import type { WorkspaceFile } from '@/components/ide/agent-types'

const READ_ONLY_ANALYSIS_RE =
  /\b(phân tích|phan tich|đánh giá|danh gia|giải thích|giai thich|tóm tắt|tom tat|kiến trúc|kien truc|tổng quan|tong quan|còn thiếu|con thieu|điểm yếu|diem yeu|cấu trúc|cau truc|review|analyze|analyse|audit|explain|summarize|overview|architecture|structure|what does this project|how does .* work)\b/i

const MUTATION_INTENT_RE =
  /\b(sửa|sua|viết|viet|tạo|tao|thêm|them|xóa|xoa|cập nhật|cap nhat|nâng cấp|nang cap|build|fix|implement|create|add|refactor|edit|update|upgrade|delete|install|deploy|run)\b/i

/**
 * Detects pure read-only project analysis / architecture Q&A prompts so they run on
 * the 1-pass Instant Snapshot streaming path (3-8s) instead of triggering a slow
 * multi-round orchestration / tool loop (45-120s).
 */
export function isReadOnlyAnalysisPrompt(prompt: string): boolean {
  const clean = prompt.trim()
  if (!clean || clean.length > 360) return false
  if (!READ_ONLY_ANALYSIS_RE.test(clean)) return false
  // If user also explicitly asks to modify/fix/build code, keep full tool/orchestration loop
  if (MUTATION_INTENT_RE.test(clean)) return false
  return true
}

/**
 * Generates a compact, high-signal project architecture snapshot (< 4 KB) in < 5ms
 * from loaded workspace files so the AI can answer "analyze project" in ONE streaming turn.
 */
export function buildInstantProjectSnapshot(
  files: WorkspaceFile[],
  projectName: string,
  rootPath?: string,
): string {
  if (!files.length) return `Project: ${projectName} (no files loaded)`

  const extCounts = new Map<string, number>()
  const dirCounts = new Map<string, number>()
  const apiRoutes: string[] = []
  const testFiles: string[] = []

  for (const f of files) {
    const clean = f.path.replace(/\\/g, '/')
    const dot = f.name.lastIndexOf('.')
    const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : '(none)'
    extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1)

    const parts = clean.split('/')
    const topDir = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join('/') : '(root)'
    dirCounts.set(topDir, (dirCounts.get(topDir) ?? 0) + 1)

    if (/\/api\/.*route\.(ts|js)$/i.test(clean)) apiRoutes.push(clean)
    if (/\.(test|spec)\.(ts|tsx|js|jsx|py)$/i.test(clean)) testFiles.push(clean)
  }

  const topExts = [...extCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([ext, count]) => `${ext}: ${count}`)
    .join(', ')

  const topDirs = [...dirCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([dir, count]) => `  - ${dir}/ (${count} files)`)
    .join('\n')

  // Extract package.json summary if present
  let pkgSummary = ''
  const pkgFile = files.find((f) => f.path === 'package.json' || f.name === 'package.json')
  if (pkgFile?.content) {
    try {
      const pkg = JSON.parse(pkgFile.content) as {
        name?: string
        version?: string
        scripts?: Record<string, string>
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      const deps = Object.keys(pkg.dependencies ?? {}).slice(0, 18).join(', ')
      const devDeps = Object.keys(pkg.devDependencies ?? {}).slice(0, 12).join(', ')
      const scripts = Object.entries(pkg.scripts ?? {})
        .slice(0, 10)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' | ')
      pkgSummary = [
        `Package: ${pkg.name || projectName}@${pkg.version || '0.0.0'}`,
        deps ? `Dependencies: ${deps}` : '',
        devDeps ? `DevDependencies: ${devDeps}` : '',
        scripts ? `Scripts: ${scripts}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    } catch {
      // ignore invalid JSON
    }
  }

  // Extract Python / Gradle / Rust manifests if present
  const manifestHints = files
    .filter((f) =>
      /^(pyproject\.toml|requirements\.txt|Cargo\.toml|go\.mod|build\.gradle(\.kts)?)$/i.test(
        f.name,
      ),
    )
    .slice(0, 2)
    .map((f) => `${f.path}:\n${f.content.slice(0, 500)}`)
    .join('\n')

  const readmeFile = files.find((f) => /^readme\.md$/i.test(f.name))
  const readmeSnippet = readmeFile?.content
    ? `README excerpt:\n${readmeFile.content.slice(0, 700)}`
    : ''

  const keyFilePaths = files
    .map((f) => f.path)
    .slice(0, 45)
    .join(', ')

  return [
    `=== INSTANT PROJECT SNAPSHOT (${projectName}) ===`,
    rootPath ? `Workspace Root: ${rootPath}` : '',
    `Total Indexed Files: ${files.length} | By Extension: ${topExts}`,
    pkgSummary,
    manifestHints,
    `Directory Map:\n${topDirs}`,
    apiRoutes.length ? `API Routes (${apiRoutes.length}): ${apiRoutes.slice(0, 24).join(', ')}` : '',
    testFiles.length ? `Test Suites (${testFiles.length}): ${testFiles.slice(0, 16).join(', ')}` : '',
    `Sample File Paths: ${keyFilePaths}`,
    readmeSnippet,
    '=== END SNAPSHOT ===',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 4_200)
}

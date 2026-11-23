import { describe, expect, it } from 'vitest'
import {
  buildInstantProjectSnapshot,
  isReadOnlyAnalysisPrompt,
} from '@/lib/project-snapshot'

describe('Fast Project Analysis Snapshot & Intent Classifier', () => {
  it('classifies pure analysis prompts as fast read-only and keeps code-change prompts on full loop', () => {
    expect(isReadOnlyAnalysisPrompt('phân tích dự án này cho tôi')).toBe(true)
    expect(isReadOnlyAnalysisPrompt('phân tích giao diện ui ux và tính năng')).toBe(true)
    expect(isReadOnlyAnalysisPrompt('analyze this codebase architecture')).toBe(true)
    expect(isReadOnlyAnalysisPrompt('dự án này còn thiếu gì')).toBe(true)

    // Mutation intents must NOT skip the full tool/orchestration loop
    expect(isReadOnlyAnalysisPrompt('phân tích dự án rồi sửa lỗi đăng nhập')).toBe(false)
    expect(isReadOnlyAnalysisPrompt('tạo mới trang login và viết test')).toBe(false)
    expect(isReadOnlyAnalysisPrompt('fix bug in android emulator')).toBe(false)
  })

  it('builds a compact high-signal project snapshot in milliseconds', () => {
    const snapshot = buildInstantProjectSnapshot(
      [
        {
          name: 'package.json',
          path: 'package.json',
          language: 'json',
          content: JSON.stringify({
            name: 'demo-app',
            version: '1.2.0',
            scripts: { dev: 'next dev', test: 'vitest run' },
            dependencies: { next: '16.4.6', react: '19.3.0' },
          }),
        },
        {
          name: 'route.ts',
          path: 'src/app/api/health/route.ts',
          language: 'typescript',
          content: 'export async function GET() { return Response.json({ ok: true }) }',
        },
        {
          name: 'health.test.ts',
          path: 'src/lib/__tests__/health.test.ts',
          language: 'typescript',
          content: 'test("ok", () => {})',
        },
        {
          name: 'README.md',
          path: 'README.md',
          language: 'markdown',
          content: '# Demo App\nLocal-first studio.',
        },
      ],
      'Demo App',
      'C:/demo',
    )

    expect(snapshot).toContain('INSTANT PROJECT SNAPSHOT (Demo App)')
    expect(snapshot).toContain('demo-app@1.2.0')
    expect(snapshot).toContain('next, react')
    expect(snapshot).toContain('src/app/api/health/route.ts')
    expect(snapshot).toContain('src/lib/__tests__/health.test.ts')
    expect(snapshot.length).toBeLessThanOrEqual(4200)
  })
})

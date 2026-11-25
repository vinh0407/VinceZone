import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  extractSymbolsFromSource,
  findSymbolDefinitions,
  findSymbolReferences,
  indexWorkspaceSymbols,
  renameSymbolAcrossWorkspace,
  searchWorkspaceSymbols,
} from '@/lib/code-index'
import { isLoopbackRequest, resolvePathInsideWorkspace } from '@/lib/local-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Cross-File Codebase Index & LSP API:
 * - GET ?action=definition&symbol=Foo&currentFile=src/a.ts&root=...
 * - GET ?action=references&symbol=Foo&root=...
 * - GET ?action=search&q=Foo&root=...
 * - GET ?action=summary&root=...
 */
export async function GET(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Local workspace access required.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'summary'
  const root = path.resolve(
    /*turbopackIgnore: true*/ searchParams.get('root')?.trim() ||
      process.env.VINCEZONE_WORKSPACE_ROOT ||
      process.cwd(),
  )

  try {
    if (action === 'definition') {
      const symbol = searchParams.get('symbol') || ''
      const currentFile = searchParams.get('currentFile') || undefined
      const definitions = await findSymbolDefinitions(root, symbol, currentFile)
      return Response.json({ symbol, definitions })
    }

    if (action === 'references') {
      const symbol = searchParams.get('symbol') || ''
      const references = await findSymbolReferences(root, symbol, 80)
      return Response.json({ symbol, references })
    }

    if (action === 'search') {
      const q = searchParams.get('q') || ''
      const symbols = await searchWorkspaceSymbols(root, q, 40)
      return Response.json({ query: q, symbols })
    }

    if (action === 'outline') {
      const relPath = searchParams.get('path') || ''
      if (!relPath) return Response.json({ path: '', symbols: [] })
      const safePath = resolvePathInsideWorkspace(root, relPath)
      const content = await readFile(safePath, 'utf8')
      const symbols = extractSymbolsFromSource(relPath, content)
      return Response.json({ path: relPath, symbols })
    }

    const idx = await indexWorkspaceSymbols(root)
    return Response.json({
      fileCount: idx.fileCount,
      symbolCount: idx.symbols.length,
      sample: idx.symbols.filter((s) => s.exported).slice(0, 40),
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Code index lookup failed.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) {
    return Response.json({ error: 'Local workspace access required.' }, { status: 403 })
  }

  let body: { action?: string; root?: string; oldName?: string; newName?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const root = path.resolve(
    /*turbopackIgnore: true*/ body.root?.trim() ||
      process.env.VINCEZONE_WORKSPACE_ROOT ||
      process.cwd(),
  )

  try {
    if (body.action === 'rename') {
      const result = await renameSymbolAcrossWorkspace(
        root,
        body.oldName || '',
        body.newName || '',
      )
      return Response.json({ ok: true, ...result })
    }
    return Response.json({ error: `Unsupported action: ${body.action}` }, { status: 400 })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Rename symbol failed.' },
      { status: 400 },
    )
  }
}

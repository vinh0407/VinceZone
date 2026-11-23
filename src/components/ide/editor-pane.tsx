'use client'

import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Columns2,
  GitCompareArrows,
  MessageSquarePlus,
  PanelLeftOpen,
  Save,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { computeDiffHunks } from '@/lib/hunk-diff'
import { extractProposedPatches } from '@/lib/orchestrator'
import type { InlineHunkReview, ProviderConfig, WorkspaceFile } from './agent-types'
import type { EditorDiagnostic } from './status-bar'
import { fileIcon } from './workspace-defaults'

const REACT_JSX_TYPE_SHIMS = [
  {
    filePath: 'file:///node_modules/@types/react/index.d.ts',
    content: `
declare namespace JSX {
  type Element = any;
  interface IntrinsicElements { [elemName: string]: any; }
  interface ElementAttributesProperty { props: {}; }
  interface ElementChildrenAttribute { children: {}; }
}
declare module 'react' {
  export type ReactNode = any;
  export type ReactElement = any;
  export type FC<P = {}> = (props: P) => any;
  export type ChangeEvent<T = any> = { target: T & { value: string; files?: FileList | null } };
  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prevState: S) => S);
  export type RefObject<T> = { current: T | null };
  export function useState<T>(v: T | (() => T)): [T, Dispatch<SetStateAction<T>>];
  export function useEffect(fn: () => any, deps?: any[]): void;
  export function useMemo<T>(fn: () => T, deps?: any[]): T;
  export function useCallback<T extends Function>(fn: T, deps?: any[]): T;
  export function useRef<T>(v: T): { current: T };
  const React: any;
  export default React;
}
declare module 'react/jsx-runtime' {
  export const Fragment: any;
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
  export namespace JSX {
    type Element = any;
    interface IntrinsicElements { [elemName: string]: any; }
  }
}
declare module 'react/jsx-dev-runtime' {
  export const Fragment: any;
  export function jsxDEV(type: any, props: any, key?: any): any;
  export namespace JSX {
    type Element = any;
    interface IntrinsicElements { [elemName: string]: any; }
  }
}
`,
  },
]

export function EditorPane({
  projectName,
  workspaceRoot,
  files,
  openPaths,
  activePath,
  activeFile,
  splitPath,
  explorerOpen,
  aiActivity,
  editPulse,
  fontSize = 13,
  wordWrap = false,
  minimap = true,
  provider,
  revealRequest,
  formatSeq = 0,
  breakpoints = {},
  debugActiveLocation = null,
  hunkReview = null,
  onToggleBreakpoint,
  onNavigateToFile,
  onHunkDecision,
  onAcceptAllHunks,
  onRejectAllHunks,
  onDismissHunkReview,
  onOpenExplorer,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onSetSplitPath,
  onUpdateFile,
  onUpdateFileByPath,
  onSaveFile,
  onAcceptInlineEdit,
  onSendSelectionToChat,
  onDiagnosticsChange,
  onCursorChange,
}: {
  projectName: string
  workspaceRoot?: string
  files: WorkspaceFile[]
  openPaths: string[]
  activePath: string
  activeFile?: WorkspaceFile
  splitPath?: string | null
  explorerOpen: boolean
  aiActivity: 'idle' | 'reading' | 'editing'
  editPulse: boolean
  fontSize?: number
  wordWrap?: boolean
  minimap?: boolean
  provider?: ProviderConfig
  revealRequest: { path: string; line: number; seq: number } | null
  formatSeq?: number
  breakpoints?: Record<string, number[]>
  debugActiveLocation?: { path: string; line: number } | null
  hunkReview?: InlineHunkReview | null
  onToggleBreakpoint?: (path: string, line: number) => void
  onNavigateToFile?: (path: string, line: number) => void
  onHunkDecision?: (path: string, hunkId: string, decision: 'accepted' | 'rejected') => void
  onAcceptAllHunks?: (path: string) => void
  onRejectAllHunks?: (path: string) => void
  onDismissHunkReview?: (path: string) => void
  onOpenExplorer: () => void
  onSelectTab: (path: string) => void
  onCloseTab: (path: string) => void
  onCloseOtherTabs?: (keepPath: string) => void
  onSetSplitPath?: (path: string | null) => void
  onUpdateFile: (content?: string) => void
  onUpdateFileByPath?: (path: string, content: string) => void
  onSaveFile: () => void
  onAcceptInlineEdit?: (path: string, nextContent: string, summary: string) => void
  onSendSelectionToChat?: (payload: {
    path: string
    startLine: number
    endLine: number
    snippet: string
  }) => void
  onDiagnosticsChange?: (diagnostics: EditorDiagnostic[]) => void
  onCursorChange: (pos: { line: number; column: number }) => void
}) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)
  const saveRef = useRef(onSaveFile)
  saveRef.current = onSaveFile
  const sendSelectionRef = useRef(onSendSelectionToChat)
  sendSelectionRef.current = onSendSelectionToChat
  const activeFileRef = useRef(activeFile)
  activeFileRef.current = activeFile
  const diagCbRef = useRef(onDiagnosticsChange)
  diagCbRef.current = onDiagnosticsChange

  // Selection floating button state
  const [selectionInfo, setSelectionInfo] = useState<{
    startLine: number
    endLine: number
    snippet: string
  } | null>(null)

  // Tab context menu state
  const [tabMenu, setTabMenu] = useState<{ path: string; x: number; y: number } | null>(null)

  // Ctrl+K Inline AI Edit state + AI Tab Ghost-Text state + Breakpoint decorations
  const [aiTabEnabled, setAiTabEnabled] = useState(true)
  const aiTabEnabledRef = useRef(true)
  aiTabEnabledRef.current = aiTabEnabled
  const providerRef = useRef(provider)
  providerRef.current = provider
  const toggleBreakpointRef = useRef(onToggleBreakpoint)
  toggleBreakpointRef.current = onToggleBreakpoint
  const navigateToFileRef = useRef(onNavigateToFile)
  navigateToFileRef.current = onNavigateToFile
  const workspaceRootRef = useRef(workspaceRoot)
  workspaceRootRef.current = workspaceRoot
  const decorationIdsRef = useRef<string[]>([])
  const inlineProviderDisposablesRef = useRef<Array<{ dispose: () => void }>>([])
  const ghostAbortRef = useRef<AbortController | null>(null)
  const ghostCacheRef = useRef<Map<string, string>>(new Map())

  // P1-3: Cross-File LSP F12 Go-to-Definition / Shift+F12 Find All References overlay
  const [lspOverlay, setLspOverlay] = useState<{
    mode: 'definition' | 'references'
    symbol: string
    items: Array<{ path: string; line: number; preview: string; badge?: string }>
  } | null>(null)

  // P1-4: Per-Hunk Inline Diff Review state
  const [activeHunkIndex, setActiveHunkIndex] = useState(0)
  const diffHunks = useMemo(() => {
    if (!hunkReview || !activeFile || hunkReview.path !== activeFile.path) return []
    return computeDiffHunks(hunkReview.originalContent, hunkReview.proposedContent)
  }, [activeFile, hunkReview])

  useEffect(() => {
    setActiveHunkIndex(0)
  }, [hunkReview?.path, hunkReview?.proposedContent])

  const [inlineOpen, setInlineOpen] = useState(false)
  const [inlinePrompt, setInlinePrompt] = useState('')
  const [inlineLoading, setInlineLoading] = useState(false)
  const [inlineError, setInlineError] = useState('')
  const [inlineDiff, setInlineDiff] = useState<{
    path: string
    original: string
    proposed: string
    summary: string
  } | null>(null)

  const splitFile = splitPath ? files.find((item) => item.path === splitPath) : undefined

  const syncMonacoTypeScriptLibs = (
    monaco: Parameters<OnMount>[1],
    workspaceFiles: WorkspaceFile[],
  ) => {
    try {
      const tsDefaults = monaco.languages.typescript.typescriptDefaults
      tsDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ES2022,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
        allowJs: true,
        allowNonTsExtensions: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        strict: false,
        noEmit: true,
        baseUrl: 'file:///',
        paths: {
          '@/*': ['file:///src/*'],
        },
      })
      tsDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
        // Suppress missing third-party npm typings noise inside lightweight local Monaco
        diagnosticCodesToIgnore: [2307, 2792, 7016, 1259, 2875, 17004],
      })

      const extraLibs: Array<{ content: string; filePath: string }> = [...REACT_JSX_TYPE_SHIMS]

      for (const file of workspaceFiles.slice(0, 80)) {
        if (/\.(ts|tsx|js|jsx)$/i.test(file.path)) {
          extraLibs.push({
            filePath: `file:///${file.path.replace(/^\/+/, '')}`,
            content: file.content,
          })
        }
      }
      tsDefaults.setExtraLibs(extraLibs)
    } catch {
      // Monaco TS worker optional
    }
  }

  const pushCurrentSelectionToChat = () => {
    const editor = editorRef.current
    const currentFile = activeFileRef.current
    if (!editor || !currentFile || !sendSelectionRef.current) return
    const selection = editor.getSelection()
    const model = editor.getModel()
    if (!model) return
    if (selection && !selection.isEmpty()) {
      const snippet = model.getValueInRange(selection)
      sendSelectionRef.current({
        path: currentFile.path,
        startLine: selection.startLineNumber,
        endLine: selection.endLineNumber,
        snippet,
      })
    } else {
      const pos = editor.getPosition()
      const line = pos?.lineNumber ?? 1
      sendSelectionRef.current({
        path: currentFile.path,
        startLine: line,
        endLine: line,
        snippet: model.getLineContent(line),
      })
    }
  }

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    syncMonacoTypeScriptLibs(monaco, files)

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current())
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      setInlineOpen(true)
      setInlineError('')
    })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, () => {
      pushCurrentSelectionToChat()
    })

    // P1-3: Cross-file F12 Go-to-Definition & Shift+F12 Find All References via /api/code-index
    const runCrossFileLookup = async (mode: 'definition' | 'references') => {
      const model = editor.getModel()
      const pos = editor.getPosition()
      if (!model || !pos) return
      const word = model.getWordAtPosition(pos)?.word?.trim()
      if (!word || word.length < 2) return
      const params = new URLSearchParams({ action: mode, symbol: word })
      if (activeFileRef.current?.path) params.set('currentFile', activeFileRef.current.path)
      if (workspaceRootRef.current) params.set('root', workspaceRootRef.current)

      try {
        const res = await fetch(`/api/code-index?${params.toString()}`)
        if (!res.ok) return
        if (mode === 'definition') {
          const data = (await res.json()) as {
            definitions?: Array<{ path: string; line: number; kind: string; signature: string }>
          }
          const defs = data.definitions ?? []
          if (defs.length === 1 && navigateToFileRef.current) {
            navigateToFileRef.current(defs[0].path, defs[0].line)
            return
          }
          if (defs.length > 0) {
            setLspOverlay({
              mode: 'definition',
              symbol: word,
              items: defs.map((d) => ({
                path: d.path,
                line: d.line,
                preview: d.signature,
                badge: d.kind,
              })),
            })
          }
        } else {
          const data = (await res.json()) as {
            references?: Array<{
              path: string
              line: number
              preview: string
              isDefinition: boolean
            }>
          }
          const refs = data.references ?? []
          setLspOverlay({
            mode: 'references',
            symbol: word,
            items: refs.map((r) => ({
              path: r.path,
              line: r.line,
              preview: r.preview,
              badge: r.isDefinition ? 'DEF' : undefined,
            })),
          })
        }
      } catch {
        // ignore lookup error
      }
    }

    editor.addAction({
      id: 'vincezone.crossFileGoToDefinition',
      label: 'VinceZone: Go to Definition (Cross-File F12)',
      keybindings: [monaco.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.1,
      run: () => {
        void runCrossFileLookup('definition')
      },
    })
    editor.addAction({
      id: 'vincezone.crossFileFindReferences',
      label: 'VinceZone: Find All References (Cross-File Shift+F12)',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.2,
      run: () => {
        void runCrossFileLookup('references')
      },
    })
    editor.onDidChangeCursorPosition((event) => {
      onCursorChange({ line: event.position.lineNumber, column: event.position.column })
    })
    editor.onDidChangeCursorSelection(() => {
      const sel = editor.getSelection()
      const model = editor.getModel()
      if (sel && model && !sel.isEmpty()) {
        const snippet = model.getValueInRange(sel)
        if (snippet.trim().length > 0) {
          setSelectionInfo({
            startLine: sel.startLineNumber,
            endLine: sel.endLineNumber,
            snippet: snippet.slice(0, 2400),
          })
          return
        }
      }
      setSelectionInfo(null)
    })

    // Sync real Monaco diagnostics to StatusBar + Problems tab
    const emitMarkers = () => {
      if (!diagCbRef.current) return
      const markers = monaco.editor.getModelMarkers({})
      const mapped: EditorDiagnostic[] = markers
        .filter((m: (typeof markers)[number]) => m.severity >= monaco.MarkerSeverity.Warning)
        .slice(0, 50)
        .map((m: (typeof markers)[number]) => ({
          path: m.resource.path.replace(/^\/+/, ''),
          line: m.startLineNumber,
          column: m.startColumn,
          severity: m.severity >= monaco.MarkerSeverity.Error ? 'error' : 'warning',
          message: m.message,
        }))
      diagCbRef.current(mapped)
    }
    monaco.editor.onDidChangeMarkers(emitMarkers)
    window.setTimeout(emitMarkers, 800)

    // P0-3: Real clickable Monaco Gutter Breakpoints
    editor.onMouseDown((event) => {
      if (event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const line = event.target.position?.lineNumber
        const current = activeFileRef.current
        if (line && current && toggleBreakpointRef.current) {
          toggleBreakpointRef.current(current.path, line)
        }
      }
    })

    // P0-4: Real AI Tab Ghost-Text Autocomplete (registerInlineCompletionsProvider)
    for (const d of inlineProviderDisposablesRef.current) d.dispose()
    inlineProviderDisposablesRef.current = []

    const langs = ['typescript', 'javascript', 'python', 'css', 'html', 'json']
    for (const lang of langs) {
      const disposable = monaco.languages.registerInlineCompletionsProvider(lang, {
        provideInlineCompletions: async (
          model: {
            getLineContent: (line: number) => string
            getLineCount: () => number
            getLineMaxColumn: (line: number) => number
            getValueInRange: (range: {
              startLineNumber: number
              startColumn: number
              endLineNumber: number
              endColumn: number
            }) => string
          },
          position: { lineNumber: number; column: number },
          _context: unknown,
          token: {
            isCancellationRequested: boolean
            onCancellationRequested: (cb: () => void) => unknown
          },
        ) => {
          if (!aiTabEnabledRef.current) return { items: [] }
          const active = activeFileRef.current
          if (!active) return { items: [] }

          const lineText = model.getLineContent(position.lineNumber)
          const beforeCursor = lineText.slice(0, position.column - 1)
          if (beforeCursor.trim().length < 2) return { items: [] }

          const startLine = Math.max(1, position.lineNumber - 35)
          const endLine = Math.min(model.getLineCount(), position.lineNumber + 12)
          const prefix = model.getValueInRange({
            startLineNumber: startLine,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          })
          const suffix = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: endLine,
            endColumn: model.getLineMaxColumn(endLine),
          })

          const cacheKey = `${active.path}:${prefix.slice(-180)}`
          const cached = ghostCacheRef.current.get(cacheKey)
          if (cached) {
            return {
              items: [
                {
                  insertText: cached,
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                  },
                },
              ],
            }
          }

          // Debounce 450ms so rapid typing stays zero-lag
          await new Promise((resolve) => setTimeout(resolve, 450))
          if (token.isCancellationRequested || !aiTabEnabledRef.current) return { items: [] }

          ghostAbortRef.current?.abort()
          const controller = new AbortController()
          ghostAbortRef.current = controller
          token.onCancellationRequested(() => controller.abort())

          try {
            const p = providerRef.current
            const res = await fetch('/api/autocomplete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                baseUrl: p?.baseUrl || 'http://localhost:20128/v1',
                apiKey: p?.apiKey || '',
                model: 'always-on',
                path: active.path,
                language: active.language,
                prefix,
                suffix,
              }),
            })
            if (!res.ok || token.isCancellationRequested) return { items: [] }
            const data = (await res.json()) as { completion?: string }
            const insertText = data.completion || ''
            if (!insertText.trim()) return { items: [] }

            if (ghostCacheRef.current.size > 40) ghostCacheRef.current.clear()
            ghostCacheRef.current.set(cacheKey, insertText)

            return {
              items: [
                {
                  insertText,
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                  },
                },
              ],
            }
          } catch {
            return { items: [] }
          }
        },
        disposeInlineCompletions: () => {},
      })
      inlineProviderDisposablesRef.current.push(disposable)
    }
  }

  useEffect(() => {
    return () => {
      ghostAbortRef.current?.abort()
      for (const d of inlineProviderDisposablesRef.current) d.dispose()
      inlineProviderDisposablesRef.current = []
    }
  }, [])

  // Sync Breakpoint dots & Paused Debug Execution Line decorations in Monaco
  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco || !activeFile) return

    const fileBps = breakpoints[activeFile.path] ?? []
    const nextDecorations: Array<{
      range: InstanceType<typeof monaco.Range>
      options: Record<string, unknown>
    }> = fileBps.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: 'vz-breakpoint-glyph',
        glyphMarginHoverMessage: { value: `Breakpoint at line ${line} (click to remove)` },
      },
    }))

    if (debugActiveLocation && debugActiveLocation.path === activeFile.path) {
      nextDecorations.push({
        range: new monaco.Range(debugActiveLocation.line, 1, debugActiveLocation.line, 1),
        options: {
          isWholeLine: true,
          className: 'vz-debug-active-line',
          glyphMarginClassName: 'vz-debug-active-glyph',
        },
      })
      editor.revealLineInCenter(debugActiveLocation.line)
    }

    // P1-4: Highlight per-hunk AI diff blocks right inside Monaco
    if (hunkReview && hunkReview.path === activeFile.path && diffHunks.length > 0) {
      diffHunks.forEach((hunk, idx) => {
        const decision = hunkReview.decisions[hunk.id]
        if (decision === 'rejected') return
        const startLine = Math.max(1, hunk.nextStart)
        const endLine = Math.max(startLine, startLine + Math.max(1, hunk.nextCount) - 1)
        nextDecorations.push({
          range: new monaco.Range(startLine, 1, endLine, 1),
          options: {
            isWholeLine: true,
            className:
              idx === activeHunkIndex ? 'vz-hunk-active-line' : 'vz-hunk-added-line',
          },
        })
      })
    }

    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, nextDecorations)
  }, [activeFile, activeHunkIndex, breakpoints, debugActiveLocation, diffHunks, hunkReview])

  useEffect(() => {
    if (monacoRef.current) {
      syncMonacoTypeScriptLibs(monacoRef.current, files)
    }
  }, [files])

  useEffect(() => {
    if (formatSeq > 0 && editorRef.current) {
      void editorRef.current.getAction('editor.action.formatDocument')?.run()
    }
  }, [formatSeq])

  useEffect(() => {
    if (!tabMenu) return
    const close = () => setTabMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [tabMenu])

  useEffect(() => {
    if (!revealRequest || !activeFile || revealRequest.path !== activeFile.path) return
    const editor = editorRef.current
    if (!editor) return
    editor.revealLineInCenter(revealRequest.line)
    editor.setPosition({ lineNumber: revealRequest.line, column: 1 })
    editor.focus()
  }, [revealRequest, activeFile])

  const runInlineEdit = async () => {
    if (!activeFile || !inlinePrompt.trim()) return
    if (!provider?.apiKey) {
      setInlineError('Add an API key in Settings → Providers to run Inline AI Edit.')
      return
    }

    setInlineLoading(true)
    setInlineError('')
    try {
      const editor = editorRef.current
      const selection = editor?.getSelection()
      const selectedText =
        editor && selection && !selection.isEmpty()
          ? editor.getModel()?.getValueInRange(selection) || ''
          : ''

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
          model: provider.model,
          enableTools: false,
          messages: [
            {
              role: 'system',
              content: `You are VinceZone Inline Code Editor. Return the complete updated file inside a single fenced block:\n\`\`\`edit:${activeFile.path}\n<complete updated file>\n\`\`\`\nMake ONLY the requested edit cleanly with minimal diff.`,
            },
            {
              role: 'user',
              content: `File: ${activeFile.path}\n${selectedText ? `Selected snippet:\n\`\`\`\n${selectedText}\n\`\`\`\n` : ''}Instruction: ${inlinePrompt.trim()}\n\nCurrent file content:\n${activeFile.content}`,
            },
          ],
        }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Inline AI request failed.' }))
        throw new Error(err.error || 'Inline AI request failed.')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let raw = ''
      let pending = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        pending += decoder.decode(value, { stream: true })
        const frames = pending.split('\n\n')
        pending = frames.pop() ?? ''
        for (const frame of frames) {
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
              const parsed = JSON.parse(payload)
              raw += parsed.choices?.[0]?.delta?.content ?? ''
            } catch {
              // skip
            }
          }
        }
      }

      const patches = extractProposedPatches(raw)
      const fallbackCode = raw.match(/```[a-zA-Z0-9:._-]*\r?\n([\s\S]*?)```/)?.[1]
      const proposed = patches[0]?.content ?? fallbackCode

      if (!proposed) {
        throw new Error('Model did not return a valid code block. Try rephrasing.')
      }

      setInlineDiff({
        path: activeFile.path,
        original: activeFile.content,
        proposed,
        summary: `Inline AI: ${inlinePrompt.trim().slice(0, 80)}`,
      })
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Inline edit failed.')
    } finally {
      setInlineLoading(false)
    }
  }

  const breadcrumbs = activeFile ? activeFile.path.split('/') : []

  return (
    <>
      {!explorerOpen && (
        <button
          onClick={onOpenExplorer}
          className="absolute left-2 top-11 z-20 grid size-7 place-items-center rounded border border-[#3c3c3c] bg-[#252526] text-[#cccccc] shadow-lg hover:bg-[#2a2d2e]"
          title="Open Primary Side Bar (Ctrl+B)"
        >
          <PanelLeftOpen size={14} />
        </button>
      )}
      <div className="flex h-[35px] shrink-0 items-center border-b border-[#2b2b2b] bg-[#181818]">
        <div className="flex min-w-0 flex-1 self-stretch overflow-x-auto">
          {openPaths.map((path) => {
            const file = files.find((item) => item.path === path)
            if (!file) return null
            const isActive = activePath === path
            return (
              <button
                key={path}
                onClick={() => onSelectTab(path)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setTabMenu({ path, x: event.clientX, y: event.clientY })
                }}
                className={`group flex min-w-32 items-center gap-2 border-r border-[#2b2b2b] px-3 text-[12px] ${
                  isActive
                    ? 'border-t-2 border-t-[#e5e5e5] bg-[#1e1e1e] text-white'
                    : 'bg-[#181818] text-[#9d9d9d] hover:bg-[#1f1f1f]'
                }`}
              >
                {fileIcon(file)}
                <span className="truncate">{file.name}</span>
                {file.dirty ? (
                  <span className="ml-auto size-2 rounded-full bg-white/80" />
                ) : (
                  <X
                    size={13}
                    className="ml-auto rounded p-0.5 opacity-0 hover:bg-[#3c3c3c] group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation()
                      onCloseTab(path)
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => setAiTabEnabled((prev) => !prev)}
          className={`mx-1 flex h-6 shrink-0 items-center gap-1 rounded border px-2 text-[10px] transition ${
            aiTabEnabled
              ? 'border-[#4a4a4a] bg-[#242424] text-white'
              : 'border-[#2f2f2f] bg-[#1a1a1a] text-[#787878] hover:text-[#cccccc]'
          }`}
          title="Toggle AI Tab Ghost-Text Autocomplete while typing"
        >
          <span
            className={`size-1.5 rounded-full ${aiTabEnabled ? 'bg-[#4ec9b0]' : 'bg-[#666666]'}`}
          />
          <span>AI Tab</span>
        </button>

        <button
          className={`mx-1 flex h-6 items-center gap-1 rounded border px-2 text-[10px] transition ${
            inlineOpen
              ? 'border-[#737373] bg-[#2a2a2a] text-white'
              : 'border-[#333333] bg-[#1e1e1e] text-[#cccccc] hover:bg-[#2a2a2a] hover:text-white'
          }`}
          onClick={() => {
            setInlineOpen((prev) => !prev)
            setInlineError('')
          }}
          disabled={!activeFile}
          title="Inline AI Edit (Ctrl+K)"
        >
          <Sparkles size={11} />
          <span>Inline AI</span>
          <kbd className="rounded bg-[#141414] px-1 font-mono text-[9px] text-[#858585]">Ctrl+K</kbd>
        </button>

        {onSetSplitPath && (
          <button
            className={`icon-button ${splitPath ? 'bg-[#2a2a2a] text-white' : ''}`}
            onClick={() => {
              if (splitPath) {
                onSetSplitPath(null)
              } else {
                const candidate =
                  openPaths.find((p) => p !== activePath) ??
                  files.find((f) => f.path !== activePath)?.path ??
                  activePath
                if (candidate) onSetSplitPath(candidate)
              }
            }}
            disabled={!activeFile}
            title="Split Editor Right (Ctrl+\)"
          >
            <Columns2 size={14} />
          </button>
        )}

        <button
          className="icon-button mx-1"
          onClick={onSaveFile}
          disabled={!activeFile}
          title="Save to Disk & Record Revision (Ctrl+S)"
        >
          <Save size={14} />
        </button>
      </div>

      {tabMenu && (
        <div
          style={{ left: tabMenu.x, top: tabMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-50 w-44 rounded-md border border-[#3a3a3a] bg-[#1b1b1b] py-1 text-[11px] text-[#d4d4d4] shadow-2xl"
        >
          <button
            className="block w-full px-3 py-1.5 text-left hover:bg-[#2a2a2a] hover:text-white"
            onClick={() => {
              onCloseTab(tabMenu.path)
              setTabMenu(null)
            }}
          >
            Close Tab
          </button>
          {onCloseOtherTabs && (
            <button
              className="block w-full px-3 py-1.5 text-left hover:bg-[#2a2a2a] hover:text-white"
              onClick={() => {
                onCloseOtherTabs(tabMenu.path)
                setTabMenu(null)
              }}
            >
              Close Other Tabs
            </button>
          )}
          {onSetSplitPath && (
            <button
              className="block w-full px-3 py-1.5 text-left hover:bg-[#2a2a2a] hover:text-white"
              onClick={() => {
                onSetSplitPath(tabMenu.path)
                setTabMenu(null)
              }}
            >
              Open in Split Right
            </button>
          )}
          <button
            className="block w-full px-3 py-1.5 text-left hover:bg-[#2a2a2a] hover:text-white"
            onClick={() => {
              void navigator.clipboard?.writeText(tabMenu.path)
              setTabMenu(null)
            }}
          >
            Copy Relative Path
          </button>
        </div>
      )}

      <div className="flex h-[24px] shrink-0 items-center justify-between border-b border-[#2b2b2b] bg-[#1e1e1e] px-3 text-[11px] text-[#9d9d9d]">
        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          <span className="shrink-0">{projectName}</span>
          {breadcrumbs.map((segment, index) => (
            <span key={`${segment}-${index}`} className="flex items-center gap-1 truncate">
              <ChevronRight size={11} className="shrink-0 text-[#6e6e6e]" />
              <span className={index === breadcrumbs.length - 1 ? 'text-[#cccccc]' : ''}>
                {segment}
              </span>
            </span>
          ))}
        </div>
        {selectionInfo && onSendSelectionToChat && activeFile && (
          <button
            type="button"
            onClick={() =>
              onSendSelectionToChat({
                path: activeFile.path,
                startLine: selectionInfo.startLine,
                endLine: selectionInfo.endLine,
                snippet: selectionInfo.snippet,
              })
            }
            className="flex shrink-0 items-center gap-1 rounded bg-[#2a2a2a] px-2 py-0.5 text-[10px] font-medium text-white hover:bg-[#3a3a3a]"
            title="Send selected lines to AI Agent Chat (Ctrl+L)"
          >
            <MessageSquarePlus size={10} />
            Add L{selectionInfo.startLine}-{selectionInfo.endLine} to Chat (Ctrl+L)
          </button>
        )}
      </div>

      {/* Cursor-style Ctrl+K Inline AI Edit Bar */}
      {inlineOpen && activeFile && (
        <div className="shrink-0 border-b border-[#333333] bg-[#161616] px-3 py-2">
          <div className="flex items-center gap-2">
            <Sparkles size={13} className="shrink-0 text-white" />
            <input
              autoFocus
              value={inlinePrompt}
              onChange={(e) => setInlinePrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !inlineLoading) void runInlineEdit()
                if (e.key === 'Escape') {
                  setInlineOpen(false)
                  setInlineDiff(null)
                }
              }}
              placeholder={`Edit ${activeFile.name} inline (e.g. "add error handling", "refactor to clean helper")…`}
              className="min-w-0 flex-1 rounded border border-[#3a3a3a] bg-[#111111] px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-[#737373]"
            />
            <button
              onClick={() => void runInlineEdit()}
              disabled={inlineLoading || !inlinePrompt.trim()}
              className="rounded bg-[#e5e5e5] px-3 py-1.5 text-[11px] font-semibold text-[#111111] hover:bg-white disabled:opacity-40"
            >
              {inlineLoading ? 'Editing…' : 'Generate Diff'}
            </button>
            <button
              onClick={() => {
                setInlineOpen(false)
                setInlineDiff(null)
              }}
              className="icon-button !size-7"
              title="Close Inline AI"
            >
              <X size={13} />
            </button>
          </div>
          {inlineError && <p className="mt-1.5 text-[10px] text-[#f48771]">{inlineError}</p>}
          {inlineDiff && (
            <div className="mt-2 flex items-center justify-between rounded border border-[#3a3a3a] bg-[#1e1e1e] px-3 py-1.5 text-[11px]">
              <span className="text-[#e5e5e5]">
                Review inline diff for <strong className="font-mono">{inlineDiff.path}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInlineDiff(null)}
                  className="rounded border border-[#444444] px-2.5 py-1 text-[10px] text-[#cccccc] hover:bg-[#2a2a2a]"
                >
                  Reject
                </button>
                <button
                  onClick={() => {
                    if (onAcceptInlineEdit) {
                      onAcceptInlineEdit(inlineDiff.path, inlineDiff.proposed, inlineDiff.summary)
                    } else {
                      onUpdateFile(inlineDiff.proposed)
                    }
                    setInlineDiff(null)
                    setInlinePrompt('')
                    setInlineOpen(false)
                  }}
                  className="flex items-center gap-1 rounded bg-[#e5e5e5] px-2.5 py-1 text-[10px] font-semibold text-[#111111] hover:bg-white"
                >
                  <Check size={11} /> Accept & Save (REV-xxx)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* P1-4: Per-Hunk Inline Diff Review Bar directly above Monaco */}
      {hunkReview && activeFile && hunkReview.path === activeFile.path && diffHunks.length > 0 && (() => {
        const safeIdx = Math.min(activeHunkIndex, diffHunks.length - 1)
        const activeHunk = diffHunks[safeIdx]
        const decision = hunkReview.decisions[activeHunk.id]
        const jumpToHunk = (nextIdx: number) => {
          const clamped = (nextIdx + diffHunks.length) % diffHunks.length
          setActiveHunkIndex(clamped)
          const targetLine = Math.max(1, diffHunks[clamped].nextStart)
          editorRef.current?.revealLineInCenter(targetLine)
          editorRef.current?.setPosition({ lineNumber: targetLine, column: 1 })
        }

        return (
          <div className="shrink-0 border-b border-[#3a3a3a] bg-[#161a16] px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-2">
                <GitCompareArrows size={13} className="text-[#89d185]" />
                <span className="font-semibold text-white">
                  Hunk {safeIdx + 1}/{diffHunks.length}
                </span>
                <span className="font-mono text-[10px] text-[#9a9a9a]">
                  L{activeHunk.nextStart}
                  {activeHunk.nextCount > 1 ? `–${activeHunk.nextStart + activeHunk.nextCount - 1}` : ''}
                  {' · '}
                  <span className="text-[#89d185]">+{activeHunk.addedLines.length}</span>
                  {' / '}
                  <span className="text-[#f48771]">-{activeHunk.removedLines.length}</span>
                </span>
                {decision && (
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                      decision === 'accepted'
                        ? 'bg-[#1e3620] text-[#89d185]'
                        : 'bg-[#3b2020] text-[#f48771]'
                    }`}
                  >
                    {decision}
                  </span>
                )}
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => jumpToHunk(safeIdx - 1)}
                    className="mini-button"
                    title="Previous hunk"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToHunk(safeIdx + 1)}
                    className="mini-button"
                    title="Next hunk"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onHunkDecision?.(hunkReview.path, activeHunk.id, 'accepted')
                    if (safeIdx + 1 < diffHunks.length) jumpToHunk(safeIdx + 1)
                  }}
                  className="flex items-center gap-1 rounded bg-[#234227] px-2 py-1 text-[10px] font-semibold text-[#c8f5c5] hover:bg-[#2c5331]"
                >
                  <Check size={11} /> Accept Hunk
                </button>
                <button
                  type="button"
                  onClick={() => onHunkDecision?.(hunkReview.path, activeHunk.id, 'rejected')}
                  className="flex items-center gap-1 rounded bg-[#422323] px-2 py-1 text-[10px] font-semibold text-[#f8c4bc] hover:bg-[#542c2c]"
                >
                  <X size={11} /> Reject Hunk
                </button>
                <button
                  type="button"
                  onClick={() => onAcceptAllHunks?.(hunkReview.path)}
                  className="rounded bg-[#e5e5e5] px-2 py-1 text-[10px] font-semibold text-[#111111] hover:bg-white"
                >
                  Accept All
                </button>
                <button
                  type="button"
                  onClick={() => onRejectAllHunks?.(hunkReview.path)}
                  className="rounded border border-[#444444] bg-[#222222] px-2 py-1 text-[10px] text-[#cccccc] hover:bg-[#2f2f2f] hover:text-white"
                >
                  Reject All
                </button>
                <button
                  type="button"
                  onClick={() => onDismissHunkReview?.(hunkReview.path)}
                  className="mini-button"
                  title="Close hunk review"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
            {activeHunk.removedLines.length > 0 && (
              <pre className="mt-1.5 max-h-20 overflow-auto rounded border border-[#4a2626] bg-[#1f1313] px-2.5 py-1 font-mono text-[10px] leading-4 text-[#f4a298]">
                {activeHunk.removedLines.slice(0, 6).map((l) => `- ${l}`).join('\n')}
                {activeHunk.removedLines.length > 6
                  ? `\n… +${activeHunk.removedLines.length - 6} removed lines`
                  : ''}
              </pre>
            )}
          </div>
        )
      })()}

      {/* P1-3: Cross-File LSP Definitions / References Panel (F12 / Shift+F12) */}
      {lspOverlay && (
        <div className="shrink-0 border-b border-[#3a3a3a] bg-[#151515] px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 font-semibold text-white">
              <Search size={12} className="text-[#9cdcfe]" />
              {lspOverlay.mode === 'definition' ? 'Definitions' : 'References'} for{' '}
              <code className="rounded bg-[#262626] px-1.5 py-0.5 font-mono text-[10.5px]">
                {lspOverlay.symbol}
              </code>
              <span className="text-[10px] font-normal text-[#858585]">
                ({lspOverlay.items.length})
              </span>
            </span>
            <button
              type="button"
              onClick={() => setLspOverlay(null)}
              className="mini-button"
              title="Close symbol results"
            >
              <X size={12} />
            </button>
          </div>
          {lspOverlay.items.length === 0 ? (
            <p className="text-[10.5px] text-[#858585]">No matches found across workspace.</p>
          ) : (
            <div className="max-h-40 space-y-0.5 overflow-y-auto">
              {lspOverlay.items.map((item, i) => (
                <button
                  key={`${item.path}:${item.line}:${i}`}
                  type="button"
                  onClick={() => {
                    onNavigateToFile?.(item.path, item.line)
                    setLspOverlay(null)
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[10.5px] text-[#cccccc] hover:bg-[#252525] hover:text-white"
                >
                  <span className="shrink-0 font-mono text-[#9cdcfe]">
                    {item.path}:{item.line}
                  </span>
                  {item.badge && (
                    <span className="shrink-0 rounded bg-[#2a2a2a] px-1 py-0.5 font-mono text-[8.5px] uppercase text-[#e5e5e5]">
                      {item.badge}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-[#8f8f8f]">
                    {item.preview}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className={`relative flex min-h-0 flex-1 overflow-hidden bg-[#1e1e1e] ${
          aiActivity !== 'idle' ? 'ring-1 ring-inset ring-white/25' : ''
        }`}
      >
        <div className="relative min-w-0 flex-1">
          {inlineDiff && activeFile && inlineDiff.path === activeFile.path ? (
            <DiffEditor
              original={inlineDiff.original}
              modified={inlineDiff.proposed}
              language={activeFile.language}
              theme="vs-dark"
              options={{
                automaticLayout: true,
                renderSideBySide: true,
                readOnly: true,
                fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
                fontSize,
                minimap: { enabled: false },
              }}
            />
          ) : activeFile ? (
            <Editor
              path={`file:///${activeFile.path.replace(/^\/+/, '')}`}
              language={activeFile.language}
              value={activeFile.content}
              onChange={onUpdateFile}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                automaticLayout: true,
                glyphMargin: true,
                inlineSuggest: { enabled: true },
                fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
                fontSize,
                lineHeight: Math.round(fontSize * 1.55),
                minimap: { enabled: minimap && !splitFile, scale: 0.75 },
                wordWrap: wordWrap ? 'on' : 'off',
                stickyScroll: { enabled: true },
                bracketPairColorization: { enabled: true },
                guides: { bracketPairs: true, indentation: true },
                cursorSmoothCaretAnimation: 'on',
                padding: { top: 10 },
                renderLineHighlight: 'all',
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                tabSize: 2,
              }}
            />
          ) : (
            <div className="grid h-full place-items-center text-[12px] text-[#858585]">
              Press Ctrl+P to Quick Open a file or Ctrl+K for Inline AI Edit.
            </div>
          )}
        </div>

        {/* Secondary Split Editor Pane (Ctrl+\) */}
        {splitFile && onSetSplitPath && (
          <div className="flex min-w-0 flex-1 flex-col border-l border-[#2b2b2b] bg-[#1c1c1c]">
            <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-[#2b2b2b] bg-[#161616] px-2 text-[11px]">
              <select
                value={splitFile.path}
                onChange={(e) => onSetSplitPath(e.target.value)}
                className="min-w-0 flex-1 truncate rounded bg-[#1e1e1e] px-1.5 py-0.5 font-mono text-[10px] text-[#e5e5e5] outline-none"
              >
                {files.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onSetSplitPath(null)}
                className="mini-button"
                title="Close Split Editor"
              >
                <X size={12} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Editor
                path={`file:///split/${splitFile.path.replace(/^\/+/, '')}`}
                language={splitFile.language}
                value={splitFile.content}
                onChange={(val) => {
                  if (typeof val === 'string') onUpdateFileByPath?.(splitFile.path, val)
                }}
                theme="vs-dark"
                options={{
                  automaticLayout: true,
                  fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
                  fontSize,
                  lineHeight: Math.round(fontSize * 1.55),
                  minimap: { enabled: false },
                  wordWrap: wordWrap ? 'on' : 'off',
                  stickyScroll: { enabled: true },
                  bracketPairColorization: { enabled: true },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  tabSize: 2,
                }}
              />
            </div>
          </div>
        )}

        {editPulse && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1 bg-white/60 shadow-[0_0_20px_rgba(255,255,255,0.45)]" />
        )}
        {aiActivity !== 'idle' && activeFile && (
          <>
            <div className="ai-editor-scan pointer-events-none absolute inset-x-0 h-20 bg-gradient-to-b from-transparent via-white/[0.06] to-transparent" />
            <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded border border-[#454545] bg-[#181818]/95 px-2.5 py-1.5 shadow-xl">
              <span className="agent-orbit size-2 rounded-full bg-[#e5e5e5]" />
              <span className="text-[10px] font-medium text-[#e5e5e5]">
                VinceZone AI {aiActivity === 'reading' ? 'analyzing context' : 'editing code'}
              </span>
              <span className="text-[10px] text-[#858585]">{activeFile.name}</span>
            </div>
          </>
        )}
      </div>
    </>
  )
}

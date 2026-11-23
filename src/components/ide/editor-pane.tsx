'use client'

import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import { Check, ChevronRight, PanelLeftOpen, Save, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { extractProposedPatches } from '@/lib/orchestrator'
import type { ProviderConfig, WorkspaceFile } from './agent-types'
import { fileIcon } from './workspace-defaults'

export function EditorPane({
  projectName,
  files,
  openPaths,
  activePath,
  activeFile,
  explorerOpen,
  aiActivity,
  editPulse,
  fontSize = 13,
  wordWrap = false,
  minimap = true,
  provider,
  revealRequest,
  onOpenExplorer,
  onSelectTab,
  onCloseTab,
  onUpdateFile,
  onSaveFile,
  onAcceptInlineEdit,
  onCursorChange,
}: {
  projectName: string
  files: WorkspaceFile[]
  openPaths: string[]
  activePath: string
  activeFile?: WorkspaceFile
  explorerOpen: boolean
  aiActivity: 'idle' | 'reading' | 'editing'
  editPulse: boolean
  fontSize?: number
  wordWrap?: boolean
  minimap?: boolean
  provider?: ProviderConfig
  revealRequest: { path: string; line: number; seq: number } | null
  onOpenExplorer: () => void
  onSelectTab: (path: string) => void
  onCloseTab: (path: string) => void
  onUpdateFile: (content?: string) => void
  onSaveFile: () => void
  onAcceptInlineEdit?: (path: string, nextContent: string, summary: string) => void
  onCursorChange: (pos: { line: number; column: number }) => void
}) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)
  const saveRef = useRef(onSaveFile)
  saveRef.current = onSaveFile

  // Ctrl+K Inline AI Edit state
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
        diagnosticCodesToIgnore: [2307, 2792, 7016, 1259],
      })

      const extraLibs: Array<{ content: string; filePath: string }> = [
        {
          filePath: 'file:///node_modules/@types/react/index.d.ts',
          content: `declare module 'react' { export type ReactNode = any; export type FC<P = {}> = (props: P) => any; export function useState<T>(v: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void]; export function useEffect(fn: () => any, deps?: any[]): void; export function useMemo<T>(fn: () => T, deps?: any[]): T; export function useCallback<T extends Function>(fn: T, deps?: any[]): T; export function useRef<T>(v: T): { current: T }; const React: any; export default React; }`,
        },
      ]

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

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    syncMonacoTypeScriptLibs(monaco, files)

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current())
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      setInlineOpen(true)
      setInlineError('')
    })
    editor.onDidChangeCursorPosition((event) => {
      onCursorChange({ line: event.position.lineNumber, column: event.position.column })
    })
  }

  useEffect(() => {
    if (monacoRef.current) {
      syncMonacoTypeScriptLibs(monacoRef.current, files)
    }
  }, [files])

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
          title="Open Primary Side Bar"
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
        <button
          className="icon-button mx-1"
          onClick={onSaveFile}
          disabled={!activeFile}
          title="Save to Disk & Record Revision (Ctrl+S)"
        >
          <Save size={14} />
        </button>
      </div>

      <div className="flex h-[24px] shrink-0 items-center gap-1 border-b border-[#2b2b2b] bg-[#1e1e1e] px-3 text-[11px] text-[#9d9d9d]">
        <span>{projectName}</span>
        {breadcrumbs.map((segment, index) => (
          <span key={`${segment}-${index}`} className="flex items-center gap-1">
            <ChevronRight size={11} className="text-[#6e6e6e]" />
            <span className={index === breadcrumbs.length - 1 ? 'text-[#cccccc]' : ''}>
              {segment}
            </span>
          </span>
        ))}
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

      <div
        className={`relative min-h-0 flex-1 overflow-hidden bg-[#1e1e1e] ${
          aiActivity !== 'idle' ? 'ring-1 ring-inset ring-white/25' : ''
        }`}
      >
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
              fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
              fontSize,
              lineHeight: Math.round(fontSize * 1.55),
              minimap: { enabled: minimap, scale: 0.75 },
              wordWrap: wordWrap ? 'on' : 'off',
              padding: { top: 10 },
              renderLineHighlight: 'all',
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              tabSize: 2,
            }}
          />
        ) : (
          <div className="grid h-full place-items-center text-[12px] text-[#858585]">
            Open a file from Explorer or press Ctrl+K for Inline AI Edit.
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

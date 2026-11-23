'use client'

import Editor, { type OnMount } from '@monaco-editor/react'
import { ChevronRight, PanelLeftOpen, Save, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { WorkspaceFile } from './agent-types'
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
  debugState,
  debugLine,
  revealRequest,
  onOpenExplorer,
  onSelectTab,
  onCloseTab,
  onUpdateFile,
  onSaveFile,
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
  debugState: 'idle' | 'starting' | 'paused' | 'running'
  debugLine: number
  revealRequest: { path: string; line: number; seq: number } | null
  onOpenExplorer: () => void
  onSelectTab: (path: string) => void
  onCloseTab: (path: string) => void
  onUpdateFile: (content?: string) => void
  onSaveFile: () => void
  onCursorChange: (pos: { line: number; column: number }) => void
}) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const saveRef = useRef(onSaveFile)
  saveRef.current = onSaveFile

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current())
    editor.onDidChangeCursorPosition((event) => {
      onCursorChange({ line: event.position.lineNumber, column: event.position.column })
    })
  }

  useEffect(() => {
    if (!revealRequest || !activeFile || revealRequest.path !== activeFile.path) return
    const editor = editorRef.current
    if (!editor) return
    editor.revealLineInCenter(revealRequest.line)
    editor.setPosition({ lineNumber: revealRequest.line, column: 1 })
    editor.focus()
  }, [revealRequest, activeFile])

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
                    ? 'border-t-2 border-t-[#0078d4] bg-[#1e1e1e] text-white'
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
      <div
        className={`relative min-h-0 flex-1 overflow-hidden bg-[#1e1e1e] ${
          aiActivity !== 'idle' ? 'ring-1 ring-inset ring-[#0078d4]/40' : ''
        }`}
      >
        {activeFile ? (
          <Editor
            path={activeFile.path}
            language={activeFile.language}
            value={activeFile.content}
            onChange={onUpdateFile}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              automaticLayout: true,
              fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
              fontSize: 13,
              lineHeight: 20,
              minimap: { enabled: true, scale: 0.75 },
              padding: { top: 10 },
              renderLineHighlight: 'all',
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              tabSize: 2,
            }}
          />
        ) : (
          <div className="grid h-full place-items-center text-[12px] text-[#858585]">
            Open a file from Explorer or press Ctrl+K to search workspace.
          </div>
        )}
        {editPulse && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1 bg-[#0078d4]/80 shadow-[0_0_20px_rgba(0,120,212,0.8)]" />
        )}
        {aiActivity !== 'idle' && activeFile && (
          <>
            <div className="ai-editor-scan pointer-events-none absolute inset-x-0 h-20 bg-gradient-to-b from-transparent via-[#0078d4]/10 to-transparent" />
            <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded border border-[#0078d4]/40 bg-[#181818]/95 px-2.5 py-1.5 shadow-xl">
              <span className="agent-orbit size-2 rounded-full bg-[#0078d4]" />
              <span className="text-[10px] font-medium text-[#9cdcfe]">
                VinceZone AI {aiActivity === 'reading' ? 'analyzing context' : 'editing code'}
              </span>
              <span className="text-[10px] text-[#858585]">{activeFile.name}</span>
            </div>
          </>
        )}
        {debugState === 'paused' && (
          <div className="pointer-events-none absolute left-12 top-[92px] flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-[#e51400] shadow-[0_0_12px_rgba(229,20,0,0.85)]" />
            <span className="rounded bg-[#68217a]/90 px-2 py-0.5 font-mono text-[10px] text-white">
              paused · line {debugLine}
            </span>
          </div>
        )}
      </div>
    </>
  )
}

'use client'

import { type ClipboardEvent, type KeyboardEvent, type RefObject, useMemo, useRef } from 'react'

type HighlightSegment = {
  text: string
  kind: 'plain' | 'slash' | 'mention'
}

/**
 * Splits a prompt or message into plain text, selected `/skill` (`/combo:...`, `/mcp:...`,
 * `/plugin:...`) commands, and `@context` / `@ROLE` mentions so selected skills render
 * bolder and brighter in both the composer input and sent chat bubbles.
 */
export function tokenizeChatHighlights(text: string): HighlightSegment[] {
  if (!text) return []
  const pattern =
    /(^|[\s(])(\/(?:combo|mcp|plugin):[a-z0-9._-]+|\/[a-z][a-z0-9._-]+|@(?:folder|browser|drive):[^\s]+|@[a-z0-9_./-]+)(?=$|[\s),.;!?])/gi
  const segments: HighlightSegment[] = []
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const prefix = match[1] ?? ''
    const token = match[2] ?? ''
    const tokenStart = match.index + prefix.length

    if (tokenStart > cursor) {
      segments.push({ text: text.slice(cursor, tokenStart), kind: 'plain' })
    }
    segments.push({
      text: token,
      kind: token.startsWith('/') ? 'slash' : 'mention',
    })
    cursor = tokenStart + token.length
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), kind: 'plain' })
  }

  return segments
}

/**
 * Renders sent chat message text with selected `/skill` tokens bold & bright white.
 */
export function HighlightedChatText({ text }: { text: string }) {
  const segments = useMemo(() => tokenizeChatHighlights(text), [text])
  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.kind === 'slash') {
          return (
            <span
              key={idx}
              className="rounded bg-white/15 px-1 py-0.5 font-bold text-white ring-1 ring-white/25 drop-shadow-[0_0_6px_rgba(255,255,255,0.4)]"
            >
              {seg.text}
            </span>
          )
        }
        if (seg.kind === 'mention') {
          return (
            <span
              key={idx}
              className="rounded bg-white/10 px-1 py-0.5 font-semibold text-[#f5f5f5]"
            >
              {seg.text}
            </span>
          )
        }
        return <span key={idx}>{seg.text}</span>
      })}
    </>
  )
}

/**
 * Zero-caret-drift highlighted textarea: renders selected `/skill`, `/combo:...`, `/mcp:...`,
 * `/plugin:...`, and `@context` tokens visually bold and bright white directly inside the input
 * while preserving 100% native cursor, selection, IME, and scrolling behavior.
 */
export function HighlightedChatTextarea({
  textareaRef,
  value,
  readOnly,
  rows = 3,
  placeholder,
  size = 'md',
  mono = false,
  onChange,
  onKeyDown,
  onPasteImages,
}: {
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  value: string
  readOnly?: boolean
  rows?: number
  placeholder: string
  size?: 'sm' | 'md' | 'lg'
  mono?: boolean
  onChange: (next: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onPasteImages?: (files: File[]) => void
}) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const segments = useMemo(() => tokenizeChatHighlights(value), [value])

  const typography =
    size === 'lg'
      ? `px-4 pt-3.5 pb-2 text-[14.5px] leading-6 ${mono ? 'font-mono' : 'font-sans'}`
      : size === 'sm'
        ? `px-2.5 pt-2 pb-1 text-[10px] leading-4 ${mono ? 'font-mono' : 'font-sans'}`
        : `px-2.5 pt-2 pb-1 text-[11px] leading-4 ${mono ? 'font-mono' : 'font-sans'}`

  const syncScroll = (target: HTMLTextAreaElement) => {
    if (!backdropRef.current) return
    backdropRef.current.scrollTop = target.scrollTop
    backdropRef.current.scrollLeft = target.scrollLeft
  }

  return (
    <div className="relative w-full">
      <div
        ref={backdropRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words ${typography} text-[#b5b5b5]`}
      >
        {segments.map((seg, idx) => {
          if (seg.kind === 'slash') {
            return (
              <span
                key={idx}
                style={{
                  color: '#ffffff',
                  textShadow:
                    '0.5px 0 0 #ffffff, -0.25px 0 0 #ffffff, 0 0 10px rgba(255, 255, 255, 0.55)',
                  backgroundColor: 'rgba(255, 255, 255, 0.14)',
                  boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.22)',
                  borderRadius: '3px',
                }}
              >
                {seg.text}
              </span>
            )
          }
          if (seg.kind === 'mention') {
            return (
              <span
                key={idx}
                style={{
                  color: '#f5f5f5',
                  textShadow: '0.35px 0 0 #f5f5f5',
                  backgroundColor: 'rgba(255, 255, 255, 0.09)',
                  borderRadius: '3px',
                }}
              >
                {seg.text}
              </span>
            )
          }
          return <span key={idx}>{seg.text}</span>
        })}
        {value.endsWith('\n') ? '\n ' : ''}
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        readOnly={readOnly}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value)
          syncScroll(event.currentTarget)
        }}
        onScroll={(event) => syncScroll(event.currentTarget)}
        onKeyDown={onKeyDown}
        onPaste={(event: ClipboardEvent<HTMLTextAreaElement>) => {
          if (!onPasteImages) return
          const imageFiles: File[] = []
          for (const item of Array.from(event.clipboardData?.items ?? [])) {
            if (item.type.startsWith('image/')) {
              const f = item.getAsFile()
              if (f) imageFiles.push(f)
            }
          }
          if (imageFiles.length > 0) {
            event.preventDefault()
            onPasteImages(imageFiles)
          }
        }}
        className={`relative z-10 block w-full resize-none bg-transparent ${typography} text-transparent caret-white outline-none selection:bg-white/25 placeholder:text-[#666666]`}
      />
    </div>
  )
}

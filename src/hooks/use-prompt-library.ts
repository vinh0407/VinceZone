'use client'

import { useCallback, useEffect, useState } from 'react'

export type PromptTemplate = {
  id: string
  title: string
  content: string
  builtIn?: boolean
}

const STORAGE_KEY = 'vincezone-prompt-library'

const BUILTIN_PROMPTS: PromptTemplate[] = [
  {
    id: 'tpl-review',
    title: 'Code Review (Diff & Edge Cases)',
    content:
      'Review @git changes for bugs, security risks, race conditions, and missing edge cases. Suggest concrete minimal fixes.',
    builtIn: true,
  },
  {
    id: 'tpl-debug',
    title: 'Root Cause Debug (@errors + @terminal)',
    content:
      'Investigate the root cause of @errors and @terminal failure. Do not blind patch — trace the call stack and write a minimal fix + regression test.',
    builtIn: true,
  },
  {
    id: 'tpl-tests',
    title: 'Write Unit & Edge-Case Tests',
    content:
      'Write concise Vitest unit tests covering happy paths, invalid inputs, and boundary conditions for the currently active file.',
    builtIn: true,
  },
  {
    id: 'tpl-security',
    title: 'Security Audit (OWASP / Auth / SSRF)',
    content:
      'Audit this codebase for injection, path traversal, SSRF, auth bypass, and secret exposure. Report prioritized findings with exact file paths.',
    builtIn: true,
  },
  {
    id: 'tpl-refactor',
    title: 'Refactor Cleanly Without Behavior Drift',
    content:
      'Refactor the active file to reduce duplication and improve readability while preserving exact external behavior and passing all tests.',
    builtIn: true,
  },
]

export function usePromptLibrary() {
  const [customPrompts, setCustomPrompts] = useState<PromptTemplate[]>([])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        setCustomPrompts(
          parsed.filter(
            (p): p is PromptTemplate =>
              Boolean(p) && typeof p.id === 'string' && typeof p.title === 'string' && typeof p.content === 'string',
          ),
        )
      }
    } catch {
      // ignore
    }
  }, [])

  const savePrompt = useCallback((title: string, content: string) => {
    const cleanTitle = title.trim()
    const cleanContent = content.trim()
    if (!cleanTitle || !cleanContent) return
    setCustomPrompts((prev) => {
      const next: PromptTemplate[] = [
        { id: `tpl-${Date.now().toString(36)}`, title: cleanTitle, content: cleanContent },
        ...prev,
      ].slice(0, 30)
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const deletePrompt = useCallback((id: string) => {
    setCustomPrompts((prev) => {
      const next = prev.filter((p) => p.id !== id)
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  return {
    prompts: [...customPrompts, ...BUILTIN_PROMPTS],
    savePrompt,
    deletePrompt,
  }
}

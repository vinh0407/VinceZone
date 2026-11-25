'use client'

import { useCallback, useState } from 'react'

export function usePanelLayout() {
  const [explorerWidth, setExplorerWidth] = useState(256)
  const [rightChatWidth, setRightChatWidth] = useState(320)
  const [terminalHeight, setTerminalHeight] = useState(200)

  const startDragResize = useCallback(
    (
      axis: 'x' | 'y',
      startCoord: number,
      startSize: number,
      min: number,
      max: number,
      invert: boolean,
      apply: (size: number) => void,
    ) => {
      const onMove = (event: MouseEvent) => {
        const current = axis === 'x' ? event.clientX : event.clientY
        const delta = (current - startCoord) * (invert ? -1 : 1)
        const next = Math.max(min, Math.min(max, Math.round(startSize + delta)))
        apply(next)
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [],
  )

  return {
    explorerWidth,
    setExplorerWidth,
    rightChatWidth,
    setRightChatWidth,
    terminalHeight,
    setTerminalHeight,
    startDragResize,
  }
}

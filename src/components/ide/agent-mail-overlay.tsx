'use client'

import { AlertTriangle, Mail, MailOpen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Agent, CommunicationEvent, MailKind } from './agent-types'

type Point = { x: number; y: number }

type ActiveFlight = {
  flightId: string
  eventId: string
  senderId: string
  recipientId: string
  senderName: string
  recipientName: string
  label: string
  kind: MailKind
  start: Point
  control: Point
  end: Point
  progress: number
  createdAt: number
  durationMs: number
}

const mailColors: Record<MailKind, { stroke: string; badge: string; glow: string }> = {
  delegation: {
    stroke: '#f5f5f5',
    badge: 'border-[#737373] bg-[#171717]/95 text-[#f5f5f5]',
    glow: '0 0 18px rgba(255,255,255,0.28)',
  },
  direct: {
    stroke: '#d4d4d4',
    badge: 'border-[#525252] bg-[#1c1c1c]/95 text-[#e5e5e5]',
    glow: '0 0 16px rgba(212,212,212,0.25)',
  },
  peer: {
    stroke: '#a3a3a3',
    badge: 'border-[#525252] bg-[#181818]/95 text-[#d4d4d4]',
    glow: '0 0 16px rgba(163,163,163,0.25)',
  },
  report: {
    stroke: '#e5e5e5',
    badge: 'border-[#737373] bg-[#1f1f1f]/95 text-[#ffffff]',
    glow: '0 0 18px rgba(229,229,229,0.32)',
  },
  conflict: {
    stroke: '#f48771',
    badge: 'border-[#f48771]/75 bg-[#2d1410]/95 text-[#ffbeb3]',
    glow: '0 0 20px rgba(244,135,113,0.45)',
  },
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function evalBezier(start: Point, control: Point, end: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
    y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
  }
}

function computeControlPoint(start: Point, end: Point, laneOffset: number): Point {
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy) || 1
  const curveMagnitude = Math.min(96, Math.max(34, length * 0.22)) + laneOffset * 18
  const nx = -dy / length
  const ny = dx / length
  return {
    x: Math.max(48, midX + nx * curveMagnitude),
    y: Math.max(36, midY + ny * curveMagnitude),
  }
}

function findAgentAnchor(container: HTMLElement, agentId: string): Point | null {
  const containerRect = container.getBoundingClientRect()
  const panel = container.querySelector<HTMLElement>(`[data-agent-panel="${agentId}"]`)
  if (panel) {
    const rect = panel.getBoundingClientRect()
    return {
      x: rect.left - containerRect.left + Math.min(rect.width * 0.5, 140),
      y: rect.top - containerRect.top + 24,
    }
  }
  const chip = container.querySelector<HTMLElement>(`[data-agent-chip="${agentId}"]`)
  if (chip) {
    const rect = chip.getBoundingClientRect()
    return {
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top + rect.height / 2,
    }
  }
  return null
}

export function AgentMailOverlay({
  containerRef,
  agents,
  events,
  replayTrigger,
  onFlightActivity,
}: {
  containerRef: React.RefObject<HTMLElement | null>
  agents: Agent[]
  events: CommunicationEvent[]
  replayTrigger: number
  onFlightActivity: (state: { sendingIds: string[]; arrivedIds: string[] }) => void
}) {
  const [flights, setFlights] = useState<ActiveFlight[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })
  const seenIdsRef = useRef<Set<string>>(new Set(events.map((event) => event.id)))
  const arrivedTimersRef = useRef<Record<string, number>>({})
  const arrivedSetRef = useRef<Set<string>>(new Set())
  const flightsRef = useRef<ActiveFlight[]>([])
  const activityCallbackRef = useRef(onFlightActivity)
  activityCallbackRef.current = onFlightActivity

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateSize = () => {
      const rect = container.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef])

  const emitActivity = (activeList: ActiveFlight[]) => {
    const sendingIds = Array.from(new Set(activeList.map((flight) => flight.senderId)))
    const arrivedIds = Array.from(arrivedSetRef.current)
    activityCallbackRef.current({ sendingIds, arrivedIds })
  }

  const spawnFlights = (batch: CommunicationEvent[]) => {
    const container = containerRef.current
    if (!container || batch.length === 0) return
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const now = performance.now()
    const created: ActiveFlight[] = []

    batch.forEach((event, index) => {
      if (!event.recipientId || event.senderId === event.recipientId) return
      const start = findAgentAnchor(container, event.senderId)
      const end = findAgentAnchor(container, event.recipientId)
      if (!start || !end) return

      const sender = agents.find((agent) => agent.id === event.senderId)
      const recipient = agents.find((agent) => agent.id === event.recipientId)
      const laneOffset = index % 3
      const durationMs = reducedMotion ? 450 : 1080 + (index % 3) * 120

      created.push({
        flightId: `${event.id}-${now}-${index}`,
        eventId: event.id,
        senderId: event.senderId,
        recipientId: event.recipientId,
        senderName: sender?.name || event.senderId,
        recipientName: recipient?.name || event.recipientId,
        label: event.label || event.taskId || (event.kind === 'report' ? 'Report' : 'Mail'),
        kind: event.kind,
        start,
        control: computeControlPoint(start, end, laneOffset),
        end,
        progress: reducedMotion ? 1 : 0,
        createdAt: now + index * (reducedMotion ? 0 : 140),
        durationMs,
      })
    })

    if (created.length === 0) return
    flightsRef.current = [...flightsRef.current, ...created]
    setFlights(flightsRef.current)
    emitActivity(flightsRef.current)
  }

  useEffect(() => {
    const fresh = events.filter((event) => !seenIdsRef.current.has(event.id))
    for (const event of fresh) seenIdsRef.current.add(event.id)
    if (fresh.length > 0) {
      spawnFlights(fresh.slice(-8))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  useEffect(() => {
    if (replayTrigger === 0) return
    const recent = events.filter((event) => event.recipientId).slice(-6)
    if (recent.length > 0) spawnFlights(recent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayTrigger])

  useEffect(() => {
    if (flights.length === 0) return
    let rafId = 0

    const tick = (now: number) => {
      const next: ActiveFlight[] = []
      const newlyArrived: string[] = []

      for (const flight of flightsRef.current) {
        if (now < flight.createdAt) {
          next.push(flight)
          continue
        }
        const raw = (now - flight.createdAt) / flight.durationMs
        if (raw >= 1) {
          newlyArrived.push(flight.recipientId)
        } else {
          next.push({ ...flight, progress: easeInOutCubic(raw) })
        }
      }

      if (newlyArrived.length > 0) {
        for (const recipientId of newlyArrived) {
          arrivedSetRef.current.add(recipientId)
          if (arrivedTimersRef.current[recipientId]) {
            window.clearTimeout(arrivedTimersRef.current[recipientId])
          }
          arrivedTimersRef.current[recipientId] = window.setTimeout(() => {
            arrivedSetRef.current.delete(recipientId)
            delete arrivedTimersRef.current[recipientId]
            emitActivity(flightsRef.current)
          }, 900)
        }
      }

      flightsRef.current = next
      setFlights(next)
      emitActivity(next)

      if (next.length > 0) {
        rafId = window.requestAnimationFrame(tick)
      }
    }

    rafId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(rafId)
  }, [flights.length])

  useEffect(() => {
    const timers = arrivedTimersRef.current
    return () => {
      for (const timer of Object.values(timers)) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  if (flights.length === 0 || size.width === 0 || size.height === 0) return null

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <svg className="h-full w-full" viewBox={`0 0 ${size.width} ${size.height}`}>
        <defs>
          {(['delegation', 'direct', 'peer', 'report', 'conflict'] as MailKind[]).map((kind) => (
            <marker
              key={kind}
              id={`mail-arrow-${kind}`}
              markerWidth="7"
              markerHeight="7"
              refX="5"
              refY="3.5"
              orient="auto"
            >
              <path d="M0,0 L7,3.5 L0,7 Z" fill={mailColors[kind].stroke} fillOpacity="0.9" />
            </marker>
          ))}
        </defs>
        {flights.map((flight) => {
          const path = `M ${flight.start.x} ${flight.start.y} Q ${flight.control.x} ${flight.control.y} ${flight.end.x} ${flight.end.y}`
          const color = mailColors[flight.kind].stroke
          return (
            <g key={flight.flightId}>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth="3.5"
                strokeOpacity="0.18"
                strokeLinecap="round"
              />
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth="1.6"
                strokeOpacity="0.88"
                strokeDasharray="6 6"
                className="mail-path-flow"
                markerEnd={`url(#mail-arrow-${flight.kind})`}
              />
              <circle cx={flight.start.x} cy={flight.start.y} r="3.5" fill={color} fillOpacity="0.9" />
              <circle
                cx={flight.end.x}
                cy={flight.end.y}
                r="5"
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeOpacity={0.35 + flight.progress * 0.6}
              />
            </g>
          )
        })}
      </svg>

      {flights.map((flight) => {
        const pos = evalBezier(flight.start, flight.control, flight.end, flight.progress)
        const theme = mailColors[flight.kind]
        const opening = flight.progress > 0.82
        return (
          <div
            key={flight.flightId}
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%) scale(${opening ? 1.06 : 1})`,
              boxShadow: theme.glow,
            }}
            className={`absolute left-0 top-0 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium backdrop-blur-md transition-transform duration-150 ${theme.badge}`}
          >
            {flight.kind === 'conflict' ? (
              <AlertTriangle size={11} />
            ) : opening ? (
              <MailOpen size={11} />
            ) : (
              <Mail size={11} />
            )}
            <span className="max-w-32 truncate">{flight.label}</span>
          </div>
        )
      })}
    </div>
  )
}

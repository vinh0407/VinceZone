import React from 'react'
import type { Metadata } from 'next'
import './styles.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:40704'),
  title: 'VinceZone Studio — Autonomous Multi-Agent IDE',
  description:
    'VinceZone Studio desktop IDE combining VS Code Dark Modern ergonomics with autonomous multi-agent territory orchestration, memory, Android emulator, and web preview.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#1e1e1e] text-[#cccccc] antialiased">
        <div id="root" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  )
}

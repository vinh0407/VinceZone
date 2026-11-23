import { detectSupportedCliTools } from '@/lib/cli/detect-cli'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const tools = await detectSupportedCliTools()

  return Response.json(
    {
      tools,
      executionAvailable: false,
      scope: 'deployment-runtime',
      notice:
        'Detection checks this server runtime only. Authentication and managed CLI execution are not available.',
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    },
  )
}

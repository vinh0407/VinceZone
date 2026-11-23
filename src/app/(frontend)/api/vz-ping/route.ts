export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(
    {
      app: 'vincezone',
      product: 'VinceZone Studio',
      version: '2.0.0',
      port: Number(process.env.PORT || 40704),
      cwd: process.cwd(),
      platform: process.platform,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

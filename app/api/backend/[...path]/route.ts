import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/permissions'

export const dynamic = 'force-dynamic'
// Render's free plan spins down; a cold start can take ~30s to answer the first request.
export const maxDuration = 60

// Server-only origin of the FastAPI service. NEXT_PUBLIC_BACKEND_URL is still honoured so an
// existing Vercel project keeps working, but new setups should set BACKEND_URL.
const BACKEND_ORIGIN = (
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  'https://barflow-rk55.onrender.com'
).replace(/\/+$/, '')

/**
 * Only the legacy inventory and reporting endpoints are bridged. Without a list this route is
 * an open proxy: anyone could reach any path on the upstream service through our origin, and
 * the upstream sees our server's address rather than the caller's.
 */
const ALLOWED_PREFIXES = [
  '/auth',
  '/v1/auth',
  '/v1/inventory',
  '/v1/stock',
  '/v1/sales',
  '/v1/tabs',
  '/v1/reports',
  '/v1/audit',
  '/v1/settings',
  '/v1/day-close',
  '/v1/day-reopen',
]

// Only the session cookie crosses the proxy; unrelated cookies stay on the Next.js origin.
const SESSION_COOKIE_NAMES = ['better-auth.session_token', '__Secure-better-auth.session_token']

function sessionCookieHeader(request: Request) {
  const header = request.headers.get('cookie')
  if (!header) return null
  const kept = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => SESSION_COOKIE_NAMES.some((name) => part.startsWith(`${name}=`)))
  return kept.length > 0 ? kept.join('; ') : null
}

function isAllowed(path: string) {
  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  if (path.some((segment) => segment === '..' || segment === '.' || segment === '')) {
    return NextResponse.json({ detail: 'Invalid backend path' }, { status: 400 })
  }

  // The bridge is only for signed-in staff. The upstream service validates the same cookie,
  // but rejecting here stops anonymous traffic from ever leaving the app.
  try {
    await requireAuth()
  } catch {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  }

  const targetPath = `/${path.join('/')}`
  if (!isAllowed(targetPath)) {
    return NextResponse.json({ detail: 'Endpoint not available through this app' }, { status: 404 })
  }

  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  const accept = request.headers.get('accept')
  if (accept) headers.set('accept', accept)
  const cookie = sessionCookieHeader(request)
  if (cookie) headers.set('cookie', cookie)

  const { search } = new URL(request.url)
  const target = `${BACKEND_ORIGIN}${targetPath}${search}`

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
      cache: 'no-store',
      // A cold upstream must not hold the request open for the whole function budget.
      signal: AbortSignal.timeout(30_000),
    })

    const responseHeaders = new Headers()
    const upstreamType = upstream.headers.get('content-type')
    if (upstreamType) responseHeaders.set('content-type', upstreamType)
    responseHeaders.set('cache-control', 'no-store')

    return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders })
  } catch {
    return NextResponse.json({ detail: 'The stock service is unreachable. Try again in a moment.' }, { status: 502 })
  }
}

// Same-origin bridge: the browser cannot send a host-only Vercel cookie to onrender.com, and a
// cookie scoped to the app domain is never sent to a different registrable domain.
export const GET = forward
export const POST = forward
export const PUT = forward
export const PATCH = forward
export const DELETE = forward

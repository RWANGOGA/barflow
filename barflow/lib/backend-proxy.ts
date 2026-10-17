type Target = {
  path: string
  search: URLSearchParams
  method: string
  transformResponse: boolean
}

const API_PREFIX = '/api'

function snakeCase(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeCase)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      snakeCase(nested),
    ]),
  )
}

function camelCase(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelCase)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      camelCase(nested),
    ]),
  )
}

function normalizePayment(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return normalized === 'mobilemoney' ? 'mobile_money' : normalized
}

function resolveTarget(requestUrl: URL, method: string): Target {
  const originalPath = requestUrl.pathname.slice(API_PREFIX.length) || '/'
  const search = new URLSearchParams(requestUrl.searchParams)

  // The typed client uses /api/backend/v1/...; older dashboard screens use
  // /api/... paths. Both are forwarded to the same FastAPI service.
  if (originalPath.startsWith('/backend/')) {
    return {
      path: originalPath.slice('/backend'.length),
      search,
      method,
      transformResponse: false,
    }
  }

  const aliases: Record<string, string> = {
    '/overview': '/v1/overview',
    '/products': '/v1/products',
    '/team': '/v1/team',
    '/settings': '/v1/settings',
    '/reports': '/v1/reports',
    '/reports/summary': '/v1/reports/summary',
    '/reports/daily': '/v1/daily-report',
    '/reports/stock-value': '/v1/reports/stock-value',
    '/stock': '/v1/stock/receive',
    '/stock-counts': '/v1/inventory/counts',
  }
  if (originalPath === '/day') {
    return {
      path: method === 'GET' ? '/v1/day' : '/v1/day-close',
      search,
      method,
      transformResponse: true,
    }
  }

  if (originalPath === '/tabs' && method === 'PATCH') {
    const tabId = search.get('id')
    const isVoid = search.get('void') === '1'
    search.delete('id')
    search.delete('void')
    if (!tabId) {
      return { path: '/__invalid_tab_request__', search, method, transformResponse: true }
    }
    return {
      path: `/v1/tabs/${encodeURIComponent(tabId)}/${isVoid ? 'void' : 'settle'}`,
      search,
      method: 'POST',
      transformResponse: true,
    }
  }

  if (originalPath === '/sales' && method === 'GET') {
    return { path: '/v1/sales', search, method, transformResponse: true }
  }

  const path = aliases[originalPath] ?? `/v1${originalPath}`
  return { path, search, method, transformResponse: true }
}

function transformRequest(path: string, method: string, body: unknown): unknown {
  const converted = snakeCase(body)
  if (!converted || typeof converted !== 'object' || Array.isArray(converted)) return converted

  const payload = converted as Record<string, unknown>
  if (path === '/sales' && method === 'POST') {
    payload.payment_method = normalizePayment(payload.payment_method)
    if (Array.isArray(payload.payment_items)) {
      payload.payment_items = payload.payment_items.map((item) => {
        if (!item || typeof item !== 'object') return item
        const payment = item as Record<string, unknown>
        return { ...payment, method: normalizePayment(payment.method) }
      })
    }
    if (!payload.idempotency_key) payload.idempotency_key = crypto.randomUUID()
  }

  if (path === '/tabs' && method === 'PATCH') {
    payload.payment_method = normalizePayment(payload.payment_method ?? 'cash')
    if (!payload.idempotency_key) payload.idempotency_key = crypto.randomUUID()
  }

  const discountMatch = path.match(/^\/sales\/([^/]+)\/discount$/)
  if (discountMatch && method === 'POST' && !payload.sale_id) {
    payload.sale_id = decodeURIComponent(discountMatch[1])
  }

  return payload
}

function transformResponse(path: string, method: string, value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const payload = value as Record<string, unknown>
  const shouldUnwrap = method === 'GET' && ['/tabs', '/team', '/audit', '/sales'].includes(path)

  if (shouldUnwrap && Array.isArray(payload.items)) {
    return camelCase(payload.items)
  }

  if (path === '/sales' && method === 'POST') {
    return {
      ...(camelCase(payload) as Record<string, unknown>),
      receiptNumber: payload.receipt_number,
      changeDue: payload.change_due,
    }
  }

  if (['/tabs', '/team', '/audit'].includes(path)) return camelCase(value)
  const converted = camelCase(payload) as Record<string, unknown>
  if (typeof converted.detail === 'string' && !converted.error) {
    converted.error = converted.detail
  }
  return converted
}

function responseHeaders(source: Headers): Headers {
  const headers = new Headers()
  for (const name of ['content-type', 'content-disposition', 'x-request-id']) {
    const value = source.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('cache-control', 'no-store')
  return headers
}

export async function proxyBackendRequest(request: Request): Promise<Response> {
  const backendUrl = process.env.BACKEND_API_URL
  if (!backendUrl) {
    return Response.json(
      { error: 'The backend service is not configured.' },
      { status: 503 },
    )
  }

  const requestUrl = new URL(request.url)
  const target = resolveTarget(requestUrl, request.method)
  if (target.path === '/__invalid_tab_request__') {
    return Response.json({ error: 'Missing tab id.' }, { status: 400 })
  }

  const base = new URL(backendUrl)
  const basePath = base.pathname.replace(/\/+$/, '')
  base.pathname = `${basePath}${target.path}`
  base.search = target.search.toString()

  const headers = new Headers()
  for (const name of ['accept', 'content-type', 'cookie', 'x-request-id']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  let body: string | undefined
  if (!['GET', 'HEAD'].includes(target.method)) {
    const text = await request.text()
    if (text) {
      const isJson = request.headers.get('content-type')?.includes('application/json')
      if (isJson) {
        try {
          const input = JSON.parse(text)
          body = JSON.stringify(
            target.transformResponse
              ? transformRequest(requestUrl.pathname.slice(API_PREFIX.length), request.method, input)
              : input,
          )
        } catch {
          return Response.json({ error: 'Invalid JSON request body.' }, { status: 400 })
        }
      } else {
        body = text
      }
    }
  }

  try {
    const upstream = await fetch(base, {
      method: target.method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
    })
    const responseBody = await upstream.text()
    const headersOut = responseHeaders(upstream.headers)
    const contentType = upstream.headers.get('content-type') ?? ''

    if (target.transformResponse && contentType.includes('application/json') && responseBody) {
      try {
        const path = requestUrl.pathname.slice(API_PREFIX.length)
        const json = JSON.parse(responseBody)
        return new Response(JSON.stringify(transformResponse(path, request.method, json)), {
          status: upstream.status,
          headers: headersOut,
        })
      } catch {
        // Preserve the service response if a non-standard JSON body is returned.
      }
    }

    return new Response(responseBody || null, {
      status: upstream.status,
      headers: headersOut,
    })
  } catch {
    return Response.json(
      { error: 'The backend service could not be reached.' },
      { status: 502 },
    )
  }
}

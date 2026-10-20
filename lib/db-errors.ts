import { NextResponse } from 'next/server'

type DriverError = Error & { code?: string }

/**
 * Drizzle wraps driver failures, so the SQLSTATE and the useful wording sit on the cause chain.
 * Without unwrapping it, every database problem surfaces as "Failed query: select ...".
 */
function driverError(error: unknown): DriverError | null {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const candidate = current as DriverError
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) return candidate
    current = (candidate as { cause?: unknown }).cause
  }
  return null
}

/**
 * Explains a database failure in terms an operator can act on. Schema drift is the common cause
 * here, because a deployed database can predate a column the running build already reads.
 */
export function databaseErrorResponse(error: unknown): NextResponse | null {
  const cause = driverError(error)
  if (!cause) return null

  const code = cause.code ?? ''
  // 42703 unknown column, 42P01 unknown table, 42P02 unknown parameter.
  if (code === '42703' || code === '42P01' || code === '42P02') {
    return NextResponse.json(
      { error: `${cause.message}. The database schema is behind this build — apply the migrations for this environment.` },
      { status: 500 },
    )
  }
  if (code === '23505') return NextResponse.json({ error: 'That record already exists.' }, { status: 409 })
  if (code.startsWith('23')) return NextResponse.json({ error: cause.message }, { status: 400 })
  if (code.startsWith('22')) return NextResponse.json({ error: 'A value in that request is not valid for its column.' }, { status: 400 })
  return NextResponse.json({ error: 'The database could not complete that request. Try again.' }, { status: 503 })
}

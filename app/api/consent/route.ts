import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requireSessionUser } from '@/lib/permissions'
import { TERMS_VERSION } from '@/lib/terms'
import { db } from '@/lib/db'
import { termsAcceptances } from '@/lib/db/schema'

/** Whether the signed-in person accepted the current terms. */
export async function GET() {
  try {
    const session = await requireSessionUser()
    const [row] = await db
      .select({ acceptedAt: termsAcceptances.acceptedAt })
      .from(termsAcceptances)
      .where(and(eq(termsAcceptances.userId, session.id), eq(termsAcceptances.version, TERMS_VERSION)))
      .limit(1)

    return NextResponse.json({ version: TERMS_VERSION, accepted: Boolean(row), acceptedAt: row?.acceptedAt ?? null })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load consent' }, { status: 500 })
  }
}

/** Record acceptance of the current terms version. Repeat calls are idempotent. */
export async function POST(request: Request) {
  try {
    const session = await requireSessionUser()
    const body = await request.json().catch(() => ({}))
    const version = typeof body.version === 'string' ? body.version : ''

    if (version !== TERMS_VERSION) {
      return NextResponse.json(
        { error: 'These terms have been updated. Reload the page and review them again.' },
        { status: 409 },
      )
    }

    await db
      .insert(termsAcceptances)
      .values({ id: crypto.randomUUID(), userId: session.id, version })
      .onConflictDoNothing()

    return NextResponse.json({ accepted: true, version }, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not record consent' }, { status: 400 })
  }
}

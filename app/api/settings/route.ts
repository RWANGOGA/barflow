import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'

export async function GET() {
  try {
    const user = await requirePermission('settings.read')
    const rows = await db.select().from(settings).where(eq(settings.userId, user.id))
    return NextResponse.json({ items: rows })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load settings' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('settings.write')
    const body = await request.json()
    const key = typeof body.key === 'string' ? body.key.slice(0, 100) : ''
    const value = typeof body.value === 'string' ? body.value.slice(0, 1000) : ''

    if (!key || !value) return NextResponse.json({ error: 'Invalid setting' }, { status: 400 })

    const [row] = await db
      .insert(settings)
      .values({ userId: user.id, key, value })
      .onConflictDoUpdate({
        target: [settings.userId, settings.key],
        set: { value, updatedAt: new Date() },
      })
      .returning()

    return NextResponse.json(row, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save setting' }, { status: 400 })
  }
}

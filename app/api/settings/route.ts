import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function GET() {
  try {
    const userId = await getUserId()
    const rows = await db.select().from(settings).where(eq(settings.userId, userId))
    return NextResponse.json({ items: rows })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId()
    const body = await request.json()
    const key = typeof body.key === 'string' ? body.key.slice(0, 100) : ''
    const value = typeof body.value === 'string' ? body.value.slice(0, 1000) : ''
    if (!key || !value) return NextResponse.json({ error: 'Invalid setting' }, { status: 400 })
    const [row] = await db.insert(settings).values({ userId, key, value }).onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value, updatedAt: new Date() } }).returning()
    return NextResponse.json(row, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

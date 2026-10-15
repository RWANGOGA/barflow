import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tabs } from '@/lib/db/schema'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function GET() {
  try {
    const userId = await getUserId()
    return Response.json(await db.select().from(tabs).where(and(eq(tabs.userId, userId), eq(tabs.status, 'open'))).orderBy(desc(tabs.openedAt)))
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await getUserId()
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return Response.json({ error: 'Missing tab id' }, { status: 400 })
    const [tab] = await db.update(tabs).set({ status: 'settled', settledAt: new Date() }).where(and(eq(tabs.id, id), eq(tabs.userId, userId), eq(tabs.status, 'open'))).returning()
    if (!tab) return Response.json({ error: 'Tab not found' }, { status: 404 })
    return Response.json(tab)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId()
    const body = await request.json()
    if (!body.tableLabel || !body.ownerName || !Number.isInteger(body.total) || body.total < 0) return Response.json({ error: 'Invalid tab' }, { status: 400 })
    const [tab] = await db.insert(tabs).values({ id: crypto.randomUUID(), userId, tableLabel: body.tableLabel, ownerName: body.ownerName, total: body.total }).returning()
    return Response.json(tab, { status: 201 })
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { desc, eq } from 'drizzle-orm'
import { sales } from '@/lib/db/schema'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function GET() {
  try {
    const userId = await getUserId()
    const rows = await db.select().from(sales).where(eq(sales.userId, userId)).orderBy(desc(sales.createdAt)).limit(100)
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId()
    const body = await request.json()
    const total = Number(body.total)
    if (!Number.isInteger(total) || total <= 0) return NextResponse.json({ error: 'Invalid total' }, { status: 400 })
    const sale = { id: crypto.randomUUID(), userId, paymentMethod: String(body.paymentMethod), total, tableLabel: body.tableLabel ? String(body.tableLabel) : null, status: 'completed' }
    await db.insert(sales).values(sale)
    return NextResponse.json(sale)
  } catch {
    return NextResponse.json({ error: 'Could not save sale' }, { status: 400 })
  }
}

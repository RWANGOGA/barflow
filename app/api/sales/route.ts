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
    const items = Array.isArray(body.items) ? body.items.slice(0, 100).map((item: any) => ({ productId: String(item.productId), name: String(item.name), quantity: Number(item.quantity), price: Number(item.price), lineTotal: Number(item.lineTotal) })) : []
    if (items.length === 0 || items.some((item: any) => !item.productId || !item.name || !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isInteger(item.price) || item.price < 0 || item.lineTotal !== item.price * item.quantity)) return NextResponse.json({ error: 'Invalid sale items' }, { status: 400 })
    const total = items.reduce((sum: number, item: any) => sum + item.lineTotal, 0)
    if (!Number.isInteger(total) || total <= 0) return NextResponse.json({ error: 'Invalid total' }, { status: 400 })
    const sale = { id: crypto.randomUUID(), userId, paymentMethod: String(body.paymentMethod), total, tableLabel: body.tableLabel ? String(body.tableLabel) : null, status: 'completed' }
    await db.insert(sales).values(sale)
    return NextResponse.json(sale)
  } catch {
    return NextResponse.json({ error: 'Could not save sale' }, { status: 400 })
  }
}

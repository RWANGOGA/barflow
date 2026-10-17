import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { stockTransfers } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function GET() {
  try {
    const userId = await getUserId()
    const rows = await db.select().from(stockTransfers).where(eq(stockTransfers.userId, userId)).orderBy(desc(stockTransfers.createdAt))
    return NextResponse.json({ items: rows })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId()
    const body = await request.json()
    const transfer = await db.insert(stockTransfers).values({
      id: crypto.randomUUID(),
      userId,
      productId: body.product_id,
      quantity: Number(body.quantity),
      fromLocation: body.from_location,
      toLocation: body.to_location,
      reason: body.reason ?? null,
    }).returning()
    return NextResponse.json(transfer[0], { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Could not save transfer' }, { status: 400 })
  }
}

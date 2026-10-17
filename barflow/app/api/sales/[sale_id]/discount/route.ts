import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { discounts, sales } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sale_id: string }> }
) {
  try {
    const userId = await getUserId()
    const { sale_id } = await params
    const body = await request.json()
    const { amount, reason, pin } = body
    if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid discount amount' }, { status: 400 })
    if (!reason || reason.length < 3) return NextResponse.json({ error: 'Invalid discount reason' }, { status: 400 })

    const sale = await db.select().from(sales).where(eq(sales.id, sale_id)).limit(1)
    if (!sale[0] || sale[0].userId !== userId) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

    // PIN verification would be handled by the frontend before calling this
    const discount = await db.insert(discounts).values({
      id: crypto.randomUUID(),
      userId,
      saleId: sale_id,
      amount,
      reason,
      approvedBy: userId,
    }).returning()

    return NextResponse.json(discount[0])
  } catch {
    return NextResponse.json({ error: 'Could not apply discount' }, { status: 400 })
  }
}

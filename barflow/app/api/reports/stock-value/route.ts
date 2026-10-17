import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function GET() {
  try {
    const userId = await getUserId()
    const rows = await db.select().from(products).where(eq(products.userId, userId))
    const items = rows.map((p: any) => ({
      id: p.id,
      name: p.name,
      stock: p.stock,
      cost: p.cost,
      price: p.price,
      value_at_cost: p.stock * p.cost,
      value_at_selling: p.stock * p.price,
    }))
    return NextResponse.json({
      items,
      total_value_at_cost: items.reduce((sum: number, i: any) => sum + i.value_at_cost, 0),
      total_value_at_selling: items.reduce((sum: number, i: any) => sum + i.value_at_selling, 0),
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

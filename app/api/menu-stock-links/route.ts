import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { menuStockLinks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function GET() {
  try {
    const userId = await getUserId()
    const rows = await db.select().from(menuStockLinks).where(eq(menuStockLinks.userId, userId))
    return NextResponse.json({ items: rows })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId()
    const body = await request.json()
    const link = await db.insert(menuStockLinks).values({
      id: crypto.randomUUID(),
      userId,
      menuItemId: body.menu_item_id,
      stockItemId: body.stock_item_id,
      quantityPerUnit: Number(body.quantity_per_unit),
    }).returning()
    return NextResponse.json(link[0], { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Could not save menu-stock link' }, { status: 400 })
  }
}

import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { menuStockLinks, products } from '@/lib/db/schema'

export async function GET() {
  try {
    const user = await requirePermission('menu.manage')
    const rows = await db
      .select()
      .from(menuStockLinks)
      .where(eq(menuStockLinks.userId, user.id))

    return NextResponse.json({ items: rows })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load menu stock links' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('menu.manage')
    const body = await request.json()
    const menuItemId = String(body.menu_item_id ?? '')
    const stockItemId = String(body.stock_item_id ?? '')
    const quantityPerUnit = Number(body.quantity_per_unit)

    if (!menuItemId || !stockItemId || !Number.isInteger(quantityPerUnit) || quantityPerUnit <= 0) {
      return NextResponse.json({ error: 'Invalid menu-stock link' }, { status: 400 })
    }

    const [menuItem] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, menuItemId), eq(products.userId, user.id)))
      .limit(1)
    const [stockItem] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, stockItemId), eq(products.userId, user.id)))
      .limit(1)

    if (!menuItem || !stockItem) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const [link] = await db
      .insert(menuStockLinks)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        menuItemId: menuItem.id,
        stockItemId: stockItem.id,
        quantityPerUnit,
      })
      .returning()

    return NextResponse.json(link, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not save menu-stock link' }, { status: 400 })
  }
}

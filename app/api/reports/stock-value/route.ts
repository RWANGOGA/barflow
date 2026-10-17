import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'

export async function GET() {
  try {
    const user = await requirePermission('reports.read')
    const rows = await db.select().from(products).where(eq(products.userId, user.id))
    const items = rows.map((product) => ({
      id: product.id,
      name: product.name,
      stock: product.stock,
      cost: product.cost,
      price: product.price,
      value_at_cost: product.stock * product.cost,
      value_at_selling: product.stock * product.price,
    }))

    return NextResponse.json({
      items,
      total_value_at_cost: items.reduce((sum, item) => sum + item.value_at_cost, 0),
      total_value_at_selling: items.reduce((sum, item) => sum + item.value_at_selling, 0),
    })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load stock valuation' }, { status: 500 })
  }
}

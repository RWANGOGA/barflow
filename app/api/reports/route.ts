import { and, eq, gte } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { sales } from '@/lib/db/schema'

export async function GET(_request: NextRequest) {
  try {
    const user = await requirePermission('reports.read')
    const from = new Date()
    from.setDate(from.getDate() - 30)
    const rows = await db
      .select()
      .from(sales)
      .where(and(eq(sales.userId, user.id), gte(sales.createdAt, from)))
    const total = rows.reduce((sum, sale) => sum + sale.total, 0)
    const byPayment = Object.entries(rows.reduce<Record<string, number>>((result, sale) => {
      result[sale.paymentMethod] = (result[sale.paymentMethod] ?? 0) + sale.total
      return result
    }, {})).map(([paymentMethod, amount]) => ({ paymentMethod, amount }))

    return NextResponse.json({ orders: rows.length, total, byPayment, rows })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load reports' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

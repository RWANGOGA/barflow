import { and, eq, gte, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { databaseErrorResponse } from '@/lib/db-errors'
import { db } from '@/lib/db'
import { addDays, startOfDay } from '@/lib/time'
import { salePayments, sales } from '@/lib/db/schema'

export async function GET(_request: NextRequest) {
  try {
    const user = await requirePermission('reports.read')
    // Thirty whole calendar days including today, in the bar's timezone.
    const from = addDays(startOfDay(new Date()), -29)
    const live = [eq(sales.userId, user.id), eq(sales.status, 'completed'), eq(sales.voided, false), gte(sales.createdAt, from)]

    const [rows, paymentRows] = await Promise.all([
      db.select().from(sales).where(and(...live)),
      // Split payments are the source of truth; a legacy sale without payment rows falls back below.
      db
        .select({ method: salePayments.method, amount: sql<number>`coalesce(sum(${salePayments.amount}), 0)::int` })
        .from(salePayments)
        .innerJoin(sales, eq(sales.id, salePayments.saleId))
        .where(and(...live))
        .groupBy(salePayments.method),
    ])

    const byPayment = paymentRows.length
      ? paymentRows
      : Object.entries(rows.reduce<Record<string, number>>((result, sale) => {
          result[sale.paymentMethod] = (result[sale.paymentMethod] ?? 0) + sale.total
          return result
        }, {})).map(([method, amount]) => ({ method, amount }))

    return NextResponse.json({ orders: rows.length, total: rows.reduce((sum, sale) => sum + sale.total, 0), byPayment, rows })
  } catch (error) {
    return authErrorResponse(error) ?? databaseErrorResponse(error) ?? NextResponse.json({ error: 'Could not load reports' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

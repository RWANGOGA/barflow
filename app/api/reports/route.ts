import { NextRequest } from 'next/server'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sales } from '@/lib/db/schema'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const from = new Date()
  from.setDate(from.getDate() - 30)
  const rows = await db.select().from(sales).where(and(eq(sales.userId, session.user.id), gte(sales.createdAt, from)))
  const total = rows.reduce((sum, sale) => sum + sale.total, 0)
  const byPayment = Object.entries(rows.reduce<Record<string, number>>((result, sale) => { result[sale.paymentMethod] = (result[sale.paymentMethod] ?? 0) + sale.total; return result }, {})).map(([paymentMethod, amount]) => ({ paymentMethod, amount }))
  return Response.json({ orders: rows.length, total, byPayment, rows })
}

export const runtime = 'nodejs'

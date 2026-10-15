import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { desc, eq, gte } from 'drizzle-orm'
import { sales } from '@/lib/db/schema'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id
  const rows = await db.select().from(sales).where(eq(sales.userId, userId)).orderBy(desc(sales.createdAt)).limit(500)
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const weekStart = new Date(start)
  weekStart.setDate(start.getDate() - 6)
  const today = rows.filter((sale) => new Date(sale.createdAt) >= start)
  const week = rows.filter((sale) => new Date(sale.createdAt) >= weekStart)
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + index)
    return { label: date.toLocaleDateString('en-US', { weekday: 'short' }), total: week.filter((sale) => new Date(sale.createdAt).toDateString() === date.toDateString()).reduce((sum, sale) => sum + sale.total, 0) }
  })
  return NextResponse.json({ todaySales: today.reduce((sum, sale) => sum + sale.total, 0), orders: today.length, openTabs: 0, week: days, checklist: { completed: 0, total: 5 } })
}

import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { receiptCounter } from '@/lib/db/schema'

/** The receipt number the next completed sale will receive, so the till can preview it. */
export async function GET() {
  try {
    const user = await requirePermission('sales.create')
    const [counter] = await db
      .select({ nextNumber: receiptCounter.nextNumber })
      .from(receiptCounter)
      .where(eq(receiptCounter.userId, user.id))
      .limit(1)

    return NextResponse.json({ nextNumber: (counter?.nextNumber ?? 0) + 1 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not read receipt counter' }, { status: 500 })
  }
}

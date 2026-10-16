import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { varianceTolerances } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId()
    const body = await request.json()
    const { product_id, tolerance_units } = body
    await db.insert(varianceTolerances).values({
      userId,
      productId: product_id,
      toleranceUnits: Number(tolerance_units),
    }).onConflictDoUpdate({
      target: [varianceTolerances.userId, varianceTolerances.productId],
      set: { toleranceUnits: Number(tolerance_units) },
    })
    return NextResponse.json({ product_id, tolerance_units: Number(tolerance_units) }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Could not save tolerance' }, { status: 400 })
  }
}

import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { products, stockMovements } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export async function POST(request: Request) { try { const session = await auth.api.getSession({ headers: await headers() }); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const body = await request.json(); const quantity = Number(body.quantity); if (!Number.isInteger(quantity) || quantity <= 0) return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 }); const product = await db.select().from(products).where(and(eq(products.id, String(body.productId)), eq(products.userId, session.user.id))).limit(1); if (!product[0]) return NextResponse.json({ error: 'Product not found' }, { status: 404 }); await db.update(products).set({ stock: product[0].stock + quantity, updatedAt: new Date() }).where(and(eq(products.id, product[0].id), eq(products.userId, session.user.id))); await db.insert(stockMovements).values({ id: crypto.randomUUID(), userId: session.user.id, productId: product[0].id, quantity, movementType: 'delivery', reference: String(body.reference ?? 'Delivery') }); return NextResponse.json({ ok: true, stock: product[0].stock + quantity }) } catch { return NextResponse.json({ error: 'Could not record stock' }, { status: 400 }) } }

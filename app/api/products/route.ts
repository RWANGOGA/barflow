import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function userId() { const session = await auth.api.getSession({ headers: await headers() }); if (!session?.user) throw new Error('Unauthorized'); return session.user.id }
export async function GET() { try { const id = await userId(); return NextResponse.json(await db.select().from(products).where(eq(products.userId, id))) } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } }
export async function POST(request: Request) { try { const id = await userId(); const body = await request.json(); const product = { id: String(body.id), userId: id, name: String(body.name), category: String(body.category), price: Number(body.price), stock: Number(body.stock), reorder: Number(body.reorder), cost: Number(body.cost), unit: String(body.unit), tone: String(body.tone ?? 'slate') }; await db.insert(products).values(product).onConflictDoUpdate({ target: products.id, set: { ...product, userId: id, updatedAt: new Date() } }); return NextResponse.json(product) } catch { return NextResponse.json({ error: 'Could not save product' }, { status: 400 }) } }

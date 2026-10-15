import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sales } from '@/lib/db/schema'

export async function POST(request: Request) { try { const session = await auth.api.getSession({ headers: await headers() }); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const body = await request.json(); const total = Number(body.total); if (!Number.isInteger(total) || total <= 0) return NextResponse.json({ error: 'Invalid total' }, { status: 400 }); const sale = { id: crypto.randomUUID(), userId: session.user.id, paymentMethod: String(body.paymentMethod), total, tableLabel: body.tableLabel ? String(body.tableLabel) : null, status: 'completed' }; await db.insert(sales).values(sale); return NextResponse.json(sale) } catch { return NextResponse.json({ error: 'Could not save sale' }, { status: 400 }) } }

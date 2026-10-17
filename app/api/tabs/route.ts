import { and, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission, verifyUserPin } from '@/lib/permissions'
import { db } from '@/lib/db'
import { auditLogs, tabs } from '@/lib/db/schema'

export async function GET() {
  try {
    const user = await requirePermission('tabs.manage')
    const rows = await db
      .select()
      .from(tabs)
      .where(and(eq(tabs.userId, user.id), eq(tabs.status, 'open')))
      .orderBy(desc(tabs.openedAt))
    return NextResponse.json(rows)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load tabs' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    const voidTab = url.searchParams.get('void') === '1'
    if (!id) return NextResponse.json({ error: 'Missing tab id' }, { status: 400 })

    const user = await requirePermission(voidTab ? 'tabs.void' : 'tabs.manage')
    if (voidTab) {
      const body = await request.json()
      const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
      if (reason.length < 3) return NextResponse.json({ error: 'Invalid void reason' }, { status: 400 })
      if (user.role !== 'Admin' && !(await verifyUserPin(user.id, body.pin))) {
        return NextResponse.json({ error: 'Manager PIN is invalid' }, { status: 403 })
      }

      const [tab] = await db
        .update(tabs)
        .set({ status: 'voided', voidReason: reason, voidedBy: user.id, voidedAt: new Date() })
        .where(and(eq(tabs.id, id), eq(tabs.userId, user.id), eq(tabs.status, 'open')))
        .returning()
      if (!tab) return NextResponse.json({ error: 'Tab not found' }, { status: 404 })

      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: user.id,
        action: 'void',
        recordLabel: tab.tableLabel,
        approval: user.role === 'Admin' ? 'admin' : 'manager',
        createdAt: new Date(),
      })
      return NextResponse.json(tab)
    }

    const [tab] = await db
      .update(tabs)
      .set({ status: 'settled', settledAt: new Date() })
      .where(and(eq(tabs.id, id), eq(tabs.userId, user.id), eq(tabs.status, 'open')))
      .returning()
    if (!tab) return NextResponse.json({ error: 'Tab not found' }, { status: 404 })
    return NextResponse.json(tab)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not update tab' }, { status: 400 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('tabs.manage')
    const body = await request.json()
    if (!body.tableLabel || !body.ownerName || !Number.isInteger(body.total) || body.total < 0) {
      return NextResponse.json({ error: 'Invalid tab' }, { status: 400 })
    }

    const [tab] = await db
      .insert(tabs)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        tableLabel: String(body.tableLabel),
        ownerName: String(body.ownerName),
        total: body.total,
      })
      .returning()
    return NextResponse.json(tab, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not create tab' }, { status: 400 })
  }
}

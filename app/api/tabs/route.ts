import { and, desc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission, verifyUserPin } from '@/lib/permissions'
import { DAY_LOCKED_ERROR, isDayLocked } from '@/lib/day'
import { db } from '@/lib/db'
import {
  auditLogs,
  products,
  receipts,
  saleItems,
  salePayments,
  sales,
  stockMovements,
  tabItems,
  tabs,
} from '@/lib/db/schema'

const PAYMENT_METHODS = new Set(['cash', 'mobile_money', 'card'])
const normalisePayment = (value: unknown) => String(value ?? 'cash').trim().toLowerCase().replaceAll(' ', '_')

type RequestedItem = { productId: string; quantity: number }

function requestedItems(value: unknown): RequestedItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null
  const items = value.map((item: any) => ({ productId: String(item?.productId ?? ''), quantity: Number(item?.quantity) }))
  if (items.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0)) return null
  return items
}

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

/** Void an open tab. Manager role is required and a PIN is verified unless the caller is an Admin. */
async function voidTab(user: { id: string; role: string | null }, id: string, body: any) {
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 3) return NextResponse.json({ error: 'Invalid void reason' }, { status: 400 })
  if (user.role !== 'Admin' && !(await verifyUserPin(user.id, body.pin))) {
    return NextResponse.json({ error: 'Manager PIN is invalid' }, { status: 403 })
  }

  const result = await db.transaction(async (tx) => {
    const [tab] = await tx
      .update(tabs)
      .set({ status: 'voided', voidReason: reason, voidedBy: user.id, voidedAt: new Date() })
      .where(and(eq(tabs.id, id), eq(tabs.userId, user.id), eq(tabs.status, 'open')))
      .returning()
    if (!tab) return null

    // Stock leaves the bar when a tab is opened, so voiding must put it back.
    const lines = await tx.select().from(tabItems).where(and(eq(tabItems.tabId, id), eq(tabItems.userId, user.id)))
    for (const line of lines) {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${line.quantity}`, updatedAt: new Date() })
        .where(and(eq(products.id, line.productId), eq(products.userId, user.id)))
      await tx.insert(stockMovements).values({
        id: crypto.randomUUID(),
        userId: user.id,
        productId: line.productId,
        quantity: line.quantity,
        movementType: 'tab_void_return',
        reference: id,
      })
    }

    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: user.id,
      action: 'void',
      entityType: 'tab',
      entityId: id,
      reason,
      recordLabel: tab.tableLabel,
      approval: user.role === 'Admin' ? 'admin' : 'manager',
    })
    return tab
  })

  if (!result) return NextResponse.json({ error: 'Tab not found' }, { status: 404 })
  return NextResponse.json(result)
}

class EmptyTabError extends Error {}

/** Settle an open tab: record a real sale, payment and receipt so revenue reaches reports. */
async function settleTab(user: { id: string; role: string | null }, id: string, body: any) {
  const paymentMethod = normalisePayment(body.paymentMethod)
  if (!PAYMENT_METHODS.has(paymentMethod)) return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })

  let result
  try {
    result = await db.transaction(async (tx) => {
      const [tab] = await tx
        .select()
        .from(tabs)
        .where(and(eq(tabs.id, id), eq(tabs.userId, user.id), eq(tabs.status, 'open')))
        .for('update')
        .limit(1)
      if (!tab) return null

      const lines = await tx.select().from(tabItems).where(and(eq(tabItems.tabId, id), eq(tabItems.userId, user.id)))
      const total = lines.length ? lines.reduce((sum, line) => sum + line.lineTotal, 0) : tab.total
      if (!Number.isInteger(total) || total <= 0) throw new EmptyTabError()

      const saleId = crypto.randomUUID()
      await tx.insert(sales).values({
        id: saleId,
        userId: user.id,
        paymentMethod,
        total,
        tableLabel: tab.tableLabel,
        status: 'completed',
        tenderedAmount: total,
        changeDue: 0,
      })
      await tx.insert(salePayments).values({ id: crypto.randomUUID(), userId: user.id, saleId, method: paymentMethod, amount: total })

      if (lines.length) {
        const catalog = await tx.select().from(products).where(eq(products.userId, user.id))
        await tx.insert(saleItems).values(
          lines.map((line) => {
            const product = catalog.find((row) => row.id === line.productId)
            return {
              id: crypto.randomUUID(),
              userId: user.id,
              saleId,
              productId: line.productId,
              productName: product?.name ?? 'Unknown',
              category: product?.category ?? 'Unknown',
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              lineTotal: line.lineTotal,
            }
          }),
        )
      }

      const counter = await tx.execute(
        sql`INSERT INTO bar_receipt_counter (user_id, next_number) VALUES (${user.id}, 1) ON CONFLICT (user_id) DO UPDATE SET next_number = bar_receipt_counter.next_number + 1 RETURNING next_number`,
      )
      const receiptNumber = Number(counter.rows[0].next_number)
      await tx.insert(receipts).values({ id: crypto.randomUUID(), userId: user.id, saleId, receiptNumber, isCopy: false, printedBy: user.id })

      const [settled] = await tx
        .update(tabs)
        .set({ status: 'settled', paymentMethod, settledBy: user.id, settledAt: new Date(), saleId })
        .where(and(eq(tabs.id, id), eq(tabs.userId, user.id)))
        .returning()

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: user.id,
        action: 'settle',
        entityType: 'tab',
        entityId: id,
        recordLabel: tab.tableLabel,
        approval: user.role === 'Admin' ? 'admin' : 'manager',
        metadata: { saleId, total, paymentMethod, receiptNumber },
      })

      return { ...settled, saleId, total, receiptNumber, changeDue: 0 }
    })
  } catch (error) {
    if (error instanceof EmptyTabError) return NextResponse.json({ error: 'Cannot settle a tab with nothing on it' }, { status: 400 })
    throw error
  }

  if (!result) return NextResponse.json({ error: 'Tab not found' }, { status: 404 })
  return NextResponse.json(result)
}

export async function PATCH(request: Request) {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    const voidRequested = url.searchParams.get('void') === '1'
    if (!id) return NextResponse.json({ error: 'Missing tab id' }, { status: 400 })

    const user = await requirePermission(voidRequested ? 'tabs.void' : 'tabs.manage')
    const body = await request.json().catch(() => ({}))
    return voidRequested ? await voidTab(user, id, body) : await settleTab(user, id, body)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not update tab' }, { status: 400 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('tabs.manage')
    if (await isDayLocked(user.id)) return NextResponse.json({ error: DAY_LOCKED_ERROR }, { status: 409 })
    const body = await request.json()
    const tableLabel = typeof body.tableLabel === 'string' ? body.tableLabel.trim() : ''
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : ''
    const items = requestedItems(body.items)

    if (!tableLabel || !ownerName || !items) {
      return NextResponse.json({ error: 'A tab needs a table, a waiter and at least one item' }, { status: 400 })
    }

    const tab = await db.transaction(async (tx) => {
      const catalog = await tx.select().from(products).where(eq(products.userId, user.id))
      const priced: { productId: string; quantity: number; unitPrice: number; lineTotal: number }[] = []

      for (const item of items) {
        const product = catalog.find((row) => row.id === item.productId)
        if (!product) throw new Error('Product not found')
        if (item.quantity > product.stock) throw new Error(`Insufficient stock for ${product.name}`)
        priced.push({ productId: product.id, quantity: item.quantity, unitPrice: product.price, lineTotal: product.price * item.quantity })
      }

      const total = priced.reduce((sum, item) => sum + item.lineTotal, 0)
      const [created] = await tx
        .insert(tabs)
        .values({ id: crypto.randomUUID(), userId: user.id, tableLabel, ownerName, total })
        .returning()

      await tx.insert(tabItems).values(priced.map((item) => ({ id: crypto.randomUUID(), tabId: created.id, userId: user.id, ...item })))

      // Stock leaves the bar as soon as the drinks are poured.
      for (const item of priced) {
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${item.quantity}`, updatedAt: new Date() })
          .where(and(eq(products.id, item.productId), eq(products.userId, user.id)))
        await tx.insert(stockMovements).values({
          id: crypto.randomUUID(),
          userId: user.id,
          productId: item.productId,
          quantity: -item.quantity,
          movementType: 'tab_open',
          reference: created.id,
        })
      }

      return created
    })

    return NextResponse.json(tab, { status: 201 })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    if (error instanceof Error && /^Insufficient stock|^Product not found/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Could not create tab' }, { status: 400 })
  }
}

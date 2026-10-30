import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission, type CurrentUser } from '@/lib/permissions'
import { approvalErrorResponse, authorizeSensitiveAction } from '@/lib/approvals'
import { auditEvent } from '@/lib/audit'
import { databaseErrorResponse } from '@/lib/db-errors'
import { DAY_LOCKED_ERROR, isDayLocked } from '@/lib/day'
import { db } from '@/lib/db'
import { taxBreakdown } from '@/lib/locale'
import { regionalFor } from '@/lib/regional'
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
    if (rows.length === 0) return NextResponse.json([])

    // A tab card is useless without the drinks on it: the waiter has to be able to read the
    // bill at the table, so the lines travel with the tab instead of a second round trip.
    const lines = await db
      .select({
        id: tabItems.id,
        tabId: tabItems.tabId,
        productId: tabItems.productId,
        name: products.name,
        quantity: tabItems.quantity,
        unitPrice: tabItems.unitPrice,
        lineTotal: tabItems.lineTotal,
      })
      .from(tabItems)
      .innerJoin(products, and(eq(products.id, tabItems.productId), eq(products.userId, user.id)))
      .where(and(eq(tabItems.userId, user.id), inArray(tabItems.tabId, rows.map((row) => row.id))))
      .orderBy(tabItems.createdAt)

    return NextResponse.json(rows.map((tab) => ({
      ...tab,
      items: lines.filter((line) => line.tabId === tab.id).map(({ tabId: _tabId, ...line }) => line),
    })))
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load tabs' }, { status: 500 })
  }
}

/**
 * Void an open tab. Any till operator can start it, but a manager must approve with their
 * PIN (or an owner/admin can confirm their own) and the approver is recorded.
 */
async function voidTab(user: CurrentUser, id: string, body: any) {
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 3) return NextResponse.json({ error: 'Invalid void reason' }, { status: 400 })

  const approval = await authorizeSensitiveAction(user, body.pin)

  const result = await db.transaction(async (tx) => {
    const [tab] = await tx
      .update(tabs)
      .set({ status: 'voided', voidReason: reason, voidedBy: user.actorId, voidedAt: new Date() })
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

    await tx.insert(auditLogs).values(auditEvent(user, {
      action: 'void',
      entityType: 'tab',
      entityId: id,
      reason,
      recordLabel: tab.tableLabel,
      approval: approval.method,
      metadata: {
        waiter: tab.ownerName,
        total: tab.total,
        approverId: approval.approverId,
        approverName: approval.approverName,
        approvalMethod: approval.method,
      },
    }))
    return tab
  })

  if (!result) return NextResponse.json({ error: 'Tab not found' }, { status: 404 })
  return NextResponse.json(result)
}

class EmptyTabError extends Error {}
class ShortCashError extends Error {}

/** Settle an open tab: record a real sale, payment and receipt so revenue reaches reports. */
async function settleTab(user: CurrentUser, id: string, body: any) {
  const regional = await regionalFor(user.id)
  const paymentMethod = normalisePayment(body.paymentMethod)
  if (!regional.paymentMethods.includes(paymentMethod)) return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
  // Cash is counted at the table, so the till needs to know what was handed over and what
  // went back as change. Card and mobile money settle for the exact amount.
  const requestedTendered = body.tenderedAmount == null ? null : Number(body.tenderedAmount)
  if (requestedTendered !== null && (!Number.isInteger(requestedTendered) || requestedTendered < 0)) {
    return NextResponse.json({ error: 'Cash tendered must be a whole amount of 0 or more.' }, { status: 400 })
  }

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
      const subtotal = lines.length ? lines.reduce((sum, line) => sum + line.lineTotal, 0) : tab.total
      if (!Number.isInteger(subtotal) || subtotal <= 0) throw new EmptyTabError()
      // Tax follows the workspace policy at settlement time, when the money is actually taken.
      const breakdown = taxBreakdown(subtotal, regional)
      const total = breakdown.total
      const tendered = paymentMethod === 'cash' ? (requestedTendered ?? total) : total
      if (tendered < total) throw new ShortCashError()
      const changeDue = Math.max(0, tendered - total)

      const saleId = crypto.randomUUID()
      await tx.insert(sales).values({
        id: saleId,
        userId: user.id,
        paymentMethod,
        total,
        tableLabel: tab.tableLabel,
        status: 'completed',
        tenderedAmount: tendered,
        changeDue,
        currency: regional.currency,
        taxRateBps: regional.taxRateBps,
        taxTotal: breakdown.tax,
        taxInclusive: regional.taxInclusive,
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
      await tx.insert(receipts).values({ id: crypto.randomUUID(), userId: user.id, saleId, receiptNumber, isCopy: false, printedBy: user.actorId })

      const [settled] = await tx
        .update(tabs)
        .set({ status: 'settled', paymentMethod, settledBy: user.actorId, settledAt: new Date(), saleId })
        .where(and(eq(tabs.id, id), eq(tabs.userId, user.id)))
        .returning()

      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'settle',
        entityType: 'tab',
        entityId: id,
        recordLabel: tab.tableLabel,
        metadata: { saleId, total, subtotal, taxTotal: breakdown.tax, paymentMethod, receiptNumber, waiter: tab.ownerName },
      }))

      return { ...settled, saleId, total, subtotal, taxTotal: breakdown.tax, receiptNumber, tenderedAmount: tendered, changeDue }
    })
  } catch (error) {
    if (error instanceof EmptyTabError) return NextResponse.json({ error: 'Cannot settle a tab with nothing on it' }, { status: 400 })
    if (error instanceof ShortCashError) return NextResponse.json({ error: 'Cash tendered is below the tab total.' }, { status: 400 })
    throw error
  }

  if (!result) return NextResponse.json({ error: 'Tab not found' }, { status: 404 })
  return NextResponse.json(result)
}

/**
 * Add a round to an open tab. A table orders repeatedly: the waiter must be able to put two
 * more beers on Table 4 without opening a second tab or voiding the first one.
 */
async function addTabItems(user: CurrentUser, id: string, body: any) {
  const items = requestedItems(body.items)
  if (!items) return NextResponse.json({ error: 'Add at least one item' }, { status: 400 })

  try {
    const tab = await db.transaction(async (tx) => {
      const [open] = await tx
        .select()
        .from(tabs)
        .where(and(eq(tabs.id, id), eq(tabs.userId, user.id), eq(tabs.status, 'open')))
        .for('update')
        .limit(1)
      if (!open) return null

      const catalog = await tx.select().from(products).where(eq(products.userId, user.id))
      const wanted = new Map<string, number>()
      for (const item of items) wanted.set(item.productId, (wanted.get(item.productId) ?? 0) + item.quantity)
      const priced = [...wanted].map(([productId, quantity]) => {
        const product = catalog.find((row) => row.id === productId)
        if (!product) throw new Error('Product not found')
        return { productId, quantity, unitPrice: product.price, lineTotal: product.price * quantity, name: product.name }
      })

      // The guarded write is what stops two tills pouring the last bottle at the same time.
      for (const item of priced) {
        const [reserved] = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${item.quantity}`, updatedAt: new Date() })
          .where(and(eq(products.id, item.productId), eq(products.userId, user.id), gte(products.stock, item.quantity)))
          .returning({ id: products.id })
        if (!reserved) throw new Error(`Insufficient stock for ${item.name}`)
        await tx.insert(stockMovements).values({
          id: crypto.randomUUID(),
          userId: user.id,
          productId: item.productId,
          quantity: -item.quantity,
          movementType: 'tab_add',
          reference: id,
        })
      }

      // Merge into the line already on the tab so the bill reads "4 × beer", not four lines.
      const existing = await tx.select().from(tabItems).where(and(eq(tabItems.tabId, id), eq(tabItems.userId, user.id)))
      for (const item of priced) {
        const line = existing.find((row) => row.productId === item.productId && row.unitPrice === item.unitPrice)
        if (line) {
          await tx
            .update(tabItems)
            .set({ quantity: line.quantity + item.quantity, lineTotal: line.lineTotal + item.lineTotal })
            .where(eq(tabItems.id, line.id))
        } else {
          await tx.insert(tabItems).values({
            id: crypto.randomUUID(),
            tabId: id,
            userId: user.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
          })
        }
      }

      // Recomputed from the lines, never incremented: a drifted total would be paid by a guest.
      const [sum] = await tx
        .select({ total: sql<number>`coalesce(sum(${tabItems.lineTotal}), 0)::int` })
        .from(tabItems)
        .where(and(eq(tabItems.tabId, id), eq(tabItems.userId, user.id)))
      const [updated] = await tx
        .update(tabs)
        .set({ total: sum?.total ?? open.total })
        .where(and(eq(tabs.id, id), eq(tabs.userId, user.id)))
        .returning()

      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'tab_items_add',
        entityType: 'tab',
        entityId: id,
        recordLabel: open.tableLabel,
        metadata: { added: priced.map((item) => ({ name: item.name, quantity: item.quantity })), total: updated.total },
      }))
      return updated
    })

    if (!tab) return NextResponse.json({ error: 'Tab not found' }, { status: 404 })
    return NextResponse.json(tab)
  } catch (error) {
    if (error instanceof Error && /^Insufficient stock|^Product not found/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}

/**
 * Take one line off an open tab. A mis-tapped drink has to be correctable without voiding the
 * whole bill: the stock returns, the total is recomputed and the removal is logged. It needs
 * the same right as voiding a tab, because it rewrites what the table owes.
 */
async function removeTabLine(user: CurrentUser, id: string, body: any) {
  const lineId = typeof body.lineId === 'string' ? body.lineId : ''
  if (!lineId) return NextResponse.json({ error: 'Choose a line to remove' }, { status: 400 })

  try {
    const result = await db.transaction(async (tx) => {
      const [open] = await tx
        .select()
        .from(tabs)
        .where(and(eq(tabs.id, id), eq(tabs.userId, user.id), eq(tabs.status, 'open')))
        .for('update')
        .limit(1)
      if (!open) return null

      const [line] = await tx
        .delete(tabItems)
        .where(and(eq(tabItems.id, lineId), eq(tabItems.tabId, id), eq(tabItems.userId, user.id)))
        .returning()
      if (!line) throw new Error('Line not found')

      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${line.quantity}`, updatedAt: new Date() })
        .where(and(eq(products.id, line.productId), eq(products.userId, user.id)))
      await tx.insert(stockMovements).values({
        id: crypto.randomUUID(),
        userId: user.id,
        productId: line.productId,
        quantity: line.quantity,
        movementType: 'tab_item_void',
        reference: id,
      })

      const [sum] = await tx
        .select({ total: sql<number>`coalesce(sum(${tabItems.lineTotal}), 0)::int` })
        .from(tabItems)
        .where(and(eq(tabItems.tabId, id), eq(tabItems.userId, user.id)))
      const [updated] = await tx
        .update(tabs)
        .set({ total: sum?.total ?? 0 })
        .where(and(eq(tabs.id, id), eq(tabs.userId, user.id)))
        .returning()

      await tx.insert(auditLogs).values(auditEvent(user, {
        action: 'tab_item_void',
        entityType: 'tab',
        entityId: id,
        recordLabel: open.tableLabel,
        metadata: { productId: line.productId, quantity: line.quantity, lineTotal: line.lineTotal, total: updated.total },
      }))
      return updated
    })

    if (!result) return NextResponse.json({ error: 'Tab not found' }, { status: 404 })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'Line not found') {
      return NextResponse.json({ error: 'That line is no longer on the tab' }, { status: 404 })
    }
    throw error
  }
}

export async function PATCH(request: Request) {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    const voidRequested = url.searchParams.get('void') === '1'
    const addRequested = url.searchParams.get('add') === '1'
    const removeRequested = url.searchParams.get('remove') === '1'
    if (!id) return NextResponse.json({ error: 'Missing tab id' }, { status: 400 })

    // Voids are requested by any till operator; a manager PIN authorises it inside voidTab.
    const user = await requirePermission('tabs.manage')
    // Settling records a sale and voiding moves stock back, so both must respect the day lock
    // that already guards sales and new tabs. Otherwise a closed day's figures stay writable.
    if (await isDayLocked(user.id)) return NextResponse.json({ error: DAY_LOCKED_ERROR }, { status: 409 })
    const body = await request.json().catch(() => ({}))
    // Removing a line rewrites the bill, so it carries the void right rather than the till right.
    if (removeRequested) return await removeTabLine(await requirePermission('tabs.void'), id, body)
    if (addRequested) return await addTabItems(user, id, body)
    return voidRequested ? await voidTab(user, id, body) : await settleTab(user, id, body)
  } catch (error) {
    return approvalErrorResponse(error)
      ?? authErrorResponse(error)
      ?? databaseErrorResponse(error)
      ?? NextResponse.json({ error: 'Could not update tab' }, { status: 400 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('tabs.manage')
    if (await isDayLocked(user.id)) return NextResponse.json({ error: DAY_LOCKED_ERROR }, { status: 409 })
    const body = await request.json()
    const tableLabel = typeof body.tableLabel === 'string' ? body.tableLabel.trim().slice(0, 60) : ''
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim().slice(0, 60) : ''
    const items = requestedItems(body.items)

    if (!tableLabel || !ownerName || !items) {
      return NextResponse.json({ error: 'A tab needs a table, a waiter and at least one item' }, { status: 400 })
    }
    const tab = await db.transaction(async (tx) => {
      const catalog = await tx.select().from(products).where(eq(products.userId, user.id))
      const priced: { productId: string; quantity: number; unitPrice: number; lineTotal: number }[] = []

      // The same drink can be added twice; throw once and guard the combined quantity.
      const wanted = new Map<string, number>()
      for (const item of items) wanted.set(item.productId, (wanted.get(item.productId) ?? 0) + item.quantity)
      for (const [productId, quantity] of wanted) {
        const product = catalog.find((row) => row.id === productId)
        if (!product) throw new Error('Product not found')
        if (quantity > product.stock) throw new Error(`Insufficient stock for ${product.name}`)
        priced.push({ productId: product.id, quantity, unitPrice: product.price, lineTotal: product.price * quantity })
      }

      const total = priced.reduce((sum, item) => sum + item.lineTotal, 0)
      const [created] = await tx
        .insert(tabs)
        .values({ id: crypto.randomUUID(), userId: user.id, tableLabel, ownerName, total })
        .returning()

      await tx.insert(tabItems).values(priced.map((item) => ({ id: crypto.randomUUID(), tabId: created.id, userId: user.id, ...item })))

      // Stock leaves the bar as soon as the drinks are poured. The guarded write stops a
      // concurrent till from selling the same bottle twice.
      for (const item of priced) {
        const [reserved] = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${item.quantity}`, updatedAt: new Date() })
          .where(and(eq(products.id, item.productId), eq(products.userId, user.id), gte(products.stock, item.quantity)))
          .returning({ id: products.id })
        if (!reserved) throw new Error(`Insufficient stock for ${catalog.find((row) => row.id === item.productId)?.name ?? 'item'}`)
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
    return databaseErrorResponse(error) ?? NextResponse.json({ error: 'Could not create tab' }, { status: 400 })
  }
}

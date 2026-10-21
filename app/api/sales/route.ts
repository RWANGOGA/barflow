import { createHash } from 'node:crypto'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { databaseErrorResponse } from '@/lib/db-errors'
import { DAY_LOCKED_ERROR, isDayLocked } from '@/lib/day'
import { db } from '@/lib/db'
import { idempotencyKeys, products, receiptCounter, receipts, saleItems, salePayments, sales, stockMovements } from '@/lib/db/schema'

export async function GET() {
  try {
    const user = await requirePermission('sales.read')
    const rows = await db.select().from(sales).where(eq(sales.userId, user.id)).orderBy(desc(sales.createdAt)).limit(100)
    return NextResponse.json(rows)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: 'Could not load sales' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('sales.create')
    const userId = user.id
    if (await isDayLocked(userId)) return NextResponse.json({ error: DAY_LOCKED_ERROR }, { status: 409 })
    const body = await request.json()
    const requestedItems: { productId: string; quantity: number; note: string | null }[] = Array.isArray(body.items)
      ? body.items.slice(0, 100).map((item: any) => ({ productId: String(item.productId), quantity: Number(item.quantity), note: item.note ? String(item.note).slice(0, 200) : null }))
      : []
    const normalisePayment = (value: unknown) => String(value).trim().toLowerCase().replaceAll(' ', '_')
    const requestedPayments: { method: string; amount: number }[] | null = Array.isArray(body.payment_items)
      ? body.payment_items.slice(0, 10).map((payment: any) => ({ method: normalisePayment(payment.method), amount: Number(payment.amount) }))
      : null
    const paymentMethod = normalisePayment(body.paymentMethod)
    const allowedPayments = new Set(['cash', 'mobile_money', 'card'])
    const tenderedAmount = body.tendered_amount != null ? Number(body.tendered_amount) : null
    const idempotencyKey = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() ? body.idempotencyKey.trim().slice(0, 100) : null

    if (!allowedPayments.has(paymentMethod)) return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
    if (tenderedAmount != null && (!Number.isInteger(tenderedAmount) || tenderedAmount < 0)) {
      return NextResponse.json({ error: 'Invalid tendered amount' }, { status: 400 })
    }
    if (requestedItems.length === 0 || requestedItems.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      return NextResponse.json({ error: 'Invalid sale items' }, { status: 400 })
    }
    // The same drink can be scanned twice; price it once and guard the combined quantity.
    const requested = new Map<string, { quantity: number; note: string | null }>()
    for (const item of requestedItems) {
      const current = requested.get(item.productId)
      requested.set(item.productId, {
        quantity: (current?.quantity ?? 0) + item.quantity,
        note: item.note ?? current?.note ?? null,
      })
    }
    const catalog = await db.select().from(products).where(eq(products.userId, userId))
    const items = [...requested].map(([productId, request]) => {
      const product = catalog.find((row) => row.id === productId)
      if (!product) throw new Error(`Product not found: ${productId}`)
      if (request.quantity > product.stock) throw new Error(`Insufficient stock for ${product.name}`)
      return { productId: product.id, name: product.name, category: product.category, quantity: request.quantity, price: product.price, lineTotal: product.price * request.quantity, note: request.note }
    })
    const total = items.reduce((sum, item) => sum + item.lineTotal, 0)
    if (!Number.isInteger(total) || total <= 0) return NextResponse.json({ error: 'Invalid total' }, { status: 400 })

    let changeDue = 0
    const paymentItems: { method: string; amount: number }[] = requestedPayments ?? [{ method: paymentMethod, amount: total }]
    if (requestedPayments && paymentItems.reduce((sum, payment) => sum + payment.amount, 0) !== total) {
      return NextResponse.json({ error: 'Payment items do not add up to the sale total' }, { status: 400 })
    }
    if (paymentItems.some((payment) => !allowedPayments.has(payment.method) || !Number.isInteger(payment.amount) || payment.amount <= 0)) {
      return NextResponse.json({ error: 'Invalid payment details' }, { status: 400 })
    }
    // Only the cash part of a split payment can produce change.
    const cashPortion = paymentItems.filter((payment) => payment.method === 'cash').reduce((sum, payment) => sum + payment.amount, 0)
    if (tenderedAmount != null) {
      if (tenderedAmount < cashPortion) {
        return NextResponse.json({ error: 'Tendered cash is less than the cash portion of the sale' }, { status: 400 })
      }
      changeDue = tenderedAmount - cashPortion
    }

    const sale = { id: crypto.randomUUID(), userId, paymentMethod, total, tableLabel: body.tableLabel ? String(body.tableLabel).trim().slice(0, 60) || null : null, status: 'completed', tenderedAmount, changeDue, idempotencyKey }
    const requestHash = createHash('sha256').update(JSON.stringify({ items, paymentItems, total })).digest('hex')
    let receiptNumber = 0
    let replayed: Record<string, unknown> | null = null
    let keyConflict = false
    await db.transaction(async (tx) => {
      // A retried request (double tap, flaky network) must not become a second sale.
      if (idempotencyKey) {
        const [previous] = await tx
          .select({ responseJson: idempotencyKeys.responseJson, requestHash: idempotencyKeys.requestHash })
          .from(idempotencyKeys)
          .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.idempotencyKey, idempotencyKey)))
          .limit(1)
        if (previous) {
          // Reusing a key for a different basket is a bug in the caller, not a retry.
          if (previous.requestHash !== requestHash) {
            keyConflict = true
            return
          }
          replayed = previous.responseJson
          return
        }
      }

      await tx.insert(sales).values(sale)
      await tx.insert(salePayments).values(paymentItems.map((payment) => ({ id: crypto.randomUUID(), userId, saleId: sale.id, method: payment.method, amount: payment.amount })))
      await tx.insert(saleItems).values(items.map((item) => ({ id: crypto.randomUUID(), userId, saleId: sale.id, productId: item.productId, productName: item.name, category: item.category, unitPrice: item.price, quantity: item.quantity, lineTotal: item.lineTotal, note: item.note })))
      for (const item of items) {
        // The check above can lose a race with another till; this guarded write cannot.
        const [reserved] = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${item.quantity}`, updatedAt: new Date() })
          .where(and(eq(products.id, item.productId), eq(products.userId, userId), gte(products.stock, item.quantity)))
          .returning({ id: products.id })
        if (!reserved) throw new Error(`Insufficient stock for ${item.name}`)
        await tx.insert(stockMovements).values({ id: crypto.randomUUID(), userId, productId: item.productId, quantity: -item.quantity, movementType: 'sale', reference: sale.id })
      }
      const counter = await tx.execute(sql`INSERT INTO bar_receipt_counter (user_id, next_number) VALUES (${userId}, 1) ON CONFLICT (user_id) DO UPDATE SET next_number = bar_receipt_counter.next_number + 1 RETURNING next_number`)
      receiptNumber = Number(counter.rows[0].next_number)
      await tx.insert(receipts).values({ id: crypto.randomUUID(), userId, saleId: sale.id, receiptNumber, isCopy: false, printedBy: userId })

      if (idempotencyKey) {
        await tx.insert(idempotencyKeys).values({
          userId,
          idempotencyKey,
          requestHash,
          responseJson: { ...sale, receiptNumber, changeDue, paymentItems },
        })
      }
    })

    if (keyConflict) return NextResponse.json({ error: 'This idempotency key was already used for a different sale' }, { status: 409 })
    if (replayed) return NextResponse.json(replayed)
    return NextResponse.json({ ...sale, receiptNumber, changeDue, paymentItems })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Sale creation failed', error)
    return databaseErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save sale' }, { status: 400 })
  }
}

import { and, desc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authErrorResponse, requirePermission } from '@/lib/permissions'
import { db } from '@/lib/db'
import { products, receiptCounter, receipts, saleItems, salePayments, sales } from '@/lib/db/schema'

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
    const body = await request.json()
    const requestedItems: { productId: string; quantity: number; note: string | null }[] = Array.isArray(body.items)
      ? body.items.slice(0, 100).map((item: any) => ({ productId: String(item.productId), quantity: Number(item.quantity), note: item.note ? String(item.note) : null }))
      : []
    const normalisePayment = (value: unknown) => String(value).trim().toLowerCase().replaceAll(' ', '_')
    const requestedPayments: { method: string; amount: number }[] | null = Array.isArray(body.payment_items)
      ? body.payment_items.slice(0, 10).map((payment: any) => ({ method: normalisePayment(payment.method), amount: Number(payment.amount) }))
      : null
    const paymentMethod = normalisePayment(body.paymentMethod)
    const allowedPayments = new Set(['cash', 'mobile_money', 'card'])
    const tenderedAmount = body.tendered_amount != null ? Number(body.tendered_amount) : null

    if (!allowedPayments.has(paymentMethod)) return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
    if (requestedItems.length === 0 || requestedItems.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      return NextResponse.json({ error: 'Invalid sale items' }, { status: 400 })
    }
    const catalog = await db.select().from(products).where(eq(products.userId, userId))
    const items = requestedItems.map((item) => {
      const product = catalog.find((row) => row.id === item.productId)
      if (!product || item.quantity > product.stock) throw new Error('Insufficient stock')
      return { productId: product.id, name: product.name, category: product.category, quantity: item.quantity, price: product.price, lineTotal: product.price * item.quantity, note: item.note }
    })
    const total = items.reduce((sum, item) => sum + item.lineTotal, 0)
    if (!Number.isInteger(total) || total <= 0) return NextResponse.json({ error: 'Invalid total' }, { status: 400 })

    let changeDue = 0
    const paymentItems: { method: string; amount: number }[] = requestedPayments ?? [{ method: paymentMethod, amount: total }]
    if (requestedPayments && paymentItems.reduce((sum, payment) => sum + payment.amount, 0) !== total) {
      return NextResponse.json({ error: 'Payment items do not add up to the sale total' }, { status: 400 })
    }
    if (tenderedAmount != null) changeDue = Math.max(0, tenderedAmount - total)
    if (paymentItems.some((payment) => !allowedPayments.has(payment.method) || !Number.isInteger(payment.amount) || payment.amount <= 0)) {
      return NextResponse.json({ error: 'Invalid payment details' }, { status: 400 })
    }

    const sale = { id: crypto.randomUUID(), userId, paymentMethod, total, tableLabel: body.tableLabel ? String(body.tableLabel) : null, status: 'completed', tenderedAmount, changeDue }
    let receiptNumber = 0
    await db.transaction(async (tx) => {
      await tx.insert(sales).values(sale)
      await tx.insert(salePayments).values(paymentItems.map((payment) => ({ id: crypto.randomUUID(), userId, saleId: sale.id, method: payment.method, amount: payment.amount })))
      await tx.insert(saleItems).values(items.map((item) => ({ id: crypto.randomUUID(), userId, saleId: sale.id, productId: item.productId, productName: item.name, category: item.category, unitPrice: item.price, quantity: item.quantity, lineTotal: item.lineTotal, note: item.note })))
      for (const item of items) {
        await tx.update(products).set({ stock: sql`${products.stock} - ${item.quantity}`, updatedAt: new Date() }).where(and(eq(products.id, item.productId), eq(products.userId, userId)))
      }
      const counter = await tx.execute(sql`INSERT INTO bar_receipt_counter (user_id, next_number) VALUES (${userId}, 1) ON CONFLICT (user_id) DO UPDATE SET next_number = bar_receipt_counter.next_number + 1 RETURNING next_number`)
      receiptNumber = Number(counter.rows[0].next_number)
      await tx.insert(receipts).values({ id: crypto.randomUUID(), userId, saleId: sale.id, receiptNumber, isCopy: false, printedBy: userId })
    })

    return NextResponse.json({ ...sale, receiptNumber, changeDue, paymentItems })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Sale creation failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save sale' }, { status: 400 })
  }
}

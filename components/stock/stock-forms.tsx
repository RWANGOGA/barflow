'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { backendApi } from '@/lib/backend-api'
import { formatMoney, readCachedRegional } from '@/lib/locale'

export type StockProduct = { id: string; name: string; category: string; stock: number; reorder: number; cost: number; unit: string }
export type StockChange = { stockDelta: number; cost?: number }

type FormProps = {
  products: StockProduct[]
  initialProductId?: string
  toast: (message: string) => void
  onStockChanged: (productId: string, change: StockChange) => void
  onClose: () => void
}

const inputClass = 'field'
const primaryButton = 'rounded-[8px] bg-ink px-3.5 py-2 text-[12px] font-medium text-white transition hover:bg-black disabled:opacity-50'
const ghostButton = 'rounded-[8px] border border-line-strong px-3.5 py-2 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink'
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: readCachedRegional().timeZone })

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null)
  return typeof body?.error === 'string' ? body.error : fallback
}
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{label}</span>
      {children}
    </label>
  )
}

function FormShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="border-b border-line bg-sunk px-5 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-medium tracking-tight">{title}</h3>
        <button type="button" onClick={onClose} className="rounded-[6px] px-2 py-1 text-[11px] font-medium text-ink-muted transition hover:bg-well hover:text-ink">Close</button>
      </div>
      {children}
    </div>
  )
}

function ProductSelect({ products, value, onChange }: { products: StockProduct[]; value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      {products.map((p) => (
        <option key={p.id} value={p.id}>{p.name} ({p.stock} on hand)</option>
      ))}
    </select>
  )
}

/* ------------------------------ Record delivery ------------------------------ */
export function DeliveryForm({ products, initialProductId, toast, onStockChanged, onClose }: FormProps) {
  const first = products.find((p) => p.id === initialProductId) ?? products[0]
  const [productId, setProductId] = useState(first?.id ?? '')
  const [quantity, setQuantity] = useState('')
  const [cost, setCost] = useState(first ? String(first.cost) : '')
  const [supplier, setSupplier] = useState('')
  const [date, setDate] = useState(today())
  const [saving, setSaving] = useState(false)
  const product = products.find((p) => p.id === productId)

  const choose = (id: string) => {
    setProductId(id)
    const next = products.find((p) => p.id === id)
    if (next) setCost(String(next.cost))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const qty = Number(quantity)
    const unitCost = Number(cost)
    if (!product) return toast('Choose a product.')
    if (!Number.isInteger(qty) || qty <= 0) return toast('Quantity must be a whole number above zero.')
    if (!Number.isInteger(unitCost) || unitCost < 0) return toast('Cost must be a whole amount (0 or more).')
    setSaving(true)
    try {
      const response = await fetch('/api/stock/deliveries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, supplier: supplier.trim(), quantity: qty, cost_price: unitCost, delivery_date: date }),
      })
      if (!response.ok) throw new Error(await readError(response, 'Could not save delivery.'))
      onStockChanged(product.id, { stockDelta: qty, cost: unitCost })
      toast(`Received ${qty} × ${product.name}.`)
      onClose()
    } catch (error) {
      toast(errorText(error, 'Could not save delivery.'))
    } finally {
      setSaving(false)
    }
  }

  const qty = Number(quantity)
  const unitCost = Number(cost)
  const regional = readCachedRegional()

  return (
    <FormShell title="Record delivery" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        <Field label="Product"><ProductSelect products={products} value={productId} onChange={choose} /></Field>
        <Field label="Supplier"><input className={inputClass} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Uganda Breweries" /></Field>
        <Field label={`Quantity received${product ? ` (${product.unit})` : ''}`}>
          <input className={inputClass} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label={`Cost per unit (${regional.currency})`}>
          <input className={inputClass} inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Delivery date"><input type="date" className={inputClass} value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="flex items-end justify-between gap-3">
          <p className="text-[11px] text-ink-muted">
            {qty > 0 && unitCost >= 0 ? `Total cost: ${formatMoney(qty * unitCost, regional)}` : ''}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={ghostButton}>Cancel</button>
            <button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Saving…' : 'Save delivery'}</button>
          </div>
        </div>
      </form>
    </FormShell>
  )
}

/* -------------------------------- Record wastage ------------------------------- */
const WASTAGE_REASONS = ['Breakage', 'Spillage', 'Expired', 'Lost or stolen', 'Complimentary', 'Other']

export function WastageForm({ products, initialProductId, toast, onStockChanged, onClose }: FormProps) {
  const [productId, setProductId] = useState(initialProductId ?? products[0]?.id ?? '')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState(WASTAGE_REASONS[0])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const product = products.find((p) => p.id === productId)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const qty = Number(quantity)
    if (!product) return toast('Choose a product.')
    if (!Number.isInteger(qty) || qty <= 0) return toast('Quantity must be a whole number above zero.')
    if (qty > product.stock) return toast(`Only ${product.stock} on hand.`)
    setSaving(true)
    try {
      // The backend adds `quantity` to stock, so wastage is sent as a negative number.
      await backendApi.createAdjustment({
        product_id: product.id,
        quantity: -qty,
        adjustment_type: 'wastage',
        reason: (note.trim() ? `${reason}: ${note.trim()}` : reason).slice(0, 500),
      })
      onStockChanged(product.id, { stockDelta: -qty })
      toast(`Recorded ${qty} × ${product.name} as wastage.`)
      onClose()
    } catch (error) {
      toast(errorText(error, 'Could not record wastage.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormShell title="Record wastage" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        <Field label="Product"><ProductSelect products={products} value={productId} onChange={setProductId} /></Field>
        <Field label="Quantity lost">
          <input className={inputClass} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Reason">
          <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
            {WASTAGE_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Note (optional)"><input className={inputClass} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 md:col-span-2">
          <button type="button" onClick={onClose} className={ghostButton}>Cancel</button>
          <button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Saving…' : 'Record wastage'}</button>
        </div>
      </form>
    </FormShell>
  )
}

/* --------------------------------- Count sheet --------------------------------- */
export function CountSheet({ products, toast, onStockChanged, onClose }: FormProps) {
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [applyCorrection, setApplyCorrection] = useState(false)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const entries = products
      .filter((p) => (counts[p.id] ?? '').trim() !== '')
      .map((p) => ({ product: p, counted: Number(counts[p.id]) }))
    if (entries.length === 0) return toast('Enter a counted quantity for at least one product.')
    if (entries.some((e) => !Number.isInteger(e.counted) || e.counted < 0)) return toast('Counts must be whole numbers, 0 or more.')

    setSaving(true)
    const results = await Promise.allSettled(
      entries.map(async ({ product, counted }) => {
        await backendApi.createInventoryCount({ product_id: product.id, counted_quantity: counted, notes: notes.trim() || undefined })
        const delta = counted - product.stock
        if (applyCorrection && delta !== 0) {
          await backendApi.createAdjustment({ product_id: product.id, quantity: delta, adjustment_type: 'adjustment', reason: 'Stock count correction' })
          onStockChanged(product.id, { stockDelta: delta })
        }
      }),
    )
    setSaving(false)
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed === 0) {
      toast(`Saved ${entries.length} count${entries.length === 1 ? '' : 's'}.`)
      onClose()
    } else {
      toast(`${entries.length - failed} saved, ${failed} failed. Check and try again.`)
    }
  }

  return (
    <FormShell title="Physical stock count" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead className="border-b border-line text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              <tr><th className="px-3 pb-2 font-semibold">Item</th><th className="px-3 pb-2 text-right font-semibold">System</th><th className="px-3 pb-2 font-semibold">Counted</th><th className="px-3 pb-2 text-right font-semibold">Variance</th></tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const raw = counts[p.id] ?? ''
                const variance = raw.trim() === '' ? null : Number(raw) - p.stock
                return (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2.5 font-medium">{p.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{p.stock}</td>
                    <td className="px-3 py-2.5">
                      <input
                        className="h-8 w-24 rounded-[6px] border border-line-strong px-2 text-[13px] tabular-nums outline-none transition focus:border-ink"
                        inputMode="numeric"
                        value={raw}
                        onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value.replace(/\D/g, '') }))}
                      />
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${variance === null || variance === 0 ? 'text-ink-muted' : variance < 0 ? 'font-medium text-alert' : 'font-medium text-ink'}`}>
                      {variance === null ? '—' : variance > 0 ? `+${variance}` : variance}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Field label="Notes (optional)"><input className={inputClass} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-[11px] font-medium text-ink-muted">
          <input type="checkbox" checked={applyCorrection} onChange={(e) => setApplyCorrection(e.target.checked)} />
          Also correct on-hand stock to the counted quantity (records an adjustment)
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={ghostButton}>Cancel</button>
          <button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Saving…' : 'Save count'}</button>
        </div>
      </form>
    </FormShell>
  )
}

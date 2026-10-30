'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { backendApi } from '@/lib/backend-api'
import { DeliveryForm, WastageForm, CountSheet } from '@/components/stock/stock-forms'
import { formatDate, formatMoney, readCachedRegional } from '@/lib/locale'
import { ChevronDown, Truck } from 'lucide-react'

export type Product = { id:string; name:string; category:string; price:number; stock:number; reorder:number; cost:number; unit:string; tone:string; note?:string }
export type Role = 'Admin'|'Cashier'|'Manager'|'Storekeeper'

// Reads the workspace currency cached by the dashboard, falling back to the regional default.
export const money=(n:number)=>formatMoney(n,readCachedRegional())

type StockView = 'stock' | 'counts' | 'movements' | 'wastage' | 'deliveries'
type StockFormKind = 'delivery' | 'wastage' | 'count'

function Shell({eyebrow,title,sub,children,action}:{eyebrow:string;title:string;sub:string;children:any;action?:React.ReactNode}){return <div className="mx-auto w-full max-w-[1180px]"><header className="border-b border-line pb-8 text-center md:pb-10"><p className="eyebrow justify-center">{eyebrow}</p><h2 className="display mx-auto mt-4 max-w-3xl text-balance text-[34px] text-ink sm:text-[44px] lg:text-[52px]">{title}</h2><p className="mx-auto mt-4 max-w-xl text-[13px] leading-relaxed text-ink-muted sm:text-sm">{sub}</p>{action&&<div className="mt-7 flex flex-wrap items-center justify-center gap-2">{action}</div>}</header><div className="pt-6 md:pt-8">{children}</div></div>}
const Card=({children,className=''}:{children:any;className?:string})=><section className={`border-t border-line pt-6 ${className}`}>{children}</section>

function TablePage({title,sub,children,action,eyebrow='Stock control'}:{title:string;sub:string;children:any;action?:React.ReactNode;eyebrow?:string}){return <Shell eyebrow={eyebrow} title={title} sub={sub} action={action}>{children}</Shell>}

const formatWhen = (value: unknown) => {
  const d = new Date(String(value ?? ''))
  return Number.isNaN(d.getTime()) ? '' : formatDate(d, readCachedRegional())
}
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

function describeRecord(view: StockView, item: any, nameOf: (id: string) => string) {
  const name = nameOf(item.product_id ?? item.productId)
  if (view === 'counts') return { name, headline: `Counted ${item.counted_quantity} (system ${item.system_quantity})`, detail: [`Variance ${signed(Number(item.variance))}`, item.notes].filter(Boolean).join(' · '), when: item.created_at }
  if (view === 'movements') return { name, headline: `${signed(Number(item.quantity))} units`, detail: [item.movement_type, item.reference].filter(Boolean).join(' · '), when: item.created_at }
  if (view === 'wastage') return { name, headline: `${signed(Number(item.quantity))} units`, detail: [item.adjustment_type, item.reason].filter(Boolean).join(' · '), when: item.created_at }
  // Deliveries are the only remaining list view; 'stock' renders the table above instead.
  return { name, headline: `+${item.quantity} units`, detail: [item.supplier, item.costPrice != null ? `${money(Number(item.costPrice))} each` : ''].filter(Boolean).join(' · '), when: item.deliveryDate ?? item.createdAt }
}

export function Stock({ toast, role = 'Manager', products: stockItems = [], onStockChanged = () => undefined }: any) {
  const [view, setView] = useState<StockView>('stock')
  const [form, setForm] = useState<StockFormKind | null>(null)
  const [formProduct, setFormProduct] = useState<string | undefined>()
  const [report, setReport] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [filterId, setFilterId] = useState<string | undefined>()
  const [query, setQuery] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const latestRequest = useRef(0)
  const canManage = role === 'Owner' || role === 'Admin' || role === 'Manager' || role === 'Storekeeper'
  const nameOf = (id: string) => stockItems.find((p: Product) => p.id === id)?.name ?? id

  const loadView = async (next: StockView, productId?: string) => {
    const requestId = ++latestRequest.current
    setView(next); setFilterId(productId); setReport([])
    if (next === 'stock') return
    setLoading(true)
    try {
      let items: any[] = []
      if (next === 'counts') items = (await backendApi.inventoryCounts()).items as any[]
      else if (next === 'movements') items = (await backendApi.inventoryMovements(productId)).items as any[]
      else if (next === 'wastage') items = (await backendApi.inventoryAdjustments()).items as any[]
      else items = (await fetch('/api/stock/deliveries').then((r) => (r.ok ? r.json() : { items: [] }))).items ?? []
      if (requestId === latestRequest.current) setReport(items)
    } catch {
      if (requestId === latestRequest.current) toast('Could not load inventory data.')
    } finally {
      if (requestId === latestRequest.current) setLoading(false)
    }
  }

  const openForm = (kind: StockFormKind, productId?: string) => { setFormProduct(productId); setForm(kind) }
  const closeForm = () => { setForm(null); setFormProduct(undefined); if (view !== 'stock') void loadView(view, filterId) }

  const visible = stockItems.filter((p: Product) => (!lowOnly || p.stock <= p.reorder) && `${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase()))
  const lowCount = stockItems.filter((p: Product) => p.stock <= p.reorder).length
  const stockValue = stockItems.reduce((sum: number, p: Product) => sum + p.stock * p.cost, 0)
  const variance = report.reduce((sum, item) => sum + Number(item.variance ?? 0), 0)
  const formProps = { products: stockItems, initialProductId: formProduct, toast, onStockChanged, onClose: closeForm }

  const tabs: { key: StockView; label: string }[] = [
    { key: 'stock', label: 'Stock on hand' },
    { key: 'counts', label: 'Physical count' },
    { key: 'movements', label: 'Movement log' },
    { key: 'wastage', label: 'Wastage' },
    { key: 'deliveries', label: 'Deliveries' },
  ]

  return (
    <TablePage
      title="Stock & deliveries"
      sub="Track live stock, deliveries, wastage, and physical counts."
      action={canManage && (
        <>
          <button onClick={() => openForm('delivery')} className="inline-flex items-center gap-1.5 rounded-[8px] bg-ink px-4 py-2 text-[12px] font-medium text-white transition hover:bg-black"><Truck className="size-3.5" />Record delivery</button>
          <button onClick={() => openForm('wastage')} className="rounded-[8px] border border-line-strong px-4 py-2 text-[12px] font-medium text-ink-muted transition hover:border-alert hover:text-alert">Record wastage</button>
          <button onClick={() => openForm('count')} className="rounded-[8px] border border-line-strong px-4 py-2 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink">Stock count</button>
        </>
      )}
    >
      {form === 'delivery' && <DeliveryForm {...formProps} />}
      {form === 'wastage' && <WastageForm {...formProps} />}
      {form === 'count' && <CountSheet {...formProps} />}

      <div className="mt-2 flex items-center gap-6 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => loadView(t.key)} className={`-mb-px shrink-0 border-b-2 pb-3 text-[12px] transition ${view === t.key ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}>{t.label}</button>
        ))}
      </div>

      {view === 'stock' ? (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b border-line py-4">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items…" className="field w-56" />
            <button onClick={() => setLowOnly((v) => !v)} className={`text-[12px] font-medium transition ${lowOnly ? 'text-warn' : 'text-ink-muted hover:text-ink'}`}>{lowOnly ? 'Showing low stock' : 'Low stock'} ({lowCount})</button>
            <span className="ml-auto text-[11px] text-ink-muted">Stock value at cost <b className="ml-1 font-medium tabular-nums text-ink">{money(stockValue)}</b></span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-transparent text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                <tr className="border-b border-line"><th className="px-3 pb-2 font-semibold">Item</th><th className="px-3 pb-2 font-semibold">Unit</th><th className="px-3 pb-2 text-right font-semibold">On hand</th><th className="px-3 pb-2 text-right font-semibold">Reorder at</th><th className="px-3 pb-2 font-semibold">Status</th><th className="px-3 pb-2"></th></tr>
              </thead>
              <tbody>
                {visible.map((p: Product) => (
                  <tr key={p.id} className="border-b border-line transition last:border-0 hover:bg-sunk/60">
                    <td className="px-3 py-3.5 font-medium">{p.name}<span className="ml-2 text-[11px] font-normal text-ink-muted">{p.category}</span></td>
                    <td className="px-3 py-3.5 text-[13px] text-ink-muted">{p.unit}</td>
                    <td className="px-3 py-3.5 text-right font-medium tabular-nums">{p.stock}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-ink-muted">{p.reorder}</td>
                    <td className="px-3 py-3.5"><span className={`text-[11px] font-medium uppercase tracking-wide ${p.stock <= p.reorder ? 'text-warn' : 'text-ink-muted'}`}>{p.stock <= p.reorder ? 'Low stock' : 'In stock'}</span></td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center justify-end gap-3">
                        {canManage && <button onClick={() => openForm('delivery', p.id)} className="text-[11px] font-medium text-ink underline-offset-4 transition hover:underline">Receive</button>}
                        <button onClick={() => loadView('movements', p.id)} aria-label={`Open ${p.name} movement history`} className="rounded-[6px] p-1 text-ink-soft transition hover:text-ink"><ChevronDown className="size-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center"><p className="text-[13px] font-medium text-ink-muted">{stockItems.length === 0 ? 'No stock items yet' : 'No items match'}</p><p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-ink-soft">{stockItems.length === 0 ? 'Add your bottles and ingredients under Menu & prices. Deliveries, counts and wastage are recorded here against them.' : 'Try another name, or clear the search to see every item.'}</p></td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="py-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-[15px] font-semibold">
              {view === 'counts' ? 'Physical counts' : view === 'movements' ? (filterId ? `Movements: ${nameOf(filterId)}` : 'Movement history') : view === 'wastage' ? 'Wastage and adjustments' : 'Deliveries'}
            </h3>
            {view === 'counts' && <span className="text-[11px] font-medium text-ink-muted">Net variance: {signed(variance)}</span>}
            {filterId && <button onClick={() => loadView('movements')} className="text-[11px] font-medium text-ink-muted underline-offset-4 hover:underline">Show all</button>}
          </div>
          {loading ? <p className="text-[13px] text-ink-muted">Loading…</p> : report.length === 0 ? <p className="text-[13px] text-ink-muted">No records found.</p> : (
            <ul className="divide-y divide-line border-y border-line">
              {report.slice(0, 50).map((item: any, index: number) => {
                const r = describeRecord(view, item, nameOf)
                return (
                  <li key={item.id ?? index} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-[13px]">
                    <b className="min-w-32 font-medium">{r.name}</b>
                    <span>{r.headline}</span>
                    <span className="text-[11px] text-ink-muted">{r.detail}</span>
                    <span className="ml-auto text-[11px] text-ink-muted">{formatWhen(r.when)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </TablePage>
  )
}

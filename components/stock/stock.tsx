'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { backendApi } from '@/lib/backend-api'
import { DeliveryForm, WastageForm, CountSheet, TransferForm } from '@/components/stock/stock-forms'
import { ChevronDown, Truck } from 'lucide-react'

export type Product = { id:string; name:string; category:string; price:number; stock:number; reorder:number; cost:number; unit:string; tone:string; note?:string }
export type Role = 'Admin'|'Cashier'|'Manager'|'Storekeeper'

export const money=(n:number)=>`UGX ${n.toLocaleString()}`

type StockView = 'stock' | 'counts' | 'movements' | 'wastage' | 'deliveries' | 'transfers'
type StockFormKind = 'delivery' | 'wastage' | 'count' | 'transfer'

function Shell({eyebrow,title,sub,children,action}:{eyebrow:string;title:string;sub:string;children:any;action?:React.ReactNode}){return <div className="mx-auto w-full max-w-[1180px]"><header className="mb-8 flex flex-col items-center gap-4 text-center"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-[#8a96a5]">{eyebrow}</p><h2 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h2><p className="mx-auto mt-2 max-w-2xl text-sm text-[#7c8796]">{sub}</p></div>{action}</header>{children}</div>}
const Card=({children,className=''}:{children:any;className?:string})=><div className={`rounded-2xl border border-[#e0e6ee] bg-white p-5 shadow-[0_6px_18px_rgba(57,72,90,.04)] ${className}`}>{children}</div>

function TablePage({title,sub,children,action}:{title:string;sub:string;children:any;action?:React.ReactNode}){return <Shell eyebrow="Manager workspace" title={title} sub={sub} action={action}><Card className="overflow-hidden p-0">{children}</Card></Shell>}

const formatWhen = (value: unknown) => {
  const d = new Date(String(value ?? ''))
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

function describeRecord(view: StockView, item: any, nameOf: (id: string) => string) {
  const name = nameOf(item.product_id ?? item.productId)
  if (view === 'counts') return { name, headline: `Counted ${item.counted_quantity} (system ${item.system_quantity})`, detail: [`Variance ${signed(Number(item.variance))}`, item.notes].filter(Boolean).join(' · '), when: item.created_at }
  if (view === 'movements') return { name, headline: `${signed(Number(item.quantity))} units`, detail: [item.movement_type, item.reference].filter(Boolean).join(' · '), when: item.created_at }
  if (view === 'wastage') return { name, headline: `${signed(Number(item.quantity))} units`, detail: [item.adjustment_type, item.reason].filter(Boolean).join(' · '), when: item.created_at }
  if (view === 'deliveries') return { name, headline: `+${item.quantity} units`, detail: [item.supplier, item.costPrice != null ? `UGX ${Number(item.costPrice).toLocaleString()} each` : ''].filter(Boolean).join(' · '), when: item.deliveryDate ?? item.createdAt }
  return { name, headline: `${item.quantity} units`, detail: [`${item.fromLocation ?? ''} → ${item.toLocation ?? ''}`, item.reason].filter(Boolean).join(' · '), when: item.createdAt }
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
  const canManage = role === 'Admin' || role === 'Manager' || role === 'Storekeeper'
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
      else if (next === 'deliveries') items = (await fetch('/api/stock/deliveries').then((r) => (r.ok ? r.json() : { items: [] }))).items ?? []
      else items = (await fetch('/api/stock/transfers').then((r) => (r.ok ? r.json() : { items: [] }))).items ?? []
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

  const tabs: { key: StockView; label: string; manageOnly?: boolean }[] = [
    { key: 'stock', label: 'Stock on hand' },
    { key: 'counts', label: 'Physical count' },
    { key: 'movements', label: 'Movement log' },
    { key: 'wastage', label: 'Wastage' },
    { key: 'deliveries', label: 'Deliveries' },
    { key: 'transfers', label: 'Transfers', manageOnly: true },
  ]

  return (
    <TablePage
      title="Stock & deliveries"
      sub="Track live stock, deliveries, wastage, and physical counts."
      action={canManage && (
        <>
          <button onClick={() => openForm('delivery')} className="rounded-xl bg-[#292d34] px-4 py-3 text-sm font-bold text-white"><Truck className="mr-2 inline size-4" />Record delivery</button>
          <button onClick={() => openForm('transfer')} className="rounded-xl border border-[#292d34] px-4 py-3 text-sm font-bold">Transfer stock</button>
          <button onClick={() => openForm('wastage')} className="rounded-xl border border-[#a13e3e] px-4 py-3 text-sm font-bold text-red-600">Record wastage</button>
          <button onClick={() => openForm('count')} className="rounded-xl border border-[#292d34] px-4 py-3 text-sm font-bold">Stock count</button>
        </>
      )}
    >
      {form === 'delivery' && <DeliveryForm {...formProps} />}
      {form === 'transfer' && <TransferForm {...formProps} />}
      {form === 'wastage' && <WastageForm {...formProps} />}
      {form === 'count' && <CountSheet {...formProps} />}

      <div className="flex flex-wrap gap-2 border-b border-[#edf0f4] p-5">
        {tabs.filter((t) => !t.manageOnly || canManage).map((t) => (
          <button key={t.key} onClick={() => loadView(t.key)} className={`rounded-xl border px-4 py-2 text-xs font-bold ${view === t.key ? 'bg-[#292d34] text-white' : ''}`}>{t.label}</button>
        ))}
      </div>

      {view === 'stock' ? (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b border-[#edf0f4] p-4">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items…" className="w-56 rounded-xl border border-[#dce3ec] px-3 py-2 text-sm" />
            <button onClick={() => setLowOnly((v) => !v)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${lowOnly ? 'bg-[#fff0e8] text-[#b87555]' : ''}`}>Low stock ({lowCount})</button>
            <span className="ml-auto text-xs font-bold text-[#687587]">Stock value at cost: UGX {stockValue.toLocaleString()}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-[#f7f9fc] text-xs uppercase tracking-wider text-[#8a96a5]">
                <tr><th className="p-4">Item</th><th>Unit</th><th>On hand</th><th>Reorder at</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {visible.map((p: Product) => (
                  <tr key={p.id} className="border-t border-[#edf0f4]">
                    <td className="p-4 font-bold">{p.name}<span className="ml-2 text-xs font-normal text-[#8a96a5]">{p.category}</span></td>
                    <td>{p.unit}</td>
                    <td className="font-bold">{p.stock}</td>
                    <td>{p.reorder}</td>
                    <td><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${p.stock <= p.reorder ? 'bg-[#fff0e8] text-[#b87555]' : 'bg-[#e5f4e9] text-[#47815a]'}`}>{p.stock <= p.reorder ? 'LOW STOCK' : 'IN STOCK'}</span></td>
                    <td>
                      <div className="flex items-center gap-2">
                        {canManage && <button onClick={() => openForm('delivery', p.id)} className="rounded-lg bg-[#e5f4e9] px-3 py-2 text-[10px] font-bold text-[#47815a]">Receive</button>}
                        {canManage && <button onClick={() => openForm('transfer', p.id)} className="rounded-lg border px-3 py-2 text-[10px] font-bold">Transfer</button>}
                        <button onClick={() => loadView('movements', p.id)} aria-label={`Open ${p.name} movement history`}><ChevronDown className="size-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-sm text-[#8a96a5]">No items match.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">
              {view === 'counts' ? 'Physical counts' : view === 'movements' ? (filterId ? `Movements: ${nameOf(filterId)}` : 'Movement history') : view === 'wastage' ? 'Wastage and adjustments' : view === 'deliveries' ? 'Deliveries' : 'Stock transfers'}
            </h3>
            {view === 'counts' && <span className="text-xs font-bold text-[#47815a]">Net variance: {signed(variance)}</span>}
            {filterId && <button onClick={() => loadView('movements')} className="text-xs font-bold text-[#687587]">Show all</button>}
          </div>
          {loading ? <p className="text-sm text-[#8a96a5]">Loading…</p> : report.length === 0 ? <p className="text-sm text-[#8a96a5]">No records found.</p> : (
            <ul className="divide-y divide-[#edf0f4] rounded-xl border border-[#e0e6ee] bg-white">
              {report.slice(0, 50).map((item: any, index: number) => {
                const r = describeRecord(view, item, nameOf)
                return (
                  <li key={item.id ?? index} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
                    <b className="min-w-32">{r.name}</b>
                    <span>{r.headline}</span>
                    <span className="text-xs text-[#687587]">{r.detail}</span>
                    <span className="ml-auto text-xs text-[#8a96a5]">{formatWhen(r.when)}</span>
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

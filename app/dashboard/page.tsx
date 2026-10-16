'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { backendApi, type PaymentMethod } from '@/lib/backend-api'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Tags,
  UserRound,
  UsersRound,
  Wine,
  X,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────

type Product = {
  id: string
  name: string
  category: string
  price: number
  stock: number
  reorder: number
  cost: number
  unit: string
  tone: string
}

type Role = 'Admin' | 'Cashier' | 'Manager' | 'Storekeeper'
type Page =
  | 'Overview'
  | 'New sale'
  | 'Open tabs'
  | 'Stock & deliveries'
  | 'Daily close'
  | 'Reports'
  | 'Menu & prices'
  | 'Team & permissions'
  | 'Audit log'
  | 'Settings'

type CartLine = { p: Product; q: number; note?: string }

type TabRow = {
  id: string
  table_label: string
  owner_name: string
  total: number
  status: string
  opened_at: string
}

// ─── Helpers ──────────────────────────────────────────────

const money = (n: number) => `UGX ${n.toLocaleString()}`

function normalizeRole(value: unknown): Role {
  const role = String(value ?? 'Manager').toLowerCase()
  if (role === 'admin') return 'Admin'
  if (role === 'cashier') return 'Cashier'
  if (role === 'storekeeper') return 'Storekeeper'
  return 'Manager'
}

function getGreeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

function toPaymentMethod(label: string): PaymentMethod {
  const v = label.toLowerCase()
  if (v.includes('mobile') || v.includes('momo')) return 'mobile_money'
  if (v.includes('card')) return 'card'
  return 'cash'
}

function mapProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name ?? 'Item',
    category: row.category ?? 'General',
    price: Number(row.price) || 0,
    stock: Number(row.stock) || 0,
    reorder: Number(row.reorder) || 0,
    cost: Number(row.cost) || 0,
    unit: row.unit ?? 'unit',
    tone: row.tone ?? 'slate',
  }
}

function printReceipt(receipt: {
  saleId?: string
  receiptNumber?: number | string
  cashier: string
  payment: string
  changeDue?: number
  items: { name: string; quantity: number; price: number; total: number; note?: string }[]
  total: number
}) {
  const w = window.open('', '_blank', 'width=420,height=700')
  if (!w) return false
  const rows = receipt.items
    .map(
      (item) =>
        `<tr><td>${item.name}${item.note ? ` <span style="font-size:10px;color:#687587">(${item.note})</span>` : ''}<br><small>${item.quantity} × ${money(item.price)}</small></td><td>${money(item.total)}</td></tr>`
    )
    .join('')
  w.document.write(`<!doctype html><html><head><title>Receipt</title><style>
body{font-family:Arial,sans-serif;color:#292d34;width:320px;margin:24px auto}
h1{text-align:center;font-size:20px;margin:0 0 4px}p{color:#687587;font-size:12px;text-align:center}
table{width:100%;border-collapse:collapse;font-size:13px}td{padding:9px 0;border-bottom:1px solid #e5e7eb}
td:last-child{text-align:right}.total{display:flex;justify-content:space-between;font-weight:700;font-size:18px;margin-top:18px}
.meta{display:flex;justify-content:space-between;font-size:12px;margin:4px 0}
</style></head><body>
<h1>THE SIPPER</h1><p>Bar management receipt</p>
<div class="meta"><span>Receipt</span><span>#${receipt.receiptNumber ?? '--'}</span></div>
<div class="meta"><span>Sale</span><span>${receipt.saleId ?? 'Sale'}</span></div>
<div class="meta"><span>Cashier</span><span>${receipt.cashier}</span></div>
<div class="meta"><span>Payment</span><span>${receipt.payment}</span></div>
${receipt.changeDue != null && receipt.changeDue > 0 ? `<div class="meta"><span>Change due</span><span>${money(receipt.changeDue)}</span></div>` : ''}
<table>${rows}</table>
<div class="total"><span>Total</span><span>${money(receipt.total)}</span></div>
<p>Thank you for your visit.</p>
<script>window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
  return true
}

// ─── Nav ──────────────────────────────────────────────────

const nav: { label: Page; icon: any; roles: Role[] }[] = [
  { label: 'Overview', icon: LayoutDashboard, roles: ['Admin', 'Cashier', 'Manager', 'Storekeeper'] },
  { label: 'New sale', icon: CreditCard, roles: ['Admin', 'Cashier', 'Manager'] },
  { label: 'Open tabs', icon: ClipboardList, roles: ['Admin', 'Cashier', 'Manager'] },
  { label: 'Stock & deliveries', icon: Package, roles: ['Admin', 'Manager', 'Storekeeper'] },
  { label: 'Daily close', icon: ClipboardCheck, roles: ['Admin', 'Manager'] },
  { label: 'Reports', icon: BarChart3, roles: ['Admin', 'Manager'] },
  { label: 'Menu & prices', icon: Tags, roles: ['Admin', 'Manager'] },
  { label: 'Team & permissions', icon: UsersRound, roles: ['Admin', 'Manager'] },
  { label: 'Audit log', icon: FileText, roles: ['Admin', 'Manager'] },
  { label: 'Settings', icon: Settings, roles: ['Admin', 'Manager'] },
]

function PageSidebar({ page, go }: { page: Page; go: (p: Page) => void }) {
  return (
    <nav
      aria-label="Workspace navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center gap-1 overflow-x-auto bg-[#282d35] px-3 text-white shadow-2xl lg:inset-y-0 lg:bottom-auto lg:left-0 lg:h-auto lg:w-[250px] lg:flex-col lg:items-stretch lg:gap-1 lg:overflow-y-auto lg:overflow-x-hidden lg:p-5"
    >
      <div className="mb-0 hidden items-center gap-3 px-2 lg:mb-6 lg:flex">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#d8e7ff] text-[#282d35]">
          <Wine className="size-5" />
        </div>
        <div>
          <b className="text-sm">THE SIPPER</b>
          <p className="text-[9px] uppercase tracking-[.16em] text-[#aeb9c8]">bar management</p>
        </div>
      </div>
      {nav.map(({ label, icon: Icon }) => (
        <button
          key={label}
          onClick={() => go(label)}
          className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold ${
            page === label ? 'bg-[#f8fafc] text-[#292d34]' : 'text-[#d0d7e2] hover:bg-[#39414d]'
          }`}
        >
          <Icon className="size-[18px]" />
          {label}
        </button>
      ))}
    </nav>
  )
}

// ─── Main page ────────────────────────────────────────────

export default function Page() {
  const { data: session } = useSession()
  const [page, setPage] = useState<Page>('Overview')
  const [role, setRole] = useState<Role>('Manager')
  const [greeting, setGreeting] = useState('Welcome back')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [cart, setCart] = useState<CartLine[]>([])
  const [payment, setPayment] = useState('Cash')
  const [closed, setClosed] = useState(false)
  const [inventory, setInventory] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const toast = (s: string) => {
    setNotice(s)
    setTimeout(() => setNotice(''), 2800)
  }
  const go = (p: Page) => setPage(p)

  useEffect(() => {
    setRole(normalizeRole((session?.user as { role?: string } | undefined)?.role))
  }, [session])

  useEffect(() => {
    setGreeting(getGreeting())
  }, [])

  // Load inventory from FastAPI
  useEffect(() => {
    setLoading(true)
    backendApi
      .inventory()
      .then((data) => {
        const rows = Array.isArray(data?.items) ? data.items : []
        setInventory(rows.map(mapProduct))
      })
      .catch(() => setInventory([]))
      .finally(() => setLoading(false))
  }, [])

  const allowed = nav.filter((n) => n.roles.includes(role))
  useEffect(() => {
    if (!allowed.some((item) => item.label === page)) setPage('Overview')
  }, [allowed, page])

  const filtered = useMemo(
    () =>
      inventory.filter(
        (p) =>
          (category === 'All' || p.category === category) &&
          p.name.toLowerCase().includes(query.toLowerCase())
      ),
    [inventory, category, query]
  )

  const low = inventory.filter((p) => p.stock <= p.reorder).length
  const total = cart.reduce((s, x) => s + x.p.price * x.q, 0)

  const add = (p: Product) =>
    setCart((c) => {
      const note = window.prompt(`Note for ${p.name} (optional)`) ?? ''
      return c.some((x) => x.p.id === p.id)
        ? c.map((x) => (x.p.id === p.id ? { ...x, q: x.q + 1 } : x))
        : [...c, { p, q: 1, note }]
    })

  const adjust = (id: string, d: number) =>
    setCart((c) => c.map((x) => (x.p.id === id ? { ...x, q: x.q + d } : x)).filter((x) => x.q > 0))

  const receiveStock = async (id: string, quantity: number, reference: string) => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      await backendApi.createDelivery({
        supplier: reference || 'Delivery',
        product_id: id,
        quantity,
        cost_price: 0,
        delivery_date: today,
      })
      setInventory((items) =>
        items.map((p) => (p.id === id ? { ...p, stock: p.stock + quantity } : p))
      )
      toast(`Received ${quantity} units.`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not record stock.')
    }
  }

  const pay = async () => {
    if (cart.length === 0) {
      toast('Cart is empty.')
      return
    }
    try {
      const method = toPaymentMethod(payment)
      const sale = await backendApi.createSale({
        payment_method: method,
        tendered_amount: method === 'cash' ? total : null,
        items: cart.map(({ p, q, note }) => ({
          product_id: p.id,
          quantity: q,
          note: note || undefined,
        })),
        payment_items: [{ method, amount: total }],
      })

      printReceipt({
        saleId: sale.id,
        receiptNumber: sale.receipt_number,
        cashier: session?.user?.name ?? 'Cashier',
        payment,
        changeDue: sale.change_due,
        items: cart.map(({ p, q, note }) => ({
          name: p.name,
          quantity: q,
          price: p.price,
          total: p.price * q,
          note,
        })),
        total,
      })

      setInventory((items) =>
        items.map((p) => {
          const sold = cart.find((c) => c.p.id === p.id)
          return sold ? { ...p, stock: Math.max(0, p.stock - sold.q) } : p
        })
      )
      setCart([])
      toast(`Sale confirmed. Receipt #${sale.receipt_number}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save sale.')
    }
  }

  const noticeEl = notice && (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#292d34] px-5 py-3 text-sm font-bold text-white shadow-xl"
    >
      {notice}
    </div>
  )

  const shell = (children: React.ReactNode) => (
    <>
      <PageSidebar page={page} go={go} />
      <main className="relative min-h-screen pl-0 lg:pl-[250px] bg-[#dce9fb] p-4 text-[#292d34] md:p-8">
        <div className="mx-auto w-full max-w-[1240px]">{children}</div>
        {noticeEl}
      </main>
    </>
  )

  if (page === 'New sale') {
    return shell(
      <SaleView
        filtered={filtered}
        category={category}
        setCategory={setCategory}
        query={query}
        setQuery={setQuery}
        add={add}
        cart={cart}
        total={total}
        adjust={adjust}
        payment={payment}
        setPayment={setPayment}
        pay={pay}
        loading={loading}
      />
    )
  }

  if (page === 'Open tabs') {
    return shell(<TabsView toast={toast} inventory={inventory} />)
  }

  if (page === 'Stock & deliveries') {
    return shell(
      <StockView
        products={inventory}
        onReceive={(p) => {
          const value = window.prompt(`How many ${p.unit}s of ${p.name} arrived?`)
          const quantity = Number(value)
          if (Number.isInteger(quantity) && quantity > 0) receiveStock(p.id, quantity, 'Delivery')
        }}
        role={role}
      />
    )
  }

  if (page === 'Daily close') {
    return shell(<CloseDayView closed={closed} setClosed={setClosed} toast={toast} />)
  }

  if (page === 'Reports') {
    return shell(<ReportsView toast={toast} />)
  }

  if (page === 'Menu & prices') {
    return shell(<MenuView inventory={inventory} />)
  }

  if (page === 'Team & permissions') {
    return shell(<TeamView toast={toast} />)
  }

  if (page === 'Audit log') {
    return shell(<AuditView />)
  }

  if (page === 'Settings') {
    return shell(<SettingsView toast={toast} />)
  }

  // Overview (default)
  return shell(
    <OverviewView
      role={role}
      greeting={greeting}
      name={session?.user?.name ?? 'there'}
      low={low}
      inventoryCount={inventory.length}
      go={go}
    />
  )
}

// ─── Sub-views ────────────────────────────────────────────

function OverviewView({
  role,
  greeting,
  name,
  low,
  inventoryCount,
  go,
}: {
  role: Role
  greeting: string
  name: string
  low: number
  inventoryCount: number
  go: (p: Page) => void
}) {
  return (
    <section className="space-y-6">
      <header>
        <p className="text-xs font-semibold text-[#8a96a5]">
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight">
          {greeting}, {name}
        </h1>
        <p className="mt-1 text-sm text-[#687587]">Signed in as {role}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
       <div className="rounded-2xl bg-white p-5 shadow-sm border border-[#e2e7ee]"></div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#8a96a5]">Products</p>
          <p className="mt-2 text-2xl font-bold">{inventoryCount}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm border border-[#e2e7ee]">
          <p className="text-xs font-bold uppercase tracking-wide text-[#8a96a5]">Low stock</p>
          <p className="mt-2 text-2xl font-bold text-amber-600">{low}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm border border-[#e2e7ee]">
          <p className="text-xs font-bold uppercase tracking-wide text-[#8a96a5]">Quick actions</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => go('New sale')}
              className="rounded-xl bg-[#282d35] px-3 py-2 text-xs font-bold text-white"
            >
              New sale
            </button>
            <button
              onClick={() => go('Open tabs')}
              className="rounded-xl border border-[#dce3ec] px-3 py-2 text-xs font-bold"
            >
              Tabs
            </button>
            <button
              onClick={() => go('Daily close')}
              className="rounded-xl border border-[#dce3ec] px-3 py-2 text-xs font-bold"
            >
              Close day
            </button>
          </div>
        </div>
      </div>

      {low > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="size-5 shrink-0" />
          <p className="text-sm font-semibold">
            {low} product{low === 1 ? '' : 's'} at or below reorder level.
          </p>
        </div>
      )}
    </section>
  )
}

function SaleView({
  filtered,
  category,
  setCategory,
  query,
  setQuery,
  add,
  cart,
  total,
  adjust,
  payment,
  setPayment,
  pay,
  loading,
}: {
  filtered: Product[]
  category: string
  setCategory: (c: string) => void
  query: string
  setQuery: (q: string) => void
  add: (p: Product) => void
  cart: CartLine[]
  total: number
  adjust: (id: string, d: number) => void
  payment: string
  setPayment: (p: string) => void
  pay: () => void
  loading: boolean
}) {
  const categories = ['All', ...Array.from(new Set(filtered.map((p) => p.category)))]

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <h1 className="text-xl font-bold">New sale</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-[#dce3ec] bg-white px-3 py-2">
            <Search className="size-4 text-[#8a96a5]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products"
              className="bg-transparent text-sm outline-none"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-[#dce3ec] bg-white px-3 py-2 text-sm font-semibold"
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-[#687587]">Loading products…</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => add(p)}
                className="rounded-2xl border border-[#e2e7ee] bg-white p-4 text-left shadow-sm hover:border-[#282d35]"
              >
                <p className="font-bold">{p.name}</p>
                <p className="mt-1 text-xs text-[#687587]">
                  {p.category} · Stock {p.stock} {p.unit}
                </p>
                <p className="mt-2 text-sm font-bold">{money(p.price)}</p>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-[#687587]">No products found.</p>
            )}
          </div>
        )}
      </div>

      <aside className="rounded-2xl border border-[#e2e7ee] bg-white p-5 shadow-sm h-fit sticky top-4">
        <h2 className="font-bold">Cart</h2>
        <ul className="mt-3 space-y-3">
          {cart.map(({ p, q, note }) => (
            <li key={p.id} className="flex items-start justify-between gap-2 text-sm">
              <div>
                <p className="font-semibold">{p.name}</p>
                {note && <p className="text-xs text-[#687587]">{note}</p>}
                <div className="mt-1 flex items-center gap-2">
                  <button
                    onClick={() => adjust(p.id, -1)}
                    className="size-6 rounded bg-[#f0f3f7] font-bold"
                  >
                    −
                  </button>
                  <span>{q}</span>
                  <button
                    onClick={() => adjust(p.id, 1)}
                    className="size-6 rounded bg-[#f0f3f7] font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
              <span className="font-bold whitespace-nowrap">{money(p.price * q)}</span>
            </li>
          ))}
          {cart.length === 0 && <p className="text-sm text-[#687587]">Cart is empty.</p>}
        </ul>

        <div className="mt-4 border-t border-[#e2e7ee] pt-4">
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>{money(total)}</span>
          </div>
          <select
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
            className="mt-3 w-full rounded-xl border border-[#dce3ec] px-3 py-2 text-sm font-semibold"
          >
            <option>Cash</option>
            <option>Mobile Money</option>
            <option>Card</option>
          </select>
          <button
            onClick={pay}
            disabled={cart.length === 0}
            className="mt-3 w-full rounded-xl bg-[#282d35] py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            Complete sale
          </button>
        </div>
      </aside>
    </section>
  )
}

function TabsView({ toast, inventory }: { toast: (s: string) => void; inventory: Product[] }) {
  const [tabs, setTabs] = useState<TabRow[]>([])
  const [tableLabel, setTableLabel] = useState('')
  const [ownerName, setOwnerName] = useState('')

  const load = () =>
    backendApi
      .listTabs('open')
      .then((data) => setTabs(data.items ?? []))
      .catch(() => setTabs([]))

  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!tableLabel.trim() || !ownerName.trim()) {
      toast('Table and owner required.')
      return
    }
    try {
      await backendApi.createTab({ table_label: tableLabel.trim(), owner_name: ownerName.trim() })
      setTableLabel('')
      setOwnerName('')
      toast('Tab opened.')
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not open tab.')
    }
  }

  const settle = async (id: string) => {
    try {
      await backendApi.settleTab(id, { payment_method: 'cash' })
      toast('Tab settled.')
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not settle tab.')
    }
  }

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-bold">Open tabs</h1>
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[#e2e7ee] bg-white p-4">
        <input
          value={tableLabel}
          onChange={(e) => setTableLabel(e.target.value)}
          placeholder="Table label"
          className="rounded-xl border border-[#dce3ec] px-3 py-2 text-sm"
        />
        <input
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder="Owner name"
          className="rounded-xl border border-[#dce3ec] px-3 py-2 text-sm"
        />
        <button onClick={create} className="rounded-xl bg-[#282d35] px-4 py-2 text-sm font-bold text-white">
          <Plus className="inline size-4 mr-1" /> Open tab
        </button>
      </div>
      <ul className="space-y-3">
        {tabs.map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e2e7ee] bg-white p-4"
          >
            <div>
              <p className="font-bold">{t.table_label}</p>
              <p className="text-sm text-[#687587]">
                {t.owner_name} · {money(t.total)}
              </p>
            </div>
            <button
              onClick={() => settle(t.id)}
              className="rounded-xl border border-[#dce3ec] px-3 py-2 text-xs font-bold"
            >
              Settle (cash)
            </button>
          </li>
        ))}
        {tabs.length === 0 && <p className="text-sm text-[#687587]">No open tabs.</p>}
      </ul>
    </section>
  )
}

function StockView({
  products,
  onReceive,
  role,
}: {
  products: Product[]
  onReceive: (p: Product) => void
  role: Role
}) {
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold">Stock & deliveries</h1>
      <p className="text-sm text-[#687587]">Role: {role}</p>
      <div className="overflow-x-auto rounded-2xl border border-[#e2e7ee] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#e2e7ee] text-xs uppercase text-[#8a96a5]">
            <tr>
              <th className="p-3">Product</th>
              <th className="p-3">Stock</th>
              <th className="p-3">Reorder</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-[#f0f3f7]">
                <td className="p-3 font-semibold">{p.name}</td>
                <td className={`p-3 ${p.stock <= p.reorder ? 'text-amber-600 font-bold' : ''}`}>
                  {p.stock} {p.unit}
                </td>
                <td className="p-3">{p.reorder}</td>
                <td className="p-3">
                  <button
                    onClick={() => onReceive(p)}
                    className="rounded-lg bg-[#282d35] px-3 py-1.5 text-xs font-bold text-white"
                  >
                    Receive
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CloseDayView({
  closed,
  setClosed,
  toast,
}: {
  closed: boolean
  setClosed: (v: boolean) => void
  toast: (s: string) => void
}) {
  const [counted, setCounted] = useState('')

  const openDay = async () => {
    try {
      await backendApi.openDay(0)
      setClosed(false)
      toast('Day opened.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not open day.')
    }
  }

  const closeDay = async () => {
    const n = Number(counted)
    if (!Number.isFinite(n) || n < 0) {
      toast('Enter counted cash.')
      return
    }
    try {
      await backendApi.closeDay(n)
      setClosed(true)
      toast('Day closed.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not close day.')
    }
  }

  return (
    <section className="max-w-md space-y-4">
      <h1 className="text-xl font-bold">Daily close</h1>
      <p className="text-sm text-[#687587]">
        Status: <b>{closed ? 'Closed' : 'Open / unknown'}</b>
      </p>
      <button onClick={openDay} className="rounded-xl border border-[#dce3ec] px-4 py-2 text-sm font-bold">
        Open day
      </button>
      <div className="rounded-2xl border border-[#e2e7ee] bg-white p-4 space-y-3">
        <label className="block text-sm font-semibold">
          Counted cash (UGX)
          <input
            type="number"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#dce3ec] px-3 py-2"
          />
        </label>
        <button
          onClick={closeDay}
          className="w-full rounded-xl bg-[#282d35] py-3 text-sm font-bold text-white"
        >
          Close day
        </button>
      </div>
    </section>
  )
}

function ReportsView({ toast }: { toast: (s: string) => void }) {
  const [data, setData] = useState<{ orders: number; total: number; by_payment: any[] } | null>(
    null
  )

  useEffect(() => {
    backendApi
      .reports()
      .then(setData)
      .catch((err) => toast(err instanceof Error ? err.message : 'Failed to load reports'))
  }, [toast])

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold">Reports</h1>
      {data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white border border-[#e2e7ee] p-5">
            <p className="text-xs font-bold uppercase text-[#8a96a5]">Orders</p>
            <p className="mt-2 text-2xl font-bold">{data.orders}</p>
          </div>
          <div className="rounded-2xl bg-white border border-[#e2e7ee] p-5">
            <p className="text-xs font-bold uppercase text-[#8a96a5]">Total sales</p>
            <p className="mt-2 text-2xl font-bold">{money(data.total)}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[#687587]">Loading…</p>
      )}
    </section>
  )
}

function MenuView({ inventory }: { inventory: Product[] }) {
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold">Menu & prices</h1>
      <p className="text-sm text-[#687587]">
        Product create/edit still uses the legacy Next.js route until FastAPI exposes product upsert.
      </p>
      <ul className="space-y-2">
        {inventory.map((p) => (
          <li key={p.id} className="rounded-xl border border-[#e2e7ee] bg-white px-4 py-3 flex justify-between">
            <span className="font-semibold">{p.name}</span>
            <span>{money(p.price)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TeamView({ toast }: { toast: (s: string) => void }) {
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold">Team & permissions</h1>
      <p className="text-sm text-[#687587]">
        Team management will move to FastAPI next. Roles are enforced server-side on protected routes.
      </p>
      <button
        onClick={() => toast('Team API migration coming next.')}
        className="rounded-xl bg-[#282d35] px-4 py-2 text-sm font-bold text-white"
      >
        Coming soon
      </button>
    </section>
  )
}

function AuditView() {
  const [items, setItems] = useState<any[]>([])

  useEffect(() => {
    backendApi
      .audit()
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
  }, [])

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold">Audit log</h1>
      <ul className="space-y-2">
        {items.map((row, i) => (
          <li key={row.id ?? i} className="rounded-xl border border-[#e2e7ee] bg-white px-4 py-3 text-sm">
            <b>{row.action}</b> · {row.entity_type ?? row.record_label} ·{' '}
            {row.created_at ? new Date(row.created_at).toLocaleString() : ''}
          </li>
        ))}
        {items.length === 0 && <p className="text-sm text-[#687587]">No audit entries.</p>}
      </ul>
    </section>
  )
}

function SettingsView({ toast }: { toast: (s: string) => void }) {
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold">Settings</h1>
      <p className="text-sm text-[#687587]">Backend settings available via FastAPI `/v1/settings`.</p>
      <button
        onClick={async () => {
          try {
            const data = await backendApi.listSettings()
            toast(`Loaded ${data.items?.length ?? 0} settings.`)
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Failed')
          }
        }}
        className="rounded-xl bg-[#282d35] px-4 py-2 text-sm font-bold text-white"
      >
        Load settings
      </button>
    </section>
  )
}
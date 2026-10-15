'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  BarChart3,
  Beer,
  Bell,
  Calculator,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Clock3,
  Coffee,
  CreditCard,
  Droplets,
  GlassWater,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Package,
  Plus,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tags,
  UserRound,
  UsersRound,
  Wine,
  X,
} from 'lucide-react'

const menuItems = [
  { name: 'Tusker Lager', category: 'Beer', price: 5000, icon: Beer, color: 'gold' },
  { name: 'Heineken', category: 'Beer', price: 6500, icon: Beer, color: 'green' },
  { name: 'Savanna Dry', category: 'Cider', price: 6000, icon: GlassWater, color: 'peach' },
  { name: 'Jameson Tot', category: 'Spirits', price: 4000, icon: Wine, color: 'burgundy' },
  { name: 'Coke Zero', category: 'Soft drinks', price: 2500, icon: Coffee, color: 'slate' },
  { name: 'Gordon’s Gin', category: 'Spirits', price: 4500, icon: Droplets, color: 'teal' },
  { name: 'Red Bull', category: 'Soft drinks', price: 3500, icon: Sparkles, color: 'pink' },
  { name: 'House Wine', category: 'Wine', price: 7000, icon: Wine, color: 'rose' },
]

const navItems = [
  { label: 'New sale', icon: Calculator },
  { label: 'Open tabs', icon: ClipboardList, badge: '3' },
  { label: 'Stock & deliveries', icon: Package },
  { label: 'Reports', icon: BarChart3 },
]

export default function Page() {
  const [activeNav, setActiveNav] = useState('New sale')
  const [category, setCategory] = useState('All items')
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState([{ ...menuItems[0], quantity: 2 }, { ...menuItems[3], quantity: 1 }])
  const [payment, setPayment] = useState('Cash')
  const [showPaid, setShowPaid] = useState(false)

  const filteredItems = useMemo(() => menuItems.filter((item) => {
    const matchesCategory = category === 'All items' || item.category === category
    return matchesCategory && item.name.toLowerCase().includes(query.toLowerCase())
  }), [category, query])

  const total = order.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const addItem = (item: typeof menuItems[number]) => {
    setOrder((current) => {
      const existing = current.find((line) => line.name === item.name)
      return existing ? current.map((line) => line.name === item.name ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { ...item, quantity: 1 }]
    })
  }
  const updateQuantity = (name: string, delta: number) => setOrder((current) => current.map((line) => line.name === name ? { ...line, quantity: line.quantity + delta } : line).filter((line) => line.quantity > 0))

  return (
    <main className="min-h-screen bg-[#f8f5f0] text-[#302823]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[248px] shrink-0 flex-col bg-[#302823] px-4 py-5 text-white lg:flex">
          <div className="flex items-center gap-3 px-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#e4a86b] text-[#302823]"><Wine /></div>
            <div><p className="font-serif text-xl font-semibold leading-none">The Sipping Room</p><p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[#cdbcae]">bar management</p></div>
          </div>
          <div className="mt-9 flex flex-col gap-1">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9f8e80]">Workspace</p>
            {navItems.map((item) => { const Icon = item.icon; return <button key={item.label} onClick={() => setActiveNav(item.label)} className={`flex items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition ${activeNav === item.label ? 'bg-[#f4eadf] font-semibold text-[#302823]' : 'text-[#ded0c5] hover:bg-[#443933]'}`}><span className="flex items-center gap-3"><Icon className="size-[18px]" />{item.label}</span>{item.badge && <span className={`${activeNav === item.label ? 'bg-[#d88854] text-white' : 'bg-[#66554b text-[#e6d7ca]' } rounded-full px-2 py-0.5 text-[11px]`}>{item.badge}</span>}</button> })}
          </div>
          <div className="mt-8 flex flex-col gap-1">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9f8e80]">Management</p>
            {[['Menu & prices', Tags], ['Stock counts', ArrowDownToLine], ['Team & permissions', UsersRound]].map(([label, Icon]) => <button key={label as string} onClick={() => setActiveNav(label as string)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${activeNav === label ? 'bg-[#f4eadf] font-semibold text-[#302823]' : 'text-[#ded0c5] hover:bg-[#443933]'}`}><Icon className="size-[18px]" />{label as string}</button>)}
          </div>
          <div className="mt-auto rounded-2xl border border-[#54463d] bg-[#3b302b] p-3"><div className="flex items-center gap-2 text-[#e4a86b]"><ShieldCheck className="size-4" /><span className="text-xs font-semibold">Till is balanced</span></div><p className="mt-2 text-[11px] leading-relaxed text-[#bbaa9e]">Last sync today at 18:42. All sales are backed up.</p></div>
          <div className="mt-4 flex items-center gap-3 border-t border-[#51433b] pt-4"><div className="flex size-9 items-center justify-center rounded-full bg-[#d88854] text-sm font-bold">AM</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">Amina M.</p><p className="text-xs text-[#bbaa9e]">Cashier</p></div><MoreHorizontal className="size-4 text-[#bbaa9e]" /></div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex h-[72px] items-center justify-between border-b border-[#e6ddd5] bg-[#fffdfa] px-5 md:px-8"><div className="flex items-center gap-3"><button className="rounded-lg p-2 hover:bg-[#f3ece5] lg:hidden"><Menu /></button><div><p className="text-xs text-[#9a8980]">Wednesday, 14 October 2026</p><h1 className="font-serif text-[25px] font-semibold">Good evening, Amina</h1></div></div><div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded-full bg-[#edf6ed] px-3 py-2 text-xs font-semibold text-[#47734b] sm:flex"><span className="size-2 rounded-full bg-[#6aa76e]" />Offline-ready</div><button className="relative rounded-full p-2.5 hover:bg-[#f3ece5]"><Bell className="size-[19px]" /><span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[#d88854] ring-2 ring-white" /></button><button className="rounded-full p-2.5 hover:bg-[#f3ece5]"><Settings className="size-[19px]" /></button></div></header>

          <div className="grid min-h-[calc(100vh-72px)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_376px]">
            <div className="border-r border-[#e6ddd5] p-5 md:p-8">
              {activeNav !== 'New sale' ? <div className="flex min-h-[600px] flex-col items-center justify-center text-center"><div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-[#f1e5d9] text-[#a8643e]"><LayoutDashboard /></div><h2 className="font-serif text-3xl font-semibold">{activeNav}</h2><p className="mt-2 max-w-md text-sm text-[#88786f]">This concept keeps every part of the bar in one calm workspace. Use New sale to return to the fast cashier flow.</p><button className="mt-5 rounded-xl bg-[#302823] px-5 py-3 text-sm font-semibold text-white" onClick={() => setActiveNav('New sale')}>Back to new sale</button></div> : <><div className="mb-6 flex items-end justify-between"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#9a8980]"><ShoppingBag className="size-4" /> SALE #00482 <span className="text-[#c8bab0]">•</span> OPEN</div><h2 className="font-serif text-3xl font-semibold tracking-tight">Start a new sale</h2><p className="mt-1 text-sm text-[#88786f]">Take an order, select a server, and send it to the bar.</p></div><button className="hidden items-center gap-2 rounded-xl border border-[#ded3ca] bg-white px-3 py-2 text-xs font-semibold text-[#6b5d55] shadow-sm sm:flex"><Clock3 className="size-4" /> Open tabs <span className="rounded-full bg-[#f4eadf] px-1.5 py-0.5 text-[#a8643e]">3</span></button></div>

                <div className="mb-6 grid gap-3 sm:grid-cols-3"><label className="rounded-xl border border-[#e2d8cf] bg-white p-3"><span className="text-[10px] font-bold uppercase tracking-wider text-[#9a8980]">Served by</span><span className="mt-1 flex items-center justify-between text-sm font-semibold">Moses K. <ChevronDown className="size-4 text-[#9a8980]" /></span></label><label className="rounded-xl border border-[#e2d8cf] bg-white p-3"><span className="text-[10px] font-bold uppercase tracking-wider text-[#9a8980]">Table / customer</span><span className="mt-1 flex items-center justify-between text-sm font-semibold">Table 05 <ChevronDown className="size-4 text-[#9a8980]" /></span></label><label className="rounded-xl border border-[#e2d8cf] bg-white p-3"><span className="text-[10px] font-bold uppercase tracking-wider text-[#9a8980]">Price mode</span><span className="mt-1 flex items-center justify-between text-sm font-semibold">Regular <ChevronDown className="size-4 text-[#9a8980]" /></span></label></div>

                <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{['All items', 'Beer', 'Spirits', 'Cider', 'Soft drinks', 'Wine'].map((item) => <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition ${category === item ? 'bg-[#302823] text-white' : 'border border-[#ded3ca] bg-white text-[#6f6159] hover:bg-[#f3ece5]'}`}>{item}</button>)}</div>
                <div className="relative mb-5"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#a9988f]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search drinks by name..." className="h-11 w-full rounded-xl border border-[#e2d8cf] bg-white pl-10 pr-4 text-sm outline-none ring-[#d88854] placeholder:text-[#b5a59c] focus:ring-2" /></div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{filteredItems.map((item) => { const Icon = item.icon; return <button key={item.name} onClick={() => addItem(item)} className="group rounded-2xl border border-[#e6ddd5] bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-[#d7a078] hover:shadow-[0_8px_24px_rgba(86,55,36,0.08)]"><div className={`mb-3 flex size-10 items-center justify-center rounded-xl item-${item.color}`}><Icon className="size-[19px]" /></div><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-[#9a8980]">{item.category}</p><div className="mt-3 flex items-center justify-between"><span className="text-sm font-bold">UGX {item.price.toLocaleString()}</span><span className="flex size-6 items-center justify-center rounded-full bg-[#f4eadf] text-[#a8643e] transition group-hover:bg-[#d88854] group-hover:text-white"><Plus className="size-4" /></span></div></button> })}</div>
                <div className="mt-7 flex items-start gap-3 rounded-2xl border border-[#efd3b8] bg-[#fff7ed] p-4"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#c77942]" /><div><p className="text-sm font-semibold text-[#7c512f]">Low stock attention</p><p className="mt-1 text-xs leading-relaxed text-[#9c7455]">Jameson Irish Whiskey is below its reorder level. View stock to create a purchase list.</p></div><button className="ml-auto shrink-0 text-xs font-bold text-[#a8643e] underline">View</button></div>
              </>}
            </div>

            <aside className="flex flex-col bg-[#fffdfa] p-5 md:p-6"><div className="flex items-center justify-between"><div><h2 className="font-serif text-xl font-semibold">Current order</h2><p className="mt-1 text-xs text-[#9a8980]">Table 05 · Moses K.</p></div><button onClick={() => setOrder([])} className="text-xs font-semibold text-[#a8643e] hover:underline">Clear all</button></div><div className="my-5 h-px bg-[#eee5dd]" /><div className="flex-1">{order.length === 0 ? <div className="flex h-40 flex-col items-center justify-center text-center text-[#a9988f]"><Receipt className="mb-2 size-8" /><p className="text-sm font-semibold">No items yet</p><p className="mt-1 text-xs">Tap a drink to add it</p></div> : <div className="flex flex-col gap-4">{order.map((item) => <div key={item.name} className="flex items-center gap-3"><div className={`flex size-9 shrink-0 items-center justify-center rounded-lg item-${item.color}`}><item.icon className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-0.5 text-xs text-[#9a8980]">UGX {item.price.toLocaleString()} each</p></div><div className="flex items-center gap-2 rounded-lg border border-[#e5dcd4] bg-[#fcfaf8] p-1"><button onClick={() => updateQuantity(item.name, -1)} className="flex size-5 items-center justify-center rounded text-[#8e7d73] hover:bg-white">−</button><span className="w-4 text-center text-xs font-bold">{item.quantity}</span><button onClick={() => updateQuantity(item.name, 1)} className="flex size-5 items-center justify-center rounded text-[#8e7d73] hover:bg-white">+</button></div><span className="w-[72px] text-right text-sm font-bold">UGX {(item.price * item.quantity).toLocaleString()}</span></div>)}</div>}
              <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#d6c7bb] py-3 text-xs font-semibold text-[#88786f] hover:bg-[#fcfaf8]"><Plus className="size-4" /> Add a note to this order</button>
            </div><div className="my-5 h-px bg-[#eee5dd]" /><div className="flex flex-col gap-3 text-sm"><div className="flex justify-between text-[#88786f]"><span>Subtotal</span><span>UGX {total.toLocaleString()}</span></div><div className="flex justify-between text-[#88786f]"><span>Tax (0%)</span><span>UGX 0</span></div><div className="mt-1 flex justify-between text-lg font-bold"><span>Total</span><span>UGX {total.toLocaleString()}</span></div></div><div className="mt-5 grid grid-cols-3 gap-2">{['Cash', 'Mobile money', 'Card'].map((method) => <button key={method} onClick={() => setPayment(method)} className={`rounded-xl border py-2.5 text-[11px] font-bold ${payment === method ? 'border-[#d88854] bg-[#fff3e8] text-[#a8643e]' : 'border-[#e2d8cf] text-[#88786f]'}`}>{method === 'Cash' ? 'Cash' : method === 'Card' ? 'Card' : 'Mobile'}</button>)}</div><button disabled={order.length === 0} onClick={() => setShowPaid(true)} className="mt-3 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#302823] text-sm font-bold text-white shadow-[0_5px_14px_rgba(48,40,35,0.16)] transition hover:bg-[#493a32] disabled:cursor-not-allowed disabled:opacity-40"><Receipt className="size-[18px]" /> Pay & print receipt</button><button className="mt-2 flex h-11 items-center justify-center gap-2 rounded-xl border border-[#ded3ca] text-xs font-bold text-[#6f6159]"><ClipboardList className="size-4" /> Save as open tab</button><p className="mt-4 text-center text-[10px] leading-relaxed text-[#ad9c92]">Receipt will be saved before printing.<br />You can always reprint a COPY later.</p></aside>
          </div>
        </section>
      </div>
      {showPaid && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#302823]/40 p-5"><div className="w-full max-w-sm rounded-3xl bg-[#fffdfa] p-6 text-center shadow-2xl"><button onClick={() => setShowPaid(false)} className="float-right rounded-full p-1 text-[#9a8980] hover:bg-[#f3ece5]"><X className="size-4" /></button><div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#e6f2e7] text-[#4f8a55]"><Receipt /></div><h2 className="mt-4 font-serif text-2xl font-semibold">Payment recorded</h2><p className="mt-2 text-sm text-[#88786f]">Receipt <span className="font-bold text-[#302823]">#000482</span> is ready to print.</p><div className="mt-5 rounded-2xl bg-[#f8f5f0] p-4 text-left text-sm"><div className="flex justify-between"><span className="text-[#88786f]">Paid by</span><b>{payment}</b></div><div className="mt-2 flex justify-between"><span className="text-[#88786f]">Total</span><b>UGX {total.toLocaleString()}</b></div><div className="mt-2 flex justify-between"><span className="text-[#88786f]">Change</span><b>UGX 0</b></div></div><button onClick={() => { setShowPaid(false); setOrder([]) }} className="mt-5 w-full rounded-xl bg-[#302823] py-3 text-sm font-bold text-white">Done</button></div></div>}
    </main>
  )
}

'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { signOut, useSession } from '@/lib/auth-client'
import { Stock } from '@/components/stock/stock'
import { TeamPanel } from '@/components/team/team'
import {
  cacheRegional,
  csvSafe,
  CURRENCY_OPTIONS,
  DEFAULT_REGIONAL,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  LOCALE_OPTIONS,
  normalizeCurrency,
  normalizeTaxRate,
  PAYMENT_METHODS,
  readCachedRegional,
  taxBreakdown,
  TIME_ZONE_OPTIONS,
  type RegionalSettings,
} from '@/lib/locale'
import { TriangleAlert as AlertTriangle, ArrowDownToLine, ChartBar as BarChart3, Check, ChevronDown, ClipboardCheck, ClipboardList, Clock, CreditCard, Database, Download, Eye, EyeOff, FileText, KeyRound, LayoutDashboard, Loader2, Lock, LogOut, Package, Plus, Printer, ReceiptText, RefreshCw, Save, Search, Settings, ShieldCheck, ShoppingBag, SlidersHorizontal, Tags, Trash2, TrendingDown, TrendingUp, UserRound, UsersRound, Wallet, Wine, X } from 'lucide-react'

type Product = { id:string; name:string; category:string; price:number; stock:number; reorder:number; cost:number; unit:string; tone:string; note?:string }
type Role = 'Owner'|'Admin'|'Cashier'|'Manager'|'Storekeeper'
const normalizeRole=(value:unknown):Role=>{const role=String(value??'Cashier').toLowerCase();return role==='owner'?'Owner':role==='admin'?'Admin':role==='manager'?'Manager':role==='storekeeper'?'Storekeeper':'Cashier'}
type Me = { actorId:string; name:string; email:string; role:Role; workspace:{id:string;name:string}; permissions:string[]; barName?:string; regional?:RegionalSettings }
const getGreeting=()=>{const hour=new Date().getHours();return hour<12?'Good morning':hour<18?'Good afternoon':'Good evening'}
type Page = 'Overview'|'New sale'|'Open tabs'|'Stock & deliveries'|'Daily close'|'Reports'|'Menu & prices'|'Team & permissions'|'Audit log'|'Settings'
type RangeType = 'today' | 'week' | 'month' | 'two_months' | 'mid_year' | 'all';
type RangeOption = { value: RangeType; label: string };
type OverviewTrend = { label:string; tooltip:string; total:number; orders:number }
type OverviewData = { ready?:boolean; generatedAt?:string; range?:RangeType; rangeLabel:string; today:{revenue:number;orders:number;averageOrder:number}; session:{status:string;revenue:number;orders:number;openedAt:string}|null; totals:{revenue:number;orders:number;averageOrder:number;itemsSold:number;discounts:number;discountsValue:number;voidedOrders:number;voidedValue:number}; previous:{revenue:number;orders:number}|null; delta:{revenue:number|null;orders:number|null;todayRevenue:number|null}; openTabs:number; openTabsValue:number; openTabsStatus:string; byPayment:{method:string;amount:number;share:number}[]; series:OverviewTrend[]; topProducts:{name:string;category:string;quantity:number;revenue:number}[]; lowStock:{count:number;items:{id:string;name:string;stock:number;reorder:number}[]}; recent:{id:string;total:number;paymentMethod:string;tableLabel:string|null;createdAt:string}[]; checklist:{completed:number;total:number;items:{label:string;done:boolean}[]}; cashDrawer:{openingFloat:number;expectedCash:number;countedCash:number|null;cashVariance:number|null;dayStatus:string;dayLocked:boolean} }


const EMPTY_OVERVIEW:OverviewData={ready:false,rangeLabel:'This week',today:{revenue:0,orders:0,averageOrder:0},session:null,totals:{revenue:0,orders:0,averageOrder:0,itemsSold:0,discounts:0,discountsValue:0,voidedOrders:0,voidedValue:0},previous:null,delta:{revenue:null,orders:null,todayRevenue:null},openTabs:0,openTabsValue:0,openTabsStatus:'All settled',byPayment:[],series:[],topProducts:[],lowStock:{count:0,items:[]},recent:[],checklist:{completed:0,total:0,items:[]},cashDrawer:{openingFloat:0,expectedCash:0,countedCash:null,cashVariance:null,dayStatus:'no_day',dayLocked:false}}
// Cached locally so a reloaded till prints with the right currency before any request resolves.
const BAR_NAME_STORAGE_KEY='barflow.barName'
const BAR_NAME_FALLBACK='THE SIPPER'
// Rendered on the server too, so this must start deterministic; the cached copy is applied on mount.
let REGIONAL:RegionalSettings=DEFAULT_REGIONAL
let BAR_NAME=BAR_NAME_FALLBACK
const applyRegional=(value:Partial<RegionalSettings>|null|undefined)=>{REGIONAL=cacheRegional({...REGIONAL,...(value??{})}); return REGIONAL}
const applyBarName=(value:unknown)=>{const name=String(value??'').replace(/\s+/g,' ').trim().slice(0,60); BAR_NAME=name||BAR_NAME_FALLBACK; return BAR_NAME}
const cachedBarName=()=>typeof window==='undefined'?'':window.localStorage.getItem(BAR_NAME_STORAGE_KEY)??''
const money=(n:number)=>formatMoney(n,REGIONAL)
const wholeNumber=(n:number)=>formatMoney(n,REGIONAL)
/** A timestamp as YYYY-MM-DD on the bar's clock, not the device's. */
const isoDayOf=(value:Date|string|number,zone=REGIONAL.timeZone)=>{const date=value instanceof Date?value:new Date(value);return Number.isNaN(date.getTime())?'':date.toLocaleDateString('en-CA',{timeZone:zone})}
const isoDay=(zone=REGIONAL.timeZone)=>isoDayOf(new Date(),zone)
const shiftIsoDate=(date:string,days:number)=>{const shifted=new Date(`${date}T12:00:00Z`); shifted.setUTCDate(shifted.getUTCDate()+days); return shifted.toISOString().slice(0,10)}
const initials=(name?:string|null)=>(name??'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()??'').join('')||'??'
const paymentMethodLabel=(id:string)=>PAYMENT_METHODS.find(entry=>entry.id===id)?.label??id

/**
 * Build a printable document from values a cashier or manager typed. Every interpolated value
 * is escaped: the receipt window is same-origin, so unescaped HTML would be live script.
 */
function receiptDocument(options:{title:string;heading:string;subheading?:string;meta:(string|null|undefined)[];rows:string;subtotal?:number;tax?:number;taxLabel?:string;total:number;footer:string;compact?:boolean}){
  const meta=options.meta.filter((line):line is string=>Boolean(line)).map(line=>`<div class="meta">${line}</div>`).join('')
  const taxLine=options.tax?`<div class="meta"><span>${escapeHtml(options.taxLabel??'Tax')}</span><span>${money(options.tax)}</span></div>`:''
  const subtotalLine=options.subtotal!=null&&options.subtotal!==options.total?`<div class="meta"><span>Subtotal</span><span>${money(options.subtotal)}</span></div>`:''
  const css=options.compact
    ?'body{font-family:Arial,sans-serif;color:#171a1c;width:280px;margin:16px auto}h1{text-align:center;font-size:16px;margin:0 0 4px}p{color:#6a6862;font-size:11px;text-align:center;margin:4px 0 12px}table{width:100%;border-collapse:collapse;font-size:12px}td{padding:6px 0;border-bottom:1px solid #ded8cb}td:last-child{text-align:right}.total{display:flex;justify-content:space-between;font-weight:700;margin-top:12px}.meta{display:flex;justify-content:space-between;font-size:11px;margin:2px 0}@media print{body{margin:0 auto}}'
    :'body{font-family:Arial,sans-serif;color:#171a1c;width:320px;margin:24px auto}h1{text-align:center;font-size:20px;margin:0 0 4px}p{color:#6a6862;font-size:12px;text-align:center;margin:4px 0 18px}table{width:100%;border-collapse:collapse;font-size:13px}td{padding:9px 0;border-bottom:1px solid #ded8cb}td:last-child{text-align:right;white-space:nowrap}.total{display:flex;justify-content:space-between;font-weight:700;font-size:18px;margin-top:18px}.meta{display:flex;justify-content:space-between;font-size:12px;margin:4px 0}@media print{body{margin:0 auto}}'
  const lines=[REGIONAL.receiptAddress?`<p>${escapeHtml(REGIONAL.receiptAddress)}</p>`:'',REGIONAL.receiptPhone?`<p>${escapeHtml(REGIONAL.receiptPhone)}</p>`:'',REGIONAL.taxId?`<p>${escapeHtml(`Tax ID ${REGIONAL.taxId}`)}</p>`:''].join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(options.title)}</title><style>${css}</style></head><body><h1>${escapeHtml(options.heading)}</h1>${options.subheading?`<p>${escapeHtml(options.subheading)}</p>`:''}${lines}${meta}<table>${options.rows}</table>${subtotalLine}${taxLine}<div class="total"><span>Total</span><span>${money(options.total)}</span></div><p>${escapeHtml(options.footer)}</p><script>window.onload=()=>window.print()</script></body></html>`
}

function printReceipt(receipt:{saleId?:string;receiptNumber?:number|string;cashier:string;payment:string;changeDue?:number;items:{name:string;quantity:number;price:number;total:number;note?:string}[];subtotal?:number;taxTotal?:number;total:number}){const receiptWindow=window.open('', '_blank', 'width=420,height=700'); if(!receiptWindow)return false; const rows=receipt.items.map(item=>`<tr><td>${escapeHtml(item.name)}${item.note?' <span style="font-size:10px;color:#6a6862">('+escapeHtml(item.note)+')</span>':''}<br><small>${item.quantity} × ${money(item.price)}</small></td><td>${money(item.total)}</td></tr>`).join(''); const html=receiptDocument({title:`Receipt ${receipt.saleId??''}`,heading:BAR_NAME,subheading:`${escapeHtml('Bar management receipt')} · ${escapeHtml(formatDate(new Date(),REGIONAL,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}))}`,meta:[`<span>Receipt</span><span>#${escapeHtml(receipt.receiptNumber??'--')}</span>`,`<span>Sale</span><span>${escapeHtml(receipt.saleId??'Sale')}</span>`,`<span>Cashier</span><span>${escapeHtml(receipt.cashier)}</span>`,`<span>Payment</span><span>${escapeHtml(receipt.payment)}</span>`,receipt.changeDue!=null&&receipt.changeDue>0?`<span>Change due</span><span>${money(receipt.changeDue)}</span>`:''],rows,subtotal:receipt.subtotal,tax:receipt.taxTotal,taxLabel:REGIONAL.taxRateBps?`Tax ${REGIONAL.taxRateBps/100}%${REGIONAL.taxInclusive?' incl.':''}`:'',total:receipt.total,footer:REGIONAL.receiptFooter}); receiptWindow.document.write(html); receiptWindow.document.close(); return true}
function printTicket(receipt:{saleId?:string;receiptNumber?:number|string;cashier:string;items:{name:string;quantity:number;price:number;total:number}[];total:number}){const receiptWindow=window.open('', '_blank', 'width=280,height=500'); if(!receiptWindow)return false; const rows=receipt.items.map(item=>`<tr><td>${escapeHtml(item.name)}</td><td style="text-align:right">${item.quantity}</td><td style="text-align:right">${money(item.total)}</td></tr>`).join(''); const html=receiptDocument({title:`Bar ticket ${receipt.saleId??''}`,heading:'BAR TICKET',subheading:`Order #${receipt.receiptNumber??'--'} · ${receipt.cashier}`,meta:[],rows,total:receipt.total,footer:'Prepare drinks in order listed.',compact:true}); receiptWindow.document.write(html); receiptWindow.document.close(); return true}
const nav:{label:Page; icon:any; roles:Role[]}[]=[{label:'Overview',icon:LayoutDashboard,roles:['Owner','Admin','Cashier','Manager','Storekeeper']},{label:'New sale',icon:CreditCard,roles:['Owner','Admin','Cashier','Manager']},{label:'Open tabs',icon:ClipboardList,roles:['Owner','Admin','Cashier','Manager']},{label:'Daily close',icon:ClipboardCheck,roles:['Owner','Admin','Manager']},{label:'Reports',icon:BarChart3,roles:['Owner','Admin','Manager']},{label:'Stock & deliveries',icon:Package,roles:['Owner','Admin','Manager','Storekeeper']},{label:'Menu & prices',icon:Tags,roles:['Owner','Admin','Manager']},{label:'Team & permissions',icon:UsersRound,roles:['Owner','Admin','Manager']},{label:'Audit log',icon:FileText,roles:['Owner','Admin','Manager']},{label:'Settings',icon:Settings,roles:['Owner','Admin','Manager']}]
const SHORT_LABEL:Record<Page,string>={'Overview':'Overview','New sale':'New sale','Open tabs':'Tabs','Stock & deliveries':'Stock','Daily close':'Close day','Reports':'Reports','Menu & prices':'Menu','Team & permissions':'Team','Audit log':'Audit','Settings':'Settings'}
const dayTone=(locked:boolean,status:string)=>locked?{label:'Day closed',tone:'text-alert',dot:'bg-alert'}:status==='open'?{label:'Day open',tone:'text-ink',dot:'bg-ink'}:{label:'Day not started',tone:'text-ink-muted',dot:'bg-ink-soft'}

/** One navigator for the whole product: a paper rail on desktop, a tab bar on a phone. */
function Rail({page,go,allowed,overview,userName,role}:{page:Page;go:(page:Page)=>void;allowed:typeof nav;overview:OverviewData;userName:string;role:Role}){
  const signOutNow=async()=>{try{await signOut(); window.location.assign('/sign-in')}catch{/* the session stays until the request succeeds */}}
  const day=dayTone(overview.cashDrawer.dayLocked,overview.cashDrawer.dayStatus)
  const link=({label,icon:Icon}:{label:Page;icon:any})=><button key={label} onClick={()=>go(label)} data-active={page===label} aria-current={page===label?'page':undefined} className="rail-link"><Icon className="size-[17px] shrink-0"/><span className="truncate">{label}</span>{label==='Open tabs'&&overview.openTabs>0&&<span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${page===label?'bg-white/20 text-white':'bg-ink/[0.06] text-ink-muted'}`}>{overview.openTabs}</span>}</button>
  return <>
    <aside aria-label="Workspace navigation" className="rail fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col p-5 lg:flex">
      <div className="flex items-center gap-3 px-1"><div className="flex size-9 items-center justify-center rounded-[8px] bg-ink text-white"><Wine className="size-4"/></div><div className="min-w-0"><b className="block truncate text-[14px] font-semibold leading-none tracking-tight text-ink">{BAR_NAME}</b><p className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.18em] text-ink-soft">Bar management</p></div></div>
      <p className="mb-1.5 mt-8 px-2.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Workspace</p>
      <div className="flex flex-col gap-0.5">{allowed.slice(0,5).map(link)}</div>
      {allowed.length>5&&<><p className="mb-1.5 mt-7 px-2.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Management</p><div className="flex flex-col gap-0.5">{allowed.slice(5).map(link)}</div></>}
      <div className="mt-auto border-t border-line pt-4">
        <p className="px-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Trading day</p>
        <p className="mt-2 flex items-center gap-2 px-1 text-[12px] font-medium text-ink"><span className={`size-1.5 rounded-full ${day.dot}`}/>{day.label}</p>
        <p className="mt-1 px-1 text-[11px] leading-relaxed text-ink-muted">{money(overview.cashDrawer.expectedCash)} expected · {overview.openTabs} open {overview.openTabs===1?'tab':'tabs'}</p>
      </div>
      <div className="mt-4 flex items-center gap-2.5 border-t border-line pt-4"><div className="flex size-8 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-white">{initials(userName)}</div><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold text-ink">{userName}</p><p className="text-[10px] text-ink-muted">{role}</p></div><button aria-label="Sign out" title="Sign out" onClick={()=>void signOutNow()} className="rounded-[7px] p-1.5 text-ink-soft transition hover:bg-well hover:text-ink"><LogOut className="size-4"/></button></div>
    </aside>
    <nav aria-label="Workspace navigation" className="rail fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch gap-0.5 overflow-x-auto border-t border-r-0 border-line bg-white px-1.5 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {allowed.map(({label,icon:Icon})=>{const active=page===label; return <button key={label} onClick={()=>go(label)} aria-current={active?'page':undefined} className={`relative flex min-w-[64px] shrink-0 flex-col items-center justify-center gap-1 rounded-[7px] px-2 py-2 text-[9px] font-medium leading-none transition ${active?'bg-ink text-white':'text-ink-soft hover:text-ink'}`}><Icon className="size-[18px]"/><span className="whitespace-nowrap">{SHORT_LABEL[label]}</span>{label==='Open tabs'&&overview.openTabs>0&&<span className={`absolute right-1.5 top-1 rounded-full px-1 text-[9px] font-semibold leading-4 tabular-nums ${active?'bg-white text-ink':'bg-ink text-white'}`}>{overview.openTabs}</span>}</button>})}
    </nav>
  </>
}

/** Every page sits in the same frame: rail, masthead, working surface, one toast. */
function PageFrame({page,go,allowed,overview,regional,greeting,userName,role,notice,onDismiss,children}:{page:Page;go:(p:Page)=>void;allowed:typeof nav;overview:OverviewData;regional:RegionalSettings;greeting:string;userName:string;role:Role;notice:string;onDismiss:()=>void;children:any}){
  const day=dayTone(overview.cashDrawer.dayLocked,overview.cashDrawer.dayStatus)
  const canClose=allowed.some(item=>item.label==='Daily close')
  const statusClass=`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-medium ${day.tone}`
  return <>
    <Rail page={page} go={go} allowed={allowed} overview={overview} userName={userName} role={role}/>
    <div className="min-h-screen bg-canvas text-ink lg:pl-[248px]">
      <header className="topbar sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line px-4 md:px-10">
        <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-ink text-white"><Wine className="size-3.5"/></div>
          <span className="truncate text-[13px] font-semibold tracking-tight">{BAR_NAME}</span>
        </div>
        <p className="hidden truncate text-[10px] font-medium uppercase tracking-[0.16em] text-ink-muted lg:block">{formatDate(new Date(),regional,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden max-w-[220px] truncate text-[12px] text-ink-muted sm:block">{userName} · {role}</span>
          {canClose?<button onClick={()=>go('Daily close')} title="Open Daily close" className={`${statusClass} transition hover:border-line-strong`}><span className={`size-1.5 rounded-full ${day.dot}`}/>{day.label}</button>:<span className={statusClass}><span className={`size-1.5 rounded-full ${day.dot}`}/>{day.label}</span>}
        </div>
      </header>
      <main className="px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-8 md:px-10 md:pt-12 lg:pb-16">{children}</main>
    </div>
    <Toast message={notice} onDismiss={onDismiss}/>
  </>
}

function Toast({message,onDismiss}:{message:string;onDismiss?:()=>void}){
  if(!message)return null
  return <div role="status" className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-50 flex max-w-[min(92vw,420px)] items-center gap-2.5 rounded-[10px] bg-ink px-4 py-3 text-[13px] font-medium text-white shadow-[0_18px_40px_-20px_rgba(11,12,14,.6)] lg:bottom-6 lg:right-6"><Check className="size-4 shrink-0 text-white/70"/><span className="min-w-0 flex-1">{message}</span>{onDismiss&&<button aria-label="Dismiss" onClick={onDismiss} className="shrink-0 rounded-full p-1 text-white/50 transition hover:text-white"><X className="size-3.5"/></button>}</div>
}

export default function Page(){const {data:session}=useSession(); const [me,setMe]=useState<Me|null>(null); const [page,setPage]=useState<Page>('Overview'); const [regional,setRegional]=useState<RegionalSettings>(DEFAULT_REGIONAL); const [businessName,setBusinessName]=useState(BAR_NAME); const [role,setRole]=useState<Role>('Cashier'); const [timeGreeting,setTimeGreeting]=useState('Welcome back'); const [notice,setNotice]=useState(''); const [query,setQuery]=useState(''); const [category,setCategory]=useState('All'); const [cart,setCart]=useState<{p:Product;q:number;note?:string}[]>([]); const [payment,setPayment]=useState('cash'); const [closed,setClosed]=useState(false); const [day,setDay]=useState<any>(null); const [inventory,setInventory]=useState<Product[]>([]); const [receiptNumber,setReceiptNumber]=useState<string|null>(null); const [tableLabel,setTableLabel]=useState<string|null>(null); const [waiter,setWaiter]=useState<string|null>(null); const [tenderedAmount,setTenderedAmount]=useState<number|null>(null); const [activeTab,setActiveTab]=useState<any|null>(null); const [waiters,setWaiters]=useState<string[]>([]); const [nextReceipt,setNextReceipt]=useState<number|null>(null); const [paying,setPaying]=useState(false); const saleKey=useRef<string|null>(null);
 useEffect(()=>{let active=true; fetch('/api/me',{cache:'no-store'}).then(async response=>{if(response.status===401){window.location.assign('/sign-in'); return null} return response.ok?response.json():null}).then((data:Me|null)=>{if(!active||!data)return; setMe(data); setRole(normalizeRole(data.role)); if(data.regional){setRegional(applyRegional(data.regional))} const savedName=applyBarName(data.barName??data.workspace?.name); setBusinessName(savedName); window.localStorage.setItem(BAR_NAME_STORAGE_KEY,savedName)}).catch(()=>undefined); return()=>{active=false}},[]);
 useEffect(()=>{setTimeGreeting(getGreeting())},[]); const [overview,setOverview]=useState<OverviewData>(EMPTY_OVERVIEW); const [overviewLoading,setOverviewLoading]=useState(true); const [overviewError,setOverviewError]=useState(''); const overviewTicket=useRef(0);
 const [range,setRange]=useState<RangeType>('week'); const [rangeOpen,setRangeOpen]=useState(false); const rangeOptions:RangeOption[]=[{value:'today',label:'This day'},{value:'week',label:'This week'},{value:'month',label:'Month'},{value:'two_months',label:'Two months'},{value:'mid_year',label:'Six months'},{value:'all',label:'All'}];
 const refreshLiveData=async()=>{if(!session?.user){setOverviewLoading(false);return} const ticket=++overviewTicket.current; setOverviewLoading(true); try{const [overviewRes,productsRes,dayRes]=await Promise.all([fetch('/api/overview?range='+range,{cache:'no-store'}),fetch('/api/products',{cache:'no-store'}),fetch('/api/day',{cache:'no-store'})]); if(ticket!==overviewTicket.current)return; if(overviewRes.ok){const data=await overviewRes.json(); setOverview({...data,ready:true}); setOverviewError('')} else {const body=await overviewRes.json().catch(()=>({})); setOverviewError(body?.error??'Could not load live overview data.'); setOverview(current=>current.ready?current:{...EMPTY_OVERVIEW,rangeLabel:rangeOptions.find(option=>option.value===range)?.label??'This week'})} if(productsRes.ok){const rows=await productsRes.json(); setInventory(Array.isArray(rows)?rows:[])} if(dayRes.ok){const record=await dayRes.json(); setDay(record); setClosed(record?.status==='closed')}}catch{if(ticket===overviewTicket.current)setOverviewError('Could not reach the server. Check your connection and retry.')}finally{if(ticket===overviewTicket.current)setOverviewLoading(false)}};
 useEffect(()=>{void refreshLiveData()},[range,session?.user?.id,page]);
 // Paint instantly from the last known settings, then /api/me confirms them for every role.
 useEffect(()=>{const cached=readCachedRegional(); setRegional(applyRegional(cached)); const name=cachedBarName(); if(name)setBusinessName(applyBarName(name))},[]);
 useEffect(()=>{if(!regional.paymentMethods.includes(payment))setPayment(regional.paymentMethods[0]??'cash')},[regional,payment]);
 useEffect(()=>{if(page!=='Overview'||!session?.user)return; const timer=setInterval(()=>{void refreshLiveData()},30000); return()=>clearInterval(timer)},[page,session?.user?.id,range]); useEffect(()=>{if(!session?.user)return; fetch('/api/team/waiters',{cache:'no-store'}).then(r=>r.ok?r.json():[]).then(rows=>{const w=Array.isArray(rows)?rows.map((m:any)=>m.name):[]; setWaiters(w); setWaiter(current=>current&&(w.includes(current)||!w.length)?current:(w.length?w[0]:(session?.user?.name??null)))}).catch(()=>undefined); fetch('/api/receipts/next',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(data?.nextNumber)setNextReceipt(Number(data.nextNumber))}).catch(()=>undefined)},[session?.user?.id]);
			const allowed=nav.filter(n=>n.roles.includes(role)); useEffect(()=>{if(!allowed.some(item=>item.label===page))setPage('Overview')},[allowed,page]);
		const filtered=useMemo(()=>inventory.filter(p=>(category==='All'||p.category===category)&&p.name.toLowerCase().includes(query.toLowerCase())),[inventory,category,query]);
	// The filter chips come from the menu itself: a bar that sells cocktails must be able to filter for them.
	const categories=useMemo(()=>['All',...Array.from(new Set(inventory.map(p=>p.category).filter(Boolean))).sort((a,b)=>a.localeCompare(b))],[inventory]);
	// A category can disappear when its last drink is renamed; fall back to the full menu.
	useEffect(()=>{if(!categories.includes(category))setCategory('All')},[categories,category]);
	const low=inventory.filter(p=>p.stock<=p.reorder).length; const subtotal=cart.reduce((s,x)=>s+x.p.price*x.q,0); const charges=taxBreakdown(subtotal,regional); const total=charges.total
	const toast=(s:string)=>{setNotice(s);setTimeout(()=>setNotice(''),2600)}; const go=(p:Page)=>{setActiveTab(null);setPage(p)}; const add=(p:Product)=>setCart(c=>{const n='';return c.some(x=>x.p.id===p.id)?c.map(x=>x.p.id===p.id?{...x,q:x.q+1}:x):[...c,{p,q:1,note:n??''}]}); const adjust=(id:string,d:number)=>setCart(c=>c.map(x=>x.p.id===id?{...x,q:x.q+d}:x).filter(x=>x.q>0)); const onStockChanged=(id:string,change:{stockDelta:number;cost?:number})=>{setInventory(items=>items.map(p=>p.id===id?{...p,stock:p.stock+change.stockDelta,...(change.cost!==undefined?{cost:change.cost}:{})}:p)); void refreshLiveData()}; const confirmSale=async()=>{if(!cart.length||paying)return; const sold=cart; const cash=payment==='cash'; const tendered=cash?Math.max(0,Math.trunc(tenderedAmount??total)):total; if(cash&&tendered<total){toast('Cash tendered is less than the total.');return} const key=saleKey.current??crypto.randomUUID(); saleKey.current=key; setPaying(true); let result:Response; try{result=await fetch('/api/sales',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({paymentMethod:payment,payment_items:[{method:payment,amount:total}],tendered_amount:cash?tendered:null,tableLabel:tableLabel||null,idempotencyKey:key,items:sold.map(({p,q})=>({productId:p.id,quantity:q,note:p.note??''}))})})}catch{setPaying(false); toast('Could not reach the server. Check your connection and try again.'); return} if(!result.ok){const error=await result.json().catch(()=>({})); setPaying(false); toast(error.error==='Unauthorized'?'Please sign in again before recording a sale.':error.error??'Could not save sale.'); return} const sale=await result.json(); const receipt=Number(sale.receiptNumber??sale.receipt_number??0); const changeDue=Number(sale.changeDue??sale.change_due??0); const cashier=session?.user?.name??'Current user'; saleKey.current=null; setPaying(false); setReceiptNumber(String(receipt)); setNextReceipt(receipt+1); setInventory(items=>items.map(p=>{const line=sold.find(x=>x.p.id===p.id); return line?{...p,stock:Math.max(0,p.stock-line.q)}:p})); const printed=printReceipt({saleId:sale.id,receiptNumber:receipt,cashier,payment:paymentMethodLabel(String(sale.paymentMethod??payment)),changeDue,subtotal,taxTotal:Number(sale.taxTotal??charges.tax),items:sold.map(({p,q})=>({name:p.name,quantity:q,price:p.price,total:p.price*q,note:p.note??''})),total}); printTicket({saleId:sale.id,receiptNumber:receipt,cashier:waiter?`${waiter} · ${cashier}`:cashier,items:sold.map(({p,q})=>({name:p.name,quantity:q,price:p.price,total:p.price*q})),total}); setCart([]); setTenderedAmount(null); toast(printed?`Sale confirmed. Receipt #${receipt}.${changeDue>0?` Change due: ${money(changeDue)}`:''} Print dialog opened.`:`Sale confirmed. Allow pop-ups to print the receipt.`); await refreshLiveData()}; const saveOpenTab=async()=>{if(!cart.length){toast('Add at least one drink to the tab.');return} if(!tableLabel){toast('Choose a table or customer before saving the tab.');return} if(!waiter){toast('Choose who is serving this tab.');return} const result=await fetch('/api/tabs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tableLabel,ownerName:waiter,items:cart.map(({p,q})=>({productId:p.id,quantity:q}))})}); if(!result.ok){const error=await result.json().catch(()=>({})); toast(error.error??'Could not save tab.'); return} setCart([]); setTenderedAmount(null); setTableLabel(null); toast(`Tab saved for ${tableLabel}.`); await refreshLiveData()};
	// A round goes onto the existing bill. Stock, the tab total and the audit trail are all
	// written by the server so two tills adding at once cannot double-book the same bottle.
	const addToTab=async()=>{
		if(!activeTab||!cart.length||paying)return
		setPaying(true)
		try{
			const result=await fetch(`/api/tabs?id=${encodeURIComponent(activeTab.id)}&add=1`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({items:cart.map(({p,q})=>({productId:p.id,quantity:q}))})})
			if(!result.ok){const error=await result.json().catch(()=>({})); toast(error.error??'Could not add the round.'); return}
			const updated=await result.json()
			const round=cart
			const table=activeTab.tableLabel
			printTicket({saleId:activeTab.id,cashier:waiter?`${waiter} · ${session?.user?.name??'Till'}`:(session?.user?.name??'Till'),items:round.map(({p,q})=>({name:p.name,quantity:q,price:p.price,total:p.price*q})),total})
			setCart([]); setTenderedAmount(null); setActiveTab(null); setPage('Open tabs')
			toast(`Round added to ${table}. New total ${money(Number(updated.total??0))}.`)
			await refreshLiveData()
		}catch{toast('Could not reach the server. Check your connection and try again.')}
		finally{setPaying(false)}
	};
	async function saveProduct(item:Product):Promise<string|null>{try{const result=await fetch('/api/products',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(item)}); if(!result.ok){const body=await result.json().catch(()=>({})); const message=body?.error??'Could not save product.'; toast(message); return message} setInventory(items=>items.some(p=>p.id===item.id)?items.map(p=>p.id===item.id?item:p):[...items,item]); toast(`${item.name} ${inventory.some(p=>p.id===item.id)?'updated':'added'} successfully.`); void refreshLiveData(); return null}catch{const message='Could not reach the server. Check your connection and try again.'; toast(message); return message}}

 const frame={page,go,allowed,overview,regional,greeting:timeGreeting,userName:session?.user?.name ?? role,role,notice,onDismiss:()=>setNotice('')};
 if(page==='Reports') return <PageFrame {...frame}><Reports toast={toast}/></PageFrame>
 if(page==='Open tabs') return <PageFrame {...frame}><Tabs go={go} toast={toast} userName={session?.user?.name ?? 'Current user'} onActivity={refreshLiveData} canAdjust={role==='Owner'||role==='Admin'||role==='Manager'} onAddItems={(tab:any)=>{setActiveTab(tab);setTableLabel(tab.tableLabel);setWaiter(tab.ownerName);setPage('New sale')}}/></PageFrame>;
 if(page==='Daily close') return <PageFrame {...frame}><CloseDay closed={closed} day={day} inventory={inventory} overview={overview} setClosed={setClosed} toast={toast} go={go} onActivity={refreshLiveData}/></PageFrame>;
 // Every routed page shares PageFrame, so the notice is drawn once, above the page.
 if(page==='New sale') return <PageFrame {...frame}><Sale userName={session?.user?.name ?? 'Current user'} receiptNumber={receiptNumber} nextReceipt={nextReceipt} subtotal={subtotal} tax={charges.tax} paymentMethods={regional.paymentMethods} waiters={waiters} tableLabel={tableLabel} setTableLabel={setTableLabel} waiter={waiter} setWaiter={setWaiter} tenderedAmount={tenderedAmount} setTenderedAmount={setTenderedAmount} filtered={filtered} categories={categories} category={category} setCategory={setCategory} query={query} setQuery={setQuery} add={add} cart={cart} setCart={setCart} total={total} adjust={adjust} payment={payment} setPayment={setPayment} toast={toast} pay={confirmSale} saveOpenTab={saveOpenTab} paying={paying} dayLocked={closed} activeTab={activeTab} onAddToTab={addToTab} onCancelTab={()=>{setActiveTab(null);setCart([]);setTableLabel(null)}} /></PageFrame>;
 if(page==='Stock & deliveries') return <PageFrame {...frame}><Stock products={inventory} onStockChanged={onStockChanged} toast={toast} role={role}/></PageFrame>;
 if(page==='Menu & prices') return <PageFrame {...frame}><MenuPage inventory={inventory} onSave={saveProduct}/></PageFrame>;
 if(page==='Team & permissions') return <PageFrame {...frame}><TeamPanel toast={toast}/></PageFrame>;
 if(page==='Audit log') return <PageFrame {...frame}><Audit/></PageFrame>;
 if(page==='Settings') return <PageFrame {...frame}><SettingsPage toast={toast} user={session?.user} role={role} businessName={businessName} onPreferencesSaved={(next:{barName:string;regional:RegionalSettings})=>{const savedName=applyBarName(next.barName); window.localStorage.setItem(BAR_NAME_STORAGE_KEY,savedName); setBusinessName(savedName); const saved=applyRegional(next.regional); setRegional(saved)}}/></PageFrame>;
 return <PageFrame {...frame}><Overview go={go} role={role} low={low} data={overview} loading={overviewLoading} error={overviewError} refresh={()=>void refreshLiveData()} greeting={timeGreeting} range={range} setRange={setRange} rangeOpen={rangeOpen} setRangeOpen={setRangeOpen} rangeOptions={rangeOptions}/></PageFrame>}

function Shell({eyebrow,title,sub,children,action}:{eyebrow:string;title:string;sub:string;children:any;action?:React.ReactNode}){return <div className="mx-auto w-full max-w-[1180px]"><header className="border-b border-line pb-8 text-center md:pb-10"><p className="eyebrow justify-center">{eyebrow}</p><h2 className="display mx-auto mt-4 max-w-3xl text-balance text-[34px] text-ink sm:text-[44px] lg:text-[52px]">{title}</h2><p className="mx-auto mt-4 max-w-xl text-[13px] leading-relaxed text-ink-muted sm:text-sm">{sub}</p>{action&&<div className="mt-7 flex flex-wrap items-center justify-center gap-2">{action}</div>}</header><div className="pt-6 md:pt-8">{children}</div></div>}
const Card=({children,className=''}:{children:any;className?:string})=><section className={`border-t border-line pt-6 ${className}`}>{children}</section>
function paymentLabel(method:string){return paymentMethodLabel(method)}
const PAYMENT_TONES=['bg-[#0b0c0e]','bg-[#4c4c56]','bg-[#84848e]','bg-[#b4b4bc]','bg-[#d9d9df]']
function Delta({value}:{value:number|null|undefined;dark?:boolean}){
  if(value===null||value===undefined)return <span className="text-[11px] font-medium text-ink-soft">No comparison yet</span>
  const tone=value>0?'text-ink':value<0?'text-alert':'text-ink-soft'
  const Icon=value>=0?TrendingUp:TrendingDown
  return <span className={`inline-flex items-center gap-1 text-[11px] font-medium tabular-nums ${tone}`}><Icon className="size-3"/>{value>0?'+':''}{value}%</span>
}
function Kpi({label,value,sub,delta}:{label:string;value:string;sub:string;delta?:number|null;anchor?:boolean}){
  return <div className="bg-canvas px-4 py-6 sm:px-6">
    <p className="micro">{label}</p>
    <p className="stat-figure mt-3 truncate text-[26px] font-semibold text-ink sm:text-[32px]">{value}</p>
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium">{delta!==undefined&&<Delta value={delta}/>}<span className="leading-snug text-ink-muted">{sub}</span></div>
  </div>
}
/** The shared language for "nothing here yet": a quiet line, never a filled box. */
function Blank({icon:Icon,title,hint,compact=false}:{icon:any;title:string;hint?:string;compact?:boolean}){
  return <div className={`flex flex-col items-center justify-center gap-2 text-center ${compact?'py-7':'py-10'}`}>
    <Icon className="size-5 text-ink-soft"/>
    <p className="text-[13px] font-medium text-ink-muted">{title}</p>
    {hint&&<p className="max-w-[300px] text-[12px] leading-relaxed text-ink-soft">{hint}</p>}
  </div>
}
function TrendChart({points}:{points:OverviewTrend[]}){
  const max=Math.max(...points.map(point=>point.total),1)
  return <div className="mt-6">
    <div className="flex h-48 items-end gap-1.5">
      {points.map((point,index)=><div key={`${point.tooltip}-${index}`} className="group relative flex h-full flex-1 items-end">
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-[170px] -translate-x-1/2 rounded-[8px] bg-ink px-2.5 py-1.5 text-center text-[10px] font-medium text-white shadow-xl group-hover:block">
          <span className="block whitespace-nowrap">{point.tooltip}</span>
          <span className="mt-0.5 block text-white/70">{money(point.total)}</span>
          <span className="block font-medium text-white/50">{point.orders} {point.orders===1?'order':'orders'}</span>
        </div>
        <div className={`w-full rounded-[2px] transition-colors ${point.total>0?(index===points.length-1?'bg-ink':'bg-ink/25 group-hover:bg-ink/60'):'bg-well'}`} style={{height:`${point.total>0?Math.max(4,Math.round((point.total/max)*100)):2}%`}}/>
      </div>)}
    </div>
    <div className="mt-2 flex gap-1.5">
      {points.map((point,index)=><span key={`${point.label}-${index}`} className={`flex-1 truncate text-center text-[9px] text-ink-soft ${points.length>12&&index%3!==0?'invisible':''}`}>{point.label}</span>)}
    </div>
  </div>
}
function Overview({go,role,low,data,loading,error,refresh,greeting:timeGreeting,range,setRange,rangeOpen,setRangeOpen,rangeOptions}:{go:(p:Page)=>void;role:Role;low:number;data:OverviewData;loading:boolean;error:string;refresh:()=>void;greeting:string;range:RangeType;setRange:(r:RangeType)=>void;rangeOpen:boolean;setRangeOpen:(o:boolean)=>void;rangeOptions:RangeOption[]}){
  const stockAlerts=data.ready?data.lowStock.count:low
  const checklist=data.checklist.items?.length?data.checklist.items:[{label:'Review low stock',done:stockAlerts===0},{label:'Settle open tabs',done:data.openTabs===0},{label:'Count till at close',done:data.cashDrawer.dayStatus==='closed'},{label:'Trading day open',done:data.cashDrawer.dayStatus==='open'}]
  const payments=data.byPayment??[]
  const series=data.series??[]
  const topProducts=data.topProducts??[]
  const trendTotal=series.reduce((total,point)=>total+point.total,0)
  const busiest=series.length?series.reduce((best,point)=>point.total>best.total?point:best,series[0]):null
  const topRevenue=Math.max(...topProducts.map(item=>item.revenue),1)
  const updatedAt=data.generatedAt?formatDateTime(data.generatedAt,REGIONAL,{hour:'2-digit',minute:'2-digit',second:'2-digit'}):null
  const canReadCash=role==='Admin'||role==='Manager'
  const session=data.session?.status==='open'?data.session:null
  const sessionSince=session?formatDateTime(session.openedAt,REGIONAL,{hour:'2-digit',minute:'2-digit'}):''
  const variance=data.cashDrawer.cashVariance
  const cashSub=variance!==null?`Variance ${variance>=0?'+':''}${money(variance)}`:data.cashDrawer.countedCash!==null?`Counted ${money(data.cashDrawer.countedCash)}`:'Float + cash sales'
  const stats=[
    {label:'Items sold',value:String(data.totals.itemsSold),sub:`${data.totals.orders} completed ${data.totals.orders===1?'sale':'sales'}`},
    {label:'Average order',value:money(data.totals.averageOrder),sub:'per completed sale'},
    {label:'Discounts',value:money(data.totals.discountsValue),sub:`${data.totals.discounts} applied`},
    {label:'Voided',value:money(data.totals.voidedValue),sub:`${data.totals.voidedOrders} voided`},
    {label:'Cash expected',value:canReadCash?money(data.cashDrawer.expectedCash):'—',sub:cashSub},
    {label:'Low stock',value:String(stockAlerts),sub:stockAlerts?'Review stock':'Stock healthy'},
  ]
  const actions=<div className="flex flex-wrap items-center justify-center gap-2">
    <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-1.5 rounded-[8px] border border-line-strong bg-white px-3 py-2 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink disabled:opacity-50"><RefreshCw className={`size-3.5 ${loading?'animate-spin':''}`}/>Refresh</button>
    <div className="relative"><button onClick={()=>setRangeOpen(!rangeOpen)} className="inline-flex items-center gap-1 rounded-[8px] border border-line-strong bg-white px-3 py-2 text-[12px] font-medium text-ink transition hover:border-ink">{data.rangeLabel}<ChevronDown className="size-3 text-ink-muted"/></button>{rangeOpen&&<div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-[10px] border border-line bg-white py-1 shadow-[0_24px_50px_-24px_rgba(11,12,14,.35)]">{rangeOptions.map(option=><button key={option.value} onClick={()=>{setRange(option.value);setRangeOpen(false)}} className={`w-full px-3 py-2 text-left text-[13px] transition hover:bg-sunk ${option.value===range?'font-semibold text-ink':'text-ink-muted'}`}>{option.label}</button>)}</div>}</div>
    <button onClick={()=>go('New sale')} className="inline-flex items-center gap-1.5 rounded-[8px] bg-ink px-4 py-2 text-[12px] font-medium text-white transition hover:bg-black"><Plus className="size-3.5"/>New sale</button>
  </div>
  return <Shell eyebrow={`Live operations · ${role}`} title="Your bar, at a glance." sub={`Live totals from sales, tabs, stock, and the till${updatedAt?` · updated ${updatedAt}`:''}. Refreshes every 30 seconds.`} action={actions}>
    {data.cashDrawer.dayLocked&&<div className="mt-8 border-y border-alert-line bg-alert-tint px-4 py-3 text-[13px] text-alert"><b className="font-semibold">Day closed.</b> No new sales or tabs until a new day is opened.</div>}
    {error&&<div role="alert" className="mt-8 flex flex-wrap items-center justify-between gap-3 border-y border-alert-line bg-alert-tint px-4 py-3"><div><p className="text-[13px] font-semibold text-alert">Live data could not load</p><p className="mt-0.5 text-[12px] text-alert/80">{error}</p></div><button onClick={refresh} className="rounded-[6px] bg-alert px-3 py-1.5 text-[11px] font-medium text-white">Retry</button></div>}
    {!data.ready&&loading?<div className="mt-8 grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">{[0,1,2,3].map(index=><div key={index} className="bg-canvas px-5 py-6"><div className="h-2.5 w-16 animate-pulse rounded bg-well"/><div className="mt-4 h-7 w-24 animate-pulse rounded bg-well"/><div className="mt-3 h-2.5 w-20 animate-pulse rounded bg-well"/></div>)}</div>:<>
      <div className="mt-8 grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
        <Kpi label={session?'Trading day sales':"Today's sales"} value={money(session?session.revenue:data.today.revenue)} delta={session?undefined:data.delta.todayRevenue} sub={session?`${session.orders} ${session.orders===1?'order':'orders'} · since ${sessionSince}`:`${data.today.orders} ${data.today.orders===1?'order':'orders'} · vs yesterday`}/>
        <Kpi label={`${data.rangeLabel} revenue`} value={money(data.totals.revenue)} delta={data.delta.revenue} sub="vs previous period"/>
        <Kpi label="Orders served" value={String(data.totals.orders)} delta={data.delta.orders} sub={`avg ${money(data.totals.averageOrder)}`}/>
        <Kpi label="Open tabs" value={String(data.openTabs)} sub={data.openTabs?`${money(data.openTabsValue)} outstanding`:data.openTabsStatus}/>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 xl:grid-cols-6">{stats.map(item=><div key={item.label} className="border-t border-line pt-4"><p className="micro">{item.label}</p><p className="mt-2 text-[18px] font-semibold tabular-nums text-ink">{item.value}</p><p className="mt-0.5 text-[11px] leading-tight text-ink-muted">{item.sub}</p></div>)}</div>
      <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-14">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-[15px] font-semibold">Sales trend</h3><p className="mt-1 text-[12px] text-ink-muted">{data.rangeLabel} · {money(trendTotal)} across {data.totals.orders} {data.totals.orders===1?'order':'orders'}</p></div>{busiest&&busiest.total>0&&<span className="text-[11px] text-ink-muted">Best {busiest.label} · {money(busiest.total)}</span>}</div>
          {trendTotal>0?<TrendChart points={series}/>:<div className="mt-6 border-t border-line pt-4"><p className="text-[13px] font-medium text-ink-muted">No completed sales in this period</p><p className="mt-1 text-[11px] leading-relaxed text-ink-soft">Every settled bill is plotted here, hour by hour.</p></div>}
        </Card>
        <Card>
          <h3 className="text-[15px] font-semibold">Payment mix</h3>
          <p className="mt-1 text-[12px] text-ink-muted">{money(data.totals.revenue)} collected · {data.rangeLabel}</p>
          {payments.length===0?<div className="mt-6 border-t border-line pt-4"><p className="text-[13px] font-medium text-ink-muted">No payments recorded in this period</p><p className="mt-1 text-[11px] leading-relaxed text-ink-soft">Cash, mobile money and card volumes are split here as bills settle.</p></div>:<>
            <div className="mt-6 flex h-2 gap-0.5 overflow-hidden rounded-full bg-well">{payments.map((payment,index)=><div key={payment.method} className={PAYMENT_TONES[index%PAYMENT_TONES.length]} style={{width:`${Math.max(payment.share,1)}%`}}/>)}</div>
            <div className="mt-5 flex flex-col">{payments.map((payment,index)=><div key={payment.method} className="flex items-center justify-between border-b border-line py-2.5 text-[13px] last:border-0"><span className="flex items-center gap-2 font-medium"><span className={`size-2 rounded-[1px] ${PAYMENT_TONES[index%PAYMENT_TONES.length]}`}/>{paymentLabel(payment.method)}</span><span className="text-right font-medium tabular-nums">{money(payment.amount)}<span className="ml-2 text-[10px] text-ink-muted">{payment.share}%</span></span></div>)}</div>
          </>}
        </Card>
      </div>
      <div className="mt-12 grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
        <Card>
          <div className="flex items-baseline justify-between gap-3"><h3 className="text-[15px] font-semibold">Top products</h3><span className="micro">By revenue</span></div>
          <p className="mt-1 text-[12px] text-ink-muted">Best sellers for {data.rangeLabel.toLowerCase()}</p>
          <div className="mt-5 flex flex-col">{topProducts.length===0?<Blank icon={Wine} title="No items sold yet" hint="Bestsellers rank by revenue once bills settle in this period."/>:topProducts.map((item,index)=><div key={`${item.name}-${item.category}`} className="flex items-center gap-4 border-b border-line py-3 last:border-0"><span className="w-4 shrink-0 text-[11px] tabular-nums text-ink-soft">{String(index+1).padStart(2,'0')}</span><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-3"><p className="truncate text-[13px] font-medium">{item.name}</p><span className="shrink-0 text-[13px] font-medium tabular-nums">{money(item.revenue)}</span></div><div className="mt-1.5 flex items-center gap-3"><div className="h-[3px] flex-1 overflow-hidden bg-well"><div className="h-full bg-ink" style={{width:`${Math.max(3,Math.round((item.revenue/topRevenue)*100))}%`}}/></div><span className="shrink-0 text-[10px] text-ink-muted">{item.category} · {item.quantity} sold</span></div></div></div>)}</div>
        </Card>
        <Card>
          <div className="flex items-baseline justify-between gap-3"><h3 className="text-[15px] font-semibold">Recent activity</h3><span className="text-[11px] text-ink-muted">{data.recent.length} latest</span></div>
          <p className="mt-1 text-[12px] text-ink-muted">Completed sales across all dates, newest first</p>
          <div className="mt-5 flex flex-col">{data.recent.length===0?<Blank icon={ReceiptText} title="No completed sales" hint="Every settled bill lands here, newest first."/>:data.recent.map(sale=>{const created=new Date(sale.createdAt); const today=isoDayOf(created)===isoDay(); const when=today?formatDateTime(created,REGIONAL,{hour:'2-digit',minute:'2-digit'}):formatDateTime(created,REGIONAL); return <div key={sale.id} className="flex items-center justify-between border-b border-line py-3 text-[13px] last:border-0"><div><p className="font-medium">{sale.tableLabel||'Walk-in'}</p><p className="mt-0.5 text-[11px] text-ink-muted">{paymentLabel(sale.paymentMethod)} · {when}</p></div><span className="font-medium tabular-nums">{money(sale.total)}</span></div>})}</div>
        </Card>
      </div>
      <div className="mt-12 grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
        <Card>
          <div className="flex items-baseline justify-between gap-3"><h3 className="text-[15px] font-semibold">Low stock</h3><span className={`text-[11px] ${stockAlerts?'text-warn':'text-ink-muted'}`}>{stockAlerts} {stockAlerts===1?'item':'items'}</span></div>
          <p className="mt-1 text-[12px] text-ink-muted">At or below the reorder level</p>
          <div className="mt-5 flex flex-col">{data.lowStock.items.length===0?<div className="flex items-start gap-3 border-t border-line pt-4"><Check className="mt-0.5 size-4 text-ink"/><div><p className="text-[13px] font-medium">Every item is above its reorder level</p><p className="mt-0.5 text-[11px] text-ink-muted">Nothing needs a delivery today.</p></div></div>:data.lowStock.items.map(item=><div key={item.id} className="flex items-center justify-between border-b border-line py-3 text-[13px] last:border-0"><div><b className="font-medium">{item.name}</b><p className="mt-0.5 text-[11px] text-ink-muted">Reorder at {item.reorder}</p></div><span className={`text-[11px] font-medium tabular-nums ${item.stock<=0?'text-alert':'text-warn'}`}>{item.stock} left</span></div>)}</div>
          {data.lowStock.count>data.lowStock.items.length&&<p className="mt-3 text-[10px] text-ink-muted">Showing {data.lowStock.items.length} of {data.lowStock.count}. Open stock for the full list.</p>}
        </Card>
        <Card>
          <div className="flex items-baseline justify-between gap-3"><h3 className="text-[15px] font-semibold">Manager checklist</h3><span className="text-[11px] text-ink-muted">{checklist.filter(item=>item.done).length} / {checklist.length}</span></div>
          <p className="mt-1 text-[12px] text-ink-muted">Live checks against stock, tabs, and the trading day</p>
          <div className="mt-5 h-[3px] overflow-hidden bg-well"><div className="h-full bg-ink transition-[width]" style={{width:`${Math.round((checklist.filter(item=>item.done).length/checklist.length)*100)}%`}}/></div>
          <div className="mt-5 flex flex-col gap-3.5">{checklist.map(item=><div key={item.label} className="flex items-center gap-3 text-[13px] font-medium"><span className={`flex size-4 items-center justify-center rounded-[4px] border ${item.done?'border-ink bg-ink text-white':'border-line-strong text-transparent'}`}><Check className="size-2.5"/></span>{item.label}</div>)}</div>
        </Card>
      </div>
    </>}
  </Shell>
}
function Sale({userName='Current user',receiptNumber,nextReceipt,subtotal=0,tax=0,paymentMethods=['cash','mobile_money','card'],waiters=[],tableLabel,setTableLabel,waiter,setWaiter,tenderedAmount,setTenderedAmount,filtered,categories=['All'],category,setCategory,query,setQuery,add,cart,setCart,total,adjust,payment,setPayment,toast,pay,saveOpenTab,paying=false,dayLocked=false,activeTab=null,onAddToTab,onCancelTab}:any){
  // A round is added to an existing bill, so the waiter and table cannot be re-typed and no
  // money changes hands here. Settlement stays on the Open tabs page.
  const tabMode=Boolean(activeTab)
  const cashPayment=!tabMode&&payment==='cash'
  const tendered=cashPayment&&tenderedAmount!=null?tenderedAmount:total
  const changeDue=Math.max(0,tendered-total)
  const shortCash=cashPayment&&tendered<total
  const receiptLabel=nextReceipt??receiptNumber??'--'
  return <Shell eyebrow={tabMode?`Open tab · ${activeTab.tableLabel}`:`Cashier workflow · Sale #${receiptLabel}`} title={tabMode?`Add a round to ${activeTab.tableLabel}`:'Start a new sale'} sub={tabMode?'The drinks join the open tab. Payment is taken when the guest asks for the bill.':dayLocked?'The trading day is closed. Open a new day on Daily close before serving.':'Choose the waiter, table, drinks, and payment. Stock updates when you confirm.'}>
    {tabMode&&<div className="mt-8 border-y border-line bg-sunk px-4 py-3"><p className="text-[13px] font-medium">{activeTab.tableLabel} · {activeTab.ownerName}</p><p className="mt-0.5 text-[12px] text-ink-muted">On the tab now: {money(activeTab.total)} across {(activeTab.items??[]).length} {(activeTab.items??[]).length===1?'line':'lines'}. Everything you tap below is added to this bill.</p></div>}
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-12">
      <div>
        <div className="mt-8 grid gap-6 border-y border-line py-5 sm:grid-cols-3">
          <label className="block">
            <span className="micro">Served by</span>
            <select value={waiter??''} disabled={tabMode||dayLocked} onChange={e=>setWaiter(e.target.value||null)} className="mt-2 w-full border-0 border-b border-line-strong bg-transparent pb-1.5 text-[14px] font-medium outline-none transition focus:border-ink disabled:opacity-50">
              {waiters.length?<option value="">No waiter</option>:<option value={userName}>{userName} (no roster)</option>}
              {waiters.map((name:string)=><option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="micro">Table / customer</span>
            <input value={tableLabel??''} disabled={tabMode||dayLocked} onChange={e=>setTableLabel(e.target.value||null)} placeholder="Table 05 or name" className="mt-2 w-full border-0 border-b border-line-strong bg-transparent pb-1.5 text-[14px] font-medium outline-none transition placeholder:text-ink-soft focus:border-ink disabled:opacity-50"/>
          </label>
          <div className="block">
            <span className="micro">Receipt number</span>
            <span className="mt-2 flex items-center justify-between border-b border-line-strong pb-1.5 text-[14px] font-medium tabular-nums">#{receiptLabel}<ReceiptText className="size-3.5 text-ink-soft"/></span>
          </div>
        </div>
        <div className="relative mt-8"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search drinks by name…" className="field pl-10"/></div>
        <div className="mb-6 mt-5 flex gap-6 overflow-x-auto border-b border-line">{categories.map((x:string)=><button key={x} onClick={()=>setCategory(x)} className={`-mb-px whitespace-nowrap border-b-2 pb-2.5 text-[12px] transition ${category===x?'border-ink font-medium text-ink':'border-transparent text-ink-muted hover:text-ink'}`}>{x}</button>)}</div>
        <div className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-3">{filtered.map((p:Product)=><button key={p.id} onClick={()=>add(p)} disabled={p.stock<=0} className="tile group relative bg-canvas p-4 text-left disabled:cursor-not-allowed disabled:opacity-40"><div className={`item-${p.tone} mb-3 flex size-8 items-center justify-center rounded-[6px]`}><Wine className="size-4"/></div><p className="pr-7 text-[13px] font-medium leading-snug">{p.name}</p><p className="mt-1 text-[11px] tabular-nums text-ink-muted">{money(p.price)} · {p.stock>0?`${p.stock} left`:'Out of stock'}</p>{p.stock>0&&<span aria-hidden className="absolute right-3.5 top-3.5 text-ink-soft transition group-hover:text-ink"><Plus className="size-3.5"/></span>}</button>)}{filtered.length===0&&<div className="col-span-full bg-canvas"><Blank icon={Wine} title={query||category!=='All'?'No drinks match':'No drinks on the menu yet'} hint={query||category!=='All'?'Try another name, or clear the search to see the full list.':'Add bottles and cocktails under Menu & prices and they appear here, ready to sell.'}/></div>}</div>
      </div>
      <aside className="flex flex-col self-start border-t border-line pt-6 xl:sticky xl:top-24 xl:mt-8 xl:border-t-0 xl:border-l xl:pl-9 xl:pt-0">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-[15px] font-semibold">Current order</h3><p className="mt-1 text-[11px] text-ink-muted">{tableLabel||'Walk-in'} · {waiter||'No waiter'}</p></div>
          <button type="button" onClick={()=>setCart([])} className="text-[11px] font-medium text-ink-muted underline-offset-4 transition hover:text-ink hover:underline">Clear all</button>
        </div>
        <div className="my-5 h-px bg-line"/>
        {cart.length===0?<div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center"><ShoppingBag className="size-5 text-ink-soft"/><p className="text-[13px] font-medium text-ink-muted">No items yet</p><p className="text-[11px] text-ink-soft">Tap a drink to add it</p></div>:<div className="flex flex-1 flex-col gap-4">{cart.map((x:any)=><div key={x.p.id} className="flex items-center gap-2.5"><div className={`item-${x.p.tone} flex size-8 items-center justify-center rounded-[6px]`}><Wine className="size-3.5"/></div><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{x.p.name}</p><p className="text-[11px] tabular-nums text-ink-muted">{money(x.p.price)}</p></div><div className="flex items-center gap-1 rounded-[5px] border border-line-strong px-1 py-0.5"><button type="button" onClick={()=>adjust(x.p.id,-1)} className="flex size-5 items-center justify-center rounded-[3px] text-ink-muted transition hover:bg-well">−</button><span className="w-4 text-center text-[11px] font-medium tabular-nums">{x.q}</span><button type="button" onClick={()=>adjust(x.p.id,1)} className="flex size-5 items-center justify-center rounded-[3px] text-ink-muted transition hover:bg-well">+</button></div></div>)}</div>}
        <div className="my-5 h-px bg-line"/>
        <div className="flex justify-between text-[13px] text-ink-muted"><span>Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
        {tax>0&&<div className="mt-1.5 flex justify-between text-[11px] text-ink-muted"><span>Tax {formatNumber(REGIONAL.taxRateBps/100,REGIONAL)}%{REGIONAL.taxInclusive?' included':''}</span><span className="tabular-nums">{money(tax)}</span></div>}
        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3"><span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">Total</span><span className="text-[26px] font-semibold tabular-nums tracking-tight">{money(total)}</span></div>
        {tax>0&&<p className="mt-1 text-[10px] text-ink-muted">Tax is {REGIONAL.taxInclusive?'already inside the listed prices':'added on top of the listed prices'}{tabMode?' and is applied when the tab settles':''}.</p>}
        {tabMode?<div className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-muted">No payment is taken for a round. Settle the table from Open tabs when the guest asks for the bill.</div>:<>
        <div className="mt-5 flex flex-wrap gap-2">{paymentMethods.map((method:string)=><button type="button" key={method} onClick={()=>setPayment(method)} className={`rounded-[6px] border px-2.5 py-1.5 text-[11px] font-medium transition ${payment===method?'border-ink bg-ink text-white':'border-line-strong text-ink-muted hover:border-ink hover:text-ink'}`}>{paymentMethodLabel(method)}</button>)}</div>
        {cashPayment&&<div className="mt-3">
          <div className="flex items-end gap-2">
            <label className="flex-1 text-[11px] font-medium text-ink-muted">Cash tendered
              <input type="number" inputMode="numeric" min="0" step="1" value={tenderedAmount??''} onChange={e=>{const value=e.target.value;setTenderedAmount(value===''?null:Math.max(0,Math.trunc(Number(value))))}} className="field mt-1 text-[13px] font-medium tabular-nums" placeholder={String(total)}/>
            </label>
            <button type="button" onClick={()=>setTenderedAmount(total)} className="h-10 rounded-[8px] border border-line-strong px-3 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink">Exact</button>
          </div>
          <div className="mt-2 flex justify-between text-[12px] font-medium"><span className="text-ink-muted">Change due</span><span className={shortCash?'text-alert':'text-ink'}>{shortCash?'Tendered cash is below the total':money(changeDue)}</span></div>
        </div>}
        </>}
        {tabMode?<>
          <button type="button" disabled={!cart.length||paying||dayLocked} onClick={onAddToTab} className="mt-4 flex items-center justify-center gap-2 rounded-[8px] bg-ink py-3 text-[12px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"><Plus className="size-3.5"/>{paying?'Adding round…':'Add round to tab'}</button>
          <button type="button" disabled={paying} onClick={onCancelTab} className="mt-2 rounded-[8px] border border-line-strong py-2 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink disabled:opacity-40">Cancel</button>
        </>:<>
          <button type="button" disabled={!cart.length||shortCash||paying||dayLocked} onClick={pay} className="mt-4 flex items-center justify-center gap-2 rounded-[8px] bg-ink py-3 text-[12px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"><Printer className="size-3.5"/>{paying?'Saving sale…':'Pay & print receipt'}</button>
          <button type="button" disabled={!cart.length||dayLocked} onClick={saveOpenTab} className="mt-2 rounded-[8px] border border-line-strong py-2 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">Save as open tab</button>
        </>}
      </aside>
    </div>
  </Shell>
}
function TablePage({title,sub,children,action,eyebrow='Bar workspace'}:{title:string;sub:string;children:any;action?:React.ReactNode;eyebrow?:string}){return <Shell eyebrow={eyebrow} title={title} sub={sub} action={action}><div className="panel-flat overflow-hidden">{children}</div></Shell>}
type TabLine={id:string;productId:string;name:string;quantity:number;unitPrice:number;lineTotal:number}
type OpenTab={id:string;tableLabel:string;ownerName:string;total:number;openedAt:string;items?:TabLine[]}
/** A tab is billed pre-tax; tax is worked out when the guest actually settles. */
const tabCharges=(tab:OpenTab)=>taxBreakdown(Number(tab.total)||0,REGIONAL)
function TabBill({tab,canAdjust,onRemove,busy}:{tab:OpenTab;canAdjust:boolean;onRemove:(line:TabLine)=>void;busy:boolean}){
  const charges=tabCharges(tab)
  const lines=tab.items??[]
  return <div className="mt-4">
    <ul className="divide-y divide-line border-y border-line">
      {lines.map(line=><li key={line.id} className="flex items-center gap-2 py-2.5 text-[13px]"><span className="w-6 shrink-0 text-center text-[11px] tabular-nums text-ink-muted">{line.quantity}×</span><span className="min-w-0 flex-1 truncate font-medium">{line.name}</span><span className="shrink-0 text-[11px] text-ink-muted">{money(line.unitPrice)}</span><span className="w-16 shrink-0 text-right font-medium tabular-nums">{money(line.lineTotal)}</span>{canAdjust&&<button type="button" disabled={busy} aria-label={`Remove ${line.name}`} onClick={()=>onRemove(line)} className="shrink-0 rounded p-1 text-ink-soft transition hover:text-alert disabled:opacity-40"><X className="size-3.5"/></button>}</li>)}
      {lines.length===0&&<li className="py-6 text-center text-[12px] text-ink-muted">Nothing on this tab yet.</li>}
    </ul>
    <div className="mt-3 flex flex-col gap-1 text-[13px]">
      <div className="flex justify-between text-ink-muted"><span>Subtotal</span><span className="tabular-nums">{money(charges.subtotal)}</span></div>
      {charges.tax>0&&<div className="flex justify-between text-[11px] text-ink-muted"><span>Tax {formatNumber(REGIONAL.taxRateBps/100,REGIONAL)}%{REGIONAL.taxInclusive?' included':''}</span><span className="tabular-nums">{money(charges.tax)}</span></div>}
      <div className="flex justify-between border-t border-line pt-2 text-[15px] font-semibold"><span>Total</span><span className="tabular-nums">{money(charges.total)}</span></div>
    </div>
  </div>
}

function Tabs({go,toast,userName='Current user',onActivity,onAddItems,canAdjust=false}:any){
  const [tabs,setTabs]=useState<OpenTab[]>([])
  const [loading,setLoading]=useState(true)
  const [selected,setSelected]=useState<OpenTab|null>(null)
  const [settling,setSettling]=useState<OpenTab|null>(null)
  const [method,setMethod]=useState('cash')
  const [tendered,setTendered]=useState<number|null>(null)
  const [busy,setBusy]=useState(false)
  const [voiding,setVoiding]=useState<OpenTab|null>(null)
  const [voidPin,setVoidPin]=useState('')
  const [voidReason,setVoidReason]=useState('')
  const [error,setError]=useState('')

  const load=async()=>{setLoading(true); try{const response=await fetch('/api/tabs',{cache:'no-store'}); if(!response.ok)throw new Error('load failed'); setTabs(await response.json()); setError('')}catch{setError('Could not load the open tabs.')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[])

  const closeModal=()=>{if(busy)return; setSelected(null); setSettling(null); setVoiding(null)}
  const openSettle=(tab:OpenTab)=>{setSelected(null); setSettling(tab); setMethod(REGIONAL.paymentMethods[0]??'cash'); setTendered(null)}

  /** The bill a guest reads before paying. It is explicitly not a receipt. */
  const printBill=(tab:OpenTab)=>{
    const charges=tabCharges(tab)
    const rows=(tab.items??[]).map(line=>`<tr><td>${escapeHtml(line.name)}<br><small>${line.quantity} × ${money(line.unitPrice)}</small></td><td>${money(line.lineTotal)}</td></tr>`).join('')
    const html=receiptDocument({title:`Bill ${tab.tableLabel}`,heading:BAR_NAME,subheading:`Table bill · ${tab.tableLabel}`,meta:[`<span>Waiter</span><span>${escapeHtml(tab.ownerName)}</span>`,`<span>Opened</span><span>${escapeHtml(formatDateTime(tab.openedAt,REGIONAL,{hour:'2-digit',minute:'2-digit'}))}</span>`],rows,subtotal:charges.subtotal,tax:charges.tax,taxLabel:REGIONAL.taxRateBps?`Tax ${REGIONAL.taxRateBps/100}%${REGIONAL.taxInclusive?' incl.':''}`:'',total:charges.total,footer:'Bill only · payment is still due'})
    const billWindow=window.open('','_blank','width=420,height=700')
    if(!billWindow){toast('Allow pop-ups to print the bill'); return}
    billWindow.document.write(html); billWindow.document.close()
  }

  const settle=async()=>{
    if(!settling||busy)return
    const charges=tabCharges(settling)
    const cash=method==='cash'
    const handed=cash?(tendered??charges.total):charges.total
    if(cash&&handed<charges.total){toast('Cash tendered is below the tab total.'); return}
    setBusy(true)
    try{
      const response=await fetch(`/api/tabs?id=${encodeURIComponent(settling.id)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({paymentMethod:method,tenderedAmount:cash?handed:null})})
      if(!response.ok){const body=await response.json().catch(()=>({})); toast(typeof body?.error==='string'?body.error:'Could not settle tab.'); return}
      const result=await response.json()
      const changeDue=Number(result.changeDue??Math.max(0,handed-charges.total))
      const printed=printReceipt({saleId:result.saleId,receiptNumber:result.receiptNumber??'--',cashier:userName,payment:paymentMethodLabel(String(result.paymentMethod??method)),changeDue,subtotal:Number(result.subtotal??charges.subtotal),taxTotal:Number(result.taxTotal??charges.tax),items:(settling.items??[]).map(line=>({name:line.name,quantity:line.quantity,price:line.unitPrice,total:line.lineTotal})),total:Number(result.total??charges.total)})
      toast(`${settling.tableLabel} settled${printed?` · receipt #${result.receiptNumber}`:' · allow pop-ups to print the receipt'}${changeDue>0?` · change ${money(changeDue)}`:''}.`)
      setSettling(null); setTendered(null); await load(); onActivity?.()
    }catch{toast('Could not reach the server. Check your connection and try again.')}
    finally{setBusy(false)}
  }

  const voidTab=(tab:OpenTab)=>{setSelected(null); setVoiding(tab); setVoidPin(''); setVoidReason('')}
  const confirmVoid=async()=>{
    if(!voiding||busy)return
    if(!voidPin.trim()||!voidReason.trim()){toast('PIN and reason are required.'); return}
    setBusy(true)
    try{
      const response=await fetch(`/api/tabs?id=${encodeURIComponent(voiding.id)}&void=1`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({reason:voidReason.trim(),pin:voidPin.trim()})})
      if(!response.ok){const body=await response.json().catch(()=>({})); toast(typeof body?.error==='string'?body.error:'Void failed.'); return}
      toast(`${voiding.tableLabel} voided. The stock is back on the shelf.`)
      setVoiding(null); setSelected(null); await load(); onActivity?.()
    }catch{toast('Could not reach the server. Check your connection and try again.')}
    finally{setBusy(false)}
  }

  const removeLine=async(tab:OpenTab,line:TabLine)=>{
    if(busy)return
    setBusy(true)
    try{
      const response=await fetch(`/api/tabs?id=${encodeURIComponent(tab.id)}&remove=1`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({lineId:line.id})})
      if(!response.ok){const body=await response.json().catch(()=>({})); toast(typeof body?.error==='string'?body.error:'Could not remove the line.'); return}
      const updated=await response.json()
      const remaining=(tab.items??[]).filter(item=>item.id!==line.id)
      setTabs(items=>items.map(item=>item.id===tab.id?{...item,...updated,items:remaining}:item))
      setSelected(current=>current&&current.id===tab.id?{...current,...updated,items:remaining}:current)
      toast(`${line.name} removed from ${tab.tableLabel}.`)
      onActivity?.()
    }catch{toast('Could not reach the server. Check your connection and try again.')}
    finally{setBusy(false)}
  }

  const active=settling??selected
  return <TablePage eyebrow="Service floor" title="Open tabs" sub="Every table with an unpaid bill. Add a round, print the bill, or settle the tab." action={<button onClick={()=>go('New sale')} className="inline-flex items-center gap-1.5 rounded-[8px] bg-ink px-4 py-2 text-[12px] font-medium text-white transition hover:bg-black"><Plus className="size-3.5"/>New tab</button>}>
    {tabs.length>0&&<div className="mt-8 grid gap-px border-y border-line bg-line md:grid-cols-3">
      {tabs.map(tab=>{
        const charges=tabCharges(tab)
        const drinks=(tab.items??[]).reduce((sum,line)=>sum+line.quantity,0)
        return <div key={tab.id} className="bg-canvas p-5">
          <div className="flex items-start justify-between gap-2"><b className="text-[14px] font-medium">{tab.tableLabel}</b><span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-warn">Open</span></div>
          <p className="mt-2 text-[11px] text-ink-muted">{tab.ownerName} · opened {formatDateTime(tab.openedAt,REGIONAL,{hour:'2-digit',minute:'2-digit'})}</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">{drinks} {drinks===1?'drink':'drinks'} on {(tab.items??[]).length} {(tab.items??[]).length===1?'line':'lines'}</p>
          <p className="stat-figure mt-5 text-[26px] font-semibold tracking-tight">{money(charges.total)}</p>
          <p className="mt-1 text-[10px] text-ink-muted">{REGIONAL.taxInclusive?'tax included':'plus tax at settlement'}</p>
          <div className="mt-5 flex items-center gap-3 border-t border-line pt-4"><button onClick={()=>openSettle(tab)} className="rounded-[7px] bg-ink px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-black">Settle</button><button onClick={()=>onAddItems?.(tab)} className="text-[11px] font-medium text-ink-muted transition hover:text-ink">Add round</button><button onClick={()=>setSelected(tab)} className="text-[11px] font-medium text-ink-muted transition hover:text-ink">View</button></div>
        </div>
      })}
    </div>}
    {error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-alert-line bg-alert-tint px-4 py-3 text-[13px] font-medium text-alert"><span>{error}</span><button onClick={()=>void load()} className="rounded-[6px] bg-white px-3 py-1.5 text-[11px] font-medium text-alert">Retry</button></div>}
    {!loading&&tabs.length===0&&!error&&<div className="border-b border-line py-6"><Blank icon={ClipboardList} title="No open tabs" hint="Start a bill on New sale and choose “Save as open tab” when the guest is not paying yet."/><div className="flex justify-center"><button onClick={()=>go('New sale')} className="inline-flex items-center gap-1.5 rounded-[7px] bg-ink px-4 py-2 text-[11px] font-medium text-white transition hover:bg-black"><Plus className="size-3"/>Start a sale</button></div></div>}
    {loading&&tabs.length===0&&<div className="flex items-center justify-center gap-2 border-b border-line py-16 text-[13px] text-ink-muted"><Loader2 className="size-4 animate-spin"/>Loading open tabs…</div>}
    {active&&<div className="scrim" role="dialog" aria-modal="true"><div className="dialog max-w-md p-6">
      <div className="flex items-start justify-between gap-3">
        <div><p className="micro">{settling?'Settle tab':'Open tab'}</p><h2 className="mt-2 text-[20px] font-semibold tracking-tight">{active.tableLabel}</h2><p className="mt-1.5 text-[11px] text-ink-muted">Served by {active.ownerName} · opened {formatDateTime(active.openedAt,REGIONAL,{hour:'2-digit',minute:'2-digit'})}</p></div>
        <button aria-label="Close" onClick={closeModal} className="rounded-[6px] p-1.5 text-ink-muted transition hover:bg-canvas"><X className="size-4"/></button>
      </div>
      <TabBill tab={active} canAdjust={canAdjust&&!settling} onRemove={line=>void removeLine(active,line)} busy={busy}/>
      {settling?<>
        <div className="mt-4 grid grid-cols-2 gap-2">{REGIONAL.paymentMethods.map((option:string)=><button type="button" key={option} onClick={()=>{setMethod(option);setTendered(null)}} className={`rounded-[6px] border py-2 text-[12px] font-medium transition ${method===option?'border-ink text-ink':'border-line text-ink-muted hover:border-line-strong'}`}>{paymentMethodLabel(option)}</button>)}</div>
        {method==='cash'&&<div className="mt-3">
          <div className="flex items-end gap-2"><label className="flex-1 text-[11px] font-medium text-ink-muted">Cash received<input type="number" inputMode="numeric" min="0" step="1" value={tendered??''} onChange={e=>setTendered(e.target.value===''?null:Math.max(0,Math.trunc(Number(e.target.value))))} placeholder={String(tabCharges(settling).total)} className="field mt-1.5 text-[13px] font-medium tabular-nums"/></label><button type="button" onClick={()=>setTendered(tabCharges(settling).total)} className="h-10 rounded-[8px] border border-line-strong px-3 text-[12px] font-medium transition hover:border-ink">Exact</button></div>
          <div className="mt-2.5 flex justify-between text-[12px] font-medium"><span className="text-ink-muted">Change due</span><span className={(tendered??0)<tabCharges(settling).total?'text-alert':'text-ink'}>{(tendered??0)<tabCharges(settling).total?'Cash received is below the total':money(Math.max(0,(tendered??tabCharges(settling).total)-tabCharges(settling).total))}</span></div>
        </div>}
        <div className="mt-5 flex gap-2 border-t border-line pt-4"><button disabled={busy} onClick={()=>setSettling(null)} className="flex-1 rounded-[8px] border border-line-strong py-2.5 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink">Keep open</button><button disabled={busy} onClick={()=>void settle()} className="flex-1 rounded-[8px] bg-ink py-2.5 text-[12px] font-medium text-white transition hover:bg-black disabled:opacity-60">{busy?'Settling…':'Settle & print'}</button></div>
      </>:<>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4"><button onClick={()=>printBill(active)} className="inline-flex items-center gap-2 rounded-[8px] border border-line-strong px-3 py-2 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink"><Printer className="size-3.5"/>Print bill</button><button onClick={()=>onAddItems?.(active)} className="flex-1 rounded-[8px] border border-line-strong px-3 py-2 text-[12px] font-medium transition hover:border-ink">Add a round</button><button onClick={()=>openSettle(active)} className="flex-1 rounded-[8px] bg-ink px-3 py-2 text-[12px] font-medium text-white transition hover:bg-black">Settle</button></div>
        <button onClick={()=>voidTab(active)} className="mt-2 w-full rounded-[8px] border border-alert-line py-2 text-[12px] font-medium text-alert transition hover:bg-alert-tint">Void this tab</button>
      </>}
    </div></div>}
    {voiding&&<div className="scrim" role="dialog" aria-modal="true"><div className="dialog max-w-md p-6">
      <div className="flex items-start justify-between"><div><p className="micro">Void tab</p><h2 className="mt-2 text-[20px] font-semibold tracking-tight">{voiding.tableLabel}</h2><p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">Voiding removes the bill and returns every drink to stock. It stays in the audit log.</p></div><button aria-label="Close" onClick={closeModal} className="rounded-[6px] p-1.5 text-ink-muted transition hover:bg-canvas"><X className="size-4"/></button></div>
      <label className="mt-5 block text-[11px] font-medium text-ink-muted">Approval PIN<input value={voidPin} onChange={e=>setVoidPin(e.target.value.replace(/\D/g,'').slice(0,8))} inputMode="numeric" type="password" placeholder="4–8 digits" className="field mt-1.5 tracking-[.2em]"/><span className="mt-1.5 block text-[11px] text-ink-soft">A manager, admin or owner enters their own approval PIN to authorise this void.</span></label>
      <label className="mt-4 block text-[11px] font-medium text-ink-muted">Void reason<input value={voidReason} onChange={e=>setVoidReason(e.target.value)} placeholder="Explain why this tab is being voided" className="field mt-1.5"/></label>
      <div className="mt-6 flex gap-2 border-t border-line pt-4"><button onClick={closeModal} className="flex-1 rounded-[8px] border border-line-strong py-2.5 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink">Cancel</button><button disabled={busy} onClick={()=>void confirmVoid()} className="flex-1 rounded-[8px] bg-alert py-2.5 text-[12px] font-medium text-white transition hover:bg-[#a82c24] disabled:opacity-60">{busy?'Voiding…':'Confirm void'}</button></div>
    </div></div>}
  </TablePage>
}

function CloseDay({closed,day,inventory=[],setClosed,toast,go,overview,onActivity}:any){
  const [opening,setOpening]=useState(false);
  const [openingFloat,setOpeningFloat]=useState('0');
  const [countedCash,setCountedCash]=useState('');
  const [varianceReason,setVarianceReason]=useState('');
  const expected=Number(overview?.cashDrawer?.expectedCash??day?.expectedCash??0);
  const openingFloatValue=Number(day?.openingFloat??0);
  const counted=day?.status==='closed'?(day?.countedCash??null):(countedCash===''?null:Math.max(0,Math.trunc(Number(countedCash))||0));
  const variance=counted==null?null:(day?.status==='closed'?(day?.cashVariance??0):counted-expected);
  const varianceText=variance==null?'Not counted yet':`${variance>=0?'+':'−'}${money(Math.abs(variance))}`;
  const lowStock=inventory.filter((p:Product)=>p.stock<=p.reorder);
  const stockUnits=inventory.reduce((sum:number,p:Product)=>sum+p.stock,0);
  const stockValue=inventory.reduce((sum:number,p:Product)=>sum+p.stock*p.cost,0);
  const openDay=async()=>{
    setOpening(true);
    const float=Math.max(0,Math.trunc(Number(openingFloat)||0));
    const result=await fetch('/api/day',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'open',openingFloat:float})});
    if(result.ok){setClosed(false);setCountedCash('');setVarianceReason('');toast('Day opened. New sales and tabs are now allowed.');await onActivity?.()}
    else{const err=await result.json().catch(()=>({}));toast(err.error??'Could not open the trading day.')}
    setOpening(false)
  };
  const closeDay=async()=>{
    if(!day){toast('Open the trading day before closing it.');return}
    if(counted==null||!Number.isInteger(counted)||counted<0){toast('Enter the counted cash as a whole amount of 0 or more.');return}
    if(variance!==0&&varianceReason.trim().length<3){toast('A variance reason is required when counted cash does not match.');return}
    const result=await fetch('/api/day',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'close',countedCash:counted,varianceReason:varianceReason.trim(),varianceAccepted:true})});
    if(result.ok){setClosed(true);setCountedCash('');toast('Day closed. Reconciliation is saved and the till is locked.');await onActivity?.()}
    else{const err=await result.json().catch(()=>({}));toast(err.error??'Could not close the trading day.')}
  };
  return <TablePage eyebrow="End of shift" title={closed?'Day closed':'Close day'} sub={closed?'This trading day is locked. Open a new day before accepting more sales.':'Count the till, check the stock, then lock the day. Everything after that is read-only.'} action={day?.status==='open'&&!closed?<button onClick={closeDay} className="rounded-[8px] bg-ink px-3.5 py-2 text-[12px] font-medium text-white transition hover:bg-black">Close day</button>:undefined}>
    <div className="grid gap-x-12 gap-y-12 px-5 py-10 lg:grid-cols-2">
      <div>
        {day?.status!=='open'&&!closed?<>
          <p className="micro">Step one</p>
          <h3 className="mt-2 text-[15px] font-medium tracking-tight">Open the day</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">Count the float that is already in the drawer and open the day. Sales and tabs stay blocked until it is open.</p>
          <label className="mt-5 block text-[11px] font-medium text-ink-muted">Opening float<input type="number" inputMode="numeric" min="0" step="1" value={openingFloat} onChange={e=>setOpeningFloat(e.target.value)} className="field mt-2 text-[13px] font-medium tabular-nums"/></label>
          <button onClick={openDay} disabled={opening} className="mt-3 w-full rounded-[8px] bg-ink py-2.5 text-[12px] font-medium text-white transition hover:bg-black disabled:opacity-60">{opening?'Opening…':'Open trading day'}</button>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">Everything sold after this point belongs to this session. The float is added to cash sales when you reconcile.</p>
        </>:<>
        <p className="micro">Step one</p>
        <h3 className="mt-2 text-[15px] font-medium tracking-tight">Count the till</h3>
        <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">Expected cash = opening float + cash taken since the day opened. Card and mobile money are not in the drawer.</p>
        <div className="mt-5 flex flex-col">
          {[['Opening float',money(openingFloatValue)],['Cash sales',money(Math.max(0,expected-openingFloatValue))],['Expected cash',money(expected)],['Counted cash',counted==null?'Not counted yet':money(counted)],['Cash variance',varianceText]].map(x=><div key={x[0]} className="flex items-baseline justify-between gap-3 border-b border-line py-3 text-[13px] last:border-0"><span className="text-ink-muted">{x[0]}</span><b className="font-medium tabular-nums">{x[1]}</b></div>)}
          {day?.status==='open'&&counted==null?<label className="text-[11px] font-medium text-ink-muted">Counted cash<input type="number" inputMode="numeric" min="0" step="1" value={countedCash} onChange={e=>setCountedCash(e.target.value)} placeholder="Enter the cash counted in the till" className="field mt-2 text-[13px] font-medium tabular-nums"/></label>:counted!=null&&<div className={`flex justify-between border-t-2 py-3 text-[13px] font-medium ${variance===0?'border-ink text-ink':'border-alert text-alert'}`}><span>Cash variance</span><span className="tabular-nums">{varianceText}</span></div>}
          {day?.status==='closed'&&day?.varianceReason&&<p className="border-l-2 border-warn pl-3 text-[12px] font-medium text-warn">Variance reason: {day.varianceReason}</p>}
          {day?.status==='open'&&<label className="mt-2 text-[11px] font-medium text-ink-muted">Variance reason<input value={varianceReason} onChange={e=>setVarianceReason(e.target.value)} placeholder="Required only when cash does not match" className="field mt-2 text-[13px]"/></label>}
          {day?.status==='open'&&(overview?.openTabs??0)>0&&<p className="border-l-2 border-warn pl-3 text-[12px] font-medium text-warn">{overview.openTabs} {overview.openTabs===1?'tab is':'tabs are'} still open. Settle {overview.openTabs===1?'it':'them'} on Open tabs before closing.</p>}
          {day?.status==='open'&&<p className="text-[11px] leading-relaxed text-ink-muted">When the count is in, use <b>Close day</b> in the header. The day then locks: no more sales, tabs or voids.</p>}
        </div>
        </>}
      </div>
      <div>
        <p className="micro">Step two</p>
        <h3 className="mt-2 text-[15px] font-medium tracking-tight">Check the stock</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">Live on-hand after tonight's sales, deliveries and wastage. Do a physical count when the numbers look wrong; the count is what catches missing bottles.</p>
        <div className="mt-5 grid grid-cols-3 gap-px border-y border-line bg-line">
          <div className="bg-canvas py-3"><p className="micro">Units</p><b className="stat-figure mt-2 block text-[17px] font-medium tabular-nums">{formatNumber(stockUnits,REGIONAL)}</b></div>
          <div className="bg-canvas py-3"><p className="micro">Low stock</p><b className={`stat-figure mt-2 block text-[17px] font-medium tabular-nums ${lowStock.length?'text-warn':'text-ink'}`}>{lowStock.length}</b></div>
          <div className="bg-canvas py-3"><p className="micro">Stock value</p><b className="stat-figure mt-2 block text-[17px] font-medium tabular-nums">{money(stockValue)}</b></div>
        </div>
        <div className="mt-4 flex flex-col">{lowStock.slice(0,5).map((p:Product)=><div key={p.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[13px] last:border-0"><div className="min-w-0"><b className="block truncate font-medium">{p.name}</b><p className="text-[11px] text-ink-muted">Reorder at {p.reorder} {p.unit}</p></div><b className={`shrink-0 font-medium tabular-nums ${p.stock<=0?'text-alert':'text-warn'}`}>{p.stock} left</b></div>)}{lowStock.length===0&&<p className="py-3 text-[12px] text-ink-muted">Every item is above its reorder level.</p>}</div>
        <button onClick={()=>go('Stock & deliveries')} className="mt-4 w-full rounded-[8px] border border-line-strong py-2 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink">Open stock &amp; counts</button>
      </div>
    </div>
  </TablePage>
}
function Reports({toast}:any){const [period,setPeriod]=useState<'daily'|'weekly'|'custom'>('daily'); const [report,setReport]=useState<any>({orders:0,total:0,items_sold:0,by_payment:[],by_category:[],by_product:[]}); const [loading,setLoading]=useState(true); const load=async(next=period)=>{setLoading(true); const end=isoDay(); const start=shiftIsoDate(end,next==='weekly'?-6:0); try{const response=await fetch(`/api/reports/summary?from=${start}&to=${end}`); if(response.ok)setReport(await response.json())}finally{setLoading(false)}}; useEffect(()=>{load()},[period]); const products=[...(report.by_product??[])].sort((a:any,b:any)=>b.total-a.total); const categories=report.by_category??[]; const payments=report.by_payment??[]; const periodLabel=period==='daily'?'Today':'Last 7 days'; const download=(content:string,type:string,filename:string)=>{const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)}; const downloadCsv=()=>{const csv=[['Item','Category','Quantity',`Sales (${REGIONAL.currency})`],...products.map((p:any)=>[String(p.product_name??''),String(p.category??''),String(p.quantity??0),String(p.total??0)])].map((row:string[])=>row.map(value=>{const text=csvSafe(value); return /[",\n\r]/.test(text)?`"${text.replaceAll('"','""')}"`:text}).join(',')).join('\n'); download(csv,'text/csv;charset=utf-8','barflow-sales-report.csv'); toast('CSV report downloaded')}; const downloadPdf=()=>{const rows=products.map((p:any)=>`<tr><td>${escapeHtml(p.product_name)}</td><td>${escapeHtml(p.category)}</td><td>${escapeHtml(p.quantity)}</td><td>${money(Number(p.total)||0)}</td></tr>`).join(''); const html=`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(`${BAR_NAME} sales report`)}</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#171a1c}h1{margin-bottom:4px}p{color:#6a6862}table{width:100%;border-collapse:collapse;margin-top:28px}th,td{text-align:left;padding:12px;border-bottom:1px solid #ded8cb}th{background:#f4f1ea}</style></head><body><h1>${escapeHtml(`${BAR_NAME} sales report`)}</h1><p>Generated ${escapeHtml(formatDateTime(new Date(),REGIONAL,{dateStyle:'medium',timeStyle:'short'}))}</p><p>${escapeHtml(periodLabel)} · ${escapeHtml(report.orders??0)} orders · ${money(Number(report.total)||0)}${report.mixed_currency?' · mixed currencies':''}</p><table><thead><tr><th>Item</th><th>Category</th><th>Quantity</th><th>Sales</th></tr></thead><tbody>${rows}</tbody></table><script>window.addEventListener('load',()=>{window.focus();window.print()})</script></body></html>`; const url=URL.createObjectURL(new Blob([html],{type:'text/html'})); const popup=window.open(url,'_blank','width=820,height=720'); if(!popup){URL.revokeObjectURL(url);toast('Allow pop-ups to print the PDF report');return} setTimeout(()=>URL.revokeObjectURL(url),60000); toast('Report opened. Choose Save as PDF in the print dialog')}; return <TablePage eyebrow="Sales ledger" title="Reports" sub={loading?'Loading live sales rows…':`${periodLabel} · ${report.orders??0} orders · ${money(report.total??0)} sold`} action={<div className="flex flex-wrap items-center justify-center gap-2"><div className="mr-1 flex items-center gap-5">{(['daily','weekly'] as const).map(p=><button key={p} onClick={()=>setPeriod(p)} className={`-mb-px border-b-2 pb-1 text-[12px] font-medium transition ${period===p?'border-ink text-ink':'border-transparent text-ink-muted hover:text-ink'}`}>{p==='daily'?'Today':'7 days'}</button>)}</div><button onClick={downloadCsv} className="inline-flex items-center gap-1.5 rounded-[8px] border border-line-strong px-3 py-1.5 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink"><ArrowDownToLine className="size-3.5"/>CSV</button><button onClick={downloadPdf} className="inline-flex items-center gap-1.5 rounded-[8px] bg-ink px-3.5 py-1.5 text-[12px] font-medium text-white transition hover:bg-black"><Printer className="size-3.5"/>PDF report</button></div>}><div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-3 lg:grid-cols-5">{[['Sales',money(report.total??0)],['Tax collected',money(report.tax_total??0)],['Orders',String(report.orders??0)],['Items sold',String(report.items_sold??0)],['Average order',money(report.average_order??0)]].map(x=><div key={x[0]} className="bg-canvas px-5 py-6"><p className="micro">{x[0]}</p><b className="stat-figure mt-3 block text-[22px] font-semibold">{x[1]}</b></div>)}</div>{report.mixed_currency&&<div className="border-b border-line px-5 py-3 text-[12px] leading-relaxed text-warn"><b>Mixed currencies in this period.</b> Sales were taken in {(report.by_currency??[]).map((row:any)=>formatMoney(row.total,{...REGIONAL,currency:row.currency})).join(' · ')}. The totals above are not converted, so compare them per currency instead.</div>}<div className="grid gap-x-12 gap-y-12 px-5 py-10 lg:grid-cols-2"><div><h3 className="micro">Sales by item</h3><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-[13px]"><thead className="border-b border-line text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted"><tr><th className="px-3 pb-2 text-left font-semibold">Item</th><th className="px-3 pb-2 text-right font-semibold">Qty</th><th className="px-3 pb-2 text-right font-semibold">Sales</th></tr></thead><tbody>{products.slice(0,10).map((p:any)=><tr key={p.product_id} className="border-b border-line last:border-0"><td className="p-3 font-semibold">{p.product_name}</td><td className="p-3 text-right tabular-nums">{p.quantity}</td><td className="p-3 text-right font-semibold tabular-nums">{money(p.total)}</td></tr>)}{products.length===0&&!loading&&<tr><td colSpan={3}><Blank compact icon={Wine} title="No sales yet in this period" hint="Settled bills feed this table. Try a longer period if the bar was closed."/></td></tr>}</tbody></table></div></div><div><h3 className="micro">By category</h3><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-[13px]"><thead className="border-b border-line text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted"><tr><th className="px-3 pb-2 text-left font-semibold">Category</th><th className="px-3 pb-2 text-right font-semibold">Qty</th><th className="px-3 pb-2 text-right font-semibold">Sales</th></tr></thead><tbody>{categories.map((c:any)=><tr key={c.category} className="border-b border-line last:border-0"><td className="p-3 font-semibold">{c.category}</td><td className="p-3 text-right tabular-nums">{c.quantity}</td><td className="p-3 text-right font-semibold tabular-nums">{money(c.total)}</td></tr>)}{categories.length===0&&!loading&&<tr><td colSpan={3}><Blank compact icon={Tags} title="No category totals yet" hint="Give every drink a category under Menu & prices and sales group here."/></td></tr>}</tbody></table></div><h3 className="micro mt-10">By payment method</h3><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-[13px]"><thead className="border-b border-line text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted"><tr><th className="px-3 pb-2 text-left font-semibold">Method</th><th className="px-3 pb-2 text-right font-semibold">Sales</th><th className="px-3 pb-2 text-right font-semibold">Share</th></tr></thead><tbody>{payments.map((p:any)=><tr key={p.payment_method} className="border-b border-line last:border-0"><td className="p-3 font-semibold">{paymentLabel(p.payment_method)}</td><td className="p-3 text-right font-semibold tabular-nums">{money(p.total)}</td><td className="p-3 text-right tabular-nums">{report.total?Math.round((p.total*100)/report.total):0}%</td></tr>)}{payments.length===0&&!loading&&<tr><td colSpan={3}><Blank compact icon={Wallet} title="No payments recorded yet" hint="Cash, mobile money and card volumes split here as bills settle."/></td></tr>}</tbody></table></div></div></div></TablePage>}
function MenuPage({inventory,onSave}:{inventory:Product[];onSave:(item:Product)=>Promise<string|null>}){
  const blank=():Product=>({id:`p${Date.now()}`,name:'',category:'Beer',price:0,stock:0,reorder:10,cost:0,unit:'bottle',tone:'gold'});
  const [editing,setEditing]=useState<Product|null>(null);
  const [modalOpen,setModalOpen]=useState(false);
  const [form,setForm]=useState<Product>(blank);
  const [formError,setFormError]=useState('');
  const [saving,setSaving]=useState(false);
  const isExisting=Boolean(editing&&inventory.some(p=>p.id===editing.id));
  const open=(p?:Product)=>{setEditing(p||null); setForm(p?{...p}:blank()); setFormError(''); setModalOpen(true)};
  const close=()=>{if(saving)return; setModalOpen(false); setEditing(null); setFormError(''); setForm(blank())};
  const update=(key:keyof Product,value:string)=>setForm(current=>({...current,[key]:key==='price'||key==='stock'||key==='reorder'||key==='cost'?Number(value):value}));
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(saving)return;
    const name=form.name.trim();
    if(!name){setFormError('Enter a name for the menu item.'); return}
    if(!Number.isInteger(form.price)||form.price<=0){setFormError('Selling price must be a whole amount greater than zero.'); return}
    if(![form.stock,form.reorder,form.cost].every(amount=>Number.isInteger(amount)&&amount>=0)){setFormError('Opening stock, reorder level, and cost must be whole amounts of zero or more.'); return}
    setSaving(true); setFormError('');
    const error=await onSave({...form,name});
    setSaving(false);
    if(error){setFormError(error); return}
    setModalOpen(false); setEditing(null); setForm(blank());
  };
  const field='field mt-1.5';
  return <TablePage eyebrow="Menu catalogue" title="Menu & prices" sub="What the till sells. Every item is one stock unit, so a sale takes one off the shelf." action={<button type="button" onClick={()=>open()} className="inline-flex items-center gap-1.5 rounded-[8px] bg-ink px-3.5 py-2 text-[12px] font-medium text-white transition hover:bg-black"><Plus className="size-3.5"/>Add menu item</button>}>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-[13px]">
        <thead className="border-b border-line text-[9px] uppercase tracking-[0.16em] text-ink-muted"><tr><th className="px-3 pb-2 font-semibold">Menu item</th><th className="px-3 pb-2 font-semibold">Category</th><th className="px-3 pb-2 text-right font-semibold">Price</th><th className="px-3 pb-2 text-right font-semibold">Cost</th><th className="px-3 pb-2 text-right font-semibold">Margin</th><th className="px-3 pb-2 font-semibold">On hand</th><th className="w-12 px-3 pb-2"/></tr></thead>
        <tbody>
          {inventory.map(p=>{const margin=p.price>0&&p.cost>0?Math.round(((p.price-p.cost)/p.price)*100):null; return <tr key={p.id} className="border-b border-line transition last:border-0 hover:bg-canvas"><td className="p-3 font-semibold text-ink">{p.name}</td><td className="p-3 text-ink-muted">{p.category}</td><td className="p-3 text-right font-semibold tabular-nums">{money(p.price)}</td><td className="p-3 text-right text-ink-muted tabular-nums">{p.cost>0?money(p.cost):'—'}</td><td className={`p-3 text-right font-semibold tabular-nums ${margin===null?'text-ink-muted':margin<20?'text-alert':'text-brand'}`}>{margin===null?'—':`${margin}%`}</td><td className="p-3"><span className={p.stock<=0?'font-medium text-alert':p.stock<=p.reorder?'font-medium text-warn':'font-medium'}>{formatNumber(p.stock,REGIONAL)} {p.unit}</span>{p.stock<=p.reorder&&<span className="ml-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-warn">{p.stock<=0?'Out':'Low'}</span>}</td><td className="p-3"><button type="button" aria-label={`Edit ${p.name}`} onClick={()=>open(p)} className="rounded-[8px] p-1.5 text-ink-muted transition hover:bg-well hover:text-ink"><SlidersHorizontal className="size-4"/></button></td></tr>})}
          {!inventory.length&&<tr><td colSpan={7}><Blank icon={Tags} title="The menu is empty" hint="Add the drinks you sell with a price and opening stock. Every sale then draws one unit off the shelf."/><div className="flex justify-center pb-10"><button type="button" onClick={()=>open()} className="inline-flex items-center gap-1.5 rounded-[8px] bg-ink px-3.5 py-2 text-[12px] font-medium text-white transition hover:bg-black"><Plus className="size-3.5"/>Add the first item</button></div></td></tr>}
        </tbody>
      </table>
    </div>
    {modalOpen&&<div className="scrim" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="dialog max-w-lg p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div><p className="micro">Menu catalogue</p><h3 className="mt-2 text-[20px] font-semibold tracking-tight text-ink">{isExisting?'Edit menu item':'Add menu item'}</h3><p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">Set the price guests pay. Cost and stock feed stock value and reorder alerts.</p></div>
          <button type="button" aria-label="Close dialog" onClick={close} disabled={saving} className="rounded-[6px] p-1.5 text-ink-muted transition hover:bg-canvas disabled:opacity-40"><X className="size-4"/></button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-[11px] font-medium text-ink-muted sm:col-span-2">Item name<input autoFocus required value={form.name} onChange={event=>update('name',event.target.value)} placeholder="e.g. Nile Special" className={field}/></label>
          <label className="block text-[11px] font-medium text-ink-muted">Category<input required list="menu-categories" value={form.category} onChange={event=>update('category',event.target.value)} placeholder="Beer" className={field}/></label>
          <datalist id="menu-categories">{Array.from(new Set(['Beer','Spirits','Cider','Soft drinks','Wine','Cocktails',...inventory.map(p=>p.category)])).filter(Boolean).map(name=><option key={name} value={name}/>)}</datalist>
          <label className="block text-[11px] font-medium text-ink-muted">Unit<input required value={form.unit} onChange={event=>update('unit',event.target.value)} placeholder="bottle" className={field}/></label>
          <label className="block text-[11px] font-medium text-ink-muted">Selling price ({REGIONAL.currency})<input required min="1" step="1" type="number" value={form.price||''} onChange={event=>update('price',event.target.value)} className={field}/></label>
          <label className="block text-[11px] font-medium text-ink-muted">Cost per {form.unit||'unit'} ({REGIONAL.currency})<input min="0" step="1" type="number" value={form.cost||''} onChange={event=>update('cost',event.target.value)} className={field}/></label>
          <label className="block text-[11px] font-medium text-ink-muted">{isExisting?'Stock on hand':'Opening stock'}<input min="0" step="1" type="number" value={form.stock} onChange={event=>update('stock',event.target.value)} className={field}/></label>
          <label className="block text-[11px] font-medium text-ink-muted">Reorder level<input min="0" step="1" type="number" value={form.reorder} onChange={event=>update('reorder',event.target.value)} className={field}/></label>
        </div>
        {formError&&<p role="alert" className="mt-4 border-l-2 border-alert bg-alert-tint/60 px-3 py-2 text-[11px] font-medium text-alert">{formError}</p>}
        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={close} disabled={saving} className="rounded-[8px] border border-line-strong px-3.5 py-2 text-[12px] font-medium text-ink transition hover:bg-canvas disabled:opacity-40">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-[8px] bg-ink px-4 py-2 text-[12px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60">{saving&&<Loader2 className="size-3.5 animate-spin"/>}{saving?'Saving…':isExisting?'Save changes':'Add to menu'}</button>
        </div>
      </form>
    </div>}
  </TablePage>
}
const AUDIT_ACTION_META:Record<string,{label:string;tone:string}>={open:{label:'Tab opened',tone:'text-info'},tab_items_add:{label:'Round added',tone:'text-info'},tab_item_void:{label:'Line removed',tone:'text-warn'},settle:{label:'Tab settled',tone:'text-ink'},close:{label:'Tab closed',tone:'text-ink-muted'},void:{label:'Void',tone:'text-alert'},discount:{label:'Discount',tone:'text-warn'},price_change:{label:'Price change',tone:'text-warn'},delivery:{label:'Delivery',tone:'text-ink'},tolerance_change:{label:'Tolerance change',tone:'text-warn'},day_close:{label:'Day close',tone:'text-ink'},settings_change:{label:'Setting changed',tone:'text-ink'},team_add:{label:'Team member added',tone:'text-info'},team_invite:{label:'Invitation sent',tone:'text-info'},team_join:{label:'Member joined',tone:'text-ink'},team_role_change:{label:'Role changed',tone:'text-warn'},team_remove:{label:'Member removed',tone:'text-alert'},invitation_revoke:{label:'Invitation revoked',tone:'text-alert'},workspace_rename:{label:'Workspace renamed',tone:'text-ink'},pin_change:{label:'Approval PIN',tone:'text-ink'},count:{label:'Stock count',tone:'text-info'},wastage:{label:'Wastage',tone:'text-alert'}}
const AUDIT_ENTITY_LABELS:Record<string,string>={product:'Product',sale:'Sale',tab:'Tab',stock_delivery:'Delivery',day:'Trading day',team_member:'Team member',membership:'Member',invitation:'Invitation',workspace:'Workspace',setting:'Setting',approval_pin:'Approval PIN',variance_tolerance:'Variance tolerance',inventory_count:'Inventory count',stock_adjustment:'Stock adjustment'}
const auditActionMeta=(value:string)=>AUDIT_ACTION_META[value]??{label:value.replaceAll('_',' '),tone:'text-ink'}
const auditEntityLabel=(value:string)=>AUDIT_ENTITY_LABELS[value]??value.replaceAll('_',' ')
const auditApprovalMeta=(value:string)=>{
  if(value==='self_confirm')return{label:'PIN confirmed',tone:'text-ink',hint:'The signed-in person confirmed the action with their own approval PIN.'}
  if(value==='manager_pin')return{label:'Manager PIN',tone:'text-warn',hint:'A manager, admin or owner entered their PIN at the till to approve this action.'}
  if(value==='owner_override')return{label:'Owner override',tone:'text-ink',hint:'The owner approved without a PIN because their account has none set.'}
  if(value==='admin_override')return{label:'Admin override',tone:'text-ink',hint:'An admin approved without a PIN because their account has none set.'}
  if(value==='admin')return{label:'Admin (legacy)',tone:'text-ink',hint:'Historical event recorded before explicit approval methods existed.'}
  if(value==='manager')return{label:'Manager (legacy)',tone:'text-warn',hint:'Historical event recorded before explicit approval methods existed.'}
  return{label:'Recorded',tone:'text-ink-muted',hint:'Recorded automatically; no approval step was required for this event.'}
}
const auditRelative=(value:string)=>{
  const then=new Date(value).getTime(); if(!Number.isFinite(then))return ''
  const minutes=Math.round((Date.now()-then)/60000)
  if(minutes<1)return 'just now'
  if(minutes<60)return `${minutes}m ago`
  const hours=Math.round(minutes/60); if(hours<24)return `${hours}h ago`
  const days=Math.round(hours/24); if(days<7)return `${days}d ago`
  return formatDate(value,REGIONAL,{day:'numeric',month:'short'})
}
const auditDayKey=(value:string)=>formatDate(value,REGIONAL,{year:'numeric',month:'2-digit',day:'2-digit'})
const auditDayLabel=(value:string)=>formatDate(value,REGIONAL,{weekday:'long',day:'numeric',month:'long',year:'numeric'})
const auditValue=(value:unknown)=>typeof value==='number'?formatNumber(value,REGIONAL):typeof value==='object'?JSON.stringify(value):String(value)
const auditDiff=(metadata:unknown)=>{
  if(!metadata||typeof metadata!=='object')return null
  const record=metadata as Record<string,unknown>
  for(const [before,after] of [['from','to'],['previous','value']] as [string,string][]){
    if(before in record&&after in record)return{before:record[before],after:record[after],keys:[before,after] as [string,string]}
  }
  return null
}

function Audit(){
  const [events,setEvents]=useState<any[]>([])
  const [total,setTotal]=useState(0)
  const [offset,setOffset]=useState(0)
  const [hasMore,setHasMore]=useState(false)
  const [loading,setLoading]=useState(true)
  const [loadingMore,setLoadingMore]=useState(false)
  const [error,setError]=useState('')
  const [period,setPeriod]=useState('30d')
  const [customFrom,setCustomFrom]=useState('')
  const [customTo,setCustomTo]=useState('')
  const [action,setAction]=useState('all')
  const [entityType,setEntityType]=useState('')
  const [search,setSearch]=useState('')
  const [query,setQuery]=useState('')
  const [facets,setFacets]=useState<{actions:{action:string;count:number}[];entityTypes:{entityType:string;count:number}[]}>({actions:[],entityTypes:[]})
  const [summary,setSummary]=useState<any>(null)
  const [businessDate,setBusinessDate]=useState('')
  const [openId,setOpenId]=useState<string|null>(null)
  const [copiedId,setCopiedId]=useState<string|null>(null)
  const ticket=useRef(0)

  useEffect(()=>{const timer=window.setTimeout(()=>setQuery(search.trim()),300); return ()=>window.clearTimeout(timer)},[search])

  const filterParams=useMemo(()=>{
    const params=new URLSearchParams()
    if(period==='custom'){if(customFrom)params.set('from',customFrom); if(customTo)params.set('to',customTo)}
    else if(period!=='all')params.set('period',period)
    if(action!=='all')params.set('action',action)
    if(entityType)params.set('entityType',entityType)
    if(query)params.set('q',query)
    return params
  },[period,customFrom,customTo,action,entityType,query])

  const rangeInvalid=period==='custom'&&Boolean(customFrom&&customTo&&customFrom>customTo)

  const load=async(mode:'replace'|'append')=>{
    if(rangeInvalid)return
    const current=++ticket.current
    const nextOffset=mode==='append'?offset:0
    if(mode==='append')setLoadingMore(true); else setLoading(true)
    setError('')
    try{
      const params=new URLSearchParams(filterParams)
      params.set('offset',String(nextOffset))
      const response=await fetch(`/api/audit?${params.toString()}`,{cache:'no-store'})
      const data=await response.json().catch(()=>null)
      if(current!==ticket.current)return
      if(!response.ok){
        if(mode==='replace'){setEvents([]); setTotal(0); setHasMore(false)}
        setError(data?.error??`Could not load the audit log (${response.status}).`); return
      }
      const incoming=Array.isArray(data?.events)?data.events:[]
      setEvents(currentEvents=>mode==='append'?[...currentEvents,...incoming]:incoming)
      setTotal(Number(data?.total??0)); setOffset(nextOffset+incoming.length); setHasMore(Boolean(data?.hasMore))
      setFacets({actions:Array.isArray(data?.facets?.actions)?data.facets.actions:[],entityTypes:Array.isArray(data?.facets?.entityTypes)?data.facets.entityTypes:[]})
      setSummary(data?.summary??null)
      if(data?.businessDate)setBusinessDate(String(data.businessDate))
    }catch{
      if(current!==ticket.current)return
      if(mode==='replace'){setEvents([]); setTotal(0); setHasMore(false)}
      setError('Could not reach the server. Check your connection and try again.')
    }finally{
      if(current===ticket.current){setLoading(false); setLoadingMore(false)}
    }
  }

  useEffect(()=>{setOpenId(null); void load('replace')},[filterParams,rangeInvalid])

  const exportView=()=>{const params=new URLSearchParams(filterParams); params.set('format','csv'); window.location.assign(`/api/audit?${params.toString()}`)}
  const copyId=async(value:string)=>{try{await navigator.clipboard.writeText(value); setCopiedId(value); window.setTimeout(()=>setCopiedId(current=>current===value?null:current),1600)}catch{setCopiedId(null)}}

  const actionOptions=useMemo(()=>{
    const list=[...facets.actions]
    if(action!=='all'&&!list.some(option=>option.action===action))list.push({action,count:0})
    return list.length?list:Object.keys(AUDIT_ACTION_META).map(key=>({action:key,count:0}))
  },[facets.actions,action])
  const entityOptions=useMemo(()=>{
    const list=[...facets.entityTypes]
    if(entityType&&!list.some(option=>option.entityType===entityType))list.push({entityType,count:0})
    return list
  },[facets.entityTypes,entityType])
  const hasFilters=Boolean(query||action!=='all'||entityType)

  return <TablePage eyebrow="Audit trail" title="Audit log" sub="Permanent record of voids, discounts, price changes, settlements, and approvals." action={<div className="flex gap-2"><button type="button" onClick={exportView} className="inline-flex items-center gap-1.5 rounded-[8px] border border-line-strong px-3.5 py-1.5 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink"><Download className="size-3.5"/>Export</button><button type="button" onClick={()=>void load('replace')} disabled={loading} className="rounded-[8px] border border-line-strong px-3.5 py-1.5 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink disabled:opacity-40">Refresh</button></div>}>
    <div className="flex flex-col gap-3 border-b border-line px-5 py-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <select value={period} onChange={event=>{setPeriod(event.target.value); setError('')}} aria-label="Period" className="field h-9 w-auto min-w-[136px] text-[12px] font-medium"><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All time</option><option value="custom">Custom range</option></select>
        <select value={action} onChange={event=>setAction(event.target.value)} aria-label="Action" className="field h-9 w-auto min-w-[136px] text-[12px] font-medium"><option value="all">All actions{summary?.total?` (${summary.total})`:''}</option>{actionOptions.map(option=><option key={option.action} value={option.action}>{auditActionMeta(option.action).label}{option.count?` (${option.count})`:''}</option>)}</select>
        <select value={entityType} onChange={event=>setEntityType(event.target.value)} aria-label="Record type" className="field h-9 w-auto min-w-[136px] text-[12px] font-medium"><option value="">All records</option>{entityOptions.map(option=><option key={option.entityType} value={option.entityType}>{auditEntityLabel(option.entityType)}{option.count?` (${option.count})`:''}</option>)}</select>
        <div className="relative min-w-[180px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-soft"/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search record, reason, user, or details" className="field pl-9 text-[12px]"/></div>
      </div>
      {period==='custom'&&<div className="flex flex-wrap items-end gap-3">
        <label className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted">From<input type="date" value={customFrom} max={customTo||undefined} onChange={event=>setCustomFrom(event.target.value)} className="field mt-1.5 h-9 w-auto text-[12px]"/></label>
        <label className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted">To<input type="date" value={customTo} min={customFrom||undefined} onChange={event=>setCustomTo(event.target.value)} className="field mt-1.5 h-9 w-auto text-[12px]"/></label>
        {rangeInvalid?<p className="pb-1 text-[11px] font-semibold text-alert">The start date is after the end date.</p>:<p className="pb-1 text-[11px] text-ink-muted">Blank dates include everything. Days follow the bar's clock.</p>}
      </div>}
    </div>
    {summary&&<div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-5" title="Totals for the selected date range, before action or search filters.">
      {[{label:'Events',value:summary.total,detail:''},{label:'Voids',value:summary.voids,detail:''},{label:'Discounts',value:summary.discounts,detail:money(summary.discountAmount)},{label:'Day closes',value:summary.closes,detail:''},{label:'Approvals',value:summary.approvals,detail:''}].map(cell=><div key={cell.label} className="bg-canvas px-5 py-4"><p className="micro">{cell.label}</p><p className="stat-figure mt-2 text-[18px] font-semibold leading-tight">{formatNumber(Number(cell.value??0),REGIONAL)}</p>{cell.detail&&<p className="text-[10px] text-ink-muted">{cell.detail}</p>}</div>)}
    </div>}
    {error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 text-[12px] font-medium text-alert"><span>{error}</span><button onClick={()=>void load('replace')} className="rounded-[5px] border border-alert-line px-2.5 py-1 text-[11px] font-medium">Retry</button></div>}
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-[13px]">
        <thead className="border-b border-line text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted"><tr><th className="px-3 pb-2">Time</th><th className="px-3 pb-2">User</th><th className="px-3 pb-2">Action</th><th className="px-3 pb-2">Record</th><th className="px-3 pb-2">Approval</th><th className="w-10 px-3 pb-2"/></tr></thead>
        <tbody>
          {loading?<tr><td colSpan={6} className="px-4 py-16 text-center text-[12px] text-ink-muted">Loading events…</td></tr>
          :!events.length?<tr><td colSpan={6} className="px-4 py-16 text-center"><p className="text-[13px] font-medium text-ink">{hasFilters?'No events match this filter':'No audit events yet'}</p><p className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-ink-muted">{hasFilters?'Try a wider period, another action, or clear the search.':"Voids, discounts, price changes, settlements, and approvals appear here as they happen."}</p></td></tr>
          :events.map((event,index)=>{
            const actionMeta=auditActionMeta(event.action)
            const approvalMeta=auditApprovalMeta(event.approval)
            const metadata=event.metadata&&typeof event.metadata==='object'?event.metadata as Record<string,unknown>:{}
            const diff=auditDiff(metadata)
            const detailEntries=Object.entries(metadata).filter(([key])=>!diff||(key!==diff.keys[0]&&key!==diff.keys[1]))
            const showDay=index===0||auditDayKey(events[index-1].createdAt)!==auditDayKey(event.createdAt)
            return <Fragment key={event.id}>
              {showDay&&<tr className="border-b border-line bg-sunk"><td colSpan={6} className="px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted">{auditDayLabel(event.createdAt)}</td></tr>}
              <tr onClick={()=>setOpenId(current=>current===event.id?null:event.id)} className="cursor-pointer border-b border-line transition hover:bg-canvas">
                <td className="px-3 py-3.5 align-top text-ink-muted"><span className="block font-semibold text-ink" title={formatDateTime(event.createdAt,REGIONAL,{dateStyle:'medium',timeStyle:'medium'})}>{auditRelative(event.createdAt)}</span><span className="block text-[11px]">{formatDateTime(event.createdAt,REGIONAL,{hour:'2-digit',minute:'2-digit'})}</span></td>
                <td className="px-3 py-3.5 align-top"><b>{event.userName??'Unknown'}</b><span className="block text-[11px] font-semibold text-ink-muted">{event.actorRole??event.userRole??''}</span></td>
                <td className="px-3 py-3.5 align-top"><span className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${actionMeta.tone}`}>{actionMeta.label}</span></td>
                <td className="px-3 py-3.5 align-top"><span className="font-semibold">{event.recordLabel||'—'}</span><span className="block text-[11px] text-ink-muted">{event.entityType?auditEntityLabel(event.entityType):''}</span></td>
                <td className="px-3 py-3.5 align-top"><span title={approvalMeta.hint} className={`text-[11px] font-medium ${approvalMeta.tone}`}>{approvalMeta.label}</span></td>
                <td className="px-3 py-3.5 align-top text-ink-soft"><ChevronDown className={`size-4 transition-transform ${openId===event.id?'rotate-180':''}`}/></td>
              </tr>
              {openId===event.id&&<tr className="border-b border-line bg-sunk"><td colSpan={6} className="px-4 py-5 text-[12px] text-ink-muted">
                <div className="grid gap-3 md:grid-cols-2">
                  <div><p className="micro">Reason</p><p className="mt-1 text-ink">{event.reason||'None recorded'}</p></div>
                  <div><p className="micro">Record id</p><div className="mt-1 flex items-center gap-2"><code className="break-all rounded-[4px] bg-well px-1.5 py-0.5 text-[11px]">{event.entityId||'—'}</code>{event.entityId&&<button type="button" onClick={()=>void copyId(event.entityId)} className="shrink-0 rounded-[4px] border border-line-strong px-2 py-1 text-[10px] font-medium text-ink-muted hover:text-ink">{copiedId===event.entityId?'Copied':'Copy'}</button>}</div></div>
                </div>
                {diff&&<div className="mt-3 border-l-2 border-ink pl-3"><p className="micro">Change</p><p className="mt-1 text-[13px] font-medium text-ink">{auditValue(diff.before)} <span className="text-ink-soft">→</span> {auditValue(diff.after)}</p></div>}
                {detailEntries.length>0&&<div className="mt-3"><p className="micro">Details</p><dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1">{detailEntries.map(([key,value])=><div key={key} className="flex gap-1"><dt className="font-semibold">{key}:</dt><dd className="break-all text-ink">{auditValue(value)}</dd></div>)}</dl></div>}
              </td></tr>}
            </Fragment>
          })}
        </tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-[11px] text-ink-muted">
      <span>{loading?'Loading…':`Showing ${events.length} of ${total} event${total===1?'':'s'}${hasFilters?' (filtered)':''}`}</span>
      <div className="flex items-center gap-3">
        {businessDate&&<span className="hidden sm:inline">Business date {businessDate}</span>}
        {hasMore&&<button type="button" onClick={()=>void load('append')} disabled={loadingMore} className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:text-ink disabled:opacity-40">{loadingMore?<Loader2 className="size-3.5 animate-spin"/>:null}{loadingMore?'Loading…':'Load older events'}</button>}
      </div>
    </div>
  </TablePage>
}
type Preferences={barName:string;currency:string;locale:string;timeZone:string;taxRate:string;taxInclusive:boolean;taxId:string;address:string;phone:string;footer:string;paymentMethods:string[]}
const EXPORT_TABLES=[
  {id:'bar_product',label:'Products'},
  {id:'bar_sale',label:'Sales'},
  {id:'bar_sale_item',label:'Sale line items'},
  {id:'bar_sale_payment',label:'Sale payments'},
  {id:'bar_tab',label:'Tabs'},
  {id:'bar_tab_item',label:'Tab items'},
  {id:'bar_stock_movement',label:'Stock movements'},
  {id:'bar_stock_delivery',label:'Deliveries'},
  {id:'bar_stock_count',label:'Daily stock counts'},
  {id:'bar_inventory_count',label:'Inventory counts'},
  {id:'bar_stock_adjustment',label:'Stock adjustments'},
  {id:'bar_day',label:'Trading days'},
  {id:'bar_discount',label:'Discounts'},
  {id:'bar_receipts',label:'Receipts'},
  {id:'bar_team_member',label:'Team members'},
  {id:'bar_variance_tolerance',label:'Variance tolerances'},
  {id:'bar_variance_history',label:'Variance history'},
  {id:'bar_audit_log',label:'Audit log'},
] as const
const settingsLabel='text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted'
const settingsFactLabel='text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted'
const settingsField='field'
function SettingCard({title,sub,action,children}:{icon?:any;title:string;sub:string;action?:React.ReactNode;children:any}){
  return <section className="border-t border-line pt-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="text-[15px] font-medium tracking-tight">{title}</h3><p className="mt-1 max-w-lg text-[12px] leading-relaxed text-ink-muted">{sub}</p></div>
      {action&&<div className="shrink-0">{action}</div>}
    </header>
    <div className="mt-5">{children}</div>
  </section>
}
function SettingsSkeleton(){
  return <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-14">
    {[0,1].map(column=><div key={column} className="flex flex-col gap-10">
      {[0,1].map(card=><div key={card} className="border-t border-line pt-6">
        <span className="block h-3.5 w-32 animate-pulse rounded bg-well"/>
        <span className="mt-2 block h-3 w-48 animate-pulse rounded bg-canvas"/>
        <div className="mt-6 grid gap-4 sm:grid-cols-2"><span className="h-10 animate-pulse rounded-[8px] bg-canvas"/><span className="h-10 animate-pulse rounded-[8px] bg-canvas"/></div>
      </div>)}
    </div>)}
  </div>
}
function SettingsPage({toast,user,role,businessName,onPreferencesSaved}:{toast:(message:string)=>void;user?:{name?:string|null;email?:string|null}|null;role:string;businessName:string;onPreferencesSaved:(next:{barName:string;regional:RegionalSettings})=>void}){
  // Props seed the first paint; the saved record from the API is authoritative once it loads.
  const initial=useRef({businessName});
  const seeded:Preferences={barName:businessName,currency:REGIONAL.currency,locale:REGIONAL.locale,timeZone:REGIONAL.timeZone,taxRate:String(REGIONAL.taxRateBps/100),taxInclusive:REGIONAL.taxInclusive,taxId:REGIONAL.taxId,address:REGIONAL.receiptAddress,phone:REGIONAL.receiptPhone,footer:REGIONAL.receiptFooter,paymentMethods:REGIONAL.paymentMethods};
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [reloadKey,setReloadKey]=useState(0);
  const [timeZone,setTimeZone]=useState('Africa/Kampala');
  const [businessDate,setBusinessDate]=useState('');
  const [tradingDay,setTradingDay]=useState<{status?:string;businessDate?:string;openedAt?:string;openingFloat?:number}|null>(null);
  const [saved,setSaved]=useState<Preferences>(seeded);
  const [draft,setDraft]=useState<Preferences>(seeded);
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');
  const [lastSavedAt,setLastSavedAt]=useState<Date|null>(null);
  const [hasPin,setHasPin]=useState<boolean|null>(null);
  const [pinError,setPinError]=useState('');
  const [currentPin,setCurrentPin]=useState('');
  const [pin,setPin]=useState('');
  const [confirmPin,setConfirmPin]=useState('');
  const [revealPin,setRevealPin]=useState(false);
  const [savingPin,setSavingPin]=useState(false);
  const [removingPin,setRemovingPin]=useState(false);
  const [confirmRemovePin,setConfirmRemovePin]=useState(false);
  const [exportFrom,setExportFrom]=useState('');
  const [exportTo,setExportTo]=useState('');
  const [exportPicked,setExportPicked]=useState<string[]>(EXPORT_TABLES.map(table=>table.id));
  const [exportError,setExportError]=useState('');
  const [showExportTables,setShowExportTables]=useState(false);
  const [loggingOut,setLoggingOut]=useState(false);
  useEffect(()=>{
    let active=true;
    setLoading(true); setLoadError('');
    Promise.all([
      fetch('/api/settings',{cache:'no-store'}),
      fetch('/api/day',{cache:'no-store'}),
      fetch('/api/team/pin',{cache:'no-store'}),
    ]).then(async([settingsRes,dayRes,pinRes])=>{
      if(!settingsRes.ok){const body=await settingsRes.json().catch(()=>({})); throw new Error(body?.error??'Could not load settings.')}
      const data=await settingsRes.json();
      const items=new Map<string,string>((data?.items??[]).map((row:any)=>[String(row.key),String(row.value)]));
      const loadedName=String(items.get('bar_name')??initial.current.businessName).replace(/\s+/g,' ').trim().slice(0,60)||BAR_NAME_FALLBACK;
      const regional:RegionalSettings={...(data?.regional??DEFAULT_REGIONAL)};
      const next:Preferences={barName:loadedName,currency:regional.currency,locale:regional.locale,timeZone:regional.timeZone,taxRate:String(regional.taxRateBps/100),taxInclusive:regional.taxInclusive,taxId:regional.taxId,address:regional.receiptAddress,phone:regional.receiptPhone,footer:regional.receiptFooter,paymentMethods:regional.paymentMethods};
      if(!active)return;
      setSaved(next); setDraft(next);
      const stamps=(data?.items??[]).map((row:any)=>row?.updatedAt?new Date(row.updatedAt).getTime():0).filter(Boolean);
      setLastSavedAt(stamps.length?new Date(Math.max(...stamps)):null);
      setTimeZone(String(data?.timeZone??'Africa/Kampala'));
      setBusinessDate(String(data?.businessDate??''));
      if(dayRes.ok){const record=await dayRes.json().catch(()=>null); if(active)setTradingDay(record??null)}
      if(pinRes.ok){const record=await pinRes.json().catch(()=>null); if(active)setHasPin(Boolean(record?.hasPin))}
    }).catch((error:any)=>{if(active)setLoadError(error?.message??'Could not load settings. Check your connection and retry.')}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false}
  },[reloadKey]);
  const currencyDraft=normalizeCurrency(draft.currency);
  const taxBps=normalizeTaxRate(draft.taxRate);
  const nameDraft=draft.barName.replace(/\s+/g,' ').trim();
  const nameValid=nameDraft.length>=2;
  const paymentsDraft=[...draft.paymentMethods];
  // Preview exactly what the till will show once these values are saved.
  const draftRegional:RegionalSettings={...DEFAULT_REGIONAL,currency:currencyDraft??DEFAULT_REGIONAL.currency,locale:draft.locale,timeZone:draft.timeZone,taxRateBps:taxBps??0,taxInclusive:draft.taxInclusive,taxId:draft.taxId.trim(),receiptAddress:draft.address.trim(),receiptPhone:draft.phone.trim(),receiptFooter:draft.footer.trim()||DEFAULT_REGIONAL.receiptFooter,paymentMethods:paymentsDraft.length?paymentsDraft:DEFAULT_REGIONAL.paymentMethods};
  const samePayments=paymentsDraft.slice().sort().join()===saved.paymentMethods.slice().sort().join();
  const dirty=nameDraft!==saved.barName||currencyDraft!==saved.currency||draft.locale!==saved.locale||draft.timeZone!==saved.timeZone||draft.taxRate!==saved.taxRate||draft.taxInclusive!==saved.taxInclusive||draft.taxId!==saved.taxId||draft.address!==saved.address||draft.phone!==saved.phone||draft.footer!==saved.footer||!samePayments;
  const canSave=dirty&&!saving&&Boolean(currencyDraft)&&nameValid&&taxBps!==null&&paymentsDraft.length>0;
  const pinValid=/^\d{4,8}$/.test(pin);
  const pinMatches=pin.length>0&&pin===confirmPin;
  const currentPinReady=!hasPin||/^\d{4,8}$/.test(currentPin);
  const exportAll=exportPicked.length===EXPORT_TABLES.length;
  const exportRangeInvalid=Boolean(exportFrom&&exportTo&&exportFrom>exportTo);
  const pinMessage=pinError||(!pin?'Use 4 to 8 digits.':!pinValid?'A PIN must be 4 to 8 digits.':!pinMatches?'The two PINs do not match.':pin.length<6?'Short PINs are easy to guess.':'PINs match. Ready to save.');
  const savePreferences=async()=>{
    if(!currencyDraft){setSaveError('Enter a 3-letter ISO currency code such as UGX, KES or USD.'); return}
    if(!nameValid){setSaveError('The business name needs at least 2 characters.'); return}
    if(taxBps===null){setSaveError('Tax must be a percentage between 0 and 100, such as 18 or 7.5.'); return}
    if(!paymentsDraft.length){setSaveError('Enable at least one payment method.'); return}
    const items:Record<string,string>={};
    if(currencyDraft!==saved.currency)items.currency=currencyDraft;
    if(nameDraft!==saved.barName)items.bar_name=nameDraft;
    if(draft.locale!==saved.locale)items.locale=draft.locale;
    if(draft.timeZone!==saved.timeZone)items.time_zone=draft.timeZone;
    if(draft.taxRate!==saved.taxRate)items.tax_rate_bps=String(taxBps);
    if(draft.taxInclusive!==saved.taxInclusive)items.tax_inclusive=draft.taxInclusive?'true':'false';
    if(draft.taxId!==saved.taxId)items.tax_id=draft.taxId.trim();
    if(draft.address!==saved.address)items.receipt_address=draft.address.trim();
    if(draft.phone!==saved.phone)items.receipt_phone=draft.phone.trim();
    if(draft.footer!==saved.footer)items.receipt_footer=draft.footer.trim();
    if(!samePayments)items.payment_methods=paymentsDraft.join(',');
    if(!Object.keys(items).length){setSaveError(''); return}
    setSaving(true); setSaveError('');
    try{
      const result=await fetch('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items})});
      if(!result.ok){const body=await result.json().catch(()=>({})); setSaveError(body?.error??'Could not save settings.'); return}
      // A batch is all-or-nothing, so the draft can safely mirror what the server stored.
      const stored:Preferences={...draft,barName:nameDraft,currency:currencyDraft??saved.currency,taxRate:String((taxBps??0)/100),paymentMethods:paymentsDraft};
      setSaved(stored); setDraft(stored);
      setLastSavedAt(new Date());
      onPreferencesSaved({barName:stored.barName,regional:{...draftRegional,currency:stored.currency,taxRateBps:taxBps??0}});
      toast('Settings saved. Prices, receipts and the trading day now follow these values.');
    }catch{setSaveError('Could not reach the server. Your changes are still here — try again.')}
    finally{setSaving(false)}
  };
  const discardPreferences=()=>setDraft(saved);
  const togglePayment=(id:string)=>{
    const next=draft.paymentMethods.includes(id)?draft.paymentMethods.filter(method=>method!==id):[...draft.paymentMethods,id];
    setDraft({...draft,paymentMethods:next}); setSaveError('');
  };
  const savePin=async()=>{
    if(!pinValid){setPinError('A PIN must be 4 to 8 digits.'); return}
    if(!pinMatches){setPinError('The two PINs do not match.'); return}
    if(!currentPinReady){setPinError('Enter your current PIN before choosing a new one.'); return}
    setSavingPin(true); setPinError(''); setConfirmRemovePin(false);
    try{
      const result=await fetch('/api/team/pin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(hasPin?{pin,currentPin}:{pin})});
      if(!result.ok){const body=await result.json().catch(()=>({})); throw new Error(body?.error??'Could not save the approval PIN.')}
      setHasPin(true); setCurrentPin(''); setPin(''); setConfirmPin(''); setRevealPin(false); toast('Approval PIN saved.');
    }catch(error:any){setPinError(error?.message??'Could not save the approval PIN.')}
    finally{setSavingPin(false)}
  };
  const removePin=async()=>{
    if(!hasPin){setPinError('There is no PIN to remove.'); return}
    if(!/^\d{4,8}$/.test(currentPin)){setPinError('Enter your current PIN to remove it.'); return}
    setRemovingPin(true); setPinError('');
    try{
      const result=await fetch('/api/team/pin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({remove:true,currentPin})});
      if(!result.ok){const body=await result.json().catch(()=>({})); throw new Error(body?.error??'Could not remove the approval PIN.')}
      setHasPin(false); setCurrentPin(''); setPin(''); setConfirmPin(''); setRevealPin(false); setConfirmRemovePin(false);
      toast('Approval PIN removed. Manager voids will be refused until you set a new one.');
    }catch(error:any){setPinError(error?.message??'Could not remove the approval PIN.')}
    finally{setRemovingPin(false)}
  };
  const shiftIso=(date:string,days:number)=>shiftIsoDate(date,days);
  const applyExportRange=(days:number|null)=>{
    if(days===null){setExportFrom(''); setExportTo(''); setExportError(''); return}
    const end=businessDate||isoDay();
    setExportTo(end); setExportFrom(shiftIso(end,-(days-1))); setExportError('');
  };
  const toggleExportTable=(id:string)=>{
    setExportPicked(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
    setExportError('');
  };
  const runExport=()=>{
    if(!exportPicked.length){setExportError('Choose at least one table to export.'); return}
    if(exportRangeInvalid){setExportError('The start date must be on or before the end date.'); return}
    const params=new URLSearchParams();
    if(exportFrom)params.set('from',exportFrom);
    if(exportTo)params.set('to',exportTo);
    if(!exportAll)params.set('tables',exportPicked.join(','));
    const query=params.toString();
    setExportError('');
    window.location.assign(`/api/export${query?`?${query}`:''}`);
  };
  const logout=async()=>{setLoggingOut(true); try{await signOut(); window.location.assign('/sign-in')}catch{toast('Could not sign out. Please try again.'); setLoggingOut(false)}};
  if(loading) return <Shell eyebrow="Workspace settings" title="Settings" sub="Preferences, approvals, and account controls for this bar."><SettingsSkeleton/></Shell>;
  return <Shell eyebrow="Workspace settings" title="Settings" sub="Preferences, approvals, and account controls for this bar.">
    {loadError
      ? <div className="border-t border-line pt-10 text-center">
          <AlertTriangle className="mx-auto size-5 text-alert"/>
          <h3 className="mt-3 text-[15px] font-medium">Settings could not load</h3>
          <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-ink-muted">{loadError}</p>
          <button type="button" onClick={()=>setReloadKey(key=>key+1)} className="mt-5 inline-flex items-center gap-2 rounded-[8px] bg-ink px-3.5 py-2 text-[12px] font-medium text-white transition hover:bg-black"><RefreshCw className="size-3.5"/>Retry</button>
        </div>
      : <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-14">
          <div className="flex flex-col gap-10">
            <SettingCard icon={Wallet} title="Business profile & regional settings" sub="Currency, language, trading-day clock, tax and the details printed on receipts. One save applies them to every till." action={<span className={`text-[9px] font-semibold uppercase tracking-[0.16em] ${dirty?'text-warn':'text-ink-soft'}`}>{dirty?'Unsaved':'Saved'}</span>}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className={settingsLabel}>Business name</span><input value={draft.barName} onChange={event=>{setDraft({...draft,barName:event.target.value}); setSaveError('')}} maxLength={60} disabled={saving} placeholder="THE SIPPER" className={`mt-2 ${settingsField}`}/><span className="mt-1.5 block text-[11px] leading-relaxed text-ink-muted">Printed at the top of every receipt and bar ticket.</span>{!nameValid&&nameDraft.length>0&&<span className="mt-1 block text-[11px] font-semibold text-alert">Use at least 2 characters.</span>}</label>
                <label className="block"><span className={settingsLabel}>Currency</span><input list="currency-options" value={draft.currency} onChange={event=>{setDraft({...draft,currency:event.target.value.toUpperCase()}); setSaveError('')}} maxLength={3} disabled={saving} placeholder="UGX" className={`mt-2 ${settingsField} uppercase tracking-wide`}/><datalist id="currency-options">{CURRENCY_OPTIONS.map(code=><option key={code} value={code}/>)}</datalist><span className="mt-1.5 block text-[11px] leading-relaxed text-ink-muted">Any ISO 4217 code. Prices show as <b className="text-ink-muted">{formatMoney(12000,draftRegional)}</b>.</span>{!currencyDraft&&draft.currency.length>0&&<span className="mt-1 block text-[11px] font-semibold text-alert">Use a 3-letter ISO code.</span>}</label>
                <label className="block"><span className={settingsLabel}>Regional format</span><select value={draft.locale} onChange={event=>{setDraft({...draft,locale:event.target.value}); setSaveError('')}} disabled={saving} className={`mt-2 ${settingsField}`}>{LOCALE_OPTIONS.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}{!LOCALE_OPTIONS.some(option=>option.id===draft.locale)&&<option value={draft.locale}>{draft.locale}</option>}</select><span className="mt-1.5 block text-[11px] leading-relaxed text-ink-muted">Controls dates, numbers and the currency symbol layout. The dashboard itself stays in English.</span></label>
                <label className="block"><span className={settingsLabel}>Time zone</span><select value={draft.timeZone} onChange={event=>{setDraft({...draft,timeZone:event.target.value}); setSaveError('')}} disabled={saving} className={`mt-2 ${settingsField}`}>{TIME_ZONE_OPTIONS.map(zone=><option key={zone} value={zone}>{zone.replaceAll('_',' ')}</option>)}{!TIME_ZONE_OPTIONS.includes(draft.timeZone)&&<option value={draft.timeZone}>{draft.timeZone}</option>}</select><span className="mt-1.5 block text-[11px] leading-relaxed text-ink-muted">The trading day rolls over at midnight here, whatever a device clock says.</span></label>
                <label className="block"><span className={settingsLabel}>Tax rate (%)</span><input type="number" inputMode="decimal" min="0" max="100" step="0.01" value={draft.taxRate} onChange={event=>{setDraft({...draft,taxRate:event.target.value}); setSaveError('')}} disabled={saving} placeholder="0" className={`mt-2 ${settingsField}`}/><span className="mt-1.5 block text-[11px] leading-relaxed text-ink-muted">VAT or sales tax, for example 18 or 7.5. Leave 0 when the bar is not tax registered.</span>{taxBps===null&&draft.taxRate.trim().length>0&&<span className="mt-1 block text-[11px] font-semibold text-alert">Enter a percentage between 0 and 100.</span>}</label>
                <div className="block"><span className={settingsLabel}>Tax treatment</span><div className="mt-2 inline-flex rounded-[8px] border border-line-strong p-0.5">{([{value:true,label:'Included in price'},{value:false,label:'Added at checkout'}]).map(option=><button type="button" key={String(option.value)} onClick={()=>{setDraft({...draft,taxInclusive:option.value}); setSaveError('')}} disabled={saving} className={`flex-1 rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition ${draft.taxInclusive===option.value?'bg-ink text-white':'text-ink-muted hover:text-ink'}`}>{option.label}</button>)}</div><span className="mt-1.5 block text-[11px] leading-relaxed text-ink-muted">Inclusive means the shelf price already contains tax, as in VAT markets.</span></div>
              </div>
              <div className="mt-6 border-t border-line pt-5">
                <p className={settingsLabel}>Receipt details</p>
                <div className="mt-2 grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className="text-[11px] text-ink-muted">Tax identification number</span><input value={draft.taxId} onChange={event=>{setDraft({...draft,taxId:event.target.value}); setSaveError('')}} maxLength={40} disabled={saving} placeholder="TIN / VAT number" className={`mt-1 ${settingsField}`}/></label>
                  <label className="block"><span className="text-[11px] text-ink-muted">Phone</span><input value={draft.phone} onChange={event=>{setDraft({...draft,phone:event.target.value}); setSaveError('')}} maxLength={40} disabled={saving} placeholder="+256 700 000 000" className={`mt-1 ${settingsField}`}/></label>
                  <label className="block sm:col-span-2"><span className="text-[11px] text-ink-muted">Address</span><input value={draft.address} onChange={event=>{setDraft({...draft,address:event.target.value}); setSaveError('')}} maxLength={120} disabled={saving} placeholder="Street, city, country" className={`mt-1 ${settingsField}`}/></label>
                  <label className="block sm:col-span-2"><span className="text-[11px] text-ink-muted">Receipt footer</span><input value={draft.footer} onChange={event=>{setDraft({...draft,footer:event.target.value}); setSaveError('')}} maxLength={120} disabled={saving} placeholder="Thank you for your visit." className={`mt-1 ${settingsField}`}/></label>
                </div>
              </div>
              <div className="mt-6 border-t border-line pt-5">
                <p className={settingsLabel}>Payment methods accepted</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">{PAYMENT_METHODS.map(method=>{const on=draft.paymentMethods.includes(method.id); return <button type="button" key={method.id} onClick={()=>togglePayment(method.id)} disabled={saving} aria-pressed={on} className={`rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition ${on?'bg-ink text-white':'bg-well text-ink-muted hover:text-ink'}`}>{on?'✓ ':''}{method.label}</button>})}</div>
                {!paymentsDraft.length&&<p className="mt-2 text-[11px] font-semibold text-alert">Enable at least one method or the till cannot take payment.</p>}
                <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">Only the enabled methods appear at checkout, and the server refuses any other.</p>
              </div>
              <div className="mt-6 grid gap-6 border-t border-line pt-5 sm:grid-cols-[minmax(0,1fr)_200px]">
                <div>
                  <p className="micro">What this changes</p>
                  <ul className="mt-3 space-y-2 text-[12px] leading-relaxed text-ink-muted">
                    <li>Prices, totals and stock values use {draftRegional.currency} in the {draft.locale} format.</li>
                    <li>Trading days, reports and exports roll over at midnight in {draftRegional.timeZone.replaceAll('_',' ')}.</li>
                    <li>{taxBps?`${formatNumber((taxBps)/100,draftRegional)}% tax is ${draft.taxInclusive?'included in menu prices':'added at checkout'}.`:'No tax is applied to sales.'}</li>
                    <li>Receipts print “{nameDraft||saved.barName}” with the details below.</li>
                    <li>Completed sales keep the currency and tax they were recorded with.</li>
                  </ul>
                </div>
                <div className="border-l border-line pl-4 text-center">
                  <p className="truncate text-[12px] font-semibold uppercase tracking-[0.1em]">{nameDraft||saved.barName}</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[.14em] text-ink-muted">Bar receipt · sample</p>
                  <div className="mt-3 flex justify-between text-[10px] text-ink-muted"><span>Nile Special × 2</span><span>{formatMoney(10000,draftRegional)}</span></div>
                  {taxBps?<div className="mt-1 flex justify-between text-[10px] text-ink-muted"><span>Tax {formatNumber(taxBps/100,draftRegional)}%</span><span>{formatMoney(taxBreakdown(10000,draftRegional).tax,draftRegional)}</span></div>:null}
                  <div className="mt-2 flex justify-between border-t border-line-strong pt-2 text-[11px] font-semibold"><span>Total</span><span>{formatMoney(taxBreakdown(10000,draftRegional).total,draftRegional)}</span></div>
                </div>
              </div>
              {currencyDraft&&currencyDraft!==saved.currency&&<div className="mt-4 border-l-2 border-warn pl-3">
                <p className="text-[11px] font-semibold text-warn">Currency changes relabel, they do not convert.</p>
                <p className="mt-1 text-[12px] leading-relaxed text-warn">A 5,000 price becomes {formatMoney(5000,draftRegional)}. Update the price list first if this is a real currency switch.</p>
              </div>}
              {saveError&&<p role="alert" className="mt-4 border-l-2 border-alert bg-alert-tint/60 px-3 py-2 text-[11px] font-medium text-alert">{saveError}</p>}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                <span className={`text-[11px] font-medium ${dirty?'text-warn':'text-ink-muted'}`}>{dirty?'You have unsaved changes.':lastSavedAt?`Saved ${formatDateTime(lastSavedAt,REGIONAL)}.`:'Up to date.'}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={discardPreferences} disabled={!dirty||saving} className="rounded-[8px] border border-line-strong px-3.5 py-2 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">Discard</button>
                  <button type="button" onClick={savePreferences} disabled={!canSave} className="inline-flex items-center gap-2 rounded-[8px] bg-ink px-4 py-2 text-[12px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">{saving?<Loader2 className="size-3.5 animate-spin"/>:<Save className="size-3.5"/>}{saving?'Saving…':'Save changes'}</button>
                </div>
              </div>
            </SettingCard>
            <SettingCard icon={Lock} title="Approval PIN" sub="Required when a manager voids a tab or approves a sensitive action." action={<span className={`text-[9px] font-semibold uppercase tracking-[0.16em] ${hasPin===null?'text-ink-soft':hasPin?'text-ink':'text-warn'}`}>{hasPin===null?'Unknown':hasPin?'PIN set':'No PIN'}</span>}>
              <div className="grid gap-4 sm:grid-cols-2">
                {hasPin&&<label className="block sm:col-span-2"><span className={settingsLabel}>Current PIN</span><input type={revealPin?'text':'password'} inputMode="numeric" autoComplete="current-password" maxLength={8} value={currentPin} onChange={event=>{setCurrentPin(event.target.value.replace(/\D/g,'').slice(0,8)); setPinError(''); setConfirmRemovePin(false)}} placeholder="The PIN you use today" className={`mt-2 ${settingsField} tracking-[.2em]`}/><span className="mt-1.5 block text-[11px] leading-relaxed text-ink-muted">Needed before this PIN can be replaced or removed.</span></label>}
                <label className="block"><span className={settingsLabel}>New PIN</span><div className="relative mt-2"><input type={revealPin?'text':'password'} inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin} onChange={event=>{setPin(event.target.value.replace(/\D/g,'').slice(0,8)); setPinError('')}} placeholder="4–8 digits" className={`${settingsField} pr-12 tracking-[.2em]`}/><button type="button" aria-label={revealPin?'Hide PIN':'Show PIN'} onClick={()=>setRevealPin(value=>!value)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-ink-muted transition hover:text-ink">{revealPin?<EyeOff className="size-4"/>:<Eye className="size-4"/>}</button></div></label>
                <label className="block"><span className={settingsLabel}>Confirm PIN</span><input type={revealPin?'text':'password'} inputMode="numeric" autoComplete="new-password" maxLength={8} value={confirmPin} onChange={event=>{setConfirmPin(event.target.value.replace(/\D/g,'').slice(0,8)); setPinError('')}} placeholder="Repeat the PIN" className={`mt-2 ${settingsField} tracking-[.2em]`}/></label>
              </div>
              <p className={`mt-2 text-[11px] font-medium ${pinError||(!pinMatches&&confirmPin.length>0)?'text-alert':pinValid&&pinMatches?'text-ink':'text-ink-muted'}`}>{pinMessage}</p>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                <p className="max-w-xs text-[11px] leading-relaxed text-ink-muted">Stored as a salted scrypt hash, never as plain digits. {hasPin===null?'PIN status could not be confirmed.':hasPin?'Admin accounts still bypass the PIN prompt.':'Without a PIN, manager voids are rejected.'}</p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {hasPin&&(confirmRemovePin
                    ? <><span className="text-[11px] font-medium text-alert">Remove this PIN?</span><button type="button" onClick={removePin} disabled={removingPin||!currentPinReady} className="inline-flex items-center gap-2 rounded-[8px] bg-alert px-3 py-2 text-[12px] font-medium text-white transition hover:bg-[#8a201a] disabled:cursor-not-allowed disabled:opacity-40">{removingPin?<Loader2 className="size-3.5 animate-spin"/>:<Trash2 className="size-3.5"/>}{removingPin?'Removing…':'Confirm removal'}</button><button type="button" onClick={()=>setConfirmRemovePin(false)} disabled={removingPin} className="rounded-[8px] border border-line-strong px-3 py-2 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink">Keep it</button></>
                    : <button type="button" onClick={()=>{setConfirmRemovePin(true); setPinError('')}} disabled={savingPin} className="rounded-[8px] border border-line-strong px-3 py-2 text-[12px] font-medium text-alert transition hover:border-alert disabled:cursor-not-allowed disabled:opacity-40">Remove PIN</button>)}
                  <button type="button" onClick={savePin} disabled={savingPin||removingPin||!pinValid||!pinMatches||!currentPinReady} className="inline-flex items-center gap-2 rounded-[8px] bg-ink px-3.5 py-2 text-[12px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">{savingPin?<Loader2 className="size-3.5 animate-spin"/>:<KeyRound className="size-3.5"/>}{savingPin?'Saving…':hasPin?'Replace PIN':'Set PIN'}</button>
                </div>
              </div>
            </SettingCard>
          </div>
          <div className="flex flex-col gap-10">
            <SettingCard icon={Clock} title="Trading context" sub="Read-only facts from the bar's clock and today's session.">
              <dl className="grid grid-cols-2 gap-x-6">
                <div className="border-t border-line pt-2.5"><dt className={settingsFactLabel}>Business date</dt><dd className="mt-1 text-[13px] font-medium">{businessDate||tradingDay?.businessDate||'—'}</dd></div>
                <div className="border-t border-line pt-2.5"><dt className={settingsFactLabel}>Time zone</dt><dd className="mt-1 truncate text-[13px] font-medium" title={timeZone}>{timeZone}</dd></div>
                <div className="border-t border-line pt-2.5"><dt className={settingsFactLabel}>Day status</dt><dd className="mt-1 text-[13px] font-medium">{tradingDay?.status==='open'?'Open':tradingDay?.status==='closed'?'Closed':'Not started'}</dd></div>
                <div className="border-t border-line pt-2.5"><dt className={settingsFactLabel}>Opening float</dt><dd className="mt-1 text-[13px] font-medium">{money(tradingDay?.openingFloat??0)}</dd></div>
              </dl>
              {tradingDay?.openedAt&&<p className="mt-4 text-[11px] text-ink-muted">Session opened {formatDateTime(tradingDay.openedAt,REGIONAL)}.</p>}
            </SettingCard>
            <SettingCard icon={Database} title="Data export" sub="Download this account's records for a date range, as CSV or a ZIP of CSVs.">
              <div>
                <span className={settingsLabel}>Date range</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block min-w-0"><span className="text-[11px] text-ink-muted">From</span><input type="date" value={exportFrom} max={exportTo||undefined} onChange={event=>{setExportFrom(event.target.value); setExportError('')}} className={`mt-1 min-w-0 ${settingsField}`}/></label>
                  <label className="block min-w-0"><span className="text-[11px] text-ink-muted">To</span><input type="date" value={exportTo} min={exportFrom||undefined} onChange={event=>{setExportTo(event.target.value); setExportError('')}} className={`mt-1 min-w-0 ${settingsField}`}/></label>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {([{label:'All time',days:null},{label:'Today',days:1},{label:'7 days',days:7},{label:'30 days',days:30}] as {label:string;days:number|null}[]).map(range=><button key={range.label} type="button" onClick={()=>applyExportRange(range.days)} className="rounded-[5px] px-2 py-1 text-[11px] font-medium text-ink-muted transition hover:bg-well hover:text-ink">{range.label}</button>)}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">Blank dates include everything. Days follow the bar's clock ({timeZone}).</p>
              </div>
              <div className="mt-5 border-y border-line">
                <button type="button" aria-expanded={showExportTables} onClick={()=>setShowExportTables(value=>!value)} className="flex w-full items-center justify-between gap-2 py-2.5 text-left text-[12px] font-medium text-ink transition hover:text-ink-muted">
                  <span>{exportAll?`All ${EXPORT_TABLES.length} tables`:`${exportPicked.length} of ${EXPORT_TABLES.length} tables`}</span>
                  <ChevronDown className={`size-4 text-ink-soft transition ${showExportTables?'rotate-180':''}`}/>
                </button>
                {showExportTables&&<div className="border-t border-line py-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={()=>{setExportPicked(EXPORT_TABLES.map(table=>table.id)); setExportError('')}} className="rounded-[5px] border border-line-strong px-2 py-0.5 text-[11px] font-medium text-ink-muted transition hover:text-ink">Select all</button>
                    <button type="button" onClick={()=>{setExportPicked([]); setExportError('')}} className="rounded-[5px] border border-line-strong px-2 py-0.5 text-[11px] font-medium text-ink-muted transition hover:text-ink">Clear</button>
                  </div>
                  <div className="mt-2 grid max-h-48 gap-0.5 overflow-auto sm:grid-cols-2">
                    {EXPORT_TABLES.map(table=><label key={table.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] text-ink hover:bg-canvas"><input type="checkbox" checked={exportPicked.includes(table.id)} onChange={()=>toggleExportTable(table.id)} className="size-3.5 accent-brand"/><span className="truncate">{table.label}</span></label>)}
                  </div>
                </div>}
              </div>
              {(exportError||exportRangeInvalid)&&<p role="alert" className="mt-3 border-l-2 border-alert bg-alert-tint/60 px-3 py-2 text-[11px] font-medium text-alert">{exportError||'The start date must be on or before the end date.'}</p>}
              <button type="button" onClick={runExport} disabled={!exportPicked.length||exportRangeInvalid} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-ink px-4 py-2 text-[12px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"><Download className="size-3.5"/>{exportPicked.length===1?'Download CSV':'Download ZIP'}</button>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">One table downloads as CSV; several download as a ZIP with one CSV per table and a manifest. Up to 10,000 rows per table. Team PINs are never exported.</p>
            </SettingCard>
            <SettingCard icon={UserRound} title="Account" sub="The person signed in on this till.">
              <div className="flex items-center gap-3 border-b border-line pb-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-well text-[11px] font-semibold text-ink">{initials(user?.name)}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{user?.name??'Signed in'}</p><p className="truncate text-[11px] text-ink-muted">{user?.email??'No email on file'}</p></div>
                <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted">{role}</span>
              </div>
              <button type="button" onClick={logout} disabled={loggingOut} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[8px] border border-line-strong px-4 py-2 text-[12px] font-medium text-alert transition hover:border-alert disabled:cursor-not-allowed disabled:opacity-60">{loggingOut?<Loader2 className="size-3.5 animate-spin"/>:<LogOut className="size-3.5"/>}{loggingOut?'Signing out…':'Sign out'}</button>
            </SettingCard>
          </div>
        </div>}
  </Shell>
}
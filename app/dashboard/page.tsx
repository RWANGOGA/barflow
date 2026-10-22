'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { signOut, useSession } from '@/lib/auth-client'
import { Stock } from '@/components/stock/stock'
import { TriangleAlert as AlertTriangle, ArrowDownToLine, ChartBar as BarChart3, Check, ChevronDown, ClipboardCheck, ClipboardList, Clock, CreditCard, Database, Download, Eye, EyeOff, FileText, KeyRound, LayoutDashboard, Loader2, Lock, LogOut, Menu, Package, Plus, Printer, ReceiptText, RefreshCw, Save, Search, Settings, ShieldCheck, ShoppingBag, SlidersHorizontal, Tags, Trash2, TrendingDown, TrendingUp, UserRound, UsersRound, Wallet, Wine, X } from 'lucide-react'

type Product = { id:string; name:string; category:string; price:number; stock:number; reorder:number; cost:number; unit:string; tone:string; note?:string }
type Role = 'Admin'|'Cashier'|'Manager'|'Storekeeper'
const normalizeRole=(value:unknown):Role=>{const role=String(value??'Cashier').toLowerCase();return role==='admin'?'Admin':role==='manager'?'Manager':role==='storekeeper'?'Storekeeper':'Cashier'}
const getGreeting=()=>{const hour=new Date().getHours();return hour<12?'Good morning':hour<18?'Good afternoon':'Good evening'}
type Page = 'Overview'|'New sale'|'Open tabs'|'Stock & deliveries'|'Daily close'|'Reports'|'Menu & prices'|'Team & permissions'|'Audit log'|'Settings'
type RangeType = 'today' | 'week' | 'month' | 'two_months' | 'mid_year' | 'all';
type RangeOption = { value: RangeType; label: string };
type OverviewTrend = { label:string; tooltip:string; total:number; orders:number }
type OverviewData = { ready?:boolean; generatedAt?:string; range?:RangeType; rangeLabel:string; today:{revenue:number;orders:number;averageOrder:number}; session:{status:string;revenue:number;orders:number;openedAt:string}|null; totals:{revenue:number;orders:number;averageOrder:number;itemsSold:number;discounts:number;discountsValue:number;voidedOrders:number;voidedValue:number}; previous:{revenue:number;orders:number}|null; delta:{revenue:number|null;orders:number|null;todayRevenue:number|null}; openTabs:number; openTabsValue:number; openTabsStatus:string; byPayment:{method:string;amount:number;share:number}[]; series:OverviewTrend[]; topProducts:{name:string;category:string;quantity:number;revenue:number}[]; lowStock:{count:number;items:{id:string;name:string;stock:number;reorder:number}[]}; recent:{id:string;total:number;paymentMethod:string;tableLabel:string|null;createdAt:string}[]; checklist:{completed:number;total:number;items:{label:string;done:boolean}[]}; cashDrawer:{openingFloat:number;expectedCash:number;countedCash:number|null;cashVariance:number|null;dayStatus:string;dayLocked:boolean} }


const EMPTY_OVERVIEW:OverviewData={ready:false,rangeLabel:'This week',today:{revenue:0,orders:0,averageOrder:0},session:null,totals:{revenue:0,orders:0,averageOrder:0,itemsSold:0,discounts:0,discountsValue:0,voidedOrders:0,voidedValue:0},previous:null,delta:{revenue:null,orders:null,todayRevenue:null},openTabs:0,openTabsValue:0,openTabsStatus:'All settled',byPayment:[],series:[],topProducts:[],lowStock:{count:0,items:[]},recent:[],checklist:{completed:0,total:0,items:[]},cashDrawer:{openingFloat:0,expectedCash:0,countedCash:null,cashVariance:null,dayStatus:'no_day',dayLocked:false}}
// Cached locally so a reloaded till prints with the right currency before any request resolves.
const CURRENCY_STORAGE_KEY='barflow.currency'
const BAR_NAME_STORAGE_KEY='barflow.barName'
const CURRENCY_PATTERN=/^[A-Z]{2,5}$/
const BAR_NAME_FALLBACK='THE SIPPER'
const CURRENCY_OPTIONS=['UGX','KES','TZS','RWF','USD','EUR','GBP','ZAR','NGN']
let CURRENCY='UGX'
let BAR_NAME=BAR_NAME_FALLBACK
const normalizeCurrency=(value:unknown)=>{const code=String(value??'').trim().toUpperCase(); return CURRENCY_PATTERN.test(code)?code:''}
const applyCurrency=(value:unknown)=>{const code=normalizeCurrency(value); if(code)CURRENCY=code; return CURRENCY}
const applyBarName=(value:unknown)=>{const name=String(value??'').replace(/\s+/g,' ').trim().slice(0,60); BAR_NAME=name||BAR_NAME_FALLBACK; return BAR_NAME}
const cachedSetting=(key:string)=>typeof window==='undefined'?'':window.localStorage.getItem(key)??''
const money=(n:number)=>`${CURRENCY} ${n.toLocaleString()}`
const initials=(name?:string|null)=>(name??'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()??'').join('')||'??'
function printReceipt(receipt:{saleId?:string;receiptNumber?:number|string;cashier:string;payment:string;changeDue?:number;items:{name:string;quantity:number;price:number;total:number;note?:string}[];total:number}){const receiptWindow=window.open('', '_blank', 'width=420,height=700'); if(!receiptWindow)return false; const rows=receipt.items.map(item=>`<tr><td>${item.name}${item.note?' <span style="font-size:10px;color:#57606a">('+item.note+')</span>':''}<br><small>${item.quantity} × ${money(item.price)}</small></td><td>${money(item.total)}</td></tr>`).join(''); receiptWindow.document.write(`<!doctype html><html><head><title>Receipt ${receipt.saleId??''}</title><style>body{font-family:Arial,sans-serif;color:#1f2328;width:320px;margin:24px auto}h1{text-align:center;font-size:20px;margin:0 0 4px}p{color:#57606a;font-size:12px;text-align:center;margin:4px 0 18px}table{width:100%;border-collapse:collapse;font-size:13px}td{padding:9px 0;border-bottom:1px solid #d0d7de}td:last-child{text-align:right;white-space:nowrap}.total{display:flex;justify-content:space-between;font-weight:700;font-size:18px;margin-top:18px}.meta{display:flex;justify-content:space-between;font-size:12px;margin:4px 0}@media print{body{margin:0 auto}}</style></head><body><h1>${BAR_NAME}</h1><p>Bar management receipt</p><div class="meta"><span>Receipt</span><span>#${receipt.receiptNumber??'--'}</span></div><div class="meta"><span>Sale</span><span>${receipt.saleId??'Sale'}</span></div><div class="meta"><span>Cashier</span><span>${receipt.cashier}</span></div><div class="meta"><span>Payment</span><span>${receipt.payment}</span></div>${receipt.changeDue!=null&&receipt.changeDue>0?`<div class="meta"><span>Change due</span><span>${money(receipt.changeDue??0)}</span></div>`:''}<table>${rows}</table><div class="total"><span>Total</span><span>${money(receipt.total)}</span></div><p>Thank you for your visit.</p><script>window.onload=()=>window.print()</script></body></html>`); receiptWindow.document.close(); return true}
function printTicket(receipt:{saleId?:string;receiptNumber?:number|string;cashier:string;items:{name:string;quantity:number;price:number;total:number}[];total:number}){const receiptWindow=window.open('', '_blank', 'width=280,height=500'); if(!receiptWindow)return false; const rows=receipt.items.map(item=>`<tr><td>${item.name}</td><td style="text-align:right">${item.quantity}</td><td style="text-align:right">${money(item.total)}</td></tr>`).join(''); receiptWindow.document.write(`<!doctype html><html><head><title>Bar ticket ${receipt.saleId??''}</title><style>body{font-family:Arial,sans-serif;color:#1f2328;width:280px;margin:16px auto}h1{text-align:center;font-size:16px;margin:0 0 4px}p{color:#57606a;font-size:11px;text-align:center;margin:4px 0 12px}table{width:100%;border-collapse:collapse;font-size:12px}td{padding:6px 0;border-bottom:1px solid #d0d7de}td:last-child{text-align:right}.total{display:flex;justify-content:space-between;font-weight:700;margin-top:12px}@media print{body{margin:0 auto}}</style></head><body><h1>BAR TICKET</h1><p>Order #${receipt.receiptNumber??'--'} · ${receipt.cashier}</p><table>${rows}</table><div class="total"><span>Total</span><span>${money(receipt.total)}</span></div><p style="margin-top:16px;font-size:10px;color:#57606a">Prepare drinks in order listed.</p><script>window.onload=()=>window.print()</script></body></html>`); receiptWindow.document.close(); return true}
const nav:{label:Page; icon:any; roles:Role[]}[]=[{label:'Overview',icon:LayoutDashboard,roles:['Admin','Cashier','Manager','Storekeeper']},{label:'New sale',icon:CreditCard,roles:['Admin','Cashier','Manager']},{label:'Open tabs',icon:ClipboardList,roles:['Admin','Cashier','Manager']},{label:'Stock & deliveries',icon:Package,roles:['Admin','Manager','Storekeeper']},{label:'Daily close',icon:ClipboardCheck,roles:['Admin','Manager']},{label:'Reports',icon:BarChart3,roles:['Admin','Manager']},{label:'Menu & prices',icon:Tags,roles:['Admin','Manager']},{label:'Team & permissions',icon:UsersRound,roles:['Admin','Manager']},{label:'Audit log',icon:FileText,roles:['Admin','Manager']},{label:'Settings',icon:Settings,roles:['Admin','Manager']}]
function PageSidebar({page,go}:{page:Page;go:(page:Page)=>void}){return <nav aria-label="Workspace navigation" className="fixed inset-x-0 bottom-0 z-40 flex h-16 shrink-0 items-center gap-1 overflow-x-auto border-t border-[#d0d7de] bg-white px-2 lg:inset-y-0 lg:bottom-auto lg:left-0 lg:h-auto lg:w-[250px] lg:flex-col lg:items-stretch lg:gap-0.5 lg:overflow-y-auto lg:overflow-x-hidden lg:border-r lg:border-t-0 lg:p-4"> <div className="mb-0 hidden items-center gap-2.5 px-2 lg:mb-4 lg:flex"><div className="flex size-9 items-center justify-center rounded-md bg-[#1f883d] text-white"><Wine className="size-5"/></div><div className="min-w-0"><b className="block truncate text-sm text-[#1f2328]">{BAR_NAME}</b><p className="text-[10px] uppercase tracking-[.12em] text-[#57606a]">bar management</p></div></div><div className="mx-1 my-2 hidden border-t border-[#d8dee4] lg:block"/>{nav.map(({label,icon:Icon})=><button key={label} onClick={()=>go(label)} className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm ${page===label?'bg-[#f6f8fa] font-semibold text-[#1f2328]':'font-medium text-[#57606a] hover:bg-[#f6f8fa] hover:text-[#1f2328]'}`}><Icon className="size-[18px]"/>{label}</button>)}</nav>}

export default function Page(){const {data:session}=useSession(); const [page,setPage]=useState<Page>('Overview'); const [currency,setCurrency]=useState(CURRENCY); const [businessName,setBusinessName]=useState(BAR_NAME); const [role,setRole]=useState<Role>('Cashier'); const [timeGreeting,setTimeGreeting]=useState('Welcome back'); const [todayLabel,setTodayLabel]=useState(''); const [mobile,setMobile]=useState(false); const [notice,setNotice]=useState(''); const [query,setQuery]=useState(''); const [category,setCategory]=useState('All'); const [cart,setCart]=useState<{p:Product;q:number;note?:string}[]>([]); const [payment,setPayment]=useState('Cash'); const [closed,setClosed]=useState(false); const [day,setDay]=useState<any>(null); const [inventory,setInventory]=useState<Product[]>([]); const [receiptNumber,setReceiptNumber]=useState<string|null>(null); const [tableLabel,setTableLabel]=useState<string|null>(null); const [waiter,setWaiter]=useState<string|null>(null); const [tenderedAmount,setTenderedAmount]=useState<number|null>(null); const [waiters,setWaiters]=useState<string[]>([]); const [nextReceipt,setNextReceipt]=useState<number|null>(null); const [paying,setPaying]=useState(false); const saleKey=useRef<string|null>(null); useEffect(()=>{setRole(normalizeRole((session?.user as {role?:string}|undefined)?.role))},[session]); useEffect(()=>{setTimeGreeting(getGreeting()); setTodayLabel(new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}))},[]); const [overview,setOverview]=useState<OverviewData>(EMPTY_OVERVIEW); const [overviewLoading,setOverviewLoading]=useState(true); const [overviewError,setOverviewError]=useState(''); const overviewTicket=useRef(0);
 const [range,setRange]=useState<RangeType>('week'); const [rangeOpen,setRangeOpen]=useState(false); const rangeOptions:RangeOption[]=[{value:'today',label:'This day'},{value:'week',label:'This week'},{value:'month',label:'Month'},{value:'two_months',label:'Two months'},{value:'mid_year',label:'Mid year'},{value:'all',label:'All'}];
 const refreshLiveData=async()=>{if(!session?.user){setOverviewLoading(false);return} const ticket=++overviewTicket.current; setOverviewLoading(true); try{const [overviewRes,productsRes,dayRes]=await Promise.all([fetch('/api/overview?range='+range,{cache:'no-store'}),fetch('/api/products',{cache:'no-store'}),fetch('/api/day',{cache:'no-store'})]); if(ticket!==overviewTicket.current)return; if(overviewRes.ok){const data=await overviewRes.json(); setOverview({...data,ready:true}); setOverviewError('')} else {const body=await overviewRes.json().catch(()=>({})); setOverviewError(body?.error??'Could not load live overview data.'); setOverview(current=>current.ready?current:{...EMPTY_OVERVIEW,rangeLabel:rangeOptions.find(option=>option.value===range)?.label??'This week'})} if(productsRes.ok){const rows=await productsRes.json(); setInventory(Array.isArray(rows)?rows:[])} if(dayRes.ok){const record=await dayRes.json(); setDay(record); setClosed(record?.status==='closed')}}catch{if(ticket===overviewTicket.current)setOverviewError('Could not reach the server. Check your connection and retry.')}finally{if(ticket===overviewTicket.current)setOverviewLoading(false)}};
 useEffect(()=>{void refreshLiveData()},[range,session?.user?.id,page]);
 useEffect(()=>{if(!session?.user)return; let active=true; const useCached=()=>{if(!active)return; const savedCurrency=applyCurrency(cachedSetting(CURRENCY_STORAGE_KEY)); const savedName=applyBarName(cachedSetting(BAR_NAME_STORAGE_KEY)); setCurrency(savedCurrency); setBusinessName(savedName)}; fetch('/api/settings',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(!active)return; if(!data?.items){useCached(); return} const map=new Map<string,string>((data.items??[]).map((row:any)=>[String(row.key),String(row.value)])); const savedCurrency=applyCurrency(map.get('currency')??cachedSetting(CURRENCY_STORAGE_KEY)); const savedName=applyBarName(map.get('bar_name')??cachedSetting(BAR_NAME_STORAGE_KEY)); window.localStorage.setItem(CURRENCY_STORAGE_KEY,savedCurrency); window.localStorage.setItem(BAR_NAME_STORAGE_KEY,savedName); setCurrency(savedCurrency); setBusinessName(savedName)}).catch(useCached); return()=>{active=false}},[session?.user?.id]);
 useEffect(()=>{if(page!=='Overview'||!session?.user)return; const timer=setInterval(()=>{void refreshLiveData()},30000); return()=>clearInterval(timer)},[page,session?.user?.id,range]); useEffect(()=>{if(!session?.user)return; fetch('/api/team/waiters',{cache:'no-store'}).then(r=>r.ok?r.json():[]).then(rows=>{const w=Array.isArray(rows)?rows.map((m:any)=>m.name):[]; setWaiters(w); setWaiter(current=>current&&(w.includes(current)||!w.length)?current:(w.length?w[0]:(session?.user?.name??null)))}).catch(()=>undefined); fetch('/api/receipts/next',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(data?.nextNumber)setNextReceipt(Number(data.nextNumber))}).catch(()=>undefined)},[session?.user?.id]);
			const allowed=nav.filter(n=>n.roles.includes(role)); useEffect(()=>{if(!allowed.some(item=>item.label===page))setPage('Overview')},[allowed,page]);
		const filtered=useMemo(()=>inventory.filter(p=>(category==='All'||p.category===category)&&p.name.toLowerCase().includes(query.toLowerCase())),[inventory,category,query]); const low=inventory.filter(p=>p.stock<=p.reorder).length; const total=cart.reduce((s,x)=>s+x.p.price*x.q,0)
	const toast=(s:string)=>{setNotice(s);setTimeout(()=>setNotice(''),2600)}; const go=(p:Page)=>{setPage(p);setMobile(false)}; const add=(p:Product)=>setCart(c=>{const n='';return c.some(x=>x.p.id===p.id)?c.map(x=>x.p.id===p.id?{...x,q:x.q+1}:x):[...c,{p,q:1,note:n??''}]}); const adjust=(id:string,d:number)=>setCart(c=>c.map(x=>x.p.id===id?{...x,q:x.q+d}:x).filter(x=>x.q>0)); const onStockChanged=(id:string,change:{stockDelta:number;cost?:number})=>{setInventory(items=>items.map(p=>p.id===id?{...p,stock:p.stock+change.stockDelta,...(change.cost!==undefined?{cost:change.cost}:{})}:p)); void refreshLiveData()}; const confirmSale=async()=>{if(!cart.length||paying)return; const sold=cart; const cash=payment==='Cash'; const tendered=cash?Math.max(0,Math.trunc(tenderedAmount??total)):total; if(cash&&tendered<total){toast('Cash tendered is less than the total.');return} const key=saleKey.current??crypto.randomUUID(); saleKey.current=key; setPaying(true); let result:Response; try{result=await fetch('/api/sales',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({paymentMethod:payment,payment_items:[{method:payment,amount:total}],tendered_amount:cash?tendered:null,tableLabel:tableLabel||null,idempotencyKey:key,items:sold.map(({p,q})=>({productId:p.id,quantity:q,note:p.note??''}))})})}catch{setPaying(false); toast('Could not reach the server. Check your connection and try again.'); return} if(!result.ok){const error=await result.json().catch(()=>({})); setPaying(false); toast(error.error==='Unauthorized'?'Please sign in again before recording a sale.':error.error??'Could not save sale.'); return} const sale=await result.json(); const receipt=Number(sale.receiptNumber??sale.receipt_number??0); const changeDue=Number(sale.changeDue??sale.change_due??0); const cashier=session?.user?.name??'Current user'; saleKey.current=null; setPaying(false); setReceiptNumber(String(receipt)); setNextReceipt(receipt+1); setInventory(items=>items.map(p=>{const line=sold.find(x=>x.p.id===p.id); return line?{...p,stock:Math.max(0,p.stock-line.q)}:p})); const printed=printReceipt({saleId:sale.id,receiptNumber:receipt,cashier,payment:paymentLabel(sale.paymentMethod??payment),changeDue,items:sold.map(({p,q})=>({name:p.name,quantity:q,price:p.price,total:p.price*q,note:p.note??''})),total}); printTicket({saleId:sale.id,receiptNumber:receipt,cashier:waiter?`${waiter} · ${cashier}`:cashier,items:sold.map(({p,q})=>({name:p.name,quantity:q,price:p.price,total:p.price*q})),total}); setCart([]); setTenderedAmount(null); toast(printed?`Sale confirmed. Receipt #${receipt}.${changeDue>0?` Change due: ${money(changeDue)}`:''} Print dialog opened.`:`Sale confirmed. Allow pop-ups to print the receipt.`); await refreshLiveData()}; const saveOpenTab=async()=>{if(!cart.length){toast('Add at least one drink to the tab.');return} if(!tableLabel){toast('Choose a table or customer before saving the tab.');return} if(!waiter){toast('Choose who is serving this tab.');return} const result=await fetch('/api/tabs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tableLabel,ownerName:waiter,items:cart.map(({p,q})=>({productId:p.id,quantity:q}))})}); if(!result.ok){const error=await result.json().catch(()=>({})); toast(error.error??'Could not save tab.'); return} setCart([]); setTenderedAmount(null); setTableLabel(null); toast(`Tab saved for ${tableLabel}.`); await refreshLiveData()}; async function saveProduct(item:Product):Promise<string|null>{try{const result=await fetch('/api/products',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(item)}); if(!result.ok){const body=await result.json().catch(()=>({})); const message=body?.error??'Could not save product.'; toast(message); return message} setInventory(items=>items.some(p=>p.id===item.id)?items.map(p=>p.id===item.id?item:p):[...items,item]); toast(`${item.name} ${inventory.some(p=>p.id===item.id)?'updated':'added'} successfully.`); void refreshLiveData(); return null}catch{const message='Could not reach the server. Check your connection and try again.'; toast(message); return message}}

 if(page==='Reports') return <><PageSidebar page={page} go={go}/><main className="relative min-h-screen pl-0 lg:pl-[250px] bg-[#f6f8fa] p-4 text-[#1f2328] md:p-8 mx-auto max-w-[1680px] [&>section]:mx-auto [&>section]:w-full [&>section]:max-w-[1240px]"><Reports toast={toast}/>{notice&&<div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#1f883d] px-5 py-3 text-sm font-bold text-white shadow-xl">{notice}</div>}</main></>
 if(page==='Open tabs') return <><PageSidebar page={page} go={go}/><main className="relative min-h-screen pl-0 lg:pl-[250px] bg-[#f6f8fa] p-4 text-[#1f2328] md:p-8 mx-auto max-w-[1680px] [&>section]:mx-auto [&>section]:w-full [&>section]:max-w-[1240px]"><Tabs go={go} toast={toast} userName={session?.user?.name ?? 'Current user'} onActivity={refreshLiveData}/>{notice&&<div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#1f883d] px-5 py-3 text-sm font-bold text-white shadow-xl">{notice}</div>}</main></>
 if(page==='Daily close') return <><PageSidebar page={page} go={go}/><main className="relative min-h-screen pl-0 lg:pl-[250px] bg-[#f6f8fa] p-4 text-[#1f2328] md:p-8 mx-auto max-w-[1680px] [&>section]:mx-auto [&>section]:w-full [&>section]:max-w-[1240px]"><CloseDay closed={closed} day={day} inventory={inventory} overview={overview} setClosed={setClosed} toast={toast} go={go} onActivity={refreshLiveData}/>{notice&&<div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#1f883d] px-5 py-3 text-sm font-bold text-white shadow-xl">{notice}</div>}</main></>
 const routedNotice=notice&&<div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#1f883d] px-5 py-3 text-sm font-bold text-white shadow-xl">{notice}</div>;
 if(page==='New sale') return <><PageSidebar page={page} go={go}/><main className="min-h-screen pl-0 lg:pl-[250px] bg-[#f6f8fa] p-4 text-[#1f2328] md:p-8 mx-auto max-w-[1680px] [&>section]:mx-auto [&>section]:w-full [&>section]:max-w-[1240px]"><Sale userName={session?.user?.name ?? 'Current user'} receiptNumber={receiptNumber} nextReceipt={nextReceipt} waiters={waiters} tableLabel={tableLabel} setTableLabel={setTableLabel} waiter={waiter} setWaiter={setWaiter} tenderedAmount={tenderedAmount} setTenderedAmount={setTenderedAmount} filtered={filtered} category={category} setCategory={setCategory} query={query} setQuery={setQuery} add={add} cart={cart} setCart={setCart} total={total} adjust={adjust} payment={payment} setPayment={setPayment} toast={toast} pay={confirmSale} saveOpenTab={saveOpenTab} paying={paying} />{routedNotice}</main></>;
 if(page==='Stock & deliveries') return <><PageSidebar page={page} go={go}/><main className="min-h-screen pl-0 lg:pl-[250px] bg-[#f6f8fa] p-4 text-[#1f2328] md:p-8 mx-auto max-w-[1680px] [&>section]:mx-auto [&>section]:w-full [&>section]:max-w-[1240px]"><Stock products={inventory} onStockChanged={onStockChanged} toast={toast} role={role}/>{routedNotice}</main></>;
 if(page==='Menu & prices') return <><PageSidebar page={page} go={go}/><main className="min-h-screen pl-0 lg:pl-[250px] bg-[#f6f8fa] p-4 text-[#1f2328] md:p-8 mx-auto max-w-[1680px] [&>section]:mx-auto [&>section]:w-full [&>section]:max-w-[1240px]"><MenuPage inventory={inventory} onSave={saveProduct}/>{routedNotice}</main></>;
 if(page==='Team & permissions') return <><PageSidebar page={page} go={go}/><main className="min-h-screen pl-0 lg:pl-[250px] bg-[#f6f8fa] p-4 text-[#1f2328] md:p-8 mx-auto max-w-[1680px] [&>section]:mx-auto [&>section]:w-full [&>section]:max-w-[1240px]"><Team toast={toast}/>{routedNotice}</main></>;
 if(page==='Audit log') return <><PageSidebar page={page} go={go}/><main className="min-h-screen pl-0 lg:pl-[250px] bg-[#f6f8fa] p-4 text-[#1f2328] md:p-8 mx-auto max-w-[1680px] [&>section]:mx-auto [&>section]:w-full [&>section]:max-w-[1240px]"><Audit/>{routedNotice}</main></>;
 if(page==='Settings') return <><PageSidebar page={page} go={go}/><main className="min-h-screen pl-0 lg:pl-[250px] bg-[#f6f8fa] p-4 text-[#1f2328] md:p-8 mx-auto max-w-[1680px] [&>section]:mx-auto [&>section]:w-full [&>section]:max-w-[1240px]"><SettingsPage toast={toast} user={session?.user} role={role} currency={currency} businessName={businessName} onPreferencesSaved={(next:{currency:string;barName:string})=>{const savedCurrency=applyCurrency(next.currency); const savedName=applyBarName(next.barName); window.localStorage.setItem(CURRENCY_STORAGE_KEY,savedCurrency); window.localStorage.setItem(BAR_NAME_STORAGE_KEY,savedName); setCurrency(savedCurrency); setBusinessName(savedName)}}/>{routedNotice}</main></>;
 return <><main className="min-h-screen bg-[#f6f8fa] text-[#1f2328]"><div className="mx-auto flex min-h-screen max-w-[1600px] bg-[#f6f8fa]"><aside className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col bg-white p-4 text-[#1f2328] transition-transform [&>div:last-child]:hidden lg:static lg:translate-x-0 ${mobile?'translate-x-0':'-translate-x-full'}`}><div className="flex items-center gap-3 px-2"><div className="flex size-9 items-center justify-center rounded-md bg-[#1f883d] text-white"><Wine className="size-5"/></div><div className="min-w-0"><b className="block truncate text-[15px] text-[#1f2328]">{BAR_NAME}</b><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#57606a]">bar management</p></div></div><p className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-[.06em] text-[#57606a]">Workspace</p><div className="flex flex-col gap-1">{allowed.slice(0,5).map(({label,icon:Icon})=><button key={label} onClick={()=>go(label)} className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm ${page===label?'bg-[#f6f8fa] font-semibold text-[#1f2328]':'font-medium text-[#57606a] hover:bg-[#f6f8fa] hover:text-[#1f2328]'}`}><Icon className="size-[18px]"/>{label}{label==='Open tabs'&&overview.openTabs>0&&<span className="ml-auto rounded-full bg-[#aceebb] px-2 py-0.5 text-[10px] text-[#1a7f37]">{overview.openTabs}</span>}</button>)}</div>{allowed.length>5&&<><p className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-[.06em] text-[#57606a]">Management</p><div className="flex flex-col gap-1">{allowed.slice(5).map(({label,icon:Icon})=><button key={label} onClick={()=>go(label)} className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm ${page===label?'bg-[#f6f8fa] font-semibold text-[#1f2328]':'font-medium text-[#57606a] hover:bg-[#f6f8fa] hover:text-[#1f2328]'}`}><Icon className="size-[18px]"/>{label}</button>)}</div></>}<div className="mt-auto rounded-lg border border-[#d0d7de] bg-[#f6f8fa] p-4"><div className="flex items-center gap-2 text-[#1a7f37]"><ShieldCheck className="size-4"/><b className="text-xs">{overview.cashDrawer.dayLocked?'Trading day closed':overview.cashDrawer.dayStatus==='open'?'Trading day open':'Trading day not started'}</b></div><p className="mt-2 text-[11px] leading-relaxed text-[#57606a]">Expected cash {money(overview.cashDrawer.expectedCash)} · {overview.openTabs} open {overview.openTabs===1?'tab':'tabs'}</p></div><div className="mt-3 flex items-center gap-3 border-t border-[#eaeef2] pt-3"><div className="flex size-9 items-center justify-center rounded-full bg-[#eaeef2] text-xs font-semibold text-[#57606a]">{initials(session?.user?.name)}</div><div className="flex-1"><p className="text-sm font-bold">{session?.user?.name ?? 'Signed in'}</p><p className="text-xs text-[#57606a]">{role}</p></div></div></aside>{mobile&&<button aria-label="Close menu" className="fixed inset-0 z-30 bg-[#1f2328]/50 lg:hidden" onClick={()=>setMobile(false)}/>}<section className="min-w-0 flex-1"><header className="flex min-h-[64px] items-center justify-between border-b border-[#d0d7de] bg-white px-5 md:px-8"><div className="flex items-center gap-3"><button aria-label="Open menu" onClick={()=>setMobile(true)} className="rounded-md p-2 lg:hidden"><Menu/></button><div><p className="text-xs font-semibold text-[#57606a]">{todayLabel||'Today'}</p><h1 className="mt-0.5 text-lg font-semibold tracking-tight">{`${timeGreeting}, ${session?.user?.name ?? role}`}</h1></div></div><div className="flex items-center gap-2"><span className={`hidden items-center gap-2 rounded-full px-3 py-2 text-xs font-bold md:flex ${overview.cashDrawer.dayLocked?'bg-[#ffebe9] text-[#cf222e]':'bg-[#dafbe1] text-[#1a7f37]'}`}><span className={`size-2 rounded-full ${overview.cashDrawer.dayLocked?'bg-[#cf222e]':'bg-[#1f883d]'}`}/>{overview.cashDrawer.dayLocked?'Day closed':overview.cashDrawer.dayStatus==='open'?'Day open':'Day not started'}</span></div></header><div className="p-5 md:p-8"><Overview go={go} role={role} low={low} data={overview} loading={overviewLoading} error={overviewError} refresh={()=>void refreshLiveData()} greeting={timeGreeting} range={range} setRange={setRange} rangeOpen={rangeOpen} setRangeOpen={setRangeOpen} rangeOptions={rangeOptions}/></div></section></div>{notice&&<div role="status" className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-lg bg-[#1f2328] px-5 py-4 text-sm font-bold text-white shadow-2xl"><Check className="size-5 text-[#7ee787]"/>{notice}<button onClick={()=>setNotice('')}><X className="size-4"/></button></div>}</main></>}

function Shell({eyebrow,title,sub,children,action}:{eyebrow:string;title:string;sub:string;children:any;action?:React.ReactNode}){return <div className="mx-auto w-full max-w-[1200px]"><header className="mb-6 flex flex-col gap-3 border-b border-[#d8dee4] pb-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold text-[#57606a]">{eyebrow}</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#1f2328]">{title}</h2><p className="mt-1 max-w-2xl text-sm text-[#57606a]">{sub}</p></div>{action&&<div className="flex shrink-0 flex-wrap gap-2">{action}</div>}</header>{children}</div>}
const Card=({children,className=''}:{children:any;className?:string})=><div className={`rounded-lg border border-[#d0d7de] bg-white p-5 shadow-[0_1px_0_rgba(27,31,36,.04)] ${className}`}>{children}</div>
function paymentLabel(method:string){return method==='mobile_money'?'Mobile money':method==='card'?'Card':method==='cash'?'Cash':method}
const PAYMENT_TONES=['bg-[#54aeff]','bg-[#4ac26b]','bg-[#d4a72c]','bg-[#c297ff]','bg-[#ff8182]']
function Delta({value}:{value:number|null|undefined}){
  if(value===null||value===undefined)return <span className="text-[11px] font-semibold text-[#57606a]">No comparison yet</span>
  const up=value>=0
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${up?'bg-[#dafbe1] text-[#1a7f37]':'bg-[#ffebe9] text-[#cf222e]'}`}>{up?<TrendingUp className="size-3"/>:<TrendingDown className="size-3"/>}{up?'+':''}{value}%</span>
}
function Kpi({label,value,sub,delta,icon:Icon}:{label:string;value:string;sub:string;delta?:number|null;icon:any}){
  return <Card><div className="flex items-start justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#57606a]">{label}</p><Icon className="size-5 text-[#57606a]"/></div><p className="mt-3 text-2xl font-bold tracking-tight">{value}</p><div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#57606a]">{delta!==undefined&&<Delta value={delta}/>}<span>{sub}</span></div></Card>
}
function TrendChart({points}:{points:OverviewTrend[]}){
  const max=Math.max(...points.map(point=>point.total),1)
  return <div className="mt-6">
    <div className="flex h-48 items-end gap-1">
      {points.map((point,index)=><div key={`${point.tooltip}-${index}`} className="group relative flex h-full flex-1 items-end">
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-[170px] -translate-x-1/2 rounded-lg bg-[#1f883d] px-2.5 py-1.5 text-center text-[10px] font-bold text-white shadow-xl group-hover:block">
          <span className="block whitespace-nowrap">{point.tooltip}</span>
          <span className="mt-0.5 block text-[#7ee787]">{money(point.total)}</span>
          <span className="block font-semibold text-[#57606a]">{point.orders} {point.orders===1?'order':'orders'}</span>
        </div>
        <div className={`w-full rounded-t-md transition-colors ${point.total>0?(index===points.length-1?'bg-[#0969da] group-hover:bg-[#1f6feb]':'bg-[#b6e3ff] group-hover:bg-[#54aeff]'):'bg-[#f6f8fa]'}`} style={{height:`${point.total>0?Math.max(4,Math.round((point.total/max)*100)):2}%`}}/>
      </div>)}
    </div>
    <div className="mt-2 flex gap-1">
      {points.map((point,index)=><span key={`${point.label}-${index}`} className={`flex-1 truncate text-center text-[9px] text-[#57606a] ${points.length>12&&index%3!==0?'invisible':''}`}>{point.label}</span>)}
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
  const updatedAt=data.generatedAt?new Date(data.generatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}):null
  const canReadCash=role==='Admin'||role==='Manager'
  const session=data.session?.status==='open'?data.session:null
  const sessionSince=session?new Date(session.openedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''
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
    <button onClick={refresh} disabled={loading} className="flex items-center gap-1.5 rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-xs font-bold text-[#57606a] disabled:opacity-60"><RefreshCw className={`size-3.5 ${loading?'animate-spin':''}`}/>Refresh</button>
    <div className="relative"><button onClick={()=>setRangeOpen(!rangeOpen)} className="rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-xs font-bold">{data.rangeLabel}<ChevronDown className="ml-1 inline size-3"/></button>{rangeOpen&&<div className="absolute right-0 z-50 mt-2 w-48 rounded-md border border-[#d0d7de] bg-white shadow-lg">{rangeOptions.map(option=><button key={option.value} onClick={()=>{setRange(option.value);setRangeOpen(false)}} className={`w-full px-3 py-2 text-left text-sm hover:bg-[#f6f8fa] ${option.value===range?'font-bold':''}`}>{option.label}</button>)}</div>}</div>
    <button onClick={()=>go('New sale')} className="flex items-center gap-1.5 rounded-md bg-[#1f883d] px-4 py-2.5 text-sm font-bold text-white"><Plus className="size-4"/>New sale</button>
  </div>
  return <Shell eyebrow={`${timeGreeting} · ${role}`} title="Your bar, at a glance." sub={`Live totals from sales, tabs, stock, and the till${updatedAt?` · updated ${updatedAt}`:''}. Refreshes every 30 seconds.`} action={actions}>
    {data.cashDrawer.dayLocked&&<div className="mb-4 rounded-md border border-[#ffcecb] bg-[#ffebe9] p-4"><p className="text-sm font-bold text-red-600">Day is closed and locked. No new sales or tabs allowed until a new day is opened.</p></div>}
    {error&&<div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#ffcecb] bg-[#ffebe9] p-4"><div><p className="text-sm font-bold text-[#cf222e]">Live data could not load</p><p className="mt-1 text-xs text-[#cf222e]">{error}</p></div><button onClick={refresh} className="rounded-md bg-[#cf222e] px-4 py-2 text-xs font-bold text-white">Retry</button></div>}
    {!data.ready&&loading?<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map(index=><Card key={index}><div className="h-3 w-24 animate-pulse rounded bg-[#f6f8fa]"/><div className="mt-5 h-7 w-32 animate-pulse rounded bg-[#f6f8fa]"/><div className="mt-3 h-3 w-20 animate-pulse rounded bg-[#f6f8fa]"/></Card>)}</div>:<>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={session?'Trading day sales':"Today's sales"} value={money(session?session.revenue:data.today.revenue)} delta={session?undefined:data.delta.todayRevenue} sub={session?`${session.orders} ${session.orders===1?'order':'orders'} · since ${sessionSince}`:`${data.today.orders} ${data.today.orders===1?'order':'orders'} · vs yesterday`} icon={CreditCard}/>
        <Kpi label={`${data.rangeLabel} revenue`} value={money(data.totals.revenue)} delta={data.delta.revenue} sub="vs previous period" icon={BarChart3}/>
        <Kpi label="Orders served" value={String(data.totals.orders)} delta={data.delta.orders} sub={`avg ${money(data.totals.averageOrder)}`} icon={ShoppingBag}/>
        <Kpi label="Open tabs" value={String(data.openTabs)} sub={data.openTabs?`${money(data.openTabsValue)} outstanding`:data.openTabsStatus} icon={ClipboardList}/>
      </div>
      <Card className="mt-4"><div className="grid gap-5 sm:grid-cols-3 xl:grid-cols-6">{stats.map(item=><div key={item.label}><p className="text-[10px] font-bold uppercase tracking-wider text-[#57606a]">{item.label}</p><p className="mt-1.5 text-sm font-bold">{item.value}</p><p className="mt-1 text-[10px] font-semibold text-[#57606a]">{item.sub}</p></div>)}</div></Card>
      <div className="mt-7 grid gap-7 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">Sales trend</h3><p className="mt-1 text-xs text-[#57606a]">{data.rangeLabel} · {money(trendTotal)} across {data.totals.orders} {data.totals.orders===1?'order':'orders'}</p></div>{busiest&&busiest.total>0&&<span className="rounded-full bg-[#f6f8fa] px-2.5 py-1 text-[10px] font-bold text-[#57606a]">Best {busiest.label} · {money(busiest.total)}</span>}</div>
          {trendTotal>0?<TrendChart points={series}/>:<p className="py-16 text-center text-sm text-[#57606a]">No completed sales in this period yet.</p>}
        </Card>
        <Card>
          <h3 className="text-lg font-bold">Payment mix</h3>
          <p className="mt-1 text-xs text-[#57606a]">{money(data.totals.revenue)} collected · {data.rangeLabel}</p>
          {payments.length===0?<p className="mt-6 rounded-md bg-[#f6f8fa] p-4 text-sm text-[#57606a]">No payments recorded in this period.</p>:<>
            <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-[#f6f8fa]">{payments.map((payment,index)=><div key={payment.method} className={PAYMENT_TONES[index%PAYMENT_TONES.length]} style={{width:`${Math.max(payment.share,1)}%`}}/>)}</div>
            <div className="mt-5 flex flex-col gap-3">{payments.map((payment,index)=><div key={payment.method} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-semibold"><span className={`size-2.5 rounded-full ${PAYMENT_TONES[index%PAYMENT_TONES.length]}`}/>{paymentLabel(payment.method)}</span><span className="text-right font-bold">{money(payment.amount)}<span className="ml-2 text-[10px] font-semibold text-[#57606a]">{payment.share}%</span></span></div>)}</div>
          </>}
        </Card>
      </div>
      <div className="mt-7 grid gap-7 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Top products</h3><span className="text-[10px] font-bold uppercase tracking-wider text-[#57606a]">By revenue</span></div>
          <p className="mt-1 text-xs text-[#57606a]">Best sellers for {data.rangeLabel.toLowerCase()}</p>
          <div className="mt-4 flex flex-col gap-3">{topProducts.length===0?<p className="rounded-md bg-[#f6f8fa] p-4 text-sm text-[#57606a]">No items sold in this period.</p>:topProducts.map((item,index)=><div key={`${item.name}-${item.category}`} className="flex items-center gap-3"><span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${index===0?'bg-[#1f883d] text-white':'bg-[#f6f8fa] text-[#57606a]'}`}>{index+1}</span><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-3"><p className="truncate text-sm font-bold">{item.name}</p><span className="shrink-0 text-sm font-bold">{money(item.revenue)}</span></div><div className="mt-1.5 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f6f8fa]"><div className="h-full rounded-full bg-[#54aeff]" style={{width:`${Math.max(3,Math.round((item.revenue/topRevenue)*100))}%`}}/></div><span className="shrink-0 text-[10px] font-semibold text-[#57606a]">{item.category} · {item.quantity} sold</span></div></div></div>)}</div>
        </Card>
        <Card>
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Recent activity</h3><span className="rounded-full bg-[#f6f8fa] px-2 py-1 text-[10px] font-bold text-[#57606a]">{data.recent.length} latest</span></div>
          <p className="mt-1 text-xs text-[#57606a]">Completed sales across all dates, newest first</p>
          <div className="mt-4 flex flex-col gap-2">{data.recent.length===0?<p className="rounded-md bg-[#f6f8fa] p-4 text-sm text-[#57606a]">No completed sales yet.</p>:data.recent.map(sale=>{const created=new Date(sale.createdAt); const today=new Date().toDateString()===created.toDateString(); return <div key={sale.id} className="flex items-center justify-between rounded-md bg-[#f6f8fa] px-3 py-2.5 text-sm"><div><p className="font-bold">{sale.tableLabel||'Walk-in'}</p><p className="text-[11px] text-[#57606a]">{paymentLabel(sale.paymentMethod)} · {today?created.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):created.toLocaleDateString([],{day:'numeric',month:'short'})} {created.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p></div><span className="font-bold">{money(sale.total)}</span></div>})}</div>
        </Card>
      </div>
      <div className="mt-7 grid gap-7 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Low stock</h3><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${stockAlerts?'bg-[#fff8c5] text-[#9a6700]':'bg-[#dafbe1] text-[#1a7f37]'}`}>{stockAlerts} {stockAlerts===1?'item':'items'}</span></div>
          <p className="mt-1 text-xs text-[#57606a]">At or below the reorder level</p>
          <div className="mt-4 flex flex-col gap-2">{data.lowStock.items.length===0?<p className="rounded-md bg-[#dafbe1] p-4 text-xs font-bold text-[#1a7f37]">Every item is above its reorder level.</p>:data.lowStock.items.map(item=><div key={item.id} className="flex items-center justify-between rounded-md bg-[#f6f8fa] px-3 py-2.5 text-sm"><div><b>{item.name}</b><p className="text-[11px] text-[#57606a]">Reorder at {item.reorder}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.stock<=0?'bg-[#ffebe9] text-[#cf222e]':'bg-[#fff8c5] text-[#9a6700]'}`}>{item.stock} left</span></div>)}</div>
          {data.lowStock.count>data.lowStock.items.length&&<p className="mt-2 text-[10px] font-semibold text-[#57606a]">Showing {data.lowStock.items.length} of {data.lowStock.count}. Open stock for the full list.</p>}
        </Card>
        <Card>
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold">Manager checklist</h3><span className="rounded-full bg-[#dafbe1] px-2 py-1 text-[10px] font-bold text-[#1a7f37]">{checklist.filter(item=>item.done).length} / {checklist.length}</span></div>
          <p className="mt-1 text-xs text-[#57606a]">Live checks against stock, tabs, and the trading day</p>
          <div className="mt-5 flex flex-col gap-4">{checklist.map(item=><div key={item.label} className="flex items-center gap-3 text-sm font-semibold"><span className={`flex size-6 items-center justify-center rounded-full ${item.done?'bg-[#aceebb] text-[#1a7f37]':'border border-[#d0d7de] text-transparent'}`}><Check className="size-4"/></span>{item.label}</div>)}</div>
        </Card>
      </div>
    </>}
  </Shell>
}
function Sale({userName='Current user',receiptNumber,nextReceipt,waiters=[],tableLabel,setTableLabel,waiter,setWaiter,tenderedAmount,setTenderedAmount,filtered,category,setCategory,query,setQuery,add,cart,setCart,total,adjust,payment,setPayment,toast,pay,saveOpenTab,paying=false}:any){
  const cashPayment=payment==='Cash'
  const tendered=cashPayment&&tenderedAmount!=null?tenderedAmount:total
  const changeDue=Math.max(0,tendered-total)
  const shortCash=cashPayment&&tendered<total
  const receiptLabel=nextReceipt??receiptNumber??'--'
  return <Shell eyebrow={`Cashier workflow · Sale #${receiptLabel}`} title="Start a new sale" sub="Choose the waiter, table, drinks, and payment. Stock updates when you confirm.">
    <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div>
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <label className="rounded-lg border border-[#d0d7de] bg-white p-4">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[#57606a]">Served by</span>
            <select value={waiter??''} onChange={e=>setWaiter(e.target.value||null)} className="mt-2 w-full bg-transparent text-sm font-bold outline-none">
              {waiters.length?<option value="">No waiter</option>:<option value={userName}>{userName} (no team roster yet)</option>}
              {waiters.map((name:string)=><option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="rounded-lg border border-[#d0d7de] bg-white p-4">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[#57606a]">Table / customer</span>
            <input value={tableLabel??''} onChange={e=>setTableLabel(e.target.value||null)} placeholder="Table 05 or name" className="mt-2 w-full bg-transparent text-sm font-bold outline-none"/>
          </label>
          <div className="rounded-lg border border-[#d0d7de] bg-white p-4">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[#57606a]">Receipt number</span>
            <span className="mt-2 flex justify-between text-sm font-bold">#{receiptLabel}<ReceiptText className="size-4 text-[#57606a]"/></span>
          </div>
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">{['All','Beer','Spirits','Cider','Soft drinks'].map(x=><button key={x} onClick={()=>setCategory(x)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold ${category===x?'bg-[#1f883d] text-white':'border border-[#d0d7de] bg-white text-[#57606a]'}`}>{x}</button>)}</div>
        <div className="relative mb-5"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8c959f]"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search drinks by name..." className="h-10 w-full rounded-md border border-[#d0d7de] bg-white pl-10 pr-4 text-sm outline-none"/></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{filtered.map((p:Product)=><button key={p.id} onClick={()=>add(p)} disabled={p.stock<=0} className="rounded-lg border border-[#d0d7de] bg-white p-4 text-left hover:-translate-y-0.5 hover:border-[#0969da] disabled:cursor-not-allowed disabled:opacity-40"><div className={`item-${p.tone} mb-4 flex size-11 items-center justify-center rounded-md`}><Wine className="size-5"/></div><p className="text-sm font-bold">{p.name}</p><p className="mt-1 text-xs text-[#57606a]">{money(p.price)} · {p.stock>0?`${p.stock} left`:'Out of stock'}</p></button>)}</div>
      </div>
      <Card className="flex min-h-[560px] flex-col">
        <div className="flex justify-between">
          <div><h3 className="text-xl font-bold">Current order</h3><p className="mt-1 text-xs text-[#57606a]">{tableLabel||'Walk-in'} · {waiter||'No waiter'}</p></div>
          <button type="button" onClick={()=>setCart([])} className="text-xs font-bold text-[#9a6700]">Clear all</button>
        </div>
        <div className="my-5 h-px bg-[#eaeef2]"/>
        {cart.length===0?<div className="flex flex-1 flex-col items-center justify-center text-center text-[#8c959f]"><ShoppingBag className="mb-3 size-9"/><p className="text-sm font-bold">No items yet</p><p className="mt-1 text-xs">Tap a drink to add it</p></div>:<div className="flex flex-1 flex-col gap-4">{cart.map((x:any)=><div key={x.p.id} className="flex items-center gap-2"><div className={`item-${x.p.tone} flex size-9 items-center justify-center rounded-lg`}><Wine className="size-4"/></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{x.p.name}</p><p className="text-xs text-[#57606a]">{money(x.p.price)}</p></div><div className="flex items-center gap-2 rounded-lg border border-[#d0d7de] p-1"><button type="button" onClick={()=>adjust(x.p.id,-1)} className="size-5">−</button><span className="w-3 text-center text-xs font-bold">{x.q}</span><button type="button" onClick={()=>adjust(x.p.id,1)} className="size-5">+</button></div></div>)}</div>}
        <div className="my-5 h-px bg-[#eaeef2]"/>
        <div className="flex justify-between text-sm text-[#57606a]"><span>Subtotal</span><span>{money(total)}</span></div>
        <div className="mt-3 flex justify-between text-lg font-bold"><span>Total</span><span>{money(total)}</span></div>
        <div className="mt-5 grid grid-cols-3 gap-2">{['Cash','Mobile money','Card'].map((m:string)=><button type="button" key={m} onClick={()=>setPayment(m)} className={`rounded-md border py-3 text-[11px] font-bold ${payment===m?'border-[#0969da] bg-[#ddf4ff]':'border-[#d0d7de]'}`}>{m}</button>)}</div>
        {cashPayment&&<div className="mt-3">
          <div className="flex items-end gap-2">
            <label className="flex-1 text-xs font-bold text-[#57606a]">Cash tendered
              <input type="number" inputMode="numeric" min="0" step="1" value={tenderedAmount??''} onChange={e=>{const value=e.target.value;setTenderedAmount(value===''?null:Math.max(0,Math.trunc(Number(value))))}} className="mt-1 h-10 w-full rounded-md border border-[#d0d7de] px-3 text-sm font-bold" placeholder={String(total)}/>
            </label>
            <button type="button" onClick={()=>setTenderedAmount(total)} className="h-10 rounded-md border border-[#d0d7de] px-3 text-xs font-bold">Exact</button>
          </div>
          <div className="mt-2 flex justify-between text-xs font-bold"><span className="text-[#57606a]">Change due</span><span className={shortCash?'text-[#cf222e]':'text-[#1a7f37]'}>{shortCash?'Tendered cash is below the total':money(changeDue)}</span></div>
        </div>}
        <button type="button" disabled={!cart.length||shortCash||paying} onClick={pay} className="mt-4 flex items-center justify-center gap-2 rounded-md bg-[#1f883d] py-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><Printer className="size-4"/>{paying?'Saving sale…':'Pay & print receipt'}</button>
        <button type="button" disabled={!cart.length} onClick={saveOpenTab} className="mt-2 rounded-md border border-[#d0d7de] py-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">Save as open tab</button>
      </Card>
    </div>
  </Shell>
}
function TablePage({title,sub,children,action}:{title:string;sub:string;children:any;action?:React.ReactNode}){return <Shell eyebrow="Manager workspace" title={title} sub={sub} action={action}><Card className="overflow-hidden p-0">{children}</Card></Shell>}
function Tabs({go,toast,userName='Current user',onActivity}:any){const [tabs,setTabs]=useState<any[]>([]); const [selected,setSelected]=useState<any|null>(null); const [settling,setSettling]=useState<any|null>(null); useEffect(()=>{fetch('/api/tabs',{cache:'no-store'}).then(r=>r.ok?r.json():[]).then(rows=>setTabs(Array.isArray(rows)?rows:[])).catch(()=>setTabs([]))},[]); const settle=async(tab:any)=>{const result=await fetch(`/api/tabs?id=${encodeURIComponent(tab.id)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({paymentMethod:tab.paymentMethod??'cash'})});if(!result.ok){toast('Could not settle tab.');return}setTabs(items=>items.filter(item=>item.id!==tab.id));setSettling(null);toast(`${tab.tableLabel} settled. Receipt ready to print.`);onActivity?.()}; const [voiding,setVoiding]=useState<any|null>(null);const [voidPin,setVoidPin]=useState('');const [voidReason,setVoidReason]=useState('');const voidTab=async(tab:any)=>{setVoiding(tab);setVoidPin('');setVoidReason('')};const confirmVoid=async()=>{if(!voiding)return;if(!voidPin.trim()||!voidReason.trim()){toast('PIN and reason are required.');return}const result=await fetch(`/api/tabs?id=${encodeURIComponent(voiding.id)}&void=1`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({reason:voidReason.trim(),pin:voidPin.trim()})});if(!result.ok){toast('Void failed.');return}setTabs(items=>items.filter(item=>item.id!==voiding.id));setSettling(null);setVoiding(null);toast(`${voiding.tableLabel} voided.`);onActivity?.()}; return <TablePage title="Open tabs" sub="Orders waiting for payment. Settle, add items, or carry them to tomorrow." action={<button onClick={()=>go('New sale')} className="rounded-md bg-[#1f883d] px-4 py-3 text-sm font-bold text-white"><Plus className="mr-2 inline size-4"/>New tab</button>}><div className="grid gap-4 p-5 md:grid-cols-3">{tabs.map(tab=><div key={tab.id} className="rounded-lg border border-[#d0d7de] p-4"><div className="flex justify-between"><b>{tab.tableLabel}</b><span className="rounded-full bg-[#fff8c5] px-2 py-1 text-[10px] font-bold text-[#9a6700]">OPEN</span></div><p className="mt-2 text-xs text-[#57606a]">Served by {tab.ownerName} · {new Date(tab.openedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p><p className="mt-5 text-xl font-bold">{money(tab.total)}</p><div className="mt-4 flex gap-2"><button onClick={()=>setSettling(tab)} className="flex-1 rounded-lg bg-[#1f883d] py-2 text-xs font-bold text-white">Settle</button><button onClick={()=>voidTab(tab)} className="rounded-lg border border-[#cf222e] px-3 py-2 text-xs font-bold text-red-600">Void</button><button onClick={()=>setSelected(tab)} className="rounded-lg border px-3 py-2 text-xs font-bold">View</button></div></div>)}</div>{tabs.length===0&&<div className="p-10 text-center text-sm text-[#57606a]">No open tabs. Start a new sale to create one.</div>}{(selected||settling)&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f2328]/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-md border border-[#d0d7de] bg-white p-6 shadow-lg"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#57606a]">{settling?'Settle tab':'Open tab'}</p><h2 className="mt-1 text-xl font-bold">{(settling||selected)?.tableLabel}</h2></div><button aria-label="Close" onClick={()=>{setSelected(null);setSettling(null)}} className="rounded-lg border px-3 py-2 text-sm font-bold">Close</button></div><div className="mt-6 rounded-md bg-[#f6f8fa] p-4"><p className="text-xs text-[#57606a]">Served by {(settling||selected)?.ownerName}</p><p className="mt-2 text-2xl font-bold">{(settling||selected)?.total}</p><p className="mt-1 text-xs text-[#57606a]">Opened {(settling||selected)?.openedAt}</p></div>{settling?<div className="mt-5 flex gap-3"><button onClick={()=>setSettling(null)} className="flex-1 rounded-md border py-3 text-sm font-bold">Keep open</button><button onClick={()=>settle(settling)} className="flex-1 rounded-md bg-[#1f883d] py-3 text-sm font-bold text-white">Confirm settle</button></div>:<div className="mt-5 flex gap-3"><button onClick={()=>{setSelected(null);go('New sale')}} className="flex-1 rounded-md border py-3 text-sm font-bold">Add items</button><button onClick={()=>setSelected(null)} className="flex-1 rounded-md bg-[#1f883d] py-3 text-sm font-bold text-white">Done</button></div>}</div></div>}{voiding&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f2328]/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-md border border-[#d0d7de] bg-white p-6 shadow-lg"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#57606a]">Void tab</p><h2 className="mt-1 text-xl font-bold">{voiding.tableLabel}</h2></div><button aria-label="Close" onClick={()=>setVoiding(null)} className="rounded-lg border px-3 py-2 text-sm font-bold">Close</button></div><label className="mt-5 block text-xs font-bold text-[#57606a]">Manager PIN<input value={voidPin} onChange={e=>setVoidPin(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" type="password" placeholder="4–6 digits" className="mt-2 h-10 w-full rounded-md border border-[#d0d7de] px-4 text-sm"/></label><label className="mt-4 block text-xs font-bold text-[#57606a]">Void reason<input value={voidReason} onChange={e=>setVoidReason(e.target.value)} placeholder="Explain why this tab is being voided" className="mt-2 h-10 w-full rounded-md border border-[#d0d7de] px-4 text-sm"/></label><div className="mt-6 flex gap-3"><button onClick={()=>setVoiding(null)} className="flex-1 rounded-md border py-3 text-sm font-bold">Cancel</button><button onClick={confirmVoid} className="flex-1 rounded-md bg-[#cf222e] py-3 text-sm font-bold text-white">Confirm void</button></div></div></div>}</TablePage>}

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
  return <TablePage title={closed?'Day closed':'Close day'} sub={closed?'This trading day is locked. Open a new day before accepting more sales.':'Reconcile sales, money, and stock before locking today.'} action={<div className="flex flex-wrap items-center gap-2"><button onClick={()=>go('Overview')} className="rounded-md border border-[#d0d7de] bg-white px-4 py-3 text-xs font-bold">Back to home</button><span className={`rounded-md px-4 py-3 text-xs font-bold ${closed?'bg-[#dafbe1] text-[#1a7f37]':'bg-[#fff8c5] text-[#9a6700]'}`}>{closed?'DAY CLOSED':day?.status==='open'?'DAY OPEN':'DAY NOT STARTED'}</span>{!closed&&day?.status!=='open'&&<button onClick={openDay} disabled={opening} className="rounded-md bg-[#1f883d] px-4 py-3 text-xs font-bold text-white disabled:opacity-60">{opening?'Opening…':'Open trading day'}</button>}{day?.status==='open'&&<button onClick={closeDay} className="rounded-md bg-[#1f883d] px-4 py-3 text-xs font-bold text-white">Close day</button>}</div>}>
    <div className="grid gap-6 p-5 lg:grid-cols-2">
      <div>
        <h3 className="text-lg font-bold">1. Money balance</h3>
        <p className="mt-1 text-xs text-[#57606a]">Expected cash = opening float + cash sales − refunds − payouts</p>
        <div className="mt-5 flex flex-col gap-3">
          {[['Opening float',money(openingFloatValue)],['Cash sales',money(Math.max(0,expected-openingFloatValue))],['Expected cash',money(expected)],['Counted cash',counted==null?'Not counted yet':money(counted)],['Cash variance',varianceText]].map(x=><div key={x[0]} className="flex justify-between rounded-md bg-[#f6f8fa] p-4 text-sm"><span>{x[0]}</span><b>{x[1]}</b></div>)}
          {counted==null?<label className="text-xs font-bold text-[#57606a]">Counted cash<input type="number" inputMode="numeric" min="0" step="1" value={countedCash} onChange={e=>setCountedCash(e.target.value)} placeholder="Enter the cash counted in the till" className="mt-2 h-10 w-full rounded-md border border-[#d0d7de] px-4 text-sm font-bold"/></label>:<div className={`flex justify-between rounded-md p-4 text-sm font-bold ${variance===0?'bg-[#dafbe1] text-[#1a7f37]':'bg-[#ffebe9] text-[#cf222e]'}`}><span>Cash variance</span><span>{varianceText}</span></div>}
          {day?.status==='closed'&&day?.varianceReason&&<p className="rounded-md bg-[#fff8c5] p-4 text-xs font-bold text-[#9a6700]">Variance reason: {day.varianceReason}</p>}
          {day?.status==='open'&&<label className="mt-2 text-xs font-bold text-[#57606a]">Variance reason<input value={varianceReason} onChange={e=>setVarianceReason(e.target.value)} placeholder="Required only when cash does not match" className="mt-2 h-10 w-full rounded-md border border-[#d0d7de] px-4 text-sm"/></label>}
          {!closed&&day?.status!=='open'&&<label className="mt-2 text-xs font-bold text-[#57606a]">Opening float<input type="number" inputMode="numeric" min="0" step="1" value={openingFloat} onChange={e=>setOpeningFloat(e.target.value)} className="mt-2 h-10 w-full rounded-md border border-[#d0d7de] px-4 text-sm font-bold"/></label>}
          {day?.status==='open'&&<button onClick={closeDay} className="mt-2 rounded-md bg-[#1f883d] py-4 text-sm font-bold text-white">Accept variances & close day</button>}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-bold">2. Stock balance</h3>
        <p className="mt-1 text-xs text-[#57606a]">Expected closing stock from sales, deliveries, and wastage. Count it on the stock page before closing.</p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-md bg-[#f6f8fa] p-3"><p className="text-[10px] font-bold uppercase text-[#57606a]">Units</p><b className="mt-1 block text-lg">{stockUnits.toLocaleString()}</b></div>
          <div className="rounded-md bg-[#f6f8fa] p-3"><p className="text-[10px] font-bold uppercase text-[#57606a]">Low stock</p><b className="mt-1 block text-lg">{lowStock.length}</b></div>
          <div className="rounded-md bg-[#f6f8fa] p-3"><p className="text-[10px] font-bold uppercase text-[#57606a]">Stock value</p><b className="mt-1 block text-lg">{money(stockValue)}</b></div>
        </div>
        <div className="mt-4 flex flex-col gap-2">{lowStock.slice(0,5).map((p:Product)=><div key={p.id} className="flex items-center justify-between rounded-md border border-[#d0d7de] p-3 text-sm"><div><b>{p.name}</b><p className="text-xs text-[#57606a]">Reorder at {p.reorder} {p.unit}</p></div><b className={p.stock<=0?'text-[#cf222e]':'text-[#9a6700]'}>{p.stock} left</b></div>)}{lowStock.length===0&&<p className="rounded-md bg-[#dafbe1] p-4 text-xs font-bold text-[#1a7f37]">Every item is above its reorder level.</p>}</div>
        <button onClick={()=>go('Stock & deliveries')} className="mt-3 w-full rounded-md border border-[#d0d7de] py-3 text-xs font-bold">Open physical count</button>
        {day?.status==='open'&&<button disabled={closed} onClick={closeDay} className="mt-2 w-full rounded-md bg-[#1f883d] py-4 text-sm font-bold text-white disabled:opacity-40">{closed?'Day locked':'Accept variances & close day'}</button>}
      </div>
    </div>
  </TablePage>
}
function Reports({toast}:any){const [period,setPeriod]=useState<'daily'|'weekly'|'custom'>('daily'); const [report,setReport]=useState<any>({orders:0,total:0,items_sold:0,by_payment:[],by_category:[],by_product:[]}); const [loading,setLoading]=useState(true); const load=async(next=period)=>{setLoading(true); const end=new Date(); const start=new Date(end); if(next==='weekly')start.setDate(end.getDate()-6); if(next==='daily')start.setHours(0,0,0,0); try{const response=await fetch(`/api/reports/summary?from=${start.toISOString().slice(0,10)}&to=${end.toISOString().slice(0,10)}`); if(response.ok)setReport(await response.json())}finally{setLoading(false)}}; useEffect(()=>{load()},[period]); const products=[...(report.by_product??[])].sort((a:any,b:any)=>b.total-a.total); const categories=report.by_category??[]; const payments=report.by_payment??[]; const periodLabel=period==='daily'?'Today':'Last 7 days'; const download=(content:string,type:string,filename:string)=>{const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)}; const downloadCsv=()=>{const csv=[['Item','Category','Quantity','Sales (UGX)'],...products.map((p:any)=>[String(p.product_name),String(p.category),String(p.quantity),String(p.total)])].map((row:string[])=>row.map(value=>`"${value.replaceAll('"','""')}"`).join(',')).join('\n'); download(csv,'text/csv;charset=utf-8','barflow-sales-report.csv'); toast('CSV report downloaded')}; const downloadPdf=()=>{const html=`<!doctype html><html><head><meta charset="utf-8"><title>Barflow sales report</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#1f2328}h1{margin-bottom:4px}p{color:#57606a}table{width:100%;border-collapse:collapse;margin-top:28px}th,td{text-align:left;padding:12px;border-bottom:1px solid #d0d7de}th{background:#f6f8fa}</style></head><body><h1>Barflow sales report</h1><p>Generated ${new Date().toLocaleString()}</p><p>${periodLabel} · ${report.orders??0} orders · UGX ${Number(report.total??0).toLocaleString()}</p><table><thead><tr><th>Item</th><th>Category</th><th>Quantity</th><th>Sales</th></tr></thead><tbody>${products.map((p:any)=>`<tr><td>${p.product_name}</td><td>${p.category}</td><td>${p.quantity}</td><td>UGX ${Number(p.total).toLocaleString()}</td></tr>`).join('')}</tbody></table><script>window.addEventListener('load',()=>{window.focus();window.print()})</script></body></html>`; const url=URL.createObjectURL(new Blob([html],{type:'text/html'})); const popup=window.open(url,'_blank','width=820,height=720'); if(!popup){URL.revokeObjectURL(url);toast('Allow pop-ups to print the PDF report');return} setTimeout(()=>URL.revokeObjectURL(url),60000); toast('Report opened. Choose Save as PDF in the print dialog')}; return <TablePage title="Reports" sub={loading?'Loading live sales rows…':`${periodLabel} · ${report.orders??0} orders · ${money(report.total??0)} sold`} action={<div className="flex flex-wrap gap-2"><div className="flex rounded-md border border-[#d0d7de] bg-white p-1">{(['daily','weekly'] as const).map(p=><button key={p} onClick={()=>setPeriod(p)} className={`rounded-lg px-3 py-2 text-xs font-bold ${period===p?'bg-[#1f883d] text-white':''}`}>{p==='daily'?'Today':'7 days'}</button>)}</div><button onClick={downloadCsv} className="rounded-md border px-4 py-3 text-xs font-bold"><ArrowDownToLine className="mr-2 inline size-4"/>CSV</button><button onClick={downloadPdf} className="rounded-md bg-[#1f883d] px-4 py-3 text-xs font-bold text-white"><Printer className="mr-2 inline size-4"/>PDF report</button></div>}><div className="grid gap-4 border-b border-[#eaeef2] p-5 sm:grid-cols-2 lg:grid-cols-4">{[['Sales',money(report.total??0)],['Orders',String(report.orders??0)],['Items sold',String(report.items_sold??0)],['Average order',money(report.average_order??0)]].map(x=><div key={x[0]} className="rounded-md bg-[#f6f8fa] p-4"><p className="text-xs font-bold uppercase text-[#57606a]">{x[0]}</p><b className="mt-3 block text-xl">{x[1]}</b></div>)}</div><div className="grid gap-6 p-5 lg:grid-cols-2"><div><h3 className="text-lg font-bold">Sales by item</h3><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f6f8fa] text-xs uppercase text-[#57606a]"><tr><th className="p-3">Item</th><th>Qty</th><th>Sales</th></tr></thead><tbody>{products.slice(0,10).map((p:any)=><tr key={p.product_id} className="border-t border-[#eaeef2]"><td className="p-3 font-bold">{p.product_name}</td><td>{p.quantity}</td><td>{money(p.total)}</td></tr>)}{products.length===0&&!loading&&<tr><td colSpan={3} className="p-6 text-center text-[#57606a]">No completed sales in this period.</td></tr>}</tbody></table></div></div><div><h3 className="text-lg font-bold">By category</h3><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f6f8fa] text-xs uppercase text-[#57606a]"><tr><th className="p-3">Category</th><th>Qty</th><th>Sales</th></tr></thead><tbody>{categories.map((c:any)=><tr key={c.category} className="border-t border-[#eaeef2]"><td className="p-3 font-bold">{c.category}</td><td>{c.quantity}</td><td>{money(c.total)}</td></tr>)}{categories.length===0&&!loading&&<tr><td colSpan={3} className="p-6 text-center text-[#57606a]">No category totals yet.</td></tr>}</tbody></table></div><h3 className="mt-6 text-lg font-bold">By payment method</h3><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f6f8fa] text-xs uppercase text-[#57606a]"><tr><th className="p-3">Method</th><th>Sales</th><th>Share</th></tr></thead><tbody>{payments.map((p:any)=><tr key={p.payment_method} className="border-t border-[#eaeef2]"><td className="p-3 font-bold">{paymentLabel(p.payment_method)}</td><td>{money(p.total)}</td><td>{report.total?Math.round((p.total*100)/report.total):0}%</td></tr>)}{payments.length===0&&!loading&&<tr><td colSpan={3} className="p-6 text-center text-[#57606a]">No payments recorded yet.</td></tr>}</tbody></table></div></div></div></TablePage>}
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
  const field='mt-1.5 h-9 w-full rounded-md border border-[#d0d7de] bg-white px-3 text-sm outline-none transition focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/25';
  return <TablePage title="Menu & prices" sub="Manage customer-facing items, prices, categories, and stock links." action={<button type="button" onClick={()=>open()} className="inline-flex items-center gap-2 rounded-md bg-[#1f883d] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#1a7f37]"><Plus className="size-4"/>Add menu item</button>}>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="bg-[#f6f8fa] text-[11px] uppercase tracking-wide text-[#57606a]"><tr><th className="p-3 font-semibold">Menu item</th><th className="font-semibold">Category</th><th className="font-semibold">Price</th><th className="font-semibold">Stock link</th><th className="font-semibold">Visibility</th><th className="w-12"/></tr></thead>
        <tbody>
          {inventory.map(p=><tr key={p.id} className="border-t border-[#d8dee4] hover:bg-[#f6f8fa]"><td className="p-3 font-semibold text-[#1f2328]">{p.name}</td><td className="text-[#57606a]">{p.category}</td><td className="font-semibold">{money(p.price)}</td><td className="text-[#57606a]">1 × {p.unit}</td><td><span className="rounded-full border border-[#aceebb] bg-[#dafbe1] px-2 py-0.5 text-[10px] font-semibold text-[#1a7f37]">VISIBLE</span></td><td><button type="button" aria-label={`Edit ${p.name}`} onClick={()=>open(p)} className="rounded-md p-1.5 text-[#57606a] transition hover:bg-[#eaeef2] hover:text-[#1f2328]"><SlidersHorizontal className="size-4"/></button></td></tr>)}
          {!inventory.length&&<tr><td colSpan={6} className="p-10 text-center"><p className="font-semibold text-[#1f2328]">No menu items yet</p><p className="mt-1 text-sm text-[#57606a]">Use “Add menu item” to create the first drink on the menu.</p></td></tr>}
        </tbody>
      </table>
    </div>
    {modalOpen&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f2328]/50 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md border border-[#d0d7de] bg-white p-6 shadow-lg">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-[#57606a]">Menu catalogue</p><h3 className="mt-1 text-xl font-semibold text-[#1f2328]">{isExisting?'Edit menu item':'Add menu item'}</h3><p className="mt-1 text-sm text-[#57606a]">Set the selling price and link the item to stock.</p></div>
          <button type="button" aria-label="Close dialog" onClick={close} disabled={saving} className="rounded-md p-1.5 text-[#57606a] transition hover:bg-[#eaeef2] disabled:opacity-40"><X className="size-5"/></button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-[#57606a] sm:col-span-2">Item name<input autoFocus required value={form.name} onChange={event=>update('name',event.target.value)} placeholder="e.g. Nile Special" className={field}/></label>
          <label className="block text-xs font-semibold text-[#57606a]">Category<select value={form.category} onChange={event=>update('category',event.target.value)} className={field}><option>Beer</option><option>Spirits</option><option>Cider</option><option>Soft drinks</option><option>Wine</option><option>Cocktails</option></select></label>
          <label className="block text-xs font-semibold text-[#57606a]">Unit<input required value={form.unit} onChange={event=>update('unit',event.target.value)} placeholder="bottle" className={field}/></label>
          <label className="block text-xs font-semibold text-[#57606a]">Selling price ({CURRENCY})<input required min="1" step="1" type="number" value={form.price||''} onChange={event=>update('price',event.target.value)} className={field}/></label>
          <label className="block text-xs font-semibold text-[#57606a]">Cost price ({CURRENCY})<input min="0" step="1" type="number" value={form.cost||''} onChange={event=>update('cost',event.target.value)} className={field}/></label>
          <label className="block text-xs font-semibold text-[#57606a]">Opening stock<input min="0" step="1" type="number" value={form.stock} onChange={event=>update('stock',event.target.value)} className={field}/></label>
          <label className="block text-xs font-semibold text-[#57606a]">Reorder level<input min="0" step="1" type="number" value={form.reorder} onChange={event=>update('reorder',event.target.value)} className={field}/></label>
        </div>
        {formError&&<p role="alert" className="mt-4 rounded-md border border-[#ffcecb] bg-[#ffebe9] px-3 py-2 text-xs font-semibold text-[#cf222e]">{formError}</p>}
        <div className="mt-6 flex justify-end gap-2 border-t border-[#d8dee4] pt-4">
          <button type="button" onClick={close} disabled={saving} className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3.5 py-2 text-sm font-semibold text-[#1f2328] transition hover:bg-[#eaeef2] disabled:opacity-40">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-[#1f883d] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#1a7f37] disabled:cursor-not-allowed disabled:opacity-60">{saving&&<Loader2 className="size-4 animate-spin"/>}{saving?'Saving…':isExisting?'Save changes':'Add to menu'}</button>
        </div>
      </form>
    </div>}
  </TablePage>
}
function Team({toast}:any){const [open,setOpen]=useState(false); const [name,setName]=useState(''); const [role,setRole]=useState<Role>('Cashier'); const [pin,setPin]=useState(''); const [members,setMembers]=useState<any[]>([]); useEffect(()=>{fetch('/api/team').then(r=>r.ok?r.json():[]).then(rows=>setMembers(Array.isArray(rows)?rows:[])).catch(()=>setMembers([]))},[]); const access=role==='Manager'?'Full access':role==='Storekeeper'?'Stock only':'Sales & payment'; const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!name.trim()||pin.length<4)return;const memberName=name.trim();const result=await fetch('/api/team',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:memberName,role,pin})});if(!result.ok){toast('Could not add team member.');return}const member=await result.json();setMembers(m=>[...m,member]);setName('');setPin('');setRole('Cashier');setOpen(false);toast(`${memberName} added to the team.`)}; return <TablePage title="Team & permissions" sub="Personal PINs, role access, and approval controls for your bar." action={<button onClick={()=>setOpen(true)} className="rounded-md bg-[#1f883d] px-4 py-3 text-sm font-bold text-white"><Plus className="mr-2 inline size-4"/>Add team member</button>}><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-[#f6f8fa] text-xs uppercase text-[#57606a]"><tr><th className="p-4">Team member</th><th>Role</th><th>Added</th><th>Access</th></tr></thead><tbody>{members.map((member:any)=><tr key={member.id} className="border-t border-[#eaeef2]"><td className="p-4 font-bold">{member.name}</td><td>{member.role}</td><td className="text-[#57606a]">{member.createdAt?new Date(member.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—'}</td><td><span className="rounded-full bg-[#ddf4ff] px-2 py-1 text-[10px] font-bold text-[#0969da]">{member.role==='Manager'?'Full access':member.role==='Storekeeper'?'Stock only':'Sales & payment'}</span></td></tr>)}</tbody></table></div>{open&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f2328]/50 p-4" role="dialog" aria-modal="true"><form onSubmit={submit} className="w-full max-w-lg rounded-md border border-[#d0d7de] bg-white p-6 shadow-lg"><div className="flex items-start justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[.06em] text-[#57606a]">Team setup</p><h3 className="mt-1 text-lg font-semibold">Add team member</h3><p className="mt-1 text-sm text-[#57606a]">Create a staff profile and choose their access.</p></div><button type="button" aria-label="Close dialog" onClick={()=>setOpen(false)} className="rounded-lg p-2 hover:bg-[#f6f8fa]"><X className="size-5"/></button></div><div className="mt-6 grid gap-4"><label className="text-xs font-bold text-[#57606a]">Full name<input autoFocus required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Daniel O." className="mt-2 h-10 w-full rounded-md border border-[#d0d7de] px-4 text-sm"/></label><label className="text-xs font-bold text-[#57606a]">Role<select value={role} onChange={e=>setRole(e.target.value as Role)} className="mt-2 h-10 w-full rounded-md border border-[#d0d7de] bg-white px-4 text-sm"><option>Cashier</option><option>Manager</option><option>Storekeeper</option></select></label><label className="text-xs font-bold text-[#57606a]">Personal PIN<input required minLength={4} maxLength={6} inputMode="numeric" type="password" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="4–6 digits" className="mt-2 h-10 w-full rounded-md border border-[#d0d7de] px-4 text-sm"/></label><div className="rounded-md bg-[#f6f8fa] p-4 text-sm"><span className="text-xs font-bold uppercase tracking-wider text-[#57606a]">Access granted</span><p className="mt-1 font-bold">{access}</p></div></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={()=>setOpen(false)} className="rounded-md border border-[#d0d7de] px-4 py-3 text-sm font-bold">Cancel</button><button type="submit" className="rounded-md bg-[#1f883d] px-5 py-3 text-sm font-bold text-white">Add member</button></div></form></div>}</TablePage>}
const AUDIT_ACTIONS:[string,string][]=[['all','All actions'],['void','Void'],['discount','Discount'],['settle','Tab settled'],['price_change','Price change'],['delivery','Delivery'],['transfer','Stock transfer'],['day_close','Day close'],['settings_change','Setting changed'],['team_add','Team member added'],['pin_change','Approval PIN']]
const auditActionLabel=(value:string)=>AUDIT_ACTIONS.find(([key])=>key===value)?.[1]??value.replaceAll('_',' ')
const auditActionTone=(value:string)=>value==='void'?'bg-[#ffebe9] text-[#cf222e]':value==='discount'||value==='price_change'?'bg-[#fff8c5] text-[#9a6700]':value==='delivery'||value==='settle'?'bg-[#dafbe1] text-[#1a7f37]':'bg-[#f6f8fa] text-[#1f2328]'
const auditApprovalTone=(value:string)=>value==='admin'?'bg-[#fbefff] text-[#8250df]':value==='manager'?'bg-[#fff8c5] text-[#9a6700]':'bg-[#f6f8fa] text-[#57606a]'
const auditWindow=(period:string)=>{const day=(offset:number)=>{const date=new Date();date.setUTCDate(date.getUTCDate()-offset);return date.toISOString().slice(0,10)};return period==='today'?day(0):period==='7d'?day(6):period==='30d'?day(29):''}

function Audit(){
  const [events,setEvents]=useState<any[]>([])
  const [total,setTotal]=useState(0)
  const [limit,setLimit]=useState(100)
  const [hasMore,setHasMore]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [period,setPeriod]=useState('30d')
  const [action,setAction]=useState('all')
  const [query,setQuery]=useState('')
  const [openId,setOpenId]=useState<string|null>(null)
  const ticket=useRef(0)

  const load=async()=>{
    const current=++ticket.current
    setLoading(true); setError('')
    const params=new URLSearchParams()
    if(action!=='all') params.set('action',action)
    const from=auditWindow(period)
    if(from) params.set('from',from)
    try{
      const response=await fetch(`/api/audit?${params.toString()}`,{cache:'no-store'})
      const data=await response.json().catch(()=>null)
      if(current!==ticket.current) return
      if(!response.ok){ setEvents([]); setTotal(0); setError(data?.error??`Could not load the audit log (${response.status}).`); return }
      setEvents(Array.isArray(data?.events)?data.events:[]); setTotal(Number(data?.total??0)); setLimit(Number(data?.limit??100)); setHasMore(Boolean(data?.hasMore))
    }catch{
      if(current!==ticket.current) return
      setEvents([]); setTotal(0); setError('Could not reach the server. Check your connection and try again.')
    }finally{
      if(current===ticket.current) setLoading(false)
    }
  }
  useEffect(()=>{void load()},[period,action])

  const visible=useMemo(()=>{const search=query.trim().toLowerCase(); if(!search) return events; return events.filter(event=>[event.recordLabel,event.reason,event.userName,event.action,event.entityType].filter(Boolean).join(' ').toLowerCase().includes(search))},[events,query])

  return <TablePage title="Audit log" sub="Permanent record of voids, discounts, price changes, settlements, and approvals." action={<button onClick={()=>void load()} className="rounded-md border border-[#d8dee4] bg-white px-4 py-2 text-sm font-bold text-[#1f2328] hover:bg-[#f6f8fa]">Refresh</button>}>
    <div className="flex flex-col gap-3 border-b border-[#eaeef2] p-4 md:flex-row md:items-center">
      <select value={period} onChange={event=>setPeriod(event.target.value)} aria-label="Period" className="rounded-md border border-[#d8dee4] bg-white px-3 py-2 text-sm font-semibold text-[#1f2328]"><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All time</option></select>
      <select value={action} onChange={event=>setAction(event.target.value)} aria-label="Action" className="rounded-md border border-[#d8dee4] bg-white px-3 py-2 text-sm font-semibold text-[#1f2328]">{AUDIT_ACTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8c959f]"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Filter by record, user, or reason" className="w-full rounded-md border border-[#d8dee4] bg-white py-2 pl-9 pr-3 text-sm"/></div>
    </div>
    {error&&<div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#ffcecb] bg-[#ffebe9] px-4 py-3 text-sm font-semibold text-[#cf222e]"><span>{error}</span><button onClick={()=>void load()} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold">Retry</button></div>}
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-[#f6f8fa] text-xs uppercase text-[#57606a]"><tr><th className="p-4">Time</th><th>User</th><th>Action</th><th>Record</th><th>Approval</th><th className="w-10"/></tr></thead>
        <tbody>
          {loading?<tr><td colSpan={6} className="p-10 text-center text-sm text-[#57606a]">Loading events…</td></tr>
          :!visible.length?<tr><td colSpan={6} className="p-10 text-center"><p className="font-bold">{events.length?'No events match this filter':'No audit events yet'}</p><p className="mx-auto mt-1 max-w-md text-sm text-[#57606a]">{events.length?'Try a wider period or a different action.':'Voids, discounts, price changes, settlements, and approvals appear here as they happen.'}</p></td></tr>
          :visible.map(event=><Fragment key={event.id}>
            <tr onClick={()=>setOpenId(current=>current===event.id?null:event.id)} className="cursor-pointer border-t border-[#eaeef2] hover:bg-[#f6f8fa]">
              <td className="p-4 text-[#57606a]">{new Date(event.createdAt).toLocaleString([], {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
              <td><b>{event.userName??'Unknown'}</b><span className="block text-[11px] font-semibold text-[#57606a]">{event.actorRole??event.userRole??''}</span></td>
              <td><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${auditActionTone(event.action)}`}>{auditActionLabel(event.action)}</span></td>
              <td className="pr-4">{event.recordLabel||'—'}<span className="block text-[11px] text-[#57606a]">{event.entityType??''}</span></td>
              <td><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${auditApprovalTone(event.approval)}`}>{event.approval}</span></td>
              <td className="pr-4 text-[#8c959f]"><ChevronDown className={`size-4 transition-transform ${openId===event.id?'rotate-180':''}`}/></td>
            </tr>
            {openId===event.id&&<tr className="border-t border-[#eaeef2] bg-[#f6f8fa]"><td colSpan={6} className="px-4 py-4 text-xs text-[#57606a]">
              <div className="grid gap-3 md:grid-cols-2">
                <div><p className="text-[10px] font-bold uppercase tracking-wide text-[#57606a]">Reason</p><p className="mt-1">{event.reason||'None recorded'}</p></div>
                <div><p className="text-[10px] font-bold uppercase tracking-wide text-[#57606a]">Entity</p><p className="mt-1 break-all">{event.entityId||'—'}</p></div>
              </div>
              {event.metadata&&Object.keys(event.metadata).length>0&&<div className="mt-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#57606a]">Details</p><dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1">{Object.entries(event.metadata).map(([key,value])=><div key={key} className="flex gap-1"><dt className="font-semibold">{key}:</dt><dd>{typeof value==='object'?JSON.stringify(value):String(value)}</dd></div>)}</dl></div>}
            </td></tr>}
          </Fragment>)}
        </tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eaeef2] px-4 py-3 text-xs text-[#57606a]">
      <span>{loading?'Loading…':`Showing ${visible.length} of ${total} event${total===1?'':'s'}${query.trim()?` (filtered from ${events.length} loaded)`:''}`}</span>
      {hasMore&&<span>Latest {limit} shown. Narrow the period to see older events.</span>}
    </div>
  </TablePage>
}
type Preferences={currency:string;barName:string}
const EXPORT_TABLES=[
  {id:'bar_product',label:'Products'},
  {id:'bar_sale',label:'Sales'},
  {id:'bar_sale_item',label:'Sale line items'},
  {id:'bar_sale_payment',label:'Sale payments'},
  {id:'bar_tab',label:'Tabs'},
  {id:'bar_tab_item',label:'Tab items'},
  {id:'bar_stock_movement',label:'Stock movements'},
  {id:'bar_stock_delivery',label:'Deliveries'},
  {id:'bar_stock_transfer',label:'Transfers'},
  {id:'bar_stock_count',label:'Daily stock counts'},
  {id:'bar_inventory_count',label:'Inventory counts'},
  {id:'bar_stock_adjustment',label:'Stock adjustments'},
  {id:'bar_menu_stock_link',label:'Menu–stock links'},
  {id:'bar_day',label:'Trading days'},
  {id:'bar_discount',label:'Discounts'},
  {id:'bar_receipts',label:'Receipts'},
  {id:'bar_team_member',label:'Team members'},
  {id:'bar_variance_tolerance',label:'Variance tolerances'},
  {id:'bar_variance_history',label:'Variance history'},
  {id:'bar_audit_log',label:'Audit log'},
] as const
const settingsLabel='text-[11px] font-bold uppercase tracking-wide text-[#57606a]'
const settingsFactLabel='text-[10px] font-bold uppercase tracking-wide text-[#57606a]'
const settingsField='h-10 w-full rounded-md border border-[#d0d7de] bg-white px-3 text-sm outline-none transition focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20 disabled:bg-[#f6f8fa]'
function SettingCard({icon:Icon,title,sub,action,children}:{icon:any;title:string;sub:string;action?:React.ReactNode;children:any}){
  return <section className="rounded-lg border border-[#d0d7de] bg-white shadow-[0_1px_0_rgba(27,31,36,.04)]">
    <header className="flex items-start gap-3 border-b border-[#eaeef2] px-5 py-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[#ddf4ff] text-[#0969da]"><Icon className="size-5"/></span>
      <div className="min-w-0 flex-1"><h3 className="text-sm font-bold">{title}</h3><p className="mt-0.5 text-xs leading-relaxed text-[#57606a]">{sub}</p></div>
      {action}
    </header>
    <div className="p-5">{children}</div>
  </section>
}
function SettingsSkeleton(){
  return <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
    {[0,1].map(column=><div key={column} className="flex flex-col gap-5">
      {[0,1].map(card=><div key={card} className="rounded-lg border border-[#d0d7de] bg-white p-5 shadow-[0_1px_0_rgba(27,31,36,.04)]">
        <div className="flex items-center gap-3"><span className="size-10 animate-pulse rounded-md bg-[#eaeef2]"/><div className="flex-1 space-y-2"><span className="block h-3.5 w-32 animate-pulse rounded bg-[#eaeef2]"/><span className="block h-3 w-48 animate-pulse rounded bg-[#f6f8fa]"/></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><span className="h-11 animate-pulse rounded-md bg-[#f6f8fa]"/><span className="h-11 animate-pulse rounded-md bg-[#f6f8fa]"/></div>
      </div>)}
    </div>)}
  </div>
}
function SettingsPage({toast,user,role,currency,businessName,onPreferencesSaved}:{toast:(message:string)=>void;user?:{name?:string|null;email?:string|null}|null;role:string;currency:string;businessName:string;onPreferencesSaved:(next:Preferences)=>void}){
  // Props seed the first paint; the saved record from the API is authoritative once it loads.
  const initial=useRef({currency,businessName});
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [reloadKey,setReloadKey]=useState(0);
  const [timeZone,setTimeZone]=useState('Africa/Kampala');
  const [businessDate,setBusinessDate]=useState('');
  const [tradingDay,setTradingDay]=useState<{status?:string;businessDate?:string;openedAt?:string;openingFloat?:number}|null>(null);
  const [saved,setSaved]=useState<Preferences>({currency:initial.current.currency,barName:initial.current.businessName});
  const [draft,setDraft]=useState<Preferences>({currency:initial.current.currency,barName:initial.current.businessName});
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
      const loadedName=String(items.get('bar_name')??initial.current.businessName).replace(/\s+/g,' ').trim().slice(0,60);
      const next:Preferences={currency:normalizeCurrency(items.get('currency'))||initial.current.currency,barName:loadedName||BAR_NAME_FALLBACK};
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
  const nameDraft=draft.barName.replace(/\s+/g,' ').trim();
  const nameValid=nameDraft.length>=2;
  const dirty=currencyDraft!==saved.currency||nameDraft!==saved.barName;
  const canSave=dirty&&!saving&&Boolean(currencyDraft)&&nameValid;
  const pinValid=/^\d{4,8}$/.test(pin);
  const pinMatches=pin.length>0&&pin===confirmPin;
  const currentPinReady=!hasPin||/^\d{4,8}$/.test(currentPin);
  const exportAll=exportPicked.length===EXPORT_TABLES.length;
  const exportRangeInvalid=Boolean(exportFrom&&exportTo&&exportFrom>exportTo);
  const pinMessage=pinError||(!pin?'Use 4 to 8 digits.':!pinValid?'A PIN must be 4 to 8 digits.':!pinMatches?'The two PINs do not match.':pin.length<6?'Short PINs are easy to guess.':'PINs match. Ready to save.');
  const savePreferences=async()=>{
    if(!currencyDraft){setSaveError('Enter a 2–5 letter currency code such as UGX.'); return}
    if(!nameValid){setSaveError('The business name needs at least 2 characters.'); return}
    const wanted:Preferences={currency:currencyDraft,barName:nameDraft};
    const items:Record<string,string>={};
    if(wanted.currency!==saved.currency)items.currency=wanted.currency;
    if(wanted.barName!==saved.barName)items.bar_name=wanted.barName;
    if(!Object.keys(items).length){setSaveError(''); return}
    setSaving(true); setSaveError('');
    try{
      const result=await fetch('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items})});
      if(!result.ok){const body=await result.json().catch(()=>({})); setSaveError(body?.error??'Could not save settings.'); return}
      const data=await result.json().catch(()=>({items:[]}));
      const stored:Preferences={...saved};
      for(const row of (data?.items??[]) as {key:string;value:string}[]){
        if(row.key==='currency')stored.currency=normalizeCurrency(row.value)||stored.currency;
        if(row.key==='bar_name')stored.barName=applyBarName(row.value);
      }
      // A batch is all-or-nothing, so the draft can safely mirror what the server stored.
      setSaved(stored); setDraft(stored);
      setLastSavedAt(new Date());
      onPreferencesSaved(stored);
      toast('Settings saved. New prices and receipts use these values.');
    }catch{setSaveError('Could not reach the server. Your changes are still here — try again.')}
    finally{setSaving(false)}
  };
  const discardPreferences=()=>setDraft(saved);
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
  const shiftIsoDate=(date:string,days:number)=>{const shifted=new Date(`${date}T12:00:00Z`); shifted.setUTCDate(shifted.getUTCDate()+days); return shifted.toISOString().slice(0,10)};
  const applyExportRange=(days:number|null)=>{
    if(days===null){setExportFrom(''); setExportTo(''); setExportError(''); return}
    const end=businessDate||new Date().toISOString().slice(0,10);
    setExportTo(end); setExportFrom(shiftIsoDate(end,-(days-1))); setExportError('');
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
  if(loading) return <Shell eyebrow="Manager workspace" title="Settings" sub="Preferences, approvals, and account controls for this bar."><SettingsSkeleton/></Shell>;
  return <Shell eyebrow="Manager workspace" title="Settings" sub="Preferences, approvals, and account controls for this bar.">
    {loadError
      ? <div className="rounded-lg border border-[#ffcecb] bg-white p-8 text-center shadow-[0_1px_0_rgba(27,31,36,.04)]">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#ffebe9] text-[#cf222e]"><AlertTriangle className="size-6"/></span>
          <h3 className="mt-3 text-base font-bold">Settings could not load</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-[#57606a]">{loadError}</p>
          <button type="button" onClick={()=>setReloadKey(key=>key+1)} className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#1f883d] px-4 py-2.5 text-sm font-bold text-white"><RefreshCw className="size-4"/>Retry</button>
        </div>
      : <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <SettingCard icon={Wallet} title="Preferences" sub="Applies to this account: the currency used for prices and the header printed on receipts." action={<span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${dirty?'bg-[#fff8c5] text-[#9a6700]':'bg-[#dafbe1] text-[#1a7f37]'}`}>{dirty?'Unsaved':'Saved'}</span>}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className={settingsLabel}>Business name</span><input value={draft.barName} onChange={event=>{setDraft({...draft,barName:event.target.value}); setSaveError('')}} maxLength={60} disabled={saving} placeholder="THE SIPPER" className={`mt-2 ${settingsField}`}/><span className="mt-1.5 block text-[11px] leading-relaxed text-[#57606a]">Printed at the top of every receipt and bar ticket.</span>{!nameValid&&nameDraft.length>0&&<span className="mt-1 block text-[11px] font-semibold text-[#cf222e]">Use at least 2 characters.</span>}</label>
                <label className="block"><span className={settingsLabel}>Currency</span><input list="currency-options" value={draft.currency} onChange={event=>{setDraft({...draft,currency:event.target.value.toUpperCase()}); setSaveError('')}} maxLength={5} disabled={saving} placeholder="UGX" className={`mt-2 ${settingsField} uppercase tracking-wide`}/><datalist id="currency-options">{CURRENCY_OPTIONS.map(code=><option key={code} value={code}/>)}</datalist><span className="mt-1.5 block text-[11px] leading-relaxed text-[#57606a]">Prices show as <b className="text-[#57606a]">{currencyDraft||'???'} 12,000</b>.</span></label>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_210px]">
                <div className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#57606a]">What this changes</p>
                  <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-[#57606a]">
                    <li>Prices, totals, and stock values use {currencyDraft||'—'}.</li>
                    <li>Receipts and bar tickets print “{nameDraft||saved.barName}”.</li>
                    <li>Completed sales keep the amounts they were recorded with.</li>
                  </ul>
                </div>
                <div className="rounded-md border border-[#d0d7de] bg-white p-4 text-center shadow-[0_1px_0_rgba(27,31,36,.04)]">
                  <p className="truncate font-serif text-[13px] font-bold uppercase tracking-wide">{nameDraft||saved.barName}</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[.14em] text-[#57606a]">Bar receipt · sample</p>
                  <div className="mt-3 flex justify-between text-[10px] text-[#57606a]"><span>Nile Special × 2</span><span>{currencyDraft||'—'} 10,000</span></div>
                  <div className="mt-2 flex justify-between border-t border-dashed border-[#d0d7de] pt-2 text-[11px] font-bold"><span>Total</span><span>{currencyDraft||'—'} 10,000</span></div>
                </div>
              </div>
              {currencyDraft&&currencyDraft!==saved.currency&&<div className="mt-3 rounded-md border border-[#f0d58c] bg-[#fff8c5] px-3 py-2.5">
                <p className="text-[11px] font-bold text-[#9a6700]">Currency changes relabel, they do not convert.</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[#9a6700]">A 5,000 price becomes {currencyDraft} 5,000. Update the price list first if this is a real currency switch.</p>
              </div>}
              {saveError&&<p role="alert" className="mt-4 rounded-md border border-[#ffcecb] bg-[#ffebe9] px-3 py-2 text-xs font-semibold text-[#cf222e]">{saveError}</p>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#eaeef2] pt-4">
                <span className={`text-xs font-semibold ${dirty?'text-[#9a6700]':'text-[#57606a]'}`}>{dirty?'You have unsaved changes.':lastSavedAt?`Saved ${lastSavedAt.toLocaleString([], {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}.`:'Up to date.'}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={discardPreferences} disabled={!dirty||saving} className="rounded-md border border-[#d0d7de] px-4 py-2.5 text-sm font-bold text-[#57606a] transition hover:bg-[#f6f8fa] disabled:cursor-not-allowed disabled:opacity-40">Discard</button>
                  <button type="button" onClick={savePreferences} disabled={!canSave} className="inline-flex items-center gap-2 rounded-md bg-[#1f883d] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1a7f37] disabled:cursor-not-allowed disabled:opacity-40">{saving?<Loader2 className="size-4 animate-spin"/>:<Save className="size-4"/>}{saving?'Saving…':'Save changes'}</button>
                </div>
              </div>
            </SettingCard>
            <SettingCard icon={Lock} title="Approval PIN" sub="Required when a manager voids a tab or approves a sensitive action." action={<span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${hasPin===null?'bg-[#f6f8fa] text-[#57606a]':hasPin?'bg-[#dafbe1] text-[#1a7f37]':'bg-[#fff8c5] text-[#9a6700]'}`}>{hasPin===null?'Unknown':hasPin?'PIN set':'No PIN'}</span>}>
              <div className="grid gap-4 sm:grid-cols-2">
                {hasPin&&<label className="block sm:col-span-2"><span className={settingsLabel}>Current PIN</span><input type={revealPin?'text':'password'} inputMode="numeric" autoComplete="current-password" maxLength={8} value={currentPin} onChange={event=>{setCurrentPin(event.target.value.replace(/\D/g,'').slice(0,8)); setPinError(''); setConfirmRemovePin(false)}} placeholder="The PIN you use today" className={`mt-2 ${settingsField} tracking-[.2em]`}/><span className="mt-1.5 block text-[11px] leading-relaxed text-[#57606a]">Needed before this PIN can be replaced or removed.</span></label>}
                <label className="block"><span className={settingsLabel}>New PIN</span><div className="relative mt-2"><input type={revealPin?'text':'password'} inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin} onChange={event=>{setPin(event.target.value.replace(/\D/g,'').slice(0,8)); setPinError('')}} placeholder="4–8 digits" className={`${settingsField} pr-12 tracking-[.2em]`}/><button type="button" aria-label={revealPin?'Hide PIN':'Show PIN'} onClick={()=>setRevealPin(value=>!value)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#57606a] transition hover:text-[#1f2328]">{revealPin?<EyeOff className="size-4"/>:<Eye className="size-4"/>}</button></div></label>
                <label className="block"><span className={settingsLabel}>Confirm PIN</span><input type={revealPin?'text':'password'} inputMode="numeric" autoComplete="new-password" maxLength={8} value={confirmPin} onChange={event=>{setConfirmPin(event.target.value.replace(/\D/g,'').slice(0,8)); setPinError('')}} placeholder="Repeat the PIN" className={`mt-2 ${settingsField} tracking-[.2em]`}/></label>
              </div>
              <p className={`mt-2 text-[11px] font-semibold ${pinError||(!pinMatches&&confirmPin.length>0)?'text-[#cf222e]':pinValid&&pinMatches?'text-[#1a7f37]':'text-[#57606a]'}`}>{pinMessage}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#eaeef2] pt-4">
                <p className="max-w-xs text-[11px] leading-relaxed text-[#57606a]">Stored as a salted scrypt hash, never as plain digits. {hasPin===null?'PIN status could not be confirmed.':hasPin?'Admin accounts still bypass the PIN prompt.':'Without a PIN, manager voids are rejected.'}</p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {hasPin&&(confirmRemovePin
                    ? <><span className="text-[11px] font-bold text-[#cf222e]">Remove this PIN?</span><button type="button" onClick={removePin} disabled={removingPin||!currentPinReady} className="inline-flex items-center gap-2 rounded-md bg-[#cf222e] px-3 py-2.5 text-sm font-bold text-white transition hover:bg-[#a40e26] disabled:cursor-not-allowed disabled:opacity-40">{removingPin?<Loader2 className="size-4 animate-spin"/>:<Trash2 className="size-4"/>}{removingPin?'Removing…':'Confirm removal'}</button><button type="button" onClick={()=>setConfirmRemovePin(false)} disabled={removingPin} className="rounded-md border border-[#d0d7de] px-3 py-2.5 text-sm font-bold text-[#57606a] transition hover:bg-[#f6f8fa]">Keep it</button></>
                    : <button type="button" onClick={()=>{setConfirmRemovePin(true); setPinError('')}} disabled={savingPin} className="rounded-md border border-[#ffcecb] px-3 py-2.5 text-sm font-bold text-[#cf222e] transition hover:bg-[#ffebe9] disabled:cursor-not-allowed disabled:opacity-40">Remove PIN</button>)}
                  <button type="button" onClick={savePin} disabled={savingPin||removingPin||!pinValid||!pinMatches||!currentPinReady} className="inline-flex items-center gap-2 rounded-md bg-[#1f883d] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1a7f37] disabled:cursor-not-allowed disabled:opacity-40">{savingPin?<Loader2 className="size-4 animate-spin"/>:<KeyRound className="size-4"/>}{savingPin?'Saving…':hasPin?'Replace PIN':'Set PIN'}</button>
                </div>
              </div>
            </SettingCard>
          </div>
          <div className="flex flex-col gap-5">
            <SettingCard icon={Clock} title="Trading context" sub="Read-only facts from the bar's clock and today's session.">
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-md bg-[#f6f8fa] p-3"><dt className={settingsFactLabel}>Business date</dt><dd className="mt-1 text-sm font-bold">{businessDate||tradingDay?.businessDate||'—'}</dd></div>
                <div className="rounded-md bg-[#f6f8fa] p-3"><dt className={settingsFactLabel}>Time zone</dt><dd className="mt-1 truncate text-sm font-bold" title={timeZone}>{timeZone}</dd></div>
                <div className="rounded-md bg-[#f6f8fa] p-3"><dt className={settingsFactLabel}>Day status</dt><dd className="mt-1 text-sm font-bold">{tradingDay?.status==='open'?'Open':tradingDay?.status==='closed'?'Closed':'Not started'}</dd></div>
                <div className="rounded-md bg-[#f6f8fa] p-3"><dt className={settingsFactLabel}>Opening float</dt><dd className="mt-1 text-sm font-bold">{money(tradingDay?.openingFloat??0)}</dd></div>
              </dl>
              {tradingDay?.openedAt&&<p className="mt-3 text-[11px] text-[#57606a]">Session opened {new Date(tradingDay.openedAt).toLocaleString([], {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}.</p>}
            </SettingCard>
            <SettingCard icon={Database} title="Data export" sub="Download this account's records for a date range, as CSV or a ZIP of CSVs.">
              <div>
                <span className={settingsLabel}>Date range</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block min-w-0"><span className="text-[11px] text-[#57606a]">From</span><input type="date" value={exportFrom} max={exportTo||undefined} onChange={event=>{setExportFrom(event.target.value); setExportError('')}} className={`mt-1 min-w-0 ${settingsField}`}/></label>
                  <label className="block min-w-0"><span className="text-[11px] text-[#57606a]">To</span><input type="date" value={exportTo} min={exportFrom||undefined} onChange={event=>{setExportTo(event.target.value); setExportError('')}} className={`mt-1 min-w-0 ${settingsField}`}/></label>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {([{label:'All time',days:null},{label:'Today',days:1},{label:'7 days',days:7},{label:'30 days',days:30}] as {label:string;days:number|null}[]).map(range=><button key={range.label} type="button" onClick={()=>applyExportRange(range.days)} className="rounded-full border border-[#d0d7de] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#57606a] transition hover:bg-[#f6f8fa] hover:text-[#1f2328]">{range.label}</button>)}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[#57606a]">Blank dates include everything. Days follow the bar's clock ({timeZone}).</p>
              </div>
              <div className="mt-4 rounded-md border border-[#d0d7de]">
                <button type="button" aria-expanded={showExportTables} onClick={()=>setShowExportTables(value=>!value)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-bold text-[#1f2328] transition hover:bg-[#f6f8fa]">
                  <span>{exportAll?`All ${EXPORT_TABLES.length} tables`:`${exportPicked.length} of ${EXPORT_TABLES.length} tables`}</span>
                  <ChevronDown className={`size-4 text-[#57606a] transition ${showExportTables?'rotate-180':''}`}/>
                </button>
                {showExportTables&&<div className="border-t border-[#eaeef2] p-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={()=>{setExportPicked(EXPORT_TABLES.map(table=>table.id)); setExportError('')}} className="rounded-md border border-[#d0d7de] px-2.5 py-1 text-[11px] font-semibold text-[#57606a] transition hover:bg-[#f6f8fa]">Select all</button>
                    <button type="button" onClick={()=>{setExportPicked([]); setExportError('')}} className="rounded-md border border-[#d0d7de] px-2.5 py-1 text-[11px] font-semibold text-[#57606a] transition hover:bg-[#f6f8fa]">Clear</button>
                  </div>
                  <div className="mt-2 grid max-h-48 gap-0.5 overflow-auto sm:grid-cols-2">
                    {EXPORT_TABLES.map(table=><label key={table.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] text-[#1f2328] hover:bg-[#f6f8fa]"><input type="checkbox" checked={exportPicked.includes(table.id)} onChange={()=>toggleExportTable(table.id)} className="size-3.5 accent-[#1f883d]"/><span className="truncate">{table.label}</span></label>)}
                  </div>
                </div>}
              </div>
              {(exportError||exportRangeInvalid)&&<p role="alert" className="mt-3 rounded-md border border-[#ffcecb] bg-[#ffebe9] px-3 py-2 text-[11px] font-semibold text-[#cf222e]">{exportError||'The start date must be on or before the end date.'}</p>}
              <button type="button" onClick={runExport} disabled={!exportPicked.length||exportRangeInvalid} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#1f883d] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1a7f37] disabled:cursor-not-allowed disabled:opacity-40"><Download className="size-4"/>{exportPicked.length===1?'Download CSV':'Download ZIP'}</button>
              <p className="mt-3 text-[11px] leading-relaxed text-[#57606a]">One table downloads as CSV; several download as a ZIP with one CSV per table and a manifest. Up to 10,000 rows per table. Team PINs are never exported.</p>
            </SettingCard>
            <SettingCard icon={UserRound} title="Account" sub="The person signed in on this till.">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#ddf4ff] text-sm font-bold text-[#0969da]">{initials(user?.name)}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{user?.name??'Signed in'}</p><p className="truncate text-[11px] text-[#57606a]">{user?.email??'No email on file'}</p></div>
                <span className="rounded-full bg-[#ddf4ff] px-2.5 py-1 text-[10px] font-bold uppercase text-[#0969da]">{role}</span>
              </div>
              <button type="button" onClick={logout} disabled={loggingOut} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#ffcecb] px-4 py-3 text-sm font-bold text-red-600 transition hover:bg-[#ffebe9] disabled:cursor-not-allowed disabled:opacity-60">{loggingOut?<Loader2 className="size-4 animate-spin"/>:<LogOut className="size-4"/>}{loggingOut?'Signing out…':'Sign out'}</button>
            </SettingCard>
          </div>
        </div>}
  </Shell>
}
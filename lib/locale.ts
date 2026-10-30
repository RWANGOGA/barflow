/**
 * Regional behaviour shared by the server and the till.
 *
 * A bar outside Uganda must be able to use its own currency, date format, trading-day
 * clock, tax rate and payment methods without a code change. Everything here is pure and
 * isomorphic so the API, the dashboard and the stock screens format the same way.
 */

export type RegionalSettings = {
  currency: string
  locale: string
  timeZone: string
  /** Tax stored in basis points so 18% is exactly 1800 and never a float. */
  taxRateBps: number
  /** True when listed menu prices already include tax, which is normal in VAT markets. */
  taxInclusive: boolean
  taxId: string
  receiptAddress: string
  receiptPhone: string
  receiptFooter: string
  paymentMethods: string[]
}

export const DEFAULT_CURRENCY = 'UGX'
export const DEFAULT_LOCALE = 'en-GB'
export const DEFAULT_TIME_ZONE = 'Africa/Kampala'
export const DEFAULT_PAYMENT_METHODS = ['cash', 'mobile_money', 'card']

export const DEFAULT_REGIONAL: RegionalSettings = {
  currency: DEFAULT_CURRENCY,
  locale: DEFAULT_LOCALE,
  timeZone: DEFAULT_TIME_ZONE,
  taxRateBps: 0,
  taxInclusive: true,
  taxId: '',
  receiptAddress: '',
  receiptPhone: '',
  receiptFooter: 'Thank you for your visit.',
  paymentMethods: DEFAULT_PAYMENT_METHODS,
}

/** Every method the database accepts; a workspace enables the subset it can take. */
export const PAYMENT_METHODS: { id: string; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'mobile_money', label: 'Mobile money' },
  { id: 'card', label: 'Card' },
  { id: 'bank_transfer', label: 'Bank transfer' },
  { id: 'voucher', label: 'Voucher' },
  { id: 'other', label: 'Other' },
]

export const PAYMENT_METHOD_IDS = PAYMENT_METHODS.map((method) => method.id)

/** Short pick list for the currency field; any ISO 4217 code is still accepted. */
export const CURRENCY_OPTIONS = [
  'UGX', 'KES', 'TZS', 'RWF', 'BIF', 'SSP', 'ETB', 'SOS',
  'NGN', 'GHS', 'ZAR', 'XOF', 'XAF', 'EGP', 'MAD', 'MZN',
  'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'AED', 'SAR',
  'INR', 'CNY', 'JPY', 'BRL', 'MXN', 'TRY',
]

export const LOCALE_OPTIONS = [
  { id: 'en-GB', label: 'English (United Kingdom)' },
  { id: 'en-US', label: 'English (United States)' },
  { id: 'en-KE', label: 'English (Kenya)' },
  { id: 'en-UG', label: 'English (Uganda)' },
  { id: 'en-NG', label: 'English (Nigeria)' },
  { id: 'en-ZA', label: 'English (South Africa)' },
  { id: 'sw-KE', label: 'Kiswahili (Kenya)' },
  { id: 'fr-FR', label: 'Français (France)' },
  { id: 'fr-CD', label: 'Français (RD Congo)' },
  { id: 'pt-BR', label: 'Português (Brasil)' },
  { id: 'es-ES', label: 'Español (España)' },
  { id: 'ar-AE', label: 'العربية (الإمارات)' },
  { id: 'hi-IN', label: 'हिन्दी (भारत)' },
  { id: 'de-DE', label: 'Deutsch (Deutschland)' },
]

export const TIME_ZONE_OPTIONS = [
  'Africa/Kampala', 'Africa/Nairobi', 'Africa/Dar_es_Salaam', 'Africa/Kigali',
  'Africa/Bujumbura', 'Africa/Addis_Ababa', 'Africa/Lagos', 'Africa/Accra',
  'Africa/Johannesburg', 'Africa/Cairo', 'Africa/Casablanca', 'Africa/Maputo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'America/Mexico_City', 'Asia/Dubai', 'Asia/Riyadh',
  'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney',
]

/** Accept any ISO 4217 code the runtime can format, not just our short list. */
export function normalizeCurrency(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) return null
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code }).format(1)
    return code
  } catch {
    return null
  }
}

export function normalizeLocale(value: unknown): string | null {
  const input = String(value ?? '').trim().replaceAll('_', '-')
  if (!input || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(input)) return null
  try {
    return Intl.getCanonicalLocales(input)[0] ?? null
  } catch {
    return null
  }
}

export function normalizeTimeZone(value: unknown): string | null {
  const zone = String(value ?? '').trim()
  if (!zone || zone.length > 64) return null
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone }).format(0)
    return zone
  } catch {
    return null
  }
}

/** Parse the loose boolean shapes an HTML form or API client may send. */
export function readBooleanSetting(value: unknown): boolean | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (['true', '1', 'yes', 'on', 'inclusive'].includes(raw)) return true
  if (['false', '0', 'no', 'off', 'exclusive'].includes(raw)) return false
  return null
}

/** Percent input ("18", "18.5", "18,5") or basis points ("1800"), clamped to 0–100%. */
export function normalizeTaxRate(value: unknown): number | null {
  // Comma is the decimal separator in most of the world; accept it instead of failing.
  const raw = String(value ?? '').trim().replace('%', '').replace(',', '.').trim()
  if (!raw || !/^\d{1,3}(\.\d{1,2})?$/.test(raw)) return null
  const bps = Math.round(Number(raw) * 100)
  return Number.isInteger(bps) && bps >= 0 && bps <= 10000 ? bps : null
}

export function normalizePaymentMethods(value: unknown): string[] {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',')
  const chosen = list
    .map((method) => String(method).trim().toLowerCase())
    .filter((method) => PAYMENT_METHOD_IDS.includes(method))
  const unique = [...new Set(chosen)]
  return unique.length ? unique : [...DEFAULT_PAYMENT_METHODS]
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

/** Build the effective regional settings from stored `bar_settings` rows. */
export function parseRegionalSettings(rows: { key: string; value: string }[]): RegionalSettings {
  const map = new Map(rows.map((row) => [row.key, row.value]))
  const bps = Number(map.get('tax_rate_bps'))

  return {
    currency: normalizeCurrency(map.get('currency')) ?? DEFAULT_CURRENCY,
    locale: normalizeLocale(map.get('locale')) ?? DEFAULT_LOCALE,
    timeZone: normalizeTimeZone(map.get('time_zone')) ?? DEFAULT_TIME_ZONE,
    taxRateBps: Number.isInteger(bps) && bps >= 0 && bps <= 10000 ? bps : 0,
    // Prices include tax unless the workspace explicitly says otherwise.
    taxInclusive: map.get('tax_inclusive') !== 'false',
    taxId: cleanText(map.get('tax_id'), 40),
    receiptAddress: cleanText(map.get('receipt_address'), 120),
    receiptPhone: cleanText(map.get('receipt_phone'), 40),
    receiptFooter: cleanText(map.get('receipt_footer'), 120) || DEFAULT_REGIONAL.receiptFooter,
    paymentMethods: normalizePaymentMethods(map.get('payment_methods') ?? DEFAULT_PAYMENT_METHODS),
  }
}

/** Amounts are stored as whole major units; the locale decides grouping and symbol. */
export function formatMoney(amount: number, regional: RegionalSettings = DEFAULT_REGIONAL): string {
  const value = Number.isFinite(amount) ? amount : 0
  try {
    return new Intl.NumberFormat(regional.locale, {
      style: 'currency',
      currency: regional.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${regional.currency} ${Math.round(value).toLocaleString('en-US')}`
  }
}

export function formatNumber(value: number, regional: RegionalSettings = DEFAULT_REGIONAL): string {
  try {
    return new Intl.NumberFormat(regional.locale).format(Number.isFinite(value) ? value : 0)
  } catch {
    return String(value)
  }
}

export function formatDate(
  value: Date | string | number,
  regional: RegionalSettings = DEFAULT_REGIONAL,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat(regional.locale, { timeZone: regional.timeZone, ...options }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

export function formatDateTime(
  value: Date | string | number,
  regional: RegionalSettings = DEFAULT_REGIONAL,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
): string {
  return formatDate(value, regional, options)
}

export type TaxBreakdown = { subtotal: number; tax: number; total: number }

/**
 * Split a basket into net, tax and the amount actually charged.
 *
 * Inclusive tax is back-calculated out of the shelf price (the VAT-market norm); exclusive
 * tax is added on top. Both branches round once, at the end, and stay in whole units.
 */
export function taxBreakdown(subtotal: number, regional: RegionalSettings): TaxBreakdown {
  const net = Math.max(0, Math.round(subtotal))
  if (!regional.taxRateBps) return { subtotal: net, tax: 0, total: net }

  if (regional.taxInclusive) {
    const tax = Math.round((net * regional.taxRateBps) / (10000 + regional.taxRateBps))
    return { subtotal: net, tax, total: net }
  }

  const tax = Math.round((net * regional.taxRateBps) / 10000)
  return { subtotal: net, tax, total: net + tax }
}

/** Escape untrusted text before it is interpolated into a printable HTML document. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Neutralise spreadsheet formulas. Text beginning with =, +, -, @ or a control character is
 * executed as a formula by Excel and Sheets, so a product called `=cmd` must not travel raw.
 */
export function csvSafe(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const text = value instanceof Date
    ? value.toISOString()
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value)
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

const REGIONAL_STORAGE_KEY = 'barflow.regional'
const LEGACY_CURRENCY_KEY = 'barflow.currency'

/** Last known settings, so a reloaded till prints with the right symbol before any request. */
export function readCachedRegional(): RegionalSettings {
  if (typeof window === 'undefined') return DEFAULT_REGIONAL
  try {
    const raw = window.localStorage.getItem(REGIONAL_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RegionalSettings>
      return {
        ...DEFAULT_REGIONAL,
        ...parsed,
        currency: normalizeCurrency(parsed.currency) ?? DEFAULT_CURRENCY,
        locale: normalizeLocale(parsed.locale) ?? DEFAULT_LOCALE,
        timeZone: normalizeTimeZone(parsed.timeZone) ?? DEFAULT_TIME_ZONE,
      }
    }
    const legacy = normalizeCurrency(window.localStorage.getItem(LEGACY_CURRENCY_KEY))
    return legacy ? { ...DEFAULT_REGIONAL, currency: legacy } : DEFAULT_REGIONAL
  } catch {
    return DEFAULT_REGIONAL
  }
}

export function cacheRegional(regional: RegionalSettings): RegionalSettings {
  if (typeof window === 'undefined') return regional
  try {
    window.localStorage.setItem(REGIONAL_STORAGE_KEY, JSON.stringify(regional))
    window.localStorage.setItem(LEGACY_CURRENCY_KEY, regional.currency)
  } catch {
    // Storage can be disabled; the in-memory value still applies for this session.
  }
  return regional
}

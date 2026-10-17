export type BackendRole = 'Admin' | 'Manager' | 'Cashier' | 'Storekeeper'

export type PaymentMethod = 'cash' | 'mobile_money' | 'card'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://barflow-rk55.onrender.com'

export async function backendRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include', // sends Better Auth session cookie
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      body?.error?.message ??
      body?.detail ??
      (typeof body?.detail === 'string' ? body.detail : null) ??
      'Backend request failed'
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
  }

  return body as T
}

/** Generate a simple idempotency key for write operations */
function idempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export const backendApi = {
  // ─── Auth ───────────────────────────────────────────────
  me: () =>
    backendRequest<{ user_id: string; role: BackendRole }>('/auth/me'),

  verifyPin: (pin: string) =>
    backendRequest<{ valid: boolean }>('/v1/auth/verify-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  setPin: (pin: string) =>
    backendRequest<{ ok: boolean }>('/v1/auth/set-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  // ─── Sales ──────────────────────────────────────────────
  createSale: (payload: {
    payment_method: PaymentMethod
    items: { product_id: string; quantity: number; note?: string }[]
    payment_items?: { method: PaymentMethod; amount: number }[]
    tendered_amount?: number | null
    table_label?: string | null
    idempotency_key?: string
  }) =>
    backendRequest<{
      id: string
      receipt_number: number
      total: number
      payment_method: string
      change_due: number
      payment_items: { method: string; amount: number }[]
      status: string
    }>('/v1/sales', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        idempotency_key: payload.idempotency_key ?? idempotencyKey(),
      }),
    }),

  voidSale: (saleId: string, payload: { reason: string; pin?: string }) =>
    backendRequest(`/v1/sales/${saleId}/void`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  applyDiscount: (
    saleId: string,
    payload: { amount: number; reason: string; pin?: string }
  ) =>
    backendRequest(`/v1/sales/${saleId}/discount`, {
      method: 'POST',
      body: JSON.stringify({ sale_id: saleId, ...payload }),
    }),

  // ─── Tabs ───────────────────────────────────────────────
  listTabs: (status: 'open' | 'settled' | 'voided' | 'all' = 'open') =>
    backendRequest<{
      items: {
        id: string
        table_label: string
        owner_name: string
        total: number
        status: string
        opened_at: string
        settled_at: string | null
      }[]
    }>(`/v1/tabs?status=${status}`),

  createTab: (payload: { table_label: string; owner_name: string }) =>
    backendRequest('/v1/tabs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  addTabItem: (tabId: string, payload: { product_id: string; quantity: number }) =>
    backendRequest(`/v1/tabs/${tabId}/items`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateTabItem: (tabId: string, itemId: string, quantity: number) =>
    backendRequest(`/v1/tabs/${tabId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    }),

  removeTabItem: (tabId: string, itemId: string) =>
    backendRequest(`/v1/tabs/${tabId}/items/${itemId}`, {
      method: 'DELETE',
    }),

  settleTab: (
    tabId: string,
    payload: { payment_method: PaymentMethod; idempotency_key?: string }
  ) =>
    backendRequest(`/v1/tabs/${tabId}/settle`, {
      method: 'POST',
      body: JSON.stringify({
        payment_method: payload.payment_method,
        idempotency_key: payload.idempotency_key ?? idempotencyKey(),
      }),
    }),

  voidTab: (tabId: string, payload: { reason: string; pin?: string }) =>
    backendRequest(`/v1/tabs/${tabId}/void`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  reopenTab: (tabId: string, payload: { reason: string }) =>
    backendRequest(`/v1/tabs/${tabId}/reopen`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ─── Inventory / Products ───────────────────────────────
  inventory: (cursor?: string) =>
    backendRequest<{ items: any[]; next_cursor: string | null }>(
      `/v1/inventory${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`
    ),

  createDelivery: (payload: {
    supplier: string
    product_id: string
    quantity: number
    cost_price: number
    delivery_date: string
  }) =>
    backendRequest('/v1/stock/deliveries', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listDeliveries: () =>
    backendRequest<{ items: any[] }>('/v1/stock/deliveries'),

  createAdjustment: (payload: {
    product_id: string
    quantity: number
    adjustment_type: 'wastage' | 'adjustment'
    reason: string
  }) =>
    backendRequest('/v1/inventory/adjustments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  inventoryCounts: () =>
    backendRequest<{ items: any[] }>('/v1/inventory/counts'),

  inventoryAdjustments: () =>
    backendRequest<{ items: any[] }>('/v1/inventory/adjustments'),

  inventoryMovements: (productId?: string) =>
    backendRequest<{ items: any[] }>(
      `/v1/inventory/movements${productId ? `?product_id=${encodeURIComponent(productId)}` : ''}`
    ),

  inventoryVariance: () =>
    backendRequest<{ items: any[]; total_variance: number }>('/v1/inventory/variance'),

  createInventoryCount: (payload: {
    product_id: string
    counted_quantity: number
    notes?: string
  }) =>
    backendRequest('/v1/inventory/counts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ─── Day open / close ───────────────────────────────────
  openDay: (opening_float?: number) =>
    backendRequest('/v1/day-close', {
      method: 'POST',
      body: JSON.stringify({ action: 'open', opening_float: opening_float ?? 0 }),
    }),

  closeDay: (counted_cash: number) =>
    backendRequest('/v1/day-close', {
      method: 'POST',
      body: JSON.stringify({ action: 'close', counted_cash }),
    }),

  reopenDay: (payload: { reason: string; pin?: string }) =>
    backendRequest('/v1/day-reopen', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ─── Reports / Audit ────────────────────────────────────
  reports: (from?: string, to?: string) =>
    backendRequest<{
      orders: number
      total: number
      by_payment: unknown[]
      by_category?: unknown[]
      by_product?: unknown[]
    }>(
      `/v1/reports/summary${
        from || to
          ? `?from=${encodeURIComponent(from ?? '')}&to=${encodeURIComponent(to ?? '')}`
          : ''
      }`
    ),

  audit: () =>
    backendRequest<{ items: any[] }>('/v1/audit'),

  // ─── Settings ───────────────────────────────────────────
  listSettings: () =>
    backendRequest<{ items: { key: string; value: string }[] }>('/v1/settings'),

  upsertSetting: (key: string, value: string) =>
    backendRequest('/v1/settings', {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    }),
}
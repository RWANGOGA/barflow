export type BackendRole = 'Admin' | 'Manager' | 'Cashier' | 'Storekeeper'

export async function backendRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(body?.error?.message ?? body?.detail ?? 'Backend request failed')
  }
  return body as T
}

export const backendApi = {
  me: () => backendRequest<{ user_id: string; role: BackendRole }>('/auth/me'),
  inventory: (cursor?: string) => backendRequest<{ items: unknown[]; next_cursor: string | null }>(`/inventory${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  reports: () => backendRequest<{ orders: number; total: number; by_payment: unknown[] }>('/reports/summary'),
  audit: () => backendRequest<{ items: unknown[] }>('/audit'),
}

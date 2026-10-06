import {
  activityListSchema,
  adminMetricsSchema,
  adminStatsSchema,
  adminStorageSchema,
  adminTripDetailSchema,
  adminTripListSchema,
  adminUserDetailSchema,
  adminUserListSchema,
  appSettingsSchema,
  auditListSchema,
  quotaRequestListSchema,
  quotaRequestSchema,
  type AdminMetrics,
  type AdminStats,
  type AdminStorage,
  type AdminTripDetail,
  type AdminUserDetail,
  type AppSettings,
  type AuditEntry,
  type QuotaPatch,
  type QuotaRequest,
  type SettingsPatch,
} from '@tripboard/shared'

const MB = 1024 * 1024

export function bytesFromMb(mb: number): number {
  return Math.round(mb * MB)
}

export async function listAdminUsers(search: string, signal?: AbortSignal) {
  const response = await send(`/api/admin/users${search}`, { signal })
  if (!response.ok) throw new Error('load')
  return adminUserListSchema.parse(await response.json())
}

export async function getAdminUser(
  id: string,
  signal?: AbortSignal,
): Promise<AdminUserDetail> {
  const response = await send(`/api/admin/users/${id}`, { signal })
  if (response.status === 404) throw new Error('missing')
  if (!response.ok) throw new Error('load')
  return adminUserDetailSchema.parse(await response.json())
}

export async function patchQuota(id: string, body: QuotaPatch) {
  const response = await send(`/api/admin/users/${id}/quota`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error('save')
  return adminUserDetailSchema.shape.user.parse(await response.json())
}

export async function suspendUser(id: string, reason: string) {
  const response = await send(`/api/admin/users/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
  if (response.status === 400) throw new Error('self')
  if (response.status === 409) throw new Error('last_admin')
  if (!response.ok) throw new Error('save')
}

export async function unsuspendUser(id: string) {
  const response = await send(`/api/admin/users/${id}/unsuspend`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!response.ok) throw new Error('save')
}

export async function setAdminRole(id: string, appRole: 'user' | 'admin') {
  const response = await send(`/api/admin/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ appRole }),
  })
  if (response.status === 409) throw new Error('last_admin')
  if (!response.ok) throw new Error('save')
}

export async function logoutEverywhere(id: string) {
  const response = await send(`/api/admin/users/${id}/logout-all`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!response.ok) throw new Error('save')
}

export async function listAdminTrips(search: string, signal?: AbortSignal) {
  const response = await send(`/api/admin/trips${search}`, { signal })
  if (!response.ok) throw new Error('load')
  return adminTripListSchema.parse(await response.json())
}

export async function getAdminTrip(
  id: string,
  signal?: AbortSignal,
): Promise<AdminTripDetail> {
  const response = await send(`/api/admin/trips/${id}`, { signal })
  if (response.status === 404) throw new Error('missing')
  if (!response.ok) throw new Error('load')
  return adminTripDetailSchema.parse(await response.json())
}

export async function listQuotaRequests(signal?: AbortSignal) {
  const response = await send('/api/admin/quota-requests', { signal })
  if (!response.ok) throw new Error('load')
  return quotaRequestListSchema.parse(await response.json())
}

export async function pendingRequestCount(
  signal?: AbortSignal,
): Promise<number> {
  const response = await send('/api/admin/quota-requests?status=pending', {
    signal,
  })
  if (!response.ok) throw new Error('load')
  return quotaRequestListSchema.parse(await response.json()).pendingCount
}

export async function approveRequest(
  id: string,
  body: { images?: number; bytes?: number; note?: string },
) {
  const response = await send(`/api/admin/quota-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error('save')
}

export async function rejectRequest(id: string, note: string) {
  const response = await send(`/api/admin/quota-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
  if (!response.ok) throw new Error('save')
}

export async function getSettings(signal?: AbortSignal): Promise<AppSettings> {
  const response = await send('/api/admin/settings', { signal })
  if (!response.ok) throw new Error('load')
  return appSettingsSchema.parse(await response.json())
}

export async function saveSettings(body: SettingsPatch): Promise<AppSettings> {
  const response = await send('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error('save')
  return appSettingsSchema.parse(await response.json())
}

export async function listAudit(
  search: string,
  signal?: AbortSignal,
): Promise<{ entries: AuditEntry[]; nextCursor: string | null }> {
  const response = await send(`/api/admin/audit${search}`, { signal })
  if (!response.ok) throw new Error('load')
  return auditListSchema.parse(await response.json())
}

export async function listMyQuotaRequests(signal?: AbortSignal) {
  const response = await send('/api/me/quota-requests', { signal })
  if (!response.ok) throw new Error('load')
  return quotaRequestListSchema.parse(await response.json())
}

export async function createQuotaRequest(body: {
  images?: number
  bytes?: number
  message?: string
}): Promise<QuotaRequest> {
  const response = await send('/api/me/quota-requests', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (response.status === 400) throw new Error('invalid')
  if (response.status === 409) throw new Error('pending')
  if (!response.ok) throw new Error('save')
  return quotaRequestSchema.parse(await response.json())
}

export async function getStats(
  range: string,
  signal?: AbortSignal,
): Promise<AdminStats> {
  const response = await send(`/api/admin/stats?range=${range}`, { signal })
  if (!response.ok) throw new Error('load')
  return adminStatsSchema.parse(await response.json())
}

export async function getMetrics(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<AdminMetrics> {
  const response = await send(`/api/admin/metrics?from=${from}&to=${to}`, {
    signal,
  })
  if (!response.ok) throw new Error('load')
  return adminMetricsSchema.parse(await response.json())
}

export async function listActivity(search: string, signal?: AbortSignal) {
  const response = await send(`/api/admin/activity${search}`, { signal })
  if (!response.ok) throw new Error('load')
  return activityListSchema.parse(await response.json())
}

export function activityExportPath(search: string): string {
  return `/api/admin/activity/export${search}`
}

export async function getStorage(signal?: AbortSignal): Promise<AdminStorage> {
  const response = await send('/api/admin/storage', { signal })
  if (!response.ok) throw new Error('load')
  return adminStorageSchema.parse(await response.json())
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  return fetch(path, { ...init, headers, credentials: 'include' })
}

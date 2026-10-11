import {
  activityListSchema,
  adminMetricsSchema,
  adminStatsSchema,
  adminKindLimitRequestListSchema,
  adminKindLimitSchema,
  adminStorageSchema,
  adminTripDetailSchema,
  adminTripListSchema,
  adminUserDetailSchema,
  adminUserListSchema,
  appSettingsSchema,
  auditListSchema,
  quotaRequestListSchema,
  quotaRequestSchema,
  type AdminKindLimit,
  type AdminKindLimitRequestList,
  type AdminMetrics,
  type AdminStats,
  type AdminStorage,
  type AdminTripDetail,
  type AdminUserDetail,
  type AppSettings,
  type AuditEntry,
  type KindLimitPatch,
  type QuotaPatch,
  type QuotaRequest,
  type SettingsPatch,
} from '@tripboard/shared'
import { ApiError, request, requestJson } from '../api/http'

const MB = 1024 * 1024

export function bytesFromMb(mb: number): number {
  return Math.round(mb * MB)
}

/** Maps selected statuses to the short codes the admin screens translate. */
async function mapped<T>(
  run: () => Promise<T>,
  codes: Record<number, string>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ApiError && codes[error.status]) {
      throw new Error(codes[error.status])
    }
    throw error
  }
}

export async function listAdminUsers(search: string, signal?: AbortSignal) {
  return requestJson(`/api/admin/users${search}`, adminUserListSchema, {
    signal,
  })
}

export async function getAdminUser(
  id: string,
  signal?: AbortSignal,
): Promise<AdminUserDetail> {
  return requestJson(`/api/admin/users/${id}`, adminUserDetailSchema, {
    signal,
  })
}

export async function patchQuota(id: string, body: QuotaPatch) {
  return requestJson(
    `/api/admin/users/${id}/quota`,
    adminUserDetailSchema.shape.user,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
}

export async function suspendUser(id: string, reason: string) {
  await mapped(
    () =>
      request(`/api/admin/users/${id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    { 400: 'self', 409: 'last_admin' },
  )
}

export async function unsuspendUser(id: string) {
  await request(`/api/admin/users/${id}/unsuspend`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function setAdminRole(id: string, appRole: 'user' | 'admin') {
  await mapped(
    () =>
      request(`/api/admin/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ appRole }),
      }),
    { 409: 'last_admin' },
  )
}

export async function logoutEverywhere(id: string) {
  await request(`/api/admin/users/${id}/logout-all`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function listAdminTrips(search: string, signal?: AbortSignal) {
  return requestJson(`/api/admin/trips${search}`, adminTripListSchema, {
    signal,
  })
}

export async function getAdminTrip(
  id: string,
  signal?: AbortSignal,
): Promise<AdminTripDetail> {
  return requestJson(`/api/admin/trips/${id}`, adminTripDetailSchema, {
    signal,
  })
}

export async function listQuotaRequests(signal?: AbortSignal) {
  return requestJson('/api/admin/quota-requests', quotaRequestListSchema, {
    signal,
  })
}

/** Pending storage requests plus pending kind limit requests. */
export async function pendingRequestCount(
  signal?: AbortSignal,
): Promise<number> {
  const [storage, kinds] = await Promise.all([
    requestJson(
      '/api/admin/quota-requests?status=pending',
      quotaRequestListSchema,
      { signal },
    ),
    requestJson(
      '/api/admin/kind-limit-requests?status=pending',
      adminKindLimitRequestListSchema,
      { signal },
    ),
  ])
  return storage.pendingCount + kinds.pendingCount
}

export async function listKindLimitRequests(
  signal?: AbortSignal,
): Promise<AdminKindLimitRequestList> {
  return requestJson(
    '/api/admin/kind-limit-requests',
    adminKindLimitRequestListSchema,
    { signal },
  )
}

export async function approveKindLimitRequest(
  id: string,
  body: { maxKinds?: number; note?: string },
) {
  await request(`/api/admin/kind-limit-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function rejectKindLimitRequest(id: string, note: string) {
  await request(`/api/admin/kind-limit-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(note ? { note } : {}),
  })
}

export async function patchKindLimit(
  tripId: string,
  body: KindLimitPatch,
): Promise<AdminKindLimit> {
  return requestJson(
    `/api/admin/trips/${tripId}/kind-limit`,
    adminKindLimitSchema,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
}

export async function approveRequest(
  id: string,
  body: { images?: number; bytes?: number; note?: string },
) {
  await request(`/api/admin/quota-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function rejectRequest(id: string, note: string) {
  await request(`/api/admin/quota-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
}

export async function getSettings(signal?: AbortSignal): Promise<AppSettings> {
  return requestJson('/api/admin/settings', appSettingsSchema, { signal })
}

export async function saveSettings(body: SettingsPatch): Promise<AppSettings> {
  return requestJson('/api/admin/settings', appSettingsSchema, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function listAudit(
  search: string,
  signal?: AbortSignal,
): Promise<{ entries: AuditEntry[]; nextCursor: string | null }> {
  return requestJson(`/api/admin/audit${search}`, auditListSchema, { signal })
}

export async function listMyQuotaRequests(signal?: AbortSignal) {
  return requestJson('/api/me/quota-requests', quotaRequestListSchema, {
    signal,
  })
}

export async function createQuotaRequest(body: {
  images?: number
  bytes?: number
  message?: string
}): Promise<QuotaRequest> {
  return mapped(
    () =>
      requestJson('/api/me/quota-requests', quotaRequestSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    { 400: 'invalid', 409: 'pending' },
  )
}

export async function getStats(
  range: string,
  signal?: AbortSignal,
): Promise<AdminStats> {
  return requestJson(`/api/admin/stats?range=${range}`, adminStatsSchema, {
    signal,
  })
}

export async function getMetrics(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<AdminMetrics> {
  return requestJson(
    `/api/admin/metrics?from=${from}&to=${to}`,
    adminMetricsSchema,
    { signal },
  )
}

export async function listActivity(search: string, signal?: AbortSignal) {
  return requestJson(`/api/admin/activity${search}`, activityListSchema, {
    signal,
  })
}

export function activityExportPath(search: string): string {
  return `/api/admin/activity/export${search}`
}

export async function getOpenStreams(signal?: AbortSignal): Promise<number> {
  const response = await request('/api/admin/streams', { signal })
  const body = (await response.json()) as { openStreams?: unknown }
  return typeof body.openStreams === 'number' ? body.openStreams : 0
}

export async function getStorage(signal?: AbortSignal): Promise<AdminStorage> {
  return requestJson('/api/admin/storage', adminStorageSchema, { signal })
}

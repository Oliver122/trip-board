import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { spotsView, userQuotaUsage } from './schema.js'

export type SpotDisplay = {
  id: string
  displayCategory: 'kind' | 'planned' | 'home'
  planCount: number
}

export type UserQuota = {
  userId: string
  maxImages: number
  maxBytes: number
  hasOverride: boolean
  usedImages: number
  usedBytes: number
}

export async function getSpotDisplay(
  pool: Pool,
  spotId: string,
): Promise<SpotDisplay | null> {
  const db = drizzle(pool)
  const rows = await db
    .select({
      id: spotsView.id,
      displayCategory: spotsView.displayCategory,
      planCount: spotsView.planCount,
    })
    .from(spotsView)
    .where(eq(spotsView.id, spotId))
    .limit(1)
  return rows[0] ?? null
}

export async function getUserQuotaUsage(
  pool: Pool,
  userId: string,
): Promise<UserQuota | null> {
  const db = drizzle(pool)
  const rows = await db
    .select({
      userId: userQuotaUsage.userId,
      maxImages: userQuotaUsage.maxImages,
      maxBytes: userQuotaUsage.maxBytes,
      hasOverride: userQuotaUsage.hasOverride,
      usedImages: userQuotaUsage.usedImages,
      usedBytes: userQuotaUsage.usedBytes,
    })
    .from(userQuotaUsage)
    .where(eq(userQuotaUsage.userId, userId))
    .limit(1)
  return rows[0] ?? null
}

import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  pgView,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const tripRole = pgEnum('trip_role', ['owner', 'planner', 'visitor'])
export const spotCategory = pgEnum('spot_category', [
  'must_go',
  'maybe',
  'home',
])
export const displayCategory = pgEnum('display_category', [
  'must_go',
  'maybe',
  'planned',
  'home',
])
export const planEntryType = pgEnum('plan_entry_type', ['bucket', 'single'])
export const appLocale = pgEnum('app_locale', ['en', 'de'])
export const appRole = pgEnum('app_role', ['user', 'admin'])
export const requestStatus = pgEnum('request_status', [
  'pending',
  'approved',
  'rejected',
])

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
}

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    discordId: text('discord_id').notNull(),
    username: text('username').notNull(),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    locale: appLocale('locale').notNull().default('en'),
    appRole: appRole('app_role').notNull().default('user'),
    maxImages: integer('max_images'),
    maxBytes: bigint('max_bytes', { mode: 'number' }),
    suspendedAt: timestamp('suspended_at', {
      withTimezone: true,
      mode: 'date',
    }),
    suspendedReason: text('suspended_reason'),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    lastLoginAt: timestamp('last_login_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    unique('users_discord_id_key').on(table.discordId),
    check('users_discord_id_check', sql`${table.discordId} ~ '^[0-9]{5,25}$'`),
    check(
      'users_username_check',
      sql`char_length(${table.username}) BETWEEN 1 AND 64`,
    ),
    check(
      'users_display_name_check',
      sql`char_length(${table.displayName}) <= 64`,
    ),
    check('users_max_images_check', sql`${table.maxImages} >= 0`),
    check('users_max_bytes_check', sql`${table.maxBytes} >= 0`),
    check(
      'users_suspended_reason_check',
      sql`char_length(${table.suspendedReason}) <= 500`,
    ),
    index('users_created_at_idx').on(table.createdAt),
    index('users_last_seen_at_idx').on(table.lastSeenAt),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    userAgent: text('user_agent'),
  },
  (table) => [
    check('sessions_id_check', sql`${table.id} ~ '^[0-9a-f]{64}$'`),
    check(
      'sessions_expires_at_check',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
)

const spotsRef: { tripId?: AnyPgColumn; id?: AnyPgColumn } = {}

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    startDate: date('start_date'),
    endDate: date('end_date'),
    timezone: text('timezone').notNull().default('UTC'),
    bboxMinLng: doublePrecision('bbox_min_lng').notNull(),
    bboxMinLat: doublePrecision('bbox_min_lat').notNull(),
    bboxMaxLng: doublePrecision('bbox_max_lng').notNull(),
    bboxMaxLat: doublePrecision('bbox_max_lat').notNull(),
    primaryHomeSpotId: uuid('primary_home_spot_id'),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (table) => [
    check(
      'trips_name_check',
      sql`char_length(btrim(${table.name})) BETWEEN 1 AND 100`,
    ),
    check(
      'trips_timezone_check',
      sql`char_length(${table.timezone}) BETWEEN 1 AND 64`,
    ),
    check(
      'trips_bbox_min_lng_check',
      sql`${table.bboxMinLng} BETWEEN -180 AND 180`,
    ),
    check(
      'trips_bbox_min_lat_check',
      sql`${table.bboxMinLat} BETWEEN -90 AND 90`,
    ),
    check(
      'trips_bbox_max_lng_check',
      sql`${table.bboxMaxLng} BETWEEN -180 AND 180`,
    ),
    check(
      'trips_bbox_max_lat_check',
      sql`${table.bboxMaxLat} BETWEEN -90 AND 90`,
    ),
    check(
      'trips_dates_check',
      sql`${table.endDate} IS NULL OR ${table.startDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
    check(
      'trips_bbox_check',
      sql`${table.bboxMinLng} <= ${table.bboxMaxLng} AND ${table.bboxMinLat} <= ${table.bboxMaxLat}`,
    ),
    index('trips_created_by_idx').on(table.createdBy),
    foreignKey({
      name: 'trips_primary_home_fk',
      columns: [table.id, table.primaryHomeSpotId],
      foreignColumns: [spotsRef.tripId!, spotsRef.id!],
    }).onDelete('set null'),
  ],
)

export const tripInvites = pgTable(
  'trip_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    role: tripRole('role').notNull().default('visitor'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now() + interval '7 days'`),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    uses: integer('uses').notNull().default(0),
  },
  (table) => [
    unique('trip_invites_code_key').on(table.code),
    check(
      'trip_invites_code_check',
      sql`${table.code} ~ '^[A-Z0-9]{3}-[A-Z0-9]{4}$'`,
    ),
    check(
      'trip_invites_role_check',
      sql`${table.role} IN ('planner', 'visitor')`,
    ),
    check('trip_invites_uses_check', sql`${table.uses} >= 0`),
    check(
      'trip_invites_expires_at_check',
      sql`${table.expiresAt} > ${table.createdAt} AND ${table.expiresAt} <= ${table.createdAt} + interval '7 days'`,
    ),
    index('trip_invites_trip_id_idx').on(table.tripId),
  ],
)

export const tripMembers = pgTable(
  'trip_members',
  {
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: tripRole('role').notNull(),
    invitedVia: uuid('invited_via').references(() => tripInvites.id, {
      onDelete: 'set null',
    }),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tripId, table.userId] }),
    index('trip_members_user_id_idx').on(table.userId),
    uniqueIndex('trip_members_one_owner_idx')
      .on(table.tripId)
      .where(sql`${table.role} = 'owner'`),
  ],
)

export const spots = pgTable(
  'spots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    address: text('address'),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    baseCategory: spotCategory('base_category').notNull(),
    info: text('info'),
    link: text('link'),
    stayFrom: date('stay_from'),
    stayTo: date('stay_to'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (table) => [
    unique('spots_trip_id_id_key').on(table.tripId, table.id),
    check(
      'spots_title_check',
      sql`char_length(btrim(${table.title})) BETWEEN 1 AND 120`,
    ),
    check('spots_address_check', sql`char_length(${table.address}) <= 300`),
    check('spots_lat_check', sql`${table.lat} BETWEEN -90 AND 90`),
    check('spots_lng_check', sql`${table.lng} BETWEEN -180 AND 180`),
    check('spots_info_check', sql`char_length(${table.info}) <= 2000`),
    check(
      'spots_link_check',
      sql`${table.link} ~* '^https?://' AND char_length(${table.link}) <= 500`,
    ),
    check(
      'spots_stay_category_check',
      sql`${table.baseCategory} = 'home' OR (${table.stayFrom} IS NULL AND ${table.stayTo} IS NULL)`,
    ),
    check(
      'spots_stay_order_check',
      sql`${table.stayTo} IS NULL OR ${table.stayFrom} IS NULL OR ${table.stayTo} >= ${table.stayFrom}`,
    ),
    index('spots_trip_category_idx').on(table.tripId, table.baseCategory),
    index('spots_trip_location_idx').on(table.tripId, table.lat, table.lng),
    index('spots_created_by_idx').on(table.createdBy),
    index('spots_search_trgm_idx').using(
      'gin',
      sql`(lower(${table.title} || ' ' || coalesce(${table.address}, '') || ' ' || coalesce(${table.info}, ''))) gin_trgm_ops`,
    ),
  ],
)

spotsRef.tripId = spots.tripId
spotsRef.id = spots.id

export const planEntries = pgTable(
  'plan_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    type: planEntryType('type').notNull(),
    title: text('title').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    startTime: time('start_time'),
    endTime: time('end_time'),
    info: text('info'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (table) => [
    unique('plan_entries_trip_id_id_key').on(table.tripId, table.id),
    check(
      'plan_entries_title_check',
      sql`char_length(btrim(${table.title})) BETWEEN 1 AND 120`,
    ),
    check('plan_entries_info_check', sql`char_length(${table.info}) <= 2000`),
    check(
      'plan_entries_type_dates_check',
      sql`(${table.type} = 'single' AND (${table.endDate} IS NULL OR ${table.endDate} = ${table.startDate})) OR (${table.type} = 'bucket' AND ${table.endDate} IS NOT NULL AND ${table.endDate} >= ${table.startDate})`,
    ),
    check(
      'plan_entries_end_time_check',
      sql`${table.endTime} IS NULL OR ${table.startTime} IS NOT NULL`,
    ),
    check(
      'plan_entries_single_time_check',
      sql`${table.type} = 'bucket' OR ${table.endTime} IS NULL OR ${table.endTime} > ${table.startTime}`,
    ),
    index('plan_entries_trip_start_idx').on(
      table.tripId,
      table.startDate,
      table.startTime,
    ),
  ],
)

export const planEntrySpots = pgTable(
  'plan_entry_spots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id').notNull(),
    planEntryId: uuid('plan_entry_id').notNull(),
    spotId: uuid('spot_id').notNull(),
    visitDate: date('visit_date'),
    visitTime: time('visit_time'),
    info: text('info'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.tripId, table.planEntryId],
      foreignColumns: [planEntries.tripId, planEntries.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tripId, table.spotId],
      foreignColumns: [spots.tripId, spots.id],
    }).onDelete('cascade'),
    check(
      'plan_entry_spots_info_check',
      sql`char_length(${table.info}) <= 2000`,
    ),
    check(
      'plan_entry_spots_visit_time_check',
      sql`${table.visitTime} IS NULL OR ${table.visitDate} IS NOT NULL`,
    ),
    index('plan_entry_spots_entry_idx').on(table.planEntryId, table.sortOrder),
    index('plan_entry_spots_spot_idx').on(table.spotId),
  ],
)

export const images = pgTable(
  'images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id').notNull(),
    spotId: uuid('spot_id').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    storageKey: text('storage_key').notNull(),
    mime: text('mime').notNull().default('image/webp'),
    bytes: integer('bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('images_storage_key_key').on(table.storageKey),
    foreignKey({
      columns: [table.tripId, table.spotId],
      foreignColumns: [spots.tripId, spots.id],
    }).onDelete('cascade'),
    check('images_mime_check', sql`${table.mime} = 'image/webp'`),
    check('images_bytes_check', sql`${table.bytes} > 0`),
    check('images_width_check', sql`${table.width} BETWEEN 1 AND 2048`),
    check('images_height_check', sql`${table.height} BETWEEN 1 AND 2048`),
    index('images_spot_idx').on(table.spotId, table.sortOrder),
    index('images_uploaded_by_idx').on(table.uploadedBy),
  ],
)

export const spotComments = pgTable(
  'spot_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id').notNull(),
    spotId: uuid('spot_id').notNull(),
    authorId: uuid('author_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      columns: [table.tripId, table.spotId],
      foreignColumns: [spots.tripId, spots.id],
    }).onDelete('cascade'),
    check(
      'spot_comments_body_check',
      sql`char_length(btrim(${table.body})) BETWEEN 1 AND 2000`,
    ),
    index('spot_comments_spot_idx').on(table.spotId, table.createdAt, table.id),
    index('spot_comments_trip_time_idx').on(table.tripId, table.createdAt),
  ],
)

export const spotCommentReads = pgTable(
  'spot_comment_reads',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id').notNull(),
    spotId: uuid('spot_id').notNull(),
    lastReadAt: timestamp('last_read_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.spotId] }),
    foreignKey({
      columns: [table.tripId, table.spotId],
      foreignColumns: [spots.tripId, spots.id],
    }).onDelete('cascade'),
  ],
)

export const blobDeletions = pgTable('blob_deletions', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  storageKey: text('storage_key').notNull(),
  enqueuedAt: timestamp('enqueued_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
})

export const geocodeCache = pgTable(
  'geocode_cache',
  {
    queryKey: text('query_key').primaryKey(),
    response: jsonb('response').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('geocode_cache_created_at_idx').on(table.createdAt)],
)

export const appSettings = pgTable(
  'app_settings',
  {
    id: boolean('id').primaryKey().default(true),
    defaultMaxImages: integer('default_max_images').notNull().default(100),
    defaultMaxBytes: bigint('default_max_bytes', { mode: 'number' })
      .notNull()
      .default(209715200),
    dbCapacityBytes: bigint('db_capacity_bytes', { mode: 'number' })
      .notNull()
      .default(1073741824),
    blobCapacityBytes: bigint('blob_capacity_bytes', { mode: 'number' })
      .notNull()
      .default(10737418240),
    capacityWarnPct: integer('capacity_warn_pct').notNull().default(80),
    uploadsEnabled: boolean('uploads_enabled').notNull().default(true),
    signupsEnabled: boolean('signups_enabled').notNull().default(true),
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('app_settings_id_check', sql`${table.id}`),
    check(
      'app_settings_default_max_images_check',
      sql`${table.defaultMaxImages} >= 0`,
    ),
    check(
      'app_settings_default_max_bytes_check',
      sql`${table.defaultMaxBytes} >= 0`,
    ),
    check(
      'app_settings_db_capacity_bytes_check',
      sql`${table.dbCapacityBytes} > 0`,
    ),
    check(
      'app_settings_blob_capacity_bytes_check',
      sql`${table.blobCapacityBytes} > 0`,
    ),
    check(
      'app_settings_capacity_warn_pct_check',
      sql`${table.capacityWarnPct} BETWEEN 1 AND 100`,
    ),
  ],
)

export const activityEvents = pgTable(
  'activity_events',
  {
    id: bigint('id', { mode: 'number' })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    tripId: uuid('trip_id').references(() => trips.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'activity_events_action_check',
      sql`${table.action} ~ '^[a-z_]+\\.[a-z_]+$'`,
    ),
    index('activity_events_created_at_idx').on(table.createdAt.desc()),
    index('activity_events_actor_idx').on(
      table.actorId,
      table.createdAt.desc(),
    ),
    index('activity_events_trip_idx').on(table.tripId, table.createdAt.desc()),
    index('activity_events_action_idx').on(
      table.action,
      table.createdAt.desc(),
    ),
  ],
)

export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: bigint('id', { mode: 'number' })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    adminId: uuid('admin_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    targetUserId: uuid('target_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    targetTripId: uuid('target_trip_id').references(() => trips.id, {
      onDelete: 'set null',
    }),
    before: jsonb('before'),
    after: jsonb('after'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'admin_audit_log_action_check',
      sql`${table.action} ~ '^[a-z_]+\\.[a-z_]+$'`,
    ),
    check(
      'admin_audit_log_reason_check',
      sql`char_length(${table.reason}) <= 500`,
    ),
    index('admin_audit_log_created_at_idx').on(table.createdAt.desc()),
    index('admin_audit_log_target_idx').on(
      table.targetUserId,
      table.createdAt.desc(),
    ),
  ],
)

export const quotaRequests = pgTable(
  'quota_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    requestedImages: integer('requested_images'),
    requestedBytes: bigint('requested_bytes', { mode: 'number' }),
    message: text('message'),
    status: requestStatus('status').notNull().default('pending'),
    decidedBy: uuid('decided_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    decisionNote: text('decision_note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'quota_requests_requested_images_check',
      sql`${table.requestedImages} > 0`,
    ),
    check(
      'quota_requests_requested_bytes_check',
      sql`${table.requestedBytes} > 0`,
    ),
    check(
      'quota_requests_message_check',
      sql`char_length(${table.message}) <= 500`,
    ),
    check(
      'quota_requests_decision_note_check',
      sql`char_length(${table.decisionNote}) <= 500`,
    ),
    check(
      'quota_requests_ask_check',
      sql`${table.requestedImages} IS NOT NULL OR ${table.requestedBytes} IS NOT NULL`,
    ),
    check(
      'quota_requests_decided_at_check',
      sql`(${table.status} = 'pending') = (${table.decidedAt} IS NULL)`,
    ),
    uniqueIndex('quota_requests_one_pending_idx')
      .on(table.userId)
      .where(sql`${table.status} = 'pending'`),
    index('quota_requests_status_idx').on(table.status, table.createdAt),
  ],
)

export const webhookNotices = pgTable('webhook_notices', {
  kind: text('kind').primaryKey(),
  sentOn: date('sent_on').notNull(),
})

export const metricsDaily = pgTable('metrics_daily', {
  day: date('day').primaryKey(),
  usersTotal: integer('users_total').notNull(),
  usersNew: integer('users_new').notNull(),
  usersActive: integer('users_active').notNull(),
  tripsTotal: integer('trips_total').notNull(),
  spotsTotal: integer('spots_total').notNull(),
  planEntriesTotal: integer('plan_entries_total').notNull(),
  imagesTotal: integer('images_total').notNull(),
  imageBytesTotal: bigint('image_bytes_total', { mode: 'number' }).notNull(),
  dbBytes: bigint('db_bytes', { mode: 'number' }).notNull(),
  eventsTotal: integer('events_total').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
})

export const spotsView = pgView('spots_view', {
  id: uuid('id').notNull(),
  tripId: uuid('trip_id').notNull(),
  title: text('title').notNull(),
  baseCategory: spotCategory('base_category').notNull(),
  displayCategory: displayCategory('display_category').notNull(),
  planCount: integer('plan_count').notNull(),
}).existing()

export const userQuotaUsage = pgView('user_quota_usage', {
  userId: uuid('user_id').notNull(),
  maxImages: integer('max_images').notNull(),
  maxBytes: bigint('max_bytes', { mode: 'number' }).notNull(),
  hasOverride: boolean('has_override').notNull(),
  usedImages: integer('used_images').notNull(),
  usedBytes: bigint('used_bytes', { mode: 'number' }).notNull(),
}).existing()

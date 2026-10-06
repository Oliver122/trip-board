import { z } from 'zod'
import { defaultApiPort } from '@tripboard/shared'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(defaultApiPort),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  WEB_ORIGIN: z.string().url().default('http://127.0.0.1:5180'),
  DISCORD_CLIENT_ID: z.string().min(1).default('dev-client'),
  DISCORD_CLIENT_SECRET: z.string().min(1).default('dev-secret'),
  AUTH_SECRET: z.string().min(16).default('dev-auth-secret-00'),
  DISCORD_REDIRECT_URI: z.string().url().optional(),
  DISCORD_API_ORIGIN: z.string().url().default('https://discord.com'),
  ADMIN_DISCORD_IDS: z.string().default(''),
  ADMIN_DISCORD_WEBHOOK_URL: z
    .union([z.string().url(), z.literal('')])
    .default(''),
  NOMINATIM_BASE_URL: z
    .string()
    .url()
    .default('https://nominatim.openstreetmap.org'),
  NOMINATIM_USER_AGENT: z
    .string()
    .min(1)
    .default('TripBoard/0.1 (local development)'),
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_BUCKET: z.string().min(1).default('tripboard'),
  S3_ACCESS_KEY: z.string().min(1).default('tripboard'),
  S3_SECRET_KEY: z.string().min(1).default('tripboard-secret'),
  S3_REGION: z.string().min(1).default('us-east-1'),
})

type EnvConfig = z.infer<typeof envSchema>

export type AppConfig = EnvConfig & {
  discordRedirectUri: string
  adminDiscordIds: readonly string[]
}

const productionSettings = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'AUTH_SECRET',
  'WEB_ORIGIN',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
] as const

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    const missing = result.error.issues
      .filter(
        (issue) => issue.code === 'invalid_type' || issue.code === 'too_small',
      )
      .map((issue) => issue.path.join('.'))
      .filter((name) => name.length > 0)

    const names = missing.length > 0 ? missing : ['DATABASE_URL']
    throw new Error(
      `Missing required environment variables: ${names.join(', ')}. Copy .env.example to .env and set them.`,
    )
  }

  if (result.data.NODE_ENV === 'production') {
    const missing = productionSettings.filter((name) => {
      const value = env[name]
      return typeof value !== 'string' || value.trim() === ''
    })
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and set them.`,
      )
    }
  }

  const adminDiscordIds = result.data.ADMIN_DISCORD_IDS.split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)

  return {
    ...result.data,
    discordRedirectUri:
      result.data.DISCORD_REDIRECT_URI ??
      `${result.data.WEB_ORIGIN}/api/auth/discord/callback`,
    adminDiscordIds,
  }
}

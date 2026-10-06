import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { repoRoot } from './paths.js'

type CommandResult = {
  stdout: string
  stderr: string
}

export async function runPsqlFile(
  databaseUrl: string,
  filePath: string,
): Promise<CommandResult> {
  const { database, user, password, host, port } = parseDatabaseUrl(databaseUrl)
  const args = [
    '-v',
    'ON_ERROR_STOP=1',
    '-h',
    host,
    '-p',
    port,
    '-U',
    user,
    '-d',
    database,
    '-f',
    filePath,
  ]
  try {
    return await run('psql', args, {
      env: {
        ...process.env,
        PGPASSWORD: password,
        PGOPTIONS: '-c lc_messages=C',
      },
    })
  } catch (error) {
    if (!isMissingCommand(error)) throw error
  }

  return run(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      user,
      '-d',
      database,
    ],
    { cwd: repoRoot, input: readFileSync(filePath) },
  )
}

export async function dumpSchema(databaseUrl: string): Promise<string> {
  const { database, user, password, host, port } = parseDatabaseUrl(databaseUrl)
  const args = [
    '--schema-only',
    '--no-owner',
    '--no-privileges',
    '--no-comments',
    '--exclude-schema=drizzle',
    '-h',
    host,
    '-p',
    port,
    '-U',
    user,
    database,
  ]
  try {
    const result = await run('pg_dump', args, {
      env: { ...process.env, PGPASSWORD: password },
    })
    return result.stdout
  } catch (error) {
    if (!isMissingCommand(error)) throw error
  }

  const result = await run(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'pg_dump',
      '--schema-only',
      '--no-owner',
      '--no-privileges',
      '--no-comments',
      '--exclude-schema=drizzle',
      '-U',
      user,
      database,
    ],
    { cwd: repoRoot },
  )
  return result.stdout
}

export function normalizeSchemaDump(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim()
      if (!trimmed) return false
      if (trimmed.startsWith('--')) return false
      if (trimmed.startsWith('\\')) return false
      if (trimmed.startsWith('SET ')) return false
      if (trimmed.startsWith('SELECT pg_catalog.set_config')) return false
      if (trimmed.includes('drizzle')) return false
      return true
    })
    .join('\n')
}

function parseDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl)
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!database) throw new Error('DATABASE_URL is missing a database name')
  return {
    database,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    host: url.hostname,
    port: url.port || '5432',
  }
}

function isMissingCommand(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

function run(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string; input?: Buffer },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }
      if (code === 0) {
        resolve(result)
        return
      }
      const error = new Error(
        `${command} exited ${code}\n${result.stderr || result.stdout}`,
      )
      reject(error)
    })
    if (options.input) child.stdin.end(options.input)
    else child.stdin.end()
  })
}

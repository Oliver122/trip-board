import { execFile } from 'node:child_process'
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { repoRoot } from './db/paths.js'

const execFileAsync = promisify(execFile)

// Drop inherited GIT_* variables: under a hook or `git rebase -x`, GIT_DIR
// would point every git call here at the real repository.
const gitEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  ),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

type Run = { code: number; stdout: Buffer; stderr: string }

async function run(
  file: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = gitEnv,
): Promise<Run> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      cwd,
      env,
      encoding: 'buffer',
    })
    return { code: 0, stdout, stderr: stderr.toString() }
  } catch (error) {
    const failed = error as { code?: number; stdout: Buffer; stderr: Buffer }
    return {
      code: failed.code ?? 1,
      stdout: failed.stdout,
      stderr: failed.stderr.toString(),
    }
  }
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: gitEnv })
  return stdout.trim()
}

async function makeRepo(withDeploy = false): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tb-archive-'))
  await git(dir, 'init', '-q', '-b', 'main')
  await git(dir, 'config', 'user.email', 'test@example.com')
  await git(dir, 'config', 'user.name', 'Test')
  await mkdir(join(dir, 'scripts'))
  await copyFile(
    join(repoRoot, 'scripts/deploy-archive.sh'),
    join(dir, 'scripts/deploy-archive.sh'),
  )
  if (withDeploy) {
    await copyFile(
      join(repoRoot, 'scripts/deploy.sh'),
      join(dir, 'scripts/deploy.sh'),
    )
  }
  await writeFile(join(dir, '.gitignore'), '.env\nnode_modules\n')
  await writeFile(join(dir, 'app.txt'), 'one\n')
  await git(dir, 'add', '-A')
  await git(dir, 'commit', '-q', '-m', 'Initial commit')
  return dir
}

const archiveScript = (dir: string) => join(dir, 'scripts/deploy-archive.sh')

async function entries(dir: string, stream: Buffer): Promise<string[]> {
  const file = join(dir, '..', `${dir.split('/').pop()}.tar`)
  await writeFile(file, stream)
  try {
    const { stdout } = await execFileAsync('tar', ['-tf', file], { cwd: dir })
    return stdout
      .split('\n')
      .map((name) => name.replace(/^\.\//, ''))
      .filter((name) => name !== '' && name !== '.' && !name.endsWith('/'))
      .sort()
  } finally {
    await rm(file, { force: true })
  }
}

describe('deploy archive', () => {
  it('T-39-03 refuses a dirty tracked tree before writing anything and ignores untracked files', async () => {
    const dir = await makeRepo()
    try {
      await writeFile(join(dir, 'app.txt'), 'two\n')
      await writeFile(join(dir, 'new.txt'), 'new\n')
      await git(dir, 'add', 'new.txt')

      const refused = await run('bash', [archiveScript(dir)], dir)
      expect(refused.code).toBe(1)
      expect(refused.stdout.length).toBe(0)
      expect(refused.stderr).toContain(
        'Refusing to deploy: 2 uncommitted change(s). Commit or stash them first.',
      )
      expect(refused.stderr).toContain('app.txt')
      expect(refused.stderr).toContain('new.txt')

      await git(dir, 'reset', '-q', '--hard')
      await writeFile(join(dir, 'new.txt'), 'untracked\n')
      const clean = await run('bash', [archiveScript(dir)], dir)
      expect(clean.code).toBe(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('T-39-04 streams the committed files plus REVISION and nothing untracked or ignored', async () => {
    const dir = await makeRepo()
    try {
      await writeFile(join(dir, 'deploy.env'), 'DEPLOY_HOST=x\n')
      await writeFile(join(dir, '.env'), 'SECRET=1\n')
      await mkdir(join(dir, 'node_modules'))
      await writeFile(join(dir, 'node_modules/x'), 'x\n')

      const result = await run('bash', [archiveScript(dir)], dir)
      expect(result.code).toBe(0)

      const committed = (await git(dir, 'ls-files')).split('\n')
      expect(await entries(dir, result.stdout)).toEqual(
        [...committed, 'REVISION'].sort(),
      )

      const file = join(dir, '..', `${dir.split('/').pop()}-rev.tar`)
      await writeFile(file, result.stdout)
      try {
        const { stdout } = await execFileAsync(
          'tar',
          ['-xOf', file, 'REVISION'],
          {
            cwd: dir,
          },
        ).catch(() =>
          execFileAsync('tar', ['-xOf', file, './REVISION'], { cwd: dir }),
        )
        expect(stdout).toBe(`${await git(dir, 'rev-parse', 'HEAD')}\n`)
      } finally {
        await rm(file, { force: true })
      }

      const short = await git(dir, 'log', '-1', '--format=%h')
      expect(result.stderr).toContain(`Deploying ${short} Initial commit`)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('T-39-05 warns when HEAD is not on origin/main and stays quiet once it is', async () => {
    const dir = await makeRepo()
    const bare = await mkdtemp(join(tmpdir(), 'tb-archive-bare-'))
    try {
      const short = await git(dir, 'log', '-1', '--format=%h')
      const warned = await run('bash', [archiveScript(dir)], dir)
      expect(warned.code).toBe(0)
      expect(warned.stderr).toContain(
        `Warning: ${short} is not on origin/main; CI has not checked it.`,
      )

      await git(bare, 'init', '-q', '--bare')
      await git(dir, 'remote', 'add', 'origin', bare)
      await git(dir, 'push', '-q', 'origin', 'HEAD:main')
      await git(dir, 'fetch', '-q', 'origin')
      const quiet = await run('bash', [archiveScript(dir)], dir)
      expect(quiet.code).toBe(0)
      expect(quiet.stderr).not.toContain('Warning:')
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(bare, { recursive: true, force: true })
    }
  })

  it('T-39-06 deploy.sh stops on a dirty tree before reading deploy.env or calling ssh', async () => {
    const dir = await makeRepo(true)
    const bin = await mkdtemp(join(tmpdir(), 'tb-archive-bin-'))
    try {
      const marker = join(bin, 'ssh-called')
      const ssh = join(bin, 'ssh')
      await writeFile(ssh, `#!/bin/sh\ntouch ${marker}\n`)
      await chmod(ssh, 0o755)
      await writeFile(join(dir, 'app.txt'), 'changed\n')

      const env: NodeJS.ProcessEnv = {
        ...gitEnv,
        PATH: `${bin}:${process.env.PATH}`,
      }
      delete env.DEPLOY_ENV
      const result = await run(
        'bash',
        [join(dir, 'scripts/deploy.sh')],
        dir,
        env,
      )
      expect(result.code).toBe(1)
      expect(result.stderr).toContain(
        'Refusing to deploy: 1 uncommitted change(s)',
      )
      expect(result.stderr).not.toContain('Missing ')
      await expect(stat(marker)).rejects.toThrow()

      const source = await readFile(join(repoRoot, 'scripts/deploy.sh'), 'utf8')
      expect(source).not.toContain('tar -C "$root" -cf')
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(bin, { recursive: true, force: true })
    }
  })
})

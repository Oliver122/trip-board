import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/api')
const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
  cwd: apiDir,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test' },
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal)
  })
}

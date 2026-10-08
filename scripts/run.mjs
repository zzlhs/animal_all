import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'dotenv'

export const root = fileURLToPath(new URL('../', import.meta.url))
const explicit = { ...process.env }
for (const file of ['.env', '.env.local']) {
  const path = new URL(`../${file}`, import.meta.url)
  if (existsSync(path)) Object.assign(process.env, parse(readFileSync(path)))
}
Object.assign(process.env, explicit)
process.env.GBIF_PROJECT_ROOT = root
export function run(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: root, env: process.env, stdio: 'inherit', ...options })
    const interrupt = () => child.kill('SIGINT')
    const terminate = () => child.kill('SIGTERM')
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', terminate)
    child.once('close', () => {
      process.off('SIGINT', interrupt)
      process.off('SIGTERM', terminate)
    })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${binary} exited with ${code}`)))
  })
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [target, command, ...args] = process.argv.slice(2)
  const workspace = { web: 'apps/web', worker: 'apps/worker', db: 'packages/db' }[target]
  if (!workspace || !command) throw new Error('Usage: node scripts/run.mjs web|worker|db command [arguments]')
  await run(process.execPath, [process.env.npm_execpath, 'run', command, '--workspace', workspace, ...(args.length ? ['--', ...args] : [])])
}

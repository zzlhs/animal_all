import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptsDir, '..')
const source = path.join(projectDir, 'worker', 'index.js')
const targetDir = path.join(projectDir, 'dist', 'server')

await fs.mkdir(targetDir, { recursive: true })
await fs.copyFile(source, path.join(targetDir, 'index.js'))

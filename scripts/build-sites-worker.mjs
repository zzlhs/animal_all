import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptsDir, '..')
const source = path.join(projectDir, 'worker', 'index.js')
const targetDir = path.join(projectDir, 'dist', 'server')
const sharedSourceDir = path.join(projectDir, 'shared')
const sharedTargetDir = path.join(projectDir, 'dist', 'shared')

await fs.mkdir(targetDir, { recursive: true })
await fs.copyFile(source, path.join(targetDir, 'index.js'))
await fs.mkdir(sharedTargetDir, { recursive: true })
await fs.copyFile(path.join(sharedSourceDir, 'audioProxy.constants.js'), path.join(sharedTargetDir, 'audioProxy.constants.js'))
await fs.copyFile(path.join(sharedSourceDir, 'audioProxy.js'), path.join(sharedTargetDir, 'audioProxy.js'))

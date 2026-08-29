import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const FrontendRuntimeConstants = Object.freeze({
  NODE_VERSION: '22.13.1',
  COMMANDS: Object.freeze(['build', 'dev', 'install', 'preview', 'start', 'test']),
})

const command = process.argv[2]
if (!FrontendRuntimeConstants.COMMANDS.includes(command)) {
  throw new Error(`Unsupported frontend command: ${command || 'missing'}`)
}

const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Run this helper through an npm script so npm_execpath is available')

const passthroughArguments = process.argv.slice(3)
const argumentsList = [
  '--yes',
  `--package=node@${FrontendRuntimeConstants.NODE_VERSION}`,
  'node',
  npmCli,
  '--prefix',
  resolve('frontend'),
  command === 'install' ? 'install' : 'run',
  ...(command === 'install' ? [] : [command]),
  ...(passthroughArguments.length ? ['--', ...passthroughArguments] : []),
]

const childEnvironment = { ...process.env }
delete childEnvironment.npm_config_call
delete childEnvironment.npm_config_package

const child = spawn('npx', argumentsList, { env: childEnvironment, stdio: 'inherit' })
child.once('error', error => {
  console.error(error)
  process.exitCode = 1
})
child.once('exit', code => {
  process.exitCode = code ?? 1
})

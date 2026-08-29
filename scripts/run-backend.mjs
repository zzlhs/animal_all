import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const BackendRuntimeConstants = Object.freeze({
  NODE_VERSION: '20.19.5',
  COMMANDS: Object.freeze(['build', 'dev', 'install', 'test', 'typecheck']),
})

const command = process.argv[2]
if (!BackendRuntimeConstants.COMMANDS.includes(command)) {
  throw new Error(`Unsupported backend command: ${command || 'missing'}`)
}

const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Run this helper through an npm script so npm_execpath is available')

const passthroughArguments = process.argv.slice(3)
const argumentsList = [
  '--yes',
  `--package=node@${BackendRuntimeConstants.NODE_VERSION}`,
  'node',
  npmCli,
  '--prefix',
  resolve('backend'),
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

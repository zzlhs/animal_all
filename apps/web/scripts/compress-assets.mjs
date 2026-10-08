import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { brotliCompress, gzip, constants } from 'node:zlib'
const brotli = promisify(brotliCompress), gz = promisify(gzip)
const directory = resolve('dist/client/assets')
let originalBytes = 0, compressedBytes = 0
for (const file of await readdir(directory)) {
  if (!/\.(js|css|json|svg)$/.test(file)) continue
  const input = await readFile(resolve(directory, file))
  if (input.length < 1024) continue
  const [br, zip] = await Promise.all([brotli(input, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }), gz(input, { level: 9 })])
  await Promise.all([writeFile(resolve(directory, file + '.br'), br), writeFile(resolve(directory, file + '.gz'), zip)])
  originalBytes += input.length; compressedBytes += br.length
}
console.log(`Static assets: ${(originalBytes / 1048576).toFixed(2)} MiB → ${(compressedBytes / 1048576).toFixed(2)} MiB Brotli`)

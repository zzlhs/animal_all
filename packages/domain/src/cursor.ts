import { createHash } from 'node:crypto'
import { cursorSchema, type CursorPayload } from '@gbif-globe/contracts'

export function computeScopeHash(scopeParts: (string | number | boolean | undefined | null)[]): string {
  const norm = JSON.stringify(scopeParts.map(p => p ?? null))
  return createHash('sha256').update(norm).digest('hex')
}

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload)
  return Buffer.from(json, 'utf8').toString('base64url')
}

export function decodeCursor(cursorString: string, expectedScopeHash?: string): CursorPayload {
  try {
    const raw = Buffer.from(cursorString, 'base64url').toString('utf8')
    const parsed = cursorSchema.parse(JSON.parse(raw))
    if (expectedScopeHash && parsed.scopeHash !== expectedScopeHash) {
      throw new Error('Cursor does not match query scope')
    }
    return parsed
  } catch (err) {
    throw new Error(`Invalid cursor: ${(err as Error).message}`)
  }
}

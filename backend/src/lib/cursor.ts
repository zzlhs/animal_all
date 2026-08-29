export interface PageCursor {
  id: string
}

export function encodeCursor(cursor: PageCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeCursor(value: string | undefined): PageCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<PageCursor>
    return typeof parsed.id === 'string' && /^\d+$/.test(parsed.id) ? { id: parsed.id } : null
  } catch {
    return null
  }
}

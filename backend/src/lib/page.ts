import { ApiConstants } from '../config/api.constants.js'

export function normalizePageSize(value: unknown) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return ApiConstants.DEFAULT_PAGE_SIZE
  return Math.min(parsed, ApiConstants.MAX_PAGE_SIZE)
}

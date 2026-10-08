import { z } from 'zod'
import { FilterConstants } from './constants.js'

export const bigintIdSchema = z.string().regex(/^\d+$/).refine(value => /^\d+$/.test(value) && value.length <= 19 && BigInt(value) > 0n && BigInt(value) <= 9223372036854775807n, 'ID is outside PostgreSQL BIGINT range')

export const cursorSchema = z.object({
  v: z.literal(2),
  revision: z.string().uuid(),
  scopeHash: z.string().regex(/^[a-f0-9]{64}$/),
  order: z.enum(['gbifId:asc', 'speciesKey:asc']),
  lastId: bigintIdSchema,
})

export const occurrenceParamsSchema = z.object({
  gbifId: bigintIdSchema,
})

export const cellOccurrencesParamsSchema = z.object({
  resolution: z.coerce.number().int().min(2).max(8),
  cellId: z.string().regex(/^[0-9a-fA-F]+$/, 'Cell ID must be a hex H3 string'),
})

export const coordinateOccurrencesParamsSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
})

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  filter: z.enum(FilterConstants.FILTERS).optional(),
  speciesKey: bigintIdSchema.optional(),
  unknownSpecies: z.enum(['true']).optional().transform(value => value === 'true'),
  revision: z.string().uuid().optional(),
})

export const metaQuerySchema = z.object({
  revision: z.string().uuid().optional(),
})

export const audioProxyQuerySchema = z.object({
  url: z.string().url(),
})

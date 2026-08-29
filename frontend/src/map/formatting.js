import { localeFor, normalizeLanguage } from '../i18n.js'

const CJK_TEXT = /[\u3400-\u9fff\uf900-\ufaff]/
const LOCATION_SPLIT = /[,，;；]+/
const regionNamesByLocale = new Map()

function countryName(countryCode, language) {
  if (!countryCode) return ''
  try {
    const locale = localeFor(language)
    if (!regionNamesByLocale.has(locale) && typeof Intl !== 'undefined' && Intl.DisplayNames) {
      regionNamesByLocale.set(locale, new Intl.DisplayNames([locale], { type: 'region' }))
    }
    return regionNamesByLocale.get(locale)?.of(countryCode) || countryCode
  } catch {
    return countryCode
  }
}

function normalizePart(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function addPart(parts, value, keepCjk) {
  const part = normalizePart(value)
  if (!part || (!keepCjk && CJK_TEXT.test(part)) || parts.includes(part)) return
  parts.push(part)
}

export function formatLocation(record, language = 'en') {
  const keepCjk = normalizeLanguage(language) === 'zh'
  const parts = []
  for (const part of String(record.locality || '').split(LOCATION_SPLIT)) addPart(parts, part, keepCjk)
  addPart(parts, record.stateProvince, keepCjk)

  const country = countryName(record.countryCode, language) || normalizePart(record.country)
  if (country && !parts.includes(country)) parts.push(country)
  return parts.slice(0, 3).join(keepCjk ? '，' : ', ') || country || (keepCjk ? '位置未知' : 'Location unavailable')
}

export function formatEnglishLocation(record) {
  return formatLocation(record, 'en')
}

export function formatEventDate(value, language = 'en') {
  if (!value) return ''
  const normalized = value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(localeFor(language), { dateStyle: 'medium' }).format(parsed)
}

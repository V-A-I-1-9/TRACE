import type { CaptureResponse } from '../validation/gemini'

export function captureText(text: string, source: string): CaptureResponse {
  const lines = text
    .trim()
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const travel = /\b(ticket|boarding pass|itinerary|bus booking|destination)\b/i.test(text)
  const coupon = /\b(coupon|voucher|promo code)\b/i.test(text)
  const entities: CaptureResponse['entities'] = []
  for (const line of lines) {
    const location = line.match(/^(origin|from|destination|to)\s*:\s*(.{1,80})$/i)
    if (location)
      entities.push({
        name: location[2],
        type: 'LOCATION',
        relationship: /origin|from/i.test(location[1]) ? 'origin' : 'destination',
      })
    const brand = line.match(/^(?:merchant|brand|store)\s*:\s*(.{1,80})$/i)
    if (brand) entities.push({ name: brand[1], type: 'ORGANIZATION', relationship: 'merchant' })
  }
  const merchantHeading = lines[0]?.match(/^(.{2,50}?)\s+(?:store reward|coupon|voucher|rewards?)$/i)
  if (coupon && merchantHeading && !entities.some((e) => e.relationship === 'merchant')) {
    entities.push({ name: merchantHeading[1], type: 'ORGANIZATION', relationship: 'merchant' })
  }
  const destination = entities.find((e) => e.relationship === 'destination')
  const departure = lines
    .find((line) => /^departure(?: date)?\s*:/i.test(line))
    ?.split(':')
    .slice(1)
    .join(':')
    .trim()
  // Only parse an unambiguous, fully specified calendar date; preserve other formats verbatim in claims.
  const eventDate = departure ? parseDeparture(departure) : null
  return {
    title: lines[0]?.slice(0, 100) || 'Text note',
    summary: text.slice(0, 1200),
    category: travel ? 'Travel' : coupon ? 'Shopping' : 'Note',
    event_date: eventDate,
    entities,
    events:
      destination && eventDate
        ? [
            {
              title: 'Travel to ' + destination.name,
              event_type: 'TRAVEL',
              event_date: eventDate,
              due_date: null,
              priority: 'MEDIUM',
            },
          ]
        : [],
    claims: lines
      .flatMap((line) => line.match(/[\s\S]{1,600}/g) || [])
      .map((claim_text) => ({
        claim_text,
        provenance_status: 'OBSERVED',
        source_reference: source,
      })),
  }
}

function parseDeparture(value: string) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const named = /^(\d{1,2}) ([a-z]{3,9}) (\d{4})$/i.exec(value)
  if (!iso && !named) return null
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ]
  const month = named?.[2].toLowerCase()
  const y = iso ? Number(iso[1]) : Number(named![3])
  const m = iso
    ? Number(iso[2])
    : months.findIndex((name) => name === month || name.slice(0, 3) === month) + 1
  const d = Number(iso ? iso[3] : named![1])
  const expected = [String(y).padStart(4, '0'), String(m).padStart(2, '0'), String(d).padStart(2, '0')].join(
    '-',
  )
  const utc = new Date(expected + 'T00:00:00Z')
  if (!Number.isFinite(utc.getTime()) || !utc.toISOString().startsWith(expected + 'T')) return null
  return new Date(expected + 'T00:00:00+05:30').toISOString()
}

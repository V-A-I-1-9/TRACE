import type { AskResponse } from '../validation/gemini-ask'

export interface MemoryEvidence {
  memory_id: string
  title: string
  summary: string | null
  category: string
  source_type: string
  source_path: string | null
  event_date: string | null
  claims: { text: string; status: string }[]
  entities: { name: string; type: string; relationship: string }[]
}

export function simpleAnswer(answer: string, evidence_ids: string[] = [], facts: string[] = []): AskResponse {
  return { answer, evidence_ids, facts, inferences: [], recommendations: [] }
}

export const packing = /\b(pack|packing)\b/i
export const temporal =
  /\b(upcoming|next week|this week|weekend|today|tomorrow|reminders?|due|schedule|soon|saturday|sunday|monday|tuesday|wednesday|thursday|friday)\b/i

// Only shortcut simple, explicitly scoped merchant lookups. Send compound questions to synthesis.
export function couponMerchant(question: string) {
  if (
    /\b(expir\w*|valid|conditions?|best|compare|worth|why|except|exclude|without|and|or|but|when|minimum|spend|discount percentage)\b/i.test(
      question,
    )
  )
    return null
  const after = question.match(
    /\b(?:coupons?|voucher|promo code|discount code)\s+(?:code\s+)?(?:for|from|at|on)\s+([\p{L}\d][\p{L}\d-]*)\s*[?.!]*$/iu,
  )
  const before = question.match(
    /\b([\p{L}\d][\p{L}\d-]*)\s+(?:coupons?|voucher|promo code|discount code)(?:\s+code)?\s*[?.!]*$/iu,
  )
  const merchant = after?.[1] || before?.[1]
  return merchant &&
    !/^(a|any|the|my|that|this|have|which|some|discount|is|use|saved|me|it|these|there)$/i.test(merchant)
    ? merchant
    : null
}

export function searchTerms(question: string, merchant: string | null, previous = '') {
  if (merchant) return merchant
  const context = /\b(it|that|there|they|its|those|else|again|more)\b/i.test(question) ? previous : ''
  return [question, context, packing.test(question) ? 'travel ticket trip booking destination' : '']
    .join(' ')
    .trim()
}

export function couponAnswer(merchant: string, sources: MemoryEvidence[]) {
  const matches = sources.flatMap((source, index) => {
    const containsMerchant = (text: string) =>
      text
        .toLowerCase()
        .split(/[^\p{L}\d-]+/u)
        .includes(merchant.toLowerCase())
    const merchants = source.entities.filter((e) => /^(merchant|brand|retailer|store)$/i.test(e.relationship))
    const singleMerchant = merchants.length
      ? merchants.every((e) => containsMerchant(e.name))
      : containsMerchant(source.title)
    const codes = source.claims.filter((claim) => {
      if (claim.status !== 'OBSERVED') return false
      const match = claim.text.match(
        /^(.*?)\b(?:coupon|promo|voucher|discount|offer|redemption)\s+code\s*(?:is\b|[:=])\s*["'“]?([\p{L}\d_-]+)\b/iu,
      )
      if (!match || /^(unknown|unreadable|missing|unavailable|not|none|unclear)$/i.test(match[2]))
        return false
      const prefix = match[1].trim()
      return containsMerchant(prefix) || (singleMerchant && /^(?:the|your|my)?$/i.test(prefix))
    })
    // Reproduce the observed wording, including punctuation and case in the identifier.
    return codes.map((c) => ({ id: String(index + 1), text: c.text }))
  })
  if (!matches.length)
    return sources.length ? null : simpleAnswer(`I couldn’t find a saved coupon for ${merchant}.`)
  return simpleAnswer([...new Set(matches.map((m) => m.text))].join('\n'), [
    ...new Set(matches.map((m) => m.id)),
  ])
}

export function evidenceFallback(sources: MemoryEvidence[], reason: string) {
  const entries = sources.flatMap((source, i) => {
    const observed = source.claims
      .filter((c) => c.status === 'OBSERVED')
      .slice(0, 2)
      .map((c) => c.text)
    return observed.length ? [{ id: String(i + 1), facts: observed }] : []
  })
  const facts = entries.flatMap((entry) => entry.facts)
  return simpleAnswer(
    reason + (facts.length ? ' Here are the closest saved facts.' : ' Try again later.'),
    entries.map((e) => e.id),
    facts,
  )
}

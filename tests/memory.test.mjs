import test from 'node:test'
import assert from 'node:assert/strict'
import { captureText } from '../src/lib/ai/local-capture.ts'
import { couponMerchant, couponAnswer, searchTerms } from '../src/lib/ai/retrieval.ts'
import { responseLines } from '../src/lib/stream.ts'

const capture = captureText('PUMA STORE REWARD\nCoupon code: Pace-7x42\n20% off shoes', 'reward.png')
const source = {
  ...capture,
  claims: capture.claims.map((c) => ({ text: c.claim_text, status: c.provenance_status })),
}

test('exact lookup preserves case and punctuation and cites the original', () => {
  const brand = couponMerchant('I am buying Puma shoes. Do I have a coupon for Puma?')
  assert.equal(searchTerms('coupon', brand), 'Puma')
  const answer = couponAnswer(brand, [source])
  assert.equal(answer.answer, 'Coupon code: Pace-7x42')
  assert.deepEqual(answer.evidence_ids, ['1'])
  assert.deepEqual(couponAnswer('Adidas', []).evidence_ids, [])
})
test('discount conditions, uncertain codes and unrelated merchants require further evidence', () => {
  assert.equal(couponMerchant('Is my Puma coupon valid?'), null)
  assert.equal(
    couponAnswer('Adidas', [
      { ...source, claims: [...source.claims, { text: 'Excludes Adidas shoes', status: 'OBSERVED' }] },
    ]),
    null,
  )
  assert.equal(
    couponAnswer('Puma', [{ ...source, claims: [{ text: 'Coupon code: XYZ', status: 'INFERRED' }] }]),
    null,
  )
  assert.equal(
    couponAnswer('Puma', [{ ...source, claims: [{ text: 'Coupon code: unreadable', status: 'OBSERVED' }] }]),
    null,
  )
})
test('labelled ticket is immediately searchable, with origin, destination and an explicitly dated event', () => {
  const memory = captureText(
    'BUS TICKET\nOrigin: Mysore\nDestination: Ooty\nDeparture: 15 December 2026',
    'ticket.png',
  )
  assert.equal(memory.category, 'Travel')
  assert.match(searchTerms('What should I pack?', null), /travel/)
  assert.equal(memory.entities.find((e) => e.relationship === 'destination').name, 'Ooty')
  assert.equal(memory.events[0].event_date, '2026-12-14T18:30:00.000Z')
  assert.equal(captureText('Destination: Goa\nDeparture: 01/02/26', 'ticket').events.length, 0)
})
test('stream reader handles split UTF-8 and a final line without a newline', async () => {
  const bytes = new TextEncoder().encode('{"text":"₹"}\n{"type":"complete"}')
  const body = new ReadableStream({
    start(c) {
      for (const b of bytes) c.enqueue(Uint8Array.of(b))
      c.close()
    },
  })
  const events = []
  for await (const event of responseLines(new Response(body))) events.push(event)
  assert.deepEqual(events, [{ text: '₹' }, { type: 'complete' }])
})
test('expired sessions produce an actionable error', async () => {
  await assert.rejects(async () => {
    for await (const event of responseLines(
      Response.json({ error: 'Sign in to continue.' }, { status: 401 }),
    ))
      assert.fail(event)
  }, /Sign in/)
})

test('invalid calendar dates never create a trip or reminder on a different date', () => {
  const ticket = (date) => captureText('Destination: Ooty\nDeparture: ' + date, 'ticket')
  for (const date of ['2026-02-31', '29 February 2027', '2026-00-10', '12 Invented 2026'])
    assert.equal(ticket(date).event_date, null)
  assert.equal(ticket('29 Feb 2028').event_date, '2028-02-28T18:30:00.000Z')
})

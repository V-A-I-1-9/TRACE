import test from 'node:test'
import assert from 'node:assert/strict'
import { readSource } from '../src/lib/source-input.ts'
import { startOfIndiaDay } from '../src/lib/schedule.ts'

function upload(type, bytes, name = 'sample') {
  const form = new FormData()
  if (bytes) form.set('file', new File([bytes], name, { type }))
  return new Request('http://localhost/capture', { method: 'POST', body: form })
}
for (const [kind, mime, extension] of [
  ['IMAGE', 'image/png', 'png'],
  ['IMAGE', 'image/jpeg', 'jpg'],
  ['IMAGE', 'image/webp', 'webp'],
  ['DOCUMENT', 'application/pdf', 'pdf'],
  ['DOCUMENT', 'text/plain', 'txt'],
  ['DOCUMENT', 'text/csv', 'csv'],
  ['DOCUMENT', 'text/markdown', 'md'],
  ['AUDIO', 'audio/webm;codecs=opus', 'webm'],
  ['AUDIO', 'audio/mp4', 'm4a'],
  ['AUDIO', 'audio/mpeg', 'mp3'],
  ['AUDIO', 'audio/x-wav', 'wav'],
  ['AUDIO', 'audio/ogg', 'ogg'],
]) {
  test('capture accepts ' + mime, async () => {
    const file = await readSource(upload(mime, 'fixture'), kind)
    assert.equal(file.ext, extension)
    assert.equal(file.bytes.toString(), 'fixture')
  })
}
test('empty, missing, wrong-format and oversized files are rejected before extraction', async () => {
  await assert.rejects(readSource(upload('image/jpeg', new Uint8Array()), 'IMAGE'), /non-empty/)
  await assert.rejects(readSource(upload('', null), 'DOCUMENT'), /non-empty/)
  await assert.rejects(readSource(upload('image/png', 'x'), 'DOCUMENT'), /unsupported/)
  await assert.rejects(readSource(upload('image/png', new Uint8Array(10 * 1024 ** 2 + 1)), 'IMAGE'), /10 MB/)
  await assert.rejects(readSource(upload('audio/mp4', new Uint8Array(20 * 1024 ** 2 + 1)), 'AUDIO'), /20 MB/)
})
test('notes accept the size boundary and reject malformed JSON or whitespace', async () => {
  const note = (body) => readSource(new Request('http://localhost/capture', { method: 'POST', body }), 'TEXT')
  for (const body of [
    '{',
    'null',
    '{}',
    '{"text":{}}',
    '{"text":"   "}',
    JSON.stringify({ text: 'x'.repeat(16001) }),
  ])
    await assert.rejects(note(body), /Enter a note/)
  assert.equal((await note(JSON.stringify({ text: 'x'.repeat(16000) }))).bytes.length, 16000)
})
test('upcoming includes today in India and rolls over at local midnight', () => {
  assert.equal(startOfIndiaDay(new Date('2026-11-26T18:29:59Z')), '2026-11-25T18:30:00.000Z')
  assert.equal(startOfIndiaDay(new Date('2026-11-26T18:30:00Z')), '2026-11-26T18:30:00.000Z')
})

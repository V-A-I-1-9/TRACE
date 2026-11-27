import { createHash, randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { createClient } from './supabase/server'
import { extractMemory, generateEmbedding, providerMessage } from './ai/gemini'
import { captureText } from './ai/local-capture'
import { readScreenshot } from './ai/ocr'

import {readSource, type CaptureKind} from './source-input'

async function understand(source: Awaited<ReturnType<typeof readSource>>, kind: CaptureKind) {
  let transcript = source.mime.startsWith('text/') ? source.bytes.toString('utf8') : ''
  if (kind === 'IMAGE') {
    try {
      transcript = await readScreenshot(source.bytes)
    } catch {
      /* Other images use vision. */
    }
  }
  if (source.mime === 'application/pdf') {
    try {
      const {getDocumentProxy, extractText} = await import('unpdf')
      const document = await getDocumentProxy(new Uint8Array(source.bytes))
      try {
        if (document.numPages <= 24) {
          const {text} = await extractText(document, {mergePages: false})
          const contents = text.join('\n').trim()
          if (contents.length <= 16000) transcript = contents
        }
      } finally { await document.loadingTask.destroy() }
    } catch { /* Scans and unsupported PDFs use the multimodal extractor. */ }
  }
  if (source.mime.startsWith('text/') && transcript.length > 16000)
    throw new Error('Text documents support up to 16,000 characters. Split this document into smaller notes.')
  const local = transcript ? captureText(transcript, source.name) : null
  // A labelled code requires exact transcription. Preserve the whole source as supporting evidence.
  const labelledTrip =
    local?.entities.some((e) => e.relationship === 'origin') &&
    local.entities.some((e) => e.relationship === 'destination') &&
    local.events?.length
  if (
    local &&
    (labelledTrip || /\b(?:coupon|voucher|promo)\s+code\s*[:=]\s*\S+/i.test(transcript)) &&
    transcript.length <= 16000
  ) {
    return {
      capture: local,
      notice:
        kind === 'IMAGE'
          ? 'Read with local OCR. Compare the captured text with the original.'
          : 'Indexed from the original text.',
    }
  }
  try {
    const part = source.mime.startsWith('text/') || (source.mime === 'application/pdf' && transcript.length > 0)
      ? { text: transcript.slice(0, 16000) }
      : { inlineData: { data: source.bytes.toString('base64'), mimeType: source.mime } }
    return { capture: await extractMemory(part, source.name), notice: '' }
  } catch (error) {
    if (local)
      return { capture: local, notice: providerMessage(error) + ' Saved the readable text for search.' }
    throw new Error(providerMessage(error) + ' Retry later or capture a typed transcript.')
  }
}

export async function captureRequest(request: Request, kind: CaptureKind) {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return Response.json({ error: 'Sign in to capture a memory.' }, { status: 401 })
  const owner = user.id
  let source
  try {
    source = await readSource(request, kind)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Invalid upload.' },
      { status: 400 },
    )
  }
  const { bytes, mime, ext } = source
  const hash = createHash('sha256').update(bytes).digest('hex')
  const bucket = db.storage.from('trace-sources')
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        const findDuplicate = () =>
          db
            .from('memories')
            .select('id,title,summary,category,source_path')
            .eq('user_id', owner)
            .eq('source_type', kind)
            .eq('content_hash', hash)
            .maybeSingle()
        try {
          send({ stage: 'received' })
          const existing = await findDuplicate()
          if (existing.error) throw new Error('Memory storage is unavailable. Try again.')
          if (existing.data) {
            send({
              stage: 'complete',
              success: true,
              memory: existing.data,
              claims: [],
              entities: [],
              notice: 'This source is already in your memories.',
            })
            return
          }
          send({ stage: 'understanding' })
          const { capture, notice } = await understand(source, kind)
          send({ stage: 'saving' })
          const path = `${owner}/${randomUUID()}/original.${ext}`
          const upload = await bucket.upload(path, bytes, { contentType: mime })
          if (upload.error) throw new Error('Could not upload the original. Retry the capture.')
          const saved = await db.rpc('trace_capture', {
            p_source_type: kind,
            p_source_path: path,
            p_hash: hash,
            p_capture: capture,
          })
          if (saved.error) {
            // A network failure may hide a committed transaction; only discard a definitively unreferenced object.
            if (/^[0-9A-Z]{5}$/.test(saved.error.code || '')) await bucket.remove([path])
            throw new Error('Could not confirm the save. Retry with the same file.')
          }
          const stored = await findDuplicate()
          if (!stored.data) throw new Error('Could not verify the saved memory. Retry with the same file.')
          if (stored.data.source_path !== path) {
            await bucket.remove([path])
            send({
              stage: 'complete',
              success: true,
              memory: stored.data,
              claims: [],
              entities: [],
              notice: 'This source is already in your memories.',
            })
            return
          }
          const semanticMode = process.env.TRACE_SEMANTIC_SEARCH || 'auto'
          if (semanticMode === 'on' || (semanticMode === 'auto' && !notice)) {
            after(async () => {
              try {
                const vector = await generateEmbedding(
                  [capture.title, capture.summary, ...capture.claims.map((c) => c.claim_text)]
                    .join('\n')
                    .slice(0, 4000),
                )
                await db
                  .from('memories')
                  .update({ embedding: JSON.stringify(vector) })
                  .eq('id', saved.data)
                  .eq('user_id', owner)
              } catch {
                /* Full-text search remains available. */
              }
            })
          }
          send({
            stage: 'complete',
            success: true,
            memory: stored.data,
            notice,
            claims: capture.claims,
            entities: capture.entities,
            events: capture.events,
          })
        } catch (error) {
          send({ error: error instanceof Error ? error.message : 'Capture failed. Try again.' })
        } finally {
          controller.close()
        }
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store, no-transform' } },
  )
}

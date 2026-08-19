import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processTextWithGemini, generateEmbedding } from '@/lib/ai/gemini'
import { processEventsAndReminders } from '@/lib/events'

export async function POST(request: Request) {
  const tStart = performance.now()
  let tParsed, tStorageStart, tStorageEnd, tGeminiStart, tGeminiEnd, tRpcStart, tRpcEnd

  const supabase = await createClient()

  // 1. Verify Authenticated User
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
      }

      try {
        send({ stage: 'received' })

        const { text } = await request.json()
        tParsed = performance.now()

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
          send({ error: 'No text provided' })
          controller.close()
          return
        }

        const memoryId = crypto.randomUUID()
        const storagePath = `${user.id}/${memoryId}/original.txt`

        // 3. Upload Original to Storage as a .txt file for provenance consistency
        tStorageStart = performance.now()
        const buffer = Buffer.from(text, 'utf-8')
        const { error: uploadError } = await supabase.storage
          .from('trace-sources')
          .upload(storagePath, buffer, {
            contentType: 'text/plain',
            upsert: false
          })
        tStorageEnd = performance.now()

        if (uploadError) {
          console.error('Storage upload error:', uploadError)
          send({ error: 'TRACE could not save the text note. Please try again.' })
          controller.close()
          return
        }

        send({ stage: 'understanding' })

        let extractionResult
        try {
          // 4 & 5. Call Gemini & Zod Validation
          tGeminiStart = performance.now()
          extractionResult = await processTextWithGemini(text, 'note.txt')
          tGeminiEnd = performance.now()
        } catch (aiError) {
          console.error('Gemini extraction failed:', aiError)
          await supabase.storage.from('trace-sources').remove([storagePath])
          send({ error: 'TRACE AI processing is temporarily unavailable. Please try again.' })
          controller.close()
          return
        }

        send({ stage: 'verifying' })

        // Safe date conversion
        let safeEventDate = null
        if (extractionResult.event_date) {
          const parsedDate = new Date(extractionResult.event_date)
          if (!isNaN(parsedDate.getTime())) {
            safeEventDate = parsedDate.toISOString()
          } else {
            console.warn(`[TRACE] Rejected invalid event_date from AI: "${extractionResult.event_date}"`)
          }
        }

        send({ stage: 'saving' })

        // 6. Database Persistence (Atomic RPC)
        tRpcStart = performance.now()
        const { data: insertedMemoryId, error: dbError } = await supabase.rpc('capture_memory_atomic', {
          p_title: extractionResult.title,
          p_summary: extractionResult.summary,
          p_category: extractionResult.category,
          p_source_type: 'TEXT',
          p_source_path: storagePath,
          p_event_date: safeEventDate,
          p_entities: extractionResult.entities,
          p_claims: extractionResult.claims
        })
        tRpcEnd = performance.now()

        if (dbError) {
          console.error('Database atomic insert failed:', dbError)
          await supabase.storage.from('trace-sources').remove([storagePath])
          send({ error: 'An unexpected system error occurred while capturing memory.' })
          controller.close()
          return
        }

        const tEnd = performance.now()
        console.log(`[TRACE TIMING]
request_to_parse: ${(tParsed - tStart).toFixed(2)}ms
storage_upload: ${(tStorageEnd - tStorageStart).toFixed(2)}ms
gemini_total: ${(tGeminiEnd - tGeminiStart).toFixed(2)}ms
database_rpc: ${(tRpcEnd - tRpcStart).toFixed(2)}ms
total: ${(tEnd - tStart).toFixed(2)}ms`)

        // 7 & 8. Background Tasks (Fault tolerant, serverless safe)
        const userId = user.id
        after(async () => {
          try {
            // Background Embedding Generation
            const embeddingText = `Title: ${extractionResult.title}\nSummary: ${extractionResult.summary}\nEntities: ${extractionResult.entities.map(e => e.name).join(', ')}\nClaims: ${extractionResult.claims.map(c => c.claim_text).join(' ')}`;
            const tEmbStart = performance.now();
            const vector = await generateEmbedding(embeddingText);
            const { error: updateError } = await supabase
              .from('memories')
              .update({ embedding: JSON.stringify(vector) })
              .eq('id', insertedMemoryId);
              
            if (updateError) {
              console.warn('TRACE background embedding update failed.');
            } else {
              console.log(`[TRACE TIMING] embedding_generation: ${(performance.now() - tEmbStart).toFixed(2)}ms`);
            }
          } catch {
            console.error('TRACE background embedding generation failed');
          }

          try {
            // Background Event & Reminder Generation
            if (extractionResult.events && extractionResult.events.length > 0) {
               await processEventsAndReminders(supabase, userId, insertedMemoryId, extractionResult.events)
            }
          } catch {
            console.error('TRACE background event processing failed')
          }
        })

        send({
          stage: 'complete',
          success: true,
          memory: {
            id: insertedMemoryId,
            title: extractionResult.title,
            summary: extractionResult.summary,
            category: extractionResult.category,
          },
          entities: extractionResult.entities,
          claims: extractionResult.claims
        })

        controller.close()
      } catch (err) {
        console.error('Unexpected error in capture stream:', err)
        send({ error: 'An unexpected system error occurred while capturing memory.' })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'Connection': 'keep-alive'
    }
  })
}

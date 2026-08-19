import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateGroundedAnswerStream, EvidencePayload, ConversationMessage } from '@/lib/ai/gemini-ask'
import { generateEmbedding } from '@/lib/ai/gemini'

interface SearchRow {
  memory_id: string
  title: string
  category: string
  source_type: string
  source_path: string | null
  event_date: string | null
  claims: { id: string; text: string; status: string }[]
  entities: { id: string; name: string; type: string }[]
}

export async function POST(request: Request) {
  const tStart = performance.now()
  let tDbStart = 0, tDbEnd = 0, tGenStart = 0, tGenEnd = 0
  let tConvLoadStart = 0, tConvLoadEnd = 0, tDbSaveStart = 0, tDbSaveEnd = 0

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { query, conversation_id } = await request.json()
    const trimmedQuery = query?.trim()
    if (!trimmedQuery) {
      return NextResponse.json({ error: 'Valid query string is required' }, { status: 400 })
    }
    if (!conversation_id) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
    }

    tConvLoadStart = performance.now()
    const { data: dbHistory, error: historyError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(4)
    tConvLoadEnd = performance.now()

    if (historyError) {
      console.error('Failed to load history:', historyError)
      return NextResponse.json({ error: 'Failed to load conversation history' }, { status: 500 })
    }

    // Process recent history (last 4 messages reversed to chronological order)
    const recentHistory: ConversationMessage[] = (dbHistory || []).reverse().map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))

    const tNormEnd = performance.now() // Query normalization

    let searchContextQuery = trimmedQuery
    
    // Check for conversational references or likely follow-ups
    const hasConversationalReferences = /\b(he|she|it|they|them|there|that|this|these|those|his|her|its|their|my trip|my booking|pack|take|prepare|ready|plan|book|stay|else|enough|next|again|more)\b/i.test(trimmedQuery)
    
    if (hasConversationalReferences && recentHistory.length > 0) {
      // Zero-latency context resolution: append recent user context directly to the FTS query
      // Postgres plainto_tsquery (OR semantics) will match the historical nouns (e.g. "Ooty") naturally
      const previousUserMessages = recentHistory.filter(m => m.role === 'user').slice(-2).map(m => m.content).join(' ')
      if (previousUserMessages) {
        searchContextQuery = `${trimmedQuery} ${previousUserMessages}`
      }
    }

    // 1. Generate Query Embedding (Performance Optimization: Vector Search)
    let queryEmbedding = null
    let tEmbStart = 0, tEmbEnd = 0
    try {
      tEmbStart = performance.now()
      queryEmbedding = await generateEmbedding(searchContextQuery)
      tEmbEnd = performance.now()
    } catch (e) {
      console.warn('Non-fatal: Query embedding generation failed', e)
    }

    // 2. Retrieve Evidence (Hybrid Search with graceful fallback)
    tDbStart = performance.now()
    let searchResults, dbError
    const rpcArgs: Record<string, string | null> = { p_query: searchContextQuery }
    if (queryEmbedding) rpcArgs.p_embedding = JSON.stringify(queryEmbedding)

    const { data, error } = await supabase.rpc('search_user_context', rpcArgs)
    
    // Graceful fallback if Migration 0004 has not been executed yet
    if (error && error.message.includes('search_user_context')) {
      console.warn("Hybrid search RPC not found, falling back to FTS only")
      const fallback = await supabase.rpc('search_user_context', { p_query: searchContextQuery })
      searchResults = fallback.data
      dbError = fallback.error
    } else {
      searchResults = data
      dbError = error
    }
    tDbEnd = performance.now()

    if (dbError) {
      console.error('Database retrieval failed:', dbError)
      return NextResponse.json({ error: 'Failed to retrieve context' }, { status: 500 })
    }

    // 3. Map DB IDs to Temporary Evidence IDs and apply Context Compression
    const evidenceMap = new Map<string, SearchRow>()
    const safeSearchResults = searchResults ? searchResults.slice(0, 5) : []
    const evidencePayloads: EvidencePayload[] = safeSearchResults.map((row: SearchRow, index: number) => {
      const tempId = `EVIDENCE_${index + 1}`
      evidenceMap.set(tempId, row)
      
      // Context Compression: Enforce max 5 claims and 5 entities per memory in case old RPC was used
      const compressedClaims = row.claims ? row.claims.slice(0, 5) : []
      const compressedEntities = row.entities ? row.entities.slice(0, 5) : []
      
      return {
        id: tempId,
        title: row.title,
        category: row.category,
        event_date: row.event_date,
        claims: compressedClaims.map(c => ({ text: c.text, status: c.status })),
        entities: compressedEntities.map(e => ({ name: e.name, type: e.type }))
      }
    })

    // 3.5 Fetch upcoming events & reminders for Proactive Insights
    let proactiveRemindersContext = ''
    try {
      const today = new Date().toISOString()
      
      // Fetch upcoming events directly (richer data than reminders alone)
      const { data: upcomingEvents } = await supabase
        .from('events')
        .select('title, event_type, event_date, due_date')
        .eq('user_id', user.id)
        .or(`event_date.gte.${today},due_date.gte.${today}`)
        .order('event_date', { ascending: true })
        .limit(10)

      // Fetch pending reminders as backup
      const { data: upcRem } = await supabase
        .from('reminders')
        .select('title, reminder_date, event:events(event_type, event_date, due_date)')
        .eq('user_id', user.id)
        .eq('status', 'PENDING')
        .order('reminder_date', { ascending: true })
        .limit(5)
      
      const isTemporalQuery = /\b(upcoming|next|this week|this weekend|today|tomorrow|saturday|sunday|monday|tuesday|wednesday|thursday|friday|remind|due|plan|soon|schedule|when|happening|what.*do|what.*buy)\b/i.test(trimmedQuery)

      // Always include upcoming events for temporal queries
      const eventLines: string[] = []
      if (upcomingEvents && upcomingEvents.length > 0) {
        for (const ev of upcomingEvents) {
          const dateStr = ev.event_date || ev.due_date
          const formatted = dateStr ? new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Soon'
          eventLines.push(`- ${ev.title} (${ev.event_type}) on ${formatted}`)
        }
      }
      
      if (upcRem && upcRem.length > 0) {
        for (const r of upcRem) {
          const formatted = new Date(r.reminder_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
          eventLines.push(`- ${r.title} (Due: ${formatted})`)
        }
      }

      if (eventLines.length > 0 && isTemporalQuery) {
        proactiveRemindersContext = [...new Set(eventLines)].join('\n')
      }
    } catch {
      // Ignore if tables don't exist
    }

    // 3.8 Log Server Telemetry before calling Gemini
    const promptChars = JSON.stringify(recentHistory).length + JSON.stringify(evidencePayloads).length + proactiveRemindersContext.length + trimmedQuery.length
    console.log(`[TRACE ASK] history_messages: ${recentHistory.length} | evidence_items: ${evidencePayloads.length} | prompt_chars: ~${promptChars}`)

    // 4. Generate Answer via Stream
    tGenStart = performance.now()
    const responseStream = await generateGroundedAnswerStream(trimmedQuery, recentHistory, evidencePayloads, proactiveRemindersContext)
    
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
        }

        try {
          let fullText = ''
          let lastExtractedLength = 0

          for await (const chunk of responseStream) {
            if (chunk.text) {
              fullText += chunk.text
              
              // Extract the "answer" incrementally
              const answerMatch = fullText.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)/)
              if (answerMatch) {
                const currentAnswer = answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
                if (currentAnswer.length > lastExtractedLength) {
                  const newChunk = currentAnswer.slice(lastExtractedLength)
                  send({ type: 'chunk', text: newChunk })
                  lastExtractedLength = currentAnswer.length
                }
              }
            }
          }
          tGenEnd = performance.now()

          // Parse the full structured JSON at the end
          const parsed = JSON.parse(fullText)
          
          // Resolve Evidence IDs
          const validEvidenceIds = new Set(evidencePayloads.map(e => e.id))
          const filteredIds = (parsed.evidence_ids || []).filter((id: string) => validEvidenceIds.has(id))
          
          const resolvedEvidence = filteredIds
            .map((id: string) => evidenceMap.get(id))
            .filter((row: SearchRow | undefined): row is SearchRow => row !== undefined)
            .map((row: SearchRow) => {
              const compressedClaims = row.claims ? row.claims.slice(0, 5) : []
              const compressedEntities = row.entities ? row.entities.slice(0, 5) : []
              return {
                title: row.title,
                category: row.category,
                event_date: row.event_date,
                source_type: row.source_type || null,
                source_path: row.source_path || null,
                claims: compressedClaims.map(c => ({ text: c.text, status: c.status })),
                entities: compressedEntities.map(e => ({ name: e.name, type: e.type }))
              }
            })

          const tEnd = performance.now()

          tDbSaveStart = performance.now()
          try {
            const now = new Date();
            const userTime = new Date(now.getTime() - 1000).toISOString();
            const assistantTime = now.toISOString();

            await Promise.all([
              supabase.from('messages').insert({
                user_id: user.id,
                conversation_id,
                role: 'user',
                content: trimmedQuery,
                created_at: userTime
              }),
              supabase.from('messages').insert({
                user_id: user.id,
                conversation_id,
                role: 'assistant',
                content: parsed.answer,
                created_at: assistantTime,
                structured_response: {
                  evidence: resolvedEvidence,
                  facts: parsed.facts || [],
                  inferences: parsed.inferences || [],
                  recommendations: parsed.recommendations || []
                }
              }),
              supabase.from('conversations').update({ updated_at: assistantTime }).eq('id', conversation_id).eq('user_id', user.id)
            ])
          } catch (saveErr) {
            console.error('Failed to save messages to DB (non-fatal):', saveErr)
          }
          tDbSaveEnd = performance.now()

          send({
            type: 'complete',
            data: {
              answer: parsed.answer,
              evidence: resolvedEvidence,
              facts: parsed.facts || [],
              inferences: parsed.inferences || [],
              recommendations: parsed.recommendations || [],
              timings: {
                query_normalization: tNormEnd - tStart,
                conversation_load: tConvLoadEnd - tConvLoadStart,
                embedding_generation: queryEmbedding ? (tEmbEnd - tEmbStart) : 0,
                context_resolution: 0,
                database_retrieval: tDbEnd - tDbStart,
                gemini_generation: tGenEnd - tGenStart,
                database_save: tDbSaveEnd - tDbSaveStart,
                total: tEnd - tStart
              }
            }
          })
        } catch (err) {
          console.error('Streaming error:', err)
          send({ type: 'error', error: 'An error occurred during response generation.' })
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
      }
    })

  } catch (err) {
    console.error('Unexpected error in ask endpoint:', err)
    const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred while answering your question.'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}

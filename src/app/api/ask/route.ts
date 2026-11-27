import {upcomingSchedule} from '@/lib/schedule'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { generateEmbedding, providerMessage } from '@/lib/ai/gemini'
import { generateAnswer } from '@/lib/ai/gemini-ask'
import {
  couponAnswer,
  couponMerchant,
  evidenceFallback,
  packing,
  searchTerms,
  simpleAnswer,
  temporal,
  type MemoryEvidence,
} from '@/lib/ai/retrieval'

const input = z.object({
  query: z.string().trim().min(1).max(1500),
  conversation_id: z.uuid(),
  memory_id: z.uuid().nullish(),
})

export async function POST(request: Request) {
  const started = performance.now()
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return Response.json({ error: 'Sign in to ask a question.' }, { status: 401 })
  const body = input.safeParse(await request.json().catch(() => null))
  if (!body.success)
    return Response.json(
      { error: 'Enter a question of up to 1,500 characters in a valid chat.' },
      { status: 400 },
    )
  const { query, conversation_id, memory_id } = body.data
  const [chat, history] = await Promise.all([
    db.from('conversations').select('id').eq('id', conversation_id).eq('user_id', user.id).maybeSingle(),
    db
      .from('messages')
      .select('role,content')
      .eq('user_id', user.id)
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(4),
  ])
  if (chat.error || history.error)
    return Response.json({ error: 'Could not load the conversation.' }, { status: 503 })
  if (!chat.data) return Response.json({ error: 'Conversation unavailable.' }, { status: 404 })
  const recent = history.data.reverse().map((m) => ({ role: m.role, content: m.content.slice(0, 450) }))
  const merchant = couponMerchant(query)
  const terms = searchTerms(query, merchant, recent.filter((m) => m.role === 'user').at(-1)?.content)
  const retrieve = (vector: number[] | null) =>
    db.rpc('trace_retrieve', {
      p_terms: terms,
      p_memory: memory_id ?? null,
      p_vector: vector ? JSON.stringify(vector) : null,
    })
  const calendar = temporal.test(query)
  const [lexical,schedule] = await Promise.all([
    retrieve(null),
    calendar ? upcomingSchedule(db,user.id,10,memory_id).catch(()=>null) : [],
  ])
  if (lexical.error || !schedule)
    return Response.json({ error: 'Could not search your memories.' }, { status: 503 })
  let sources: MemoryEvidence[] = lexical.data || []
  if (memory_id && !sources.length)
    return Response.json({ error: 'This memory is unavailable.' }, { status: 404 })
  if (!sources.length && !merchant && !memory_id && process.env.TRACE_SEMANTIC_SEARCH !== 'off') {
    try {
      const semantic = await retrieve(await generateEmbedding(terms))
      if (!semantic.error) sources = semantic.data || []
    } catch {
      /* Exact and full-text results already checked. */
    }
  }
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        try {
          let answer = merchant ? couponAnswer(merchant, sources) : null
          const personal = /\b(my|mine|i have|saved|coupon|ticket|booking|pack|packing)\b/i.test(query)
          if (!answer && !sources.length && !schedule.length && personal)
            answer = simpleAnswer(
              'I couldn’t find a matching memory. Try the merchant or destination, or capture the source first.',
            )
          const retrieved = performance.now()
          let mode = 'lookup'
          if (!answer) {
            try {
              mode = 'generation'
              answer = await generateAnswer(query, recent, sources, schedule, (text) =>
                send({ type: 'chunk', text }),
              )
              const hasCitation = answer.evidence_ids.some((id) =>
                sources.some((_, i) => String(i + 1) === id),
              )
              if (personal && sources.length && !schedule.length && answer.facts.length && !hasCitation) {
                answer = evidenceFallback(sources, 'I could not verify that answer against a source.')
              }
            } catch (error) {
              mode = 'saved facts'
              answer = evidenceFallback(sources, providerMessage(error))
              if (
                packing.test(query) &&
                sources.length === 1 &&
                sources[0].entities.some((e) => e.relationship?.toLowerCase() === 'destination')
              ) {
                const destination = sources[0].entities.find(
                  (e) => e.relationship?.toLowerCase() === 'destination',
                )!
                answer.answer =
                  providerMessage(error) +
                  ' Your saved destination is ' +
                  destination.name +
                  '. Here is a general packing checklist.'
                answer.evidence_ids = ['1']
                answer.recommendations = [
                  {
                    category: 'General travel checklist',
                    items: [
                      'Carry your ticket and identification.',
                      'Pack a charger, water, and any personal essentials.',
                      'Check the destination forecast before choosing clothes.',
                    ],
                  },
                ]
              }
            }
          }
          const cited = [...new Set(answer.evidence_ids)]
            .map((id) => sources.find((_, i) => String(i + 1) === id))
            .filter((s): s is MemoryEvidence => Boolean(s))
          const details = {
            evidence: cited.map((s) => ({ ...s, claims: s.claims.slice(0, 10) })),
            facts: answer.facts,
            inferences: answer.inferences,
            recommendations: answer.recommendations,
          }
          const save = await db.rpc('trace_save_turn', {
            p_conversation: conversation_id,
            p_question: query,
            p_answer: answer.answer,
            p_details: details,
          })
          if (save.error) throw new Error('The reply could not be saved. Please retry.')
          const total = Math.round(performance.now() - started)
          console.info('[TRACE Ask]', {
            mode,
            retrieval_ms: Math.round(retrieved - started),
            total_ms: total,
          })
          send({ type: 'complete', data: { answer: answer.answer, ...details, timings: { total } } })
        } catch (error) {
          send({
            type: 'error',
            error: error instanceof Error ? error.message : 'Reply interrupted. Please retry.',
          })
        } finally {
          controller.close()
        }
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store, no-transform' } },
  )
}

import { GoogleGenAI, Type } from '@google/genai'
import { CaptureResponse, CaptureResponseSchema } from '../validation/gemini'

const MODEL_NAME = 'gemini-3.7-flash'

async function generateWithRetry(ai: GoogleGenAI, params: Parameters<typeof ai.models.generateContent>[0], maxRetries = 2) {
  let attempt = 0
  while (attempt <= maxRetries) {
    try {
      return await ai.models.generateContent(params)
    } catch (err: unknown) {
      const status = (err as Record<string, unknown>)?.status
      const message = (err as Error)?.message || ''
      
      const isQuotaExhausted = (status === 429 && message.includes('quota')) || message.includes('RESOURCE_EXHAUSTED')
      const isRateLimited = (status === 429 && !isQuotaExhausted) || message.includes('TOO_MANY_REQUESTS')
      const isHighDemand = status === 503 || message.includes('503') || message.includes('UNAVAILABLE') || message.includes('high demand')
      const isAuthError = status === 401 || status === 403 || message.includes('API key') || message.includes('API_KEY_INVALID')
      
      if (isAuthError) {
        throw new Error('API Key invalid or expired. Please check your AI configuration.')
      }
      if (isQuotaExhausted) {
        throw new Error('API quota exhausted for this account. Please use a different API key.')
      }

      const isTransient = isRateLimited || isHighDemand
      
      if (isTransient && attempt < maxRetries) {
        attempt++
        const backoffMs = Math.pow(2, attempt) * 500 // 1s, 2s backoff
        console.warn(`[Gemini Retry] Transient error detected (Attempt ${attempt}/${maxRetries}). Retrying in ${backoffMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, backoffMs))
        continue
      }
      
      if (isTransient) {
        throw new Error(isRateLimited ? 'API rate limit exceeded. Please slow down and try again.' : 'TRACE AI services are currently experiencing high demand. Please try again in a few moments.')
      }
      
      throw new Error(`AI Processing Error: ${message}`)
    }
  }
  throw new Error('Unreachable retry block')
}

export async function processImageWithGemini(
  imageBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<CaptureResponse> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Server configuration error: GEMINI_API_KEY is not set')
  }

  const ai = new GoogleGenAI({ apiKey })

  const prompt = `You are the core intelligence of TRACE (Trusted Retrieval and Associated Context Engine).
Your job is to understand the supplied image and convert its observable information into structured TRACE memory context.
Return ONLY valid JSON matching the exact schema below.

SCHEMA:
{
  "title": "A short, descriptive title",
  "summary": "Concise summary of what this image represents",
  "category": "A broad category classification (e.g., Travel, Finance, Work, Personal)",
  "event_date": "ISO 8601 date relevant to the event shown, or null if unknown",
  "entities": [
    {
      "name": "Entity Name",
      "type": "Entity Type (e.g., PERSON, LOCATION, ORGANIZATION, EVENT, PRODUCT, DATE)",
      "relationship": "Short descriptor of relation to the main context (e.g., destination, owner)"
    }
  ],
  "claims": [
    {
      "claim_text": "A single factual claim derived from the image",
      "provenance_status": "OBSERVED | INFERRED | UNKNOWN",
      "source_reference": "Uploaded image: ${filename}"
    }
  ],
  "events": [
    {
      "title": "A descriptive title for the event",
      "event_type": "TRAVEL | MAINTENANCE | APPOINTMENT | RENEWAL | MEETING | SHOPPING | PURCHASE | GENERIC",
      "event_date": "ISO 8601 date, or null if unknown",
      "due_date": "ISO 8601 deadline/expiration date, or null",
      "priority": "LOW | MEDIUM | HIGH"
    }
  ]
}

EXTRACTION RULES:
1. Extract ONLY information supported by the image.
2. NEVER invent missing information.
3. NEVER guess a value simply because it seems likely.
4. OBSERVED: Directly visible/readable information.
5. INFERRED: A reasonable conclusion derived from visible evidence.
6. UNKNOWN: Use only when an extracted/relevant fact cannot be established with sufficient confidence and explicitly needs to be represented as unknown.
7. Do not create unnecessary UNKNOWN claims for every missing field. Only create claims that are supported by the image or represent a meaningful uncertainty/inference.
8. Preserve uncertainty. Do not fabricate dates, names, prices, locations, policies, or relationships.
9. Keep entity types short and normalized.
10. Events MUST originate from captured information. Do not invent dates. Unknown dates remain null. If no events exist, return [].
11. The current date/time is ${new Date().toISOString()}. Use this to resolve relative dates like "tomorrow", "this friday", or "next week" into absolute ISO 8601 dates.`

  const tGenStart = performance.now()
  const response = await generateWithRetry(ai, {
    model: MODEL_NAME,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: imageBuffer.toString('base64'),
              mimeType
            }
          }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "A short, descriptive title" },
          summary: { type: Type.STRING, description: "Concise summary of what this image represents" },
          category: { type: Type.STRING, description: "A broad category classification" },
          event_date: { type: Type.STRING, nullable: true, description: "ISO 8601 date relevant to the event shown, or null if unknown" },
          entities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                type: { type: Type.STRING },
                relationship: { type: Type.STRING }
              },
              required: ["name", "type", "relationship"]
            }
          },
          claims: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                claim_text: { type: Type.STRING },
                provenance_status: { type: Type.STRING, description: "OBSERVED, INFERRED, or UNKNOWN" },
                source_reference: { type: Type.STRING }
              },
              required: ["claim_text", "provenance_status", "source_reference"]
            }
          },
          events: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                event_type: { type: Type.STRING },
                event_date: { type: Type.STRING, nullable: true },
                due_date: { type: Type.STRING, nullable: true },
                priority: { type: Type.STRING }
              },
              required: ["title", "event_type", "priority"]
            }
          }
        },
        required: ["title", "summary", "category", "entities", "claims", "events"]
      }
    }
  })
  const tGenEnd = performance.now()

  const responseText = response.text
  if (!responseText) {
    throw new Error('Gemini returned an empty response')
  }

  try {
    const tZodStart = performance.now()
    const rawJson = JSON.parse(responseText)
    // Zod validation strictly enforces the schema
    const result = CaptureResponseSchema.parse(rawJson)
    const tZodEnd = performance.now()
    console.log(`[TRACE TIMING - INTERNAL] gemini_api: ${(tGenEnd - tGenStart).toFixed(2)}ms, zod_parse: ${(tZodEnd - tZodStart).toFixed(2)}ms`)
    return result
  } catch (error) {
    console.error('Failed to parse or validate Gemini output:', error)
    throw new Error('Gemini returned an invalid or malformed structure')
  }
}

export async function processDocumentWithGemini(
  documentBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<CaptureResponse> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Server configuration error: GEMINI_API_KEY is not set')

  const ai = new GoogleGenAI({ apiKey })

  const prompt = `You are the core intelligence of TRACE (Trusted Retrieval and Associated Context Engine).
Your job is to understand the supplied document (PDF/text) and convert its observable information into structured TRACE memory context.
Return ONLY valid JSON matching the exact schema below.

SCHEMA:
{
  "title": "A short, descriptive title",
  "summary": "Concise summary of what this document represents",
  "category": "A broad category classification (e.g., Travel, Finance, Work, Personal)",
  "event_date": "ISO 8601 date relevant to the event shown, or null if unknown",
  "entities": [
    {
      "name": "Entity Name",
      "type": "Entity Type (e.g., PERSON, LOCATION, ORGANIZATION, EVENT, PRODUCT, DATE)",
      "relationship": "Short descriptor of relation to the main context (e.g., destination, owner)"
    }
  ],
  "claims": [
    {
      "claim_text": "A single factual claim derived from the document",
      "provenance_status": "OBSERVED | INFERRED | UNKNOWN",
      "source_reference": "Uploaded document: ${filename}"
    }
  ],
  "events": [
    {
      "title": "A descriptive title for the event",
      "event_type": "TRAVEL | MAINTENANCE | APPOINTMENT | RENEWAL | MEETING | SHOPPING | PURCHASE | GENERIC",
      "event_date": "ISO 8601 date, or null if unknown",
      "due_date": "ISO 8601 deadline/expiration date, or null",
      "priority": "LOW | MEDIUM | HIGH"
    }
  ]
}

EXTRACTION RULES:
1. Extract ONLY information supported by the document.
2. NEVER invent missing information.
3. NEVER guess a value simply because it seems likely.
4. OBSERVED: Directly visible/readable information.
5. INFERRED: A reasonable conclusion derived from visible evidence.
6. UNKNOWN: Use only when an extracted/relevant fact cannot be established with sufficient confidence and explicitly needs to be represented as unknown.
7. Do not create unnecessary UNKNOWN claims for every missing field. Only create claims that are supported by the document or represent a meaningful uncertainty/inference.
8. Preserve uncertainty. Do not fabricate dates, names, prices, locations, policies, or relationships.
9. Keep entity types short and normalized.
10. Events MUST originate from captured information. Do not invent dates. Unknown dates remain null. If no events exist, return [].
11. The current date/time is ${new Date().toISOString()}. Use this to resolve relative dates like "tomorrow", "this friday", or "next week" into absolute ISO 8601 dates.`

  const tGenStart = performance.now()
  const response = await generateWithRetry(ai, {
    model: MODEL_NAME,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: documentBuffer.toString('base64'),
              mimeType
            }
          }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          category: { type: Type.STRING },
          event_date: { type: Type.STRING, nullable: true },
          entities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { name: { type: Type.STRING }, type: { type: Type.STRING }, relationship: { type: Type.STRING } },
              required: ["name", "type", "relationship"]
            }
          },
          claims: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { claim_text: { type: Type.STRING }, provenance_status: { type: Type.STRING }, source_reference: { type: Type.STRING } },
              required: ["claim_text", "provenance_status", "source_reference"]
            }
          },
          events: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                event_type: { type: Type.STRING },
                event_date: { type: Type.STRING, nullable: true },
                due_date: { type: Type.STRING, nullable: true },
                priority: { type: Type.STRING }
              },
              required: ["title", "event_type", "priority"]
            }
          }
        },
        required: ["title", "summary", "category", "entities", "claims", "events"]
      }
    }
  })
  const tGenEnd = performance.now()

  const responseText = response.text
  if (!responseText) throw new Error('Gemini returned an empty response')

  try {
    const rawJson = JSON.parse(responseText)
    const result = CaptureResponseSchema.parse(rawJson)
    console.log(`[TRACE TIMING - INTERNAL] gemini_api: ${(tGenEnd - tGenStart).toFixed(2)}ms`)
    return result
  } catch (error) {
    console.error('Failed to parse or validate Gemini output:', error)
    throw new Error('Gemini returned an invalid or malformed structure')
  }
}

export async function processAudioWithGemini(
  audioBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<CaptureResponse> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Server configuration error: GEMINI_API_KEY is not set')

  const ai = new GoogleGenAI({ apiKey })

  const prompt = `You are the core intelligence of TRACE (Trusted Retrieval and Associated Context Engine).
Your job is to listen to the supplied voice note/audio and convert its spoken information into structured TRACE memory context.
Return ONLY valid JSON matching the exact schema below.

SCHEMA:
{
  "title": "A short, descriptive title",
  "summary": "Concise summary of what this audio represents",
  "category": "A broad category classification (e.g., Travel, Finance, Work, Personal)",
  "event_date": "ISO 8601 date relevant to the event shown, or null if unknown",
  "entities": [
    {
      "name": "Entity Name",
      "type": "Entity Type (e.g., PERSON, LOCATION, ORGANIZATION, EVENT, PRODUCT, DATE)",
      "relationship": "Short descriptor of relation to the main context (e.g., destination, owner)"
    }
  ],
  "claims": [
    {
      "claim_text": "A single factual claim derived from the audio",
      "provenance_status": "OBSERVED | INFERRED | UNKNOWN",
      "source_reference": "Voice note: ${filename}"
    }
  ],
  "events": [
    {
      "title": "A descriptive title for the event",
      "event_type": "TRAVEL | MAINTENANCE | APPOINTMENT | RENEWAL | MEETING | SHOPPING | PURCHASE | GENERIC",
      "event_date": "ISO 8601 date, or null if unknown",
      "due_date": "ISO 8601 deadline/expiration date, or null",
      "priority": "LOW | MEDIUM | HIGH"
    }
  ]
}

EXTRACTION RULES:
1. Extract ONLY information supported by the spoken content.
2. NEVER invent missing information.
3. NEVER guess a value simply because it seems likely.
4. OBSERVED: Directly spoken/stated information by the user.
5. INFERRED: A reasonable conclusion derived from the spoken evidence.
6. UNKNOWN: Use only when an extracted/relevant fact cannot be established with sufficient confidence.
7. Preserve uncertainty. Do not fabricate dates, names, prices, locations, policies, or relationships.
8. Keep entity types short and normalized.
9. The current date/time is ${new Date().toISOString()}. Use this to resolve relative dates like "tomorrow", "this friday", or "next week" into absolute ISO 8601 dates.
10. Events MUST originate from captured information. Do not invent dates. Unknown dates remain null. If no events exist, return [].`

  const tGenStart = performance.now()
  const response = await generateWithRetry(ai, {
    model: MODEL_NAME,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: audioBuffer.toString('base64'),
              mimeType
            }
          }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          category: { type: Type.STRING },
          event_date: { type: Type.STRING, nullable: true },
          entities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { name: { type: Type.STRING }, type: { type: Type.STRING }, relationship: { type: Type.STRING } },
              required: ["name", "type", "relationship"]
            }
          },
          claims: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { claim_text: { type: Type.STRING }, provenance_status: { type: Type.STRING }, source_reference: { type: Type.STRING } },
              required: ["claim_text", "provenance_status", "source_reference"]
            }
          },
          events: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                event_type: { type: Type.STRING },
                event_date: { type: Type.STRING, nullable: true },
                due_date: { type: Type.STRING, nullable: true },
                priority: { type: Type.STRING }
              },
              required: ["title", "event_type", "priority"]
            }
          }
        },
        required: ["title", "summary", "category", "entities", "claims", "events"]
      }
    }
  })
  const tGenEnd = performance.now()

  const responseText = response.text
  if (!responseText) throw new Error('Gemini returned an empty response')

  try {
    const rawJson = JSON.parse(responseText)
    const result = CaptureResponseSchema.parse(rawJson)
    console.log(`[TRACE TIMING - INTERNAL] gemini_api: ${(tGenEnd - tGenStart).toFixed(2)}ms`)
    return result
  } catch (error) {
    console.error('Failed to parse or validate Gemini output:', error)
    throw new Error('Gemini returned an invalid or malformed structure')
  }
}

export async function processTextWithGemini(
  textContent: string,
  filename: string
): Promise<CaptureResponse> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Server configuration error: GEMINI_API_KEY is not set')

  const ai = new GoogleGenAI({ apiKey })

  const prompt = `You are the core intelligence of TRACE (Trusted Retrieval and Associated Context Engine).
Your job is to read the supplied text and convert its information into structured TRACE memory context.
Return ONLY valid JSON matching the exact schema below.

SCHEMA:
{
  "title": "A short, descriptive title",
  "summary": "Concise summary of what this text represents",
  "category": "A broad category classification (e.g., Travel, Finance, Work, Personal)",
  "event_date": "ISO 8601 date relevant to the event shown, or null if unknown",
  "entities": [
    {
      "name": "Entity Name",
      "type": "Entity Type (e.g., PERSON, LOCATION, ORGANIZATION, EVENT, PRODUCT, DATE)",
      "relationship": "Short descriptor of relation to the main context (e.g., destination, owner)"
    }
  ],
  "claims": [
    {
      "claim_text": "A single factual claim derived from the text",
      "provenance_status": "OBSERVED | INFERRED | UNKNOWN",
      "source_reference": "Typed text: ${filename}"
    }
  ],
  "events": [
    {
      "title": "A descriptive title for the event",
      "event_type": "TRAVEL | MAINTENANCE | APPOINTMENT | RENEWAL | MEETING | SHOPPING | PURCHASE | GENERIC",
      "event_date": "ISO 8601 date, or null if unknown",
      "due_date": "ISO 8601 deadline/expiration date, or null",
      "priority": "LOW | MEDIUM | HIGH"
    }
  ]
}

EXTRACTION RULES:
1. Extract ONLY information supported by the text.
2. NEVER invent missing information.
3. NEVER guess a value simply because it seems likely.
4. OBSERVED: Directly stated/written information by the user.
5. INFERRED: A reasonable conclusion derived from the written evidence.
6. UNKNOWN: Use only when an extracted/relevant fact cannot be established with sufficient confidence.
7. Preserve uncertainty. Do not fabricate dates, names, prices, locations, policies, or relationships.
8. Keep entity types short and normalized.
9. The current date/time is ${new Date().toISOString()}. Use this to resolve relative dates like "tomorrow", "this friday", or "next week" into absolute ISO 8601 dates.
10. Events MUST originate from captured information. Do not invent dates. Unknown dates remain null. If no events exist, return [].

USER TEXT:
${textContent}`

  const tGenStart = performance.now()
  const response = await generateWithRetry(ai, {
    model: MODEL_NAME,
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          category: { type: Type.STRING },
          event_date: { type: Type.STRING, nullable: true },
          entities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { name: { type: Type.STRING }, type: { type: Type.STRING }, relationship: { type: Type.STRING } },
              required: ["name", "type", "relationship"]
            }
          },
          claims: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { claim_text: { type: Type.STRING }, provenance_status: { type: Type.STRING }, source_reference: { type: Type.STRING } },
              required: ["claim_text", "provenance_status", "source_reference"]
            }
          },
          events: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                event_type: { type: Type.STRING },
                event_date: { type: Type.STRING, nullable: true },
                due_date: { type: Type.STRING, nullable: true },
                priority: { type: Type.STRING }
              },
              required: ["title", "event_type", "priority"]
            }
          }
        },
        required: ["title", "summary", "category", "entities", "claims", "events"]
      }
    }
  })
  const tGenEnd = performance.now()

  const responseText = response.text
  if (!responseText) throw new Error('Gemini returned an empty response')

  try {
    const rawJson = JSON.parse(responseText)
    const result = CaptureResponseSchema.parse(rawJson)
    console.log(`[TRACE TIMING - INTERNAL] gemini_api: ${(tGenEnd - tGenStart).toFixed(2)}ms`)
    return result
  } catch (error) {
    console.error('Failed to parse or validate Gemini output:', error)
    throw new Error('Gemini returned an invalid or malformed structure')
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Server configuration error: GEMINI_API_KEY is not set')

  const ai = new GoogleGenAI({ apiKey })

  const tStart = performance.now()
  const response = await ai.models.embedContent({
    model: 'gemini-embedding-2',
    contents: text,
    config: { outputDimensionality: 768 }
  })
  const tEnd = performance.now()

  console.log(`[TRACE TIMING - INTERNAL] gemini_embedding: ${(tEnd - tStart).toFixed(2)}ms`)

  const vector = response.embeddings?.[0]?.values
  if (!vector || vector.length === 0) {
    throw new Error('Gemini returned an empty embedding vector')
  }

  return vector
}

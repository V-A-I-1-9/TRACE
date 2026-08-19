import { z } from 'zod'

export const EntitySchema = z.object({
  name: z.string().describe('The name of the entity'),
  type: z.string().describe('The type of the entity (e.g. PERSON, LOCATION, ORGANIZATION, EVENT, PRODUCT, DATE, VEHICLE, TRANSACTION)'),
  relationship: z.string().describe('A short descriptor of how this entity relates to the main memory context (e.g. "destination", "booking", "owner")')
})

export const ClaimSchema = z.object({
  claim_text: z.string().describe('A single factual claim derived from the image'),
  provenance_status: z.enum(['OBSERVED', 'INFERRED', 'UNKNOWN']).describe('OBSERVED for directly visible facts, INFERRED for reasonable deductions from visible facts, UNKNOWN when the fact cannot be confidently established'),
  source_reference: z.string().describe('A reference string identifying the source of this claim, usually the filename')
})

export const EventSchema = z.object({
  title: z.string().describe('A descriptive title for the event'),
  event_type: z.string().describe('The type of event (e.g. TRAVEL, MAINTENANCE, APPOINTMENT, RENEWAL, MEETING, GENERIC)'),
  event_date: z.string().nullable().describe('ISO 8601 date when the event happens/starts, or null if unknown'),
  due_date: z.string().nullable().describe('ISO 8601 date representing a deadline, expiration, or due date, or null if none'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).describe('The priority or urgency of this event')
})

export const CaptureResponseSchema = z.object({
  title: z.string().describe('A short, descriptive title for the captured context'),
  summary: z.string().describe('A concise summary of what this represents'),
  category: z.string().describe('A broad category classification (e.g. Travel, Finance, Work, Personal)'),
  event_date: z.string().nullable().describe('The ISO 8601 date relevant to the event shown, or null if unknown'),
  entities: z.array(EntitySchema).describe('List of distinct entities identified'),
  claims: z.array(ClaimSchema).describe('List of factual claims extracted'),
  events: z.array(EventSchema).optional().describe('List of actionable events extracted from the context')
})

export type CaptureResponse = z.infer<typeof CaptureResponseSchema>
export type ExtractedEntity = z.infer<typeof EntitySchema>
export type ExtractedClaim = z.infer<typeof ClaimSchema>
export type ExtractedEvent = z.infer<typeof EventSchema>

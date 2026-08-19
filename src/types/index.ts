export type EntityType = 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'CONCEPT' | 'EVENT' | 'ITEM';
export type ProvenanceStatus = 'OBSERVED' | 'INFERRED' | 'UNKNOWN';

export interface User {
  id: string;
  email: string;
}

export interface Memory {
  id: string;
  user_id: string;
  title: string;
  summary: string | null;
  category: string | null;
  source_type: 'IMAGE' | 'DOCUMENT' | 'VOICE' | 'TEXT' | 'SCREENSHOT';
  source_path: string | null;
  event_date: string | null;
  created_at: string;
  updated_at: string;
  last_verified: string | null;
}

export interface Entity {
  id: string;
  user_id: string;
  name: string;
  type: EntityType;
  created_at: string;
}

export interface MemoryEntity {
  memory_id: string;
  entity_id: string;
  relationship: string | null;
}

export interface Claim {
  id: string;
  memory_id: string;
  claim_text: string;
  provenance_status: ProvenanceStatus;
  source_reference: string | null;
  created_at: string;
}

export interface Interaction {
  id: string;
  user_id: string;
  query: string;
  response: string;
  created_at: string;
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MemoryExplorer } from '@/components/domain/MemoryExplorer'

export default async function ContextPage() {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  const { data: memories, error } = await supabase
    .from('memories')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const { data: entities } = await supabase
    .from('entities')
    .select('id, name, type')
    .eq('user_id', user.id)

  const { data: me } = await supabase
    .from('memory_entities')
    .select('memory_id, entity_id')

  // Fetch events and reminders, ignore if tables don't exist yet
  let events: Record<string, unknown>[] = []
  let reminders: Record<string, unknown>[] = []
  
  try {
    const { data: evData } = await supabase.from('events').select('*').eq('user_id', user.id)
    if (evData) events = evData

    const { data: remData } = await supabase.from('reminders').select('*').eq('user_id', user.id)
    if (remData) reminders = remData
  } catch {}

  if (error) {
    console.error('Failed to fetch memories:', error)
  }

  const safeMemories = memories || []
  const safeEntities = entities || []
  const safeMe = me || []

  // Deduplicate entities (JS-level for Phase 3B)
  const entityIdToNormalizedName = new Map<string, string>()
  safeEntities.forEach(e => {
    entityIdToNormalizedName.set(e.id, e.name.toLowerCase().trim())
  })

  // Map memory_id to list of connected normalized entity names
  const memoryIdToEntities: Record<string, string[]> = {}
  safeMe.forEach(relation => {
    const normName = entityIdToNormalizedName.get(relation.entity_id)
    if (normName) {
      if (!memoryIdToEntities[relation.memory_id]) {
        memoryIdToEntities[relation.memory_id] = []
      }
      memoryIdToEntities[relation.memory_id].push(normName)
    }
  })

  // Map normalized entity name to list of memory IDs
  const entityToMemories = new Map<string, Set<string>>()
  safeMe.forEach(relation => {
    const normName = entityIdToNormalizedName.get(relation.entity_id)
    if (normName) {
      if (!entityToMemories.has(normName)) {
        entityToMemories.set(normName, new Set())
      }
      entityToMemories.get(normName)!.add(relation.memory_id)
    }
  })

  // Pre-calculate related memories for each memory
  const memoryIdToRelatedMemories: Record<string, { id: string, title: string }[]> = {}
  safeMemories.forEach(memory => {
    const connectedEntityNames = new Set<string>()
    safeMe.forEach(relation => {
      if (relation.memory_id === memory.id) {
        const normName = entityIdToNormalizedName.get(relation.entity_id)
        if (normName) connectedEntityNames.add(normName)
      }
    })

    const relatedMemoryIds = new Set<string>()
    connectedEntityNames.forEach(normName => {
      const memIds = entityToMemories.get(normName)
      if (memIds) {
        memIds.forEach(id => {
          if (id !== memory.id) relatedMemoryIds.add(id)
        })
      }
    })

    memoryIdToRelatedMemories[memory.id] = safeMemories
      .filter(m => relatedMemoryIds.has(m.id))
      .map(m => ({ id: m.id, title: m.title }))
  })

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24 pt-8 px-4">
      <div className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">Memories</h1>
        <p className="text-xl text-muted-foreground font-light">
          Explore everything TRACE knows.
        </p>
      </div>

      <MemoryExplorer 
        memories={safeMemories} 
        entityMap={memoryIdToEntities}
        relatedMemoriesMap={memoryIdToRelatedMemories}
        events={events}
        reminders={reminders}
      />
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { DeleteAction } from './DeleteAction'
import { SourceMark, sourceFormat } from './SourceMark'
import { SourcePreview } from './SourcePreview'
import Link from 'next/link'
import { useState } from 'react'
import { Search, Database, Calendar as CalendarIcon, Clock, Link as LinkIcon, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { GlassCard } from '@/components/domain/GlassCard'
import { EmptyState } from '@/components/domain/EmptyState'
import { Badge } from '@/components/ui/badge'

interface MemoryExplorerProps {
  initialType?: string
  /* eslint-disable @typescript-eslint/no-explicit-any */
  memories: any[]
  entityMap: Record<string, string[]>
  relatedMemoriesMap: Record<string, { id: string; title: string }[]>
  events: any[]
  initialMemory?: string
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

const displayDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric'
})

export function MemoryExplorer({ 
  memories, 
  entityMap, 
  relatedMemoriesMap,
  events, initialMemory, initialType
}: MemoryExplorerProps) {
  const router = useRouter()
  const [notice,setNotice] = useState('')
  const [removed,setRemoved] = useState<string[]>([])
  const [oldestFirst,setOldestFirst] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState(initialType && ['IMAGE','DOCUMENT','VOICE','TEXT'].includes(initialType) ? initialType : 'ALL')
  const [expandedId, setExpandedId] = useState<string | null>(initialMemory ?? null)

  const term = search.trim().toLowerCase()
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const filteredMemories = memories.filter((m: any) => {
    const matchesSearch = [m.title, m.summary, m.category, ...(entityMap[m.id] || []),
      ...(m.claims || []).map((c:{claim_text:string})=>c.claim_text)]
      .some(value => value?.toLowerCase().includes(term))
    const matchesType = filterType === 'ALL' || m.source_type === filterType || (filterType === 'VOICE' && m.source_type === 'AUDIO') || (filterType === 'DOCUMENT' && m.source_type === 'PDF')
    return !removed.includes(m.id) && matchesSearch && matchesType
  })

  if (oldestFirst) filteredMemories.reverse()

  return (
    <div className="space-y-6">
      <div className="library-tools">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            aria-label="Search memories" placeholder="Search your memories…"
            className="pl-9 h-11 bg-card border-border"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="format-filters">
          {['ALL', 'TEXT', 'IMAGE', 'DOCUMENT', 'VOICE'].map(type => (
            <button 
              key={type}
              aria-pressed={filterType === type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
                filterType === type 
                  ? 'bg-primary text-primary-foreground border-primary' 
                  : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'
              }`}
            >
              {type === 'ALL' ? 'All types' : type[0]+type.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span aria-live="polite">{filteredMemories.length} {filteredMemories.length===1?'memory':'memories'}</span>
        <select aria-label="Memory order" className="rounded-md border bg-card px-2 py-2" value={oldestFirst?'old':'new'} onChange={e=>setOldestFirst(e.target.value==='old')}>
          <option value="new">Newest first</option><option value="old">Oldest first</option>
        </select>
      </div>
      {notice && <p role="status" className="rounded-md border bg-secondary p-3 text-sm">{notice}</p>}
      {filteredMemories.length === 0 ? (
        <EmptyState 
          icon={Database} 
          title="No memories found." 
          description={memories.length ? "Try adjusting your search or filters." : "Your memory space is empty. Capture your first context."}
        />
      ) : (
        <div className="library-list">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {filteredMemories.map((memory: any) => {
            const isExpanded = expandedId === memory.id
            const connectedEntities = entityMap[memory.id] || []
            const related = (relatedMemoriesMap[memory.id] || []).filter(item=>!removed.includes(item.id))
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            const memoryEvents = events.filter((e: any) => e.memory_id === memory.id)
            
            return (
              <GlassCard 
                id={'memory-'+memory.id}
                key={memory.id} 
                className="library-record" data-expanded={isExpanded}
              >
                <button className="record-toggle" aria-expanded={isExpanded} aria-label={memory.title} onClick={() => setExpandedId(isExpanded ? null : memory.id)}>
                    <SourceMark type={memory.source_type} />
                    <span className="record-body">
                      <span className="record-meta">
                        <span>{memory.category || 'Note'}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3" />
                          {displayDate.format(new Date(memory.created_at))}
                        </span>
                      </span>
                      <strong>{memory.title}</strong>
                      {!isExpanded && <span className="record-summary">{memory.summary}</span>}
                    </span>
                    <ChevronDown className="disclosure" size={16}/>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-4 border-t border-border animate-in slide-in-from-top-2 duration-200">
                    <p className="text-sm text-foreground/90 mb-6 leading-relaxed">{memory.summary}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-6">
                        <div className="flex flex-wrap items-center gap-3">
                          {memory.source_path && <SourcePreview path={memory.source_path} type={memory.source_type} title={memory.title}/>}
                          <Link href={'/ask?memory='+memory.id} onClick={e=>e.stopPropagation()} className="text-sm text-primary underline">Ask about this memory</Link>
                        </div>

                        <DeleteAction kind="memory" title={memory.title}
                          detail={sourceFormat(memory.source_type).label+' · '+new Date(memory.created_at).toLocaleString('en-GB',{ timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium' })+' IST'}
                          onDelete={async()=>{
                            const response=await fetch('/api/memories/'+memory.id,{method:'DELETE'})
                            const data=await response.json()
                            if (!response.ok) throw new Error(data.error || 'Could not delete memory.')
                            return data.message
                          }}
                          onSuccess={message=>{
                            setNotice(message)
                            setRemoved(ids=>[...ids,memory.id])
                            setExpandedId(null)
                            if (initialMemory===memory.id) window.history.replaceState(null,'',initialType ? '/memories?type='+encodeURIComponent(initialType) : '/memories')
                            router.refresh()
                          }}
                        />
                        {/* Entities */}
                        {connectedEntities.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Detected Entities</h5>
                            <div className="flex flex-wrap gap-2">
                              {connectedEntities.map((ent: string, i: number) => (
                                <Badge key={i} variant="outline" className="text-xs font-medium bg-secondary/50 border-white/10">
                                  {ent}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-6">
                        {/* Events / Reminders */}
                        {memoryEvents.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Extracted Events</h5>
                            <div className="space-y-2">
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {memoryEvents.map((ev: any) => (
                                <div key={ev.id} className="bg-primary/10 border border-primary/20 p-3 rounded-lg flex flex-col gap-1">
                                  <span className="text-sm font-medium">{ev.title}</span>
                                  <div className="flex items-center gap-3 text-xs text-primary/70">
                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {ev.event_type}</span>
                                    <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> {ev.event_date || ev.due_date ? displayDate.format(new Date(ev.event_date || ev.due_date)) : 'Date unknown'}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Related Memories */}
                        {related.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Related Context</h5>
                            <div className="space-y-2">
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {related.map((rel: any) => (
                                <Link href={`/memories?memory=${rel.id}#memory-${rel.id}`} onClick={e=>e.stopPropagation()} key={rel.id} className="bg-white/5 border border-white/10 p-3 rounded-lg flex items-center gap-2">
                                  <LinkIcon className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-sm line-clamp-1">{rel.title}</span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </GlassCard>
            )
          })}
        </div>
      )}
    </div>
  )
}

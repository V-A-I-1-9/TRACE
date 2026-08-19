'use client'

import { useState } from 'react'
import { Search, Database, Calendar as CalendarIcon, Clock, Link as LinkIcon, FileText, Image as ImageIcon, Mic } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { GlassCard } from '@/components/domain/GlassCard'
import { EmptyState } from '@/components/domain/EmptyState'
import { Badge } from '@/components/ui/badge'

interface MemoryExplorerProps {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  memories: any[]
  entityMap: Record<string, string[]>
  relatedMemoriesMap: Record<string, { id: string; title: string }[]>
  events: any[]
  reminders: any[]
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export function MemoryExplorer({ 
  memories, 
  entityMap, 
  relatedMemoriesMap,
  events
}: MemoryExplorerProps) {
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('ALL')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const filteredMemories = memories.filter((m: any) => {
    const matchesSearch = m.title.toLowerCase().includes(search.toLowerCase()) || 
                          (m.summary && m.summary.toLowerCase().includes(search.toLowerCase()))
    const matchesType = filterType === 'ALL' || m.source_type === filterType
    return matchesSearch && matchesType
  })

  const getSourceIcon = (type: string | undefined) => {
    switch(type) {
      case 'IMAGE': return <ImageIcon className="w-4 h-4 text-blue-500" />
      case 'PDF':
      case 'DOCUMENT': return <FileText className="w-4 h-4 text-rose-500" />
      case 'VOICE':
      case 'AUDIO': return <Mic className="w-4 h-4 text-amber-500" />
      default: return <FileText className="w-4 h-4 text-emerald-500" />
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search your memories..." 
            className="pl-9 bg-white/5 border-white/10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
          {['ALL', 'TEXT', 'IMAGE', 'DOCUMENT', 'VOICE'].map(type => (
            <button 
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${
                filterType === type 
                  ? 'bg-primary text-primary-foreground border-primary' 
                  : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'
              }`}
            >
              {type === 'ALL' ? 'All Types' : type}
            </button>
          ))}
        </div>
      </div>

      {filteredMemories.length === 0 ? (
        <EmptyState 
          icon={Database} 
          title="No memories found." 
          description={search ? "Try adjusting your search or filters." : "Your memory space is empty. Capture your first context."}
        />
      ) : (
        <div className="space-y-4">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {filteredMemories.map((memory: any) => {
            const isExpanded = expandedId === memory.id
            const connectedEntities = entityMap[memory.id] || []
            const related = relatedMemoriesMap[memory.id] || []
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            const memoryEvents = events.filter((e: any) => e.memory_id === memory.id)
            
            return (
              <GlassCard 
                key={memory.id} 
                className={`transition-all duration-300 cursor-pointer ${isExpanded ? 'border-primary/50 shadow-md shadow-primary/10' : 'hover:border-white/20'}`}
                onClick={() => setExpandedId(isExpanded ? null : memory.id)}
              >
                <div className="p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="flex gap-4 items-start flex-1">
                    <div className="p-3 bg-secondary/50 rounded-xl shrink-0 mt-1 sm:mt-0">
                      {getSourceIcon(memory.source_type)}
                    </div>
                    <div className="space-y-1 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-primary tracking-wider uppercase bg-primary/10 px-2 py-0.5 rounded-md">
                          {memory.category || 'Note'}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3" />
                          {new Date(memory.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="text-lg font-medium leading-tight">{memory.title}</h4>
                      {!isExpanded && <p className="text-sm text-muted-foreground line-clamp-1">{memory.summary}</p>}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-white/5 animate-in slide-in-from-top-2 duration-200">
                    <p className="text-sm text-foreground/90 mb-6 leading-relaxed">{memory.summary}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-6">
                        {/* Source Preview placeholder */}
                        <div className="space-y-2">
                          <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Original Source</h5>
                          <div className="bg-black/20 dark:bg-black/40 rounded-lg p-4 border border-white/5 flex items-center gap-3">
                             {getSourceIcon(memory.source_type)}
                             <span className="text-sm font-medium">Stored securely in TRACE</span>
                          </div>
                        </div>

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
                                    <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> {ev.due_date ? new Date(ev.due_date).toLocaleDateString() : 'Soon'}</span>
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
                                <div key={rel.id} className="bg-white/5 border border-white/10 p-3 rounded-lg flex items-center gap-2">
                                  <LinkIcon className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-sm line-clamp-1">{rel.title}</span>
                                </div>
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

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Brain, Database, Activity, Tag, Sparkles, Bell, Calendar, ChevronRight, FileText, Image as ImageIcon, Mic, Link as LinkIcon } from 'lucide-react'
import Link from 'next/link'
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardContent } from '@/components/domain/GlassCard'
import { EmptyState } from '@/components/domain/EmptyState'

export default async function DashboardPage() {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // Fetch all memories
  const { data: memories } = await supabase
    .from('memories')
    .select('id, title, category, created_at, source_type')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Fetch all entities to process deduplication & counts
  const { data: entities } = await supabase
    .from('entities')
    .select('name, type')
    .eq('user_id', user.id)

  const safeMemories = memories || []
  const safeEntities = entities || []

  // Fetch pending reminders safely (handle un-migrated DB)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let safeReminders: any[] = []
  try {
    // Strategy: Fetch both upcoming events AND reminders.
    // Events are the primary source of truth for "upcoming things".
    // Reminders are auto-generated notifications tied to events.
    const today = new Date().toISOString()

    // Fetch events with future dates
    const { data: upcomingEvents, error: evError } = await supabase
      .from('events')
      .select('id, title, event_type, event_date, due_date, priority, status')
      .eq('user_id', user.id)
      .or(`event_date.gte.${today},due_date.gte.${today}`)
      .order('event_date', { ascending: true, nullsFirst: false })
      .limit(5)

    // Also fetch pending reminders as backup
    const { data: reminders, error: remError } = await supabase
      .from('reminders')
      .select('id, title, reminder_date, priority, status, event:events(title, event_type, event_date, due_date)')
      .eq('user_id', user.id)
      .eq('status', 'PENDING')
      .order('reminder_date', { ascending: true })
      .limit(5)
    
    // Combine: prefer events (richer data), fall back to reminders
    if (!evError && upcomingEvents && upcomingEvents.length > 0) {
      // Transform events to match the rendering format
      safeReminders = upcomingEvents.map(ev => ({
        id: ev.id,
        title: ev.title,
        reminder_date: ev.event_date || ev.due_date,
        event: [{ event_type: ev.event_type, event_date: ev.event_date, due_date: ev.due_date }]
      }))
    } else if (!remError && reminders && reminders.length > 0) {
      safeReminders = reminders
    }
  } catch {
    // Ignore if tables don't exist
  }

  // Calculate Metrics
  const totalMemories = safeMemories.length
  
  // Deduplicate entities in JS
  const entityCounts: Record<string, { count: number; type: string }> = {}
  safeEntities.forEach(e => {
    const key = e.name.toLowerCase().trim()
    if (!entityCounts[key]) {
      entityCounts[key] = { count: 0, type: e.type }
    }
    entityCounts[key].count += 1
  })

  const totalUniqueEntities = Object.keys(entityCounts).length
  const mostConnectedEntities = Object.entries(entityCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)

  // Get appropriate icon for memory source
  const getSourceIcon = (type: string | undefined) => {
    switch(type) {
      case 'IMAGE': return <ImageIcon className="w-4 h-4 text-blue-500" />
      case 'PDF':
      case 'DOCUMENT': return <FileText className="w-4 h-4 text-rose-500" />
      case 'VOICE':
      case 'AUDIO': return <Mic className="w-4 h-4 text-amber-500" />
      default: return <FileText className="w-4 h-4 text-muted-foreground" />
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-24 pt-8 px-4">
      {/* Hero Section */}
      <div className="space-y-4">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Good morning.</h1>
        <p className="text-xl text-muted-foreground font-light">TRACE remembers your important moments.</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard>
          <GlassCardHeader className="pb-2">
            <GlassCardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Memories
              <Database className="h-4 w-4 opacity-50" />
            </GlassCardTitle>
          </GlassCardHeader>
          <GlassCardContent>
            <div className="text-3xl font-medium tracking-tight">{totalMemories}</div>
          </GlassCardContent>
        </GlassCard>
        
        <GlassCard>
          <GlassCardHeader className="pb-2">
            <GlassCardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Entities
              <Brain className="h-4 w-4 opacity-50" />
            </GlassCardTitle>
          </GlassCardHeader>
          <GlassCardContent>
            <div className="text-3xl font-medium tracking-tight">{totalUniqueEntities}</div>
          </GlassCardContent>
        </GlassCard>

        <GlassCard className="hidden md:block">
          <GlassCardHeader className="pb-2">
            <GlassCardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Active Categories
              <Tag className="h-4 w-4 opacity-50" />
            </GlassCardTitle>
          </GlassCardHeader>
          <GlassCardContent>
            <div className="text-3xl font-medium tracking-tight">{Object.keys(entityCounts).length}</div>
          </GlassCardContent>
        </GlassCard>

        <GlassCard>
          <GlassCardHeader className="pb-2">
            <GlassCardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              System Status
              <Activity className="h-4 w-4 opacity-50" />
            </GlassCardTitle>
          </GlassCardHeader>
          <GlassCardContent>
            <div className="text-3xl font-medium tracking-tight text-green-500">Online</div>
          </GlassCardContent>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Feed: Recent Memories */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-medium tracking-tight">Recent Memories</h3>
            <Link href="/memories" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center">
              View all <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
          
          <div className="space-y-4">
            {safeMemories.slice(0, 6).map(memory => (
              <Link key={memory.id} href="/memories">
                <GlassCard className="hover:border-primary/30 hover:bg-white/10 dark:hover:bg-black/40 transition-all cursor-pointer group">
                  <div className="p-5 flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-secondary/50 rounded-xl group-hover:bg-background transition-colors">
                        {getSourceIcon(memory.source_type)}
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-primary font-medium tracking-wider uppercase">{memory.category || 'Note'}</p>
                        <h4 className="text-lg font-medium leading-tight">{memory.title}</h4>
                        <p className="text-sm text-muted-foreground">{new Date(memory.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </Link>
            ))}
            
            {safeMemories.length === 0 && (
              <EmptyState 
                icon={Database} 
                title="Your memory space is empty." 
                description="Capture your first image, document, voice note, or text."
              >
                <Link href="/capture" className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-full font-medium text-sm hover:opacity-90 transition-opacity">
                  Capture Now
                </Link>
              </EmptyState>
            )}
          </div>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-8">
          
          {/* Upcoming Intelligence Widget */}
          <GlassCard>
            <GlassCardHeader className="pb-2">
              <GlassCardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Upcoming
              </GlassCardTitle>
            </GlassCardHeader>
            <GlassCardContent>
              <div className="space-y-4 mt-2">
                {safeReminders.map(rem => {
                   const dateStr = rem.event?.[0]?.event_date || rem.event?.[0]?.due_date || rem.event?.event_date || rem.event?.due_date
                   const dateFormatted = dateStr ? new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Soon'
                   const eventType = rem.event?.[0]?.event_type || rem.event?.event_type || 'REMINDER'
                   return (
                    <div key={rem.id} className="flex flex-col space-y-1 pb-3 border-b border-border/20 last:border-0 last:pb-0">
                      <div className="flex justify-between items-start">
                        <p className="text-sm font-medium leading-tight">{rem.title}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span>{dateFormatted}</span>
                        <span className="px-1.5 py-0.5 bg-secondary rounded-md text-[10px] uppercase font-semibold">{eventType}</span>
                      </div>
                    </div>
                   )
                })}
                {safeReminders.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No upcoming reminders.</p>
                )}
                
                {safeReminders.length > 0 && (
                  <button className="w-full mt-2 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-colors flex items-center justify-center">
                    Show all reminders
                  </button>
                )}
              </div>
            </GlassCardContent>
          </GlassCard>

          {/* Connected Knowledge */}
          <GlassCard>
            <GlassCardHeader className="pb-2 border-b border-white/5 mb-4">
              <GlassCardTitle className="flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-primary" />
                Connected Entities
              </GlassCardTitle>
            </GlassCardHeader>
            <GlassCardContent>
              <div className="space-y-3">
                {mostConnectedEntities.map(([name, data]) => (
                  <div key={name} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center">
                        <span className="text-xs font-semibold capitalize">{name.charAt(0)}</span>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium leading-none capitalize group-hover:text-primary transition-colors">{name}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{data.type}</p>
                      </div>
                    </div>
                    <div className="text-xs font-semibold bg-background border border-border px-2 py-1 rounded-full text-muted-foreground">
                      {data.count} connections
                    </div>
                  </div>
                ))}
                {mostConnectedEntities.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No entities found.</p>
                )}
              </div>
            </GlassCardContent>
          </GlassCard>

          {/* Graph Preview Link */}
          <Link href="/graph" className="block">
            <GlassCard className="hover:border-primary/30 transition-colors">
              <div className="p-6 flex flex-col items-center justify-center text-center space-y-3">
                <div className="p-4 rounded-full bg-primary/10">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">Knowledge Graph</h4>
                  <p className="text-xs text-muted-foreground mt-1">Explore visual connections.</p>
                </div>
              </div>
            </GlassCard>
          </Link>
        </div>
      </div>
    </div>
  )
}

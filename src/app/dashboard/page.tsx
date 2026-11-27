import { upcomingSchedule, expiryLabel } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ArrowUpRight, CalendarDays, ChevronRight, Plus, Waypoints } from 'lucide-react'
import Link from 'next/link'
import { AskDraft } from '@/components/domain/AskDraft'
import { SourceMark, sourceFormat } from '@/components/domain/SourceMark'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  const [memories, entities, schedule] = await Promise.all([
    supabase
      .from('memories')
      .select('id,title,category,created_at,source_type')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('entities').select('name,type,memory_entities!inner(memory_id)').eq('user_id', user.id),
    upcomingSchedule(supabase, 5).catch(() => null),
  ])
  const safeMemories = memories.data ?? []
  const safeEntities = entities.data ?? []
  if (memories.error || entities.error) {
    console.error('Dashboard data unavailable', {
      memories: memories.error?.code,
      entities: entities.error?.code,
    })
  }

  // Calculate Metrics
  const totalMemories = safeMemories.length

  // Deduplicate entities in JS
  const entityCounts: Record<string, { count: number; type: string }> = Object.create(null)
  safeEntities.forEach((e) => {
    const key = e.name.toLowerCase().trim()
    if (!entityCounts[key]) {
      entityCounts[key] = { count: 0, type: e.type }
    }
    entityCounts[key].count += e.memory_entities.length
  })

  const totalUniqueEntities = Object.keys(entityCounts).length
  const mostConnectedEntities = Object.entries(entityCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)

  const dateFormat = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(new Date())
  const formatCounts = new Map<string, number>()
  for (const memory of safeMemories) {
    const format = sourceFormat(memory.source_type).label
    formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1)
  }
  const formats = ['Image', 'Document', 'Voice', 'Text']
  let offset = 0
  const segments = formats.map((format) => {
    const start = offset
    offset += totalMemories ? ((formatCounts.get(format) ?? 0) * 100) / totalMemories : 0
    return 'var(--chart-' + format.toLowerCase() + ') ' + start + '% ' + offset + '%'
  })

  return (
    <div className="workspace-page dashboard-page">
      <header className="page-heading dashboard-heading">
        <div>
          <p className="date-line">{today}</p>
          <h1>Your workspace</h1>
        </div>
        <Link href="/capture" className="primary-action">
          <Plus size={17} />
          Capture a source
        </Link>
      </header>
      <div className="desk-overview">
        <section className="desk-ask">
          <h2>Ask your memories</h2>
          <p>Find a saved detail and follow it back to the original.</p>
          <AskDraft />
        </section>
        <section className="format-summary" aria-label="Memory counts by source type">
          <div
            className="format-ring"
            style={{ background: totalMemories ? 'conic-gradient(' + segments.join(',') + ')' : undefined }}
          >
            <div>
              <strong>{memories.error ? '—' : totalMemories}</strong>
              <span>memories</span>
            </div>
          </div>
          <div className="format-key">
            {formats.map((format) => (
              <Link key={format} href={'/memories?type=' + format.toUpperCase()}>
                <i style={{ background: 'var(--chart-' + format.toLowerCase() + ')' }} />
                {format}
                <strong>{memories.error ? '—' : (formatCounts.get(format) ?? 0)}</strong>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <div className="desk-columns">
        <section className="desk-panel">
          <header className="section-heading">
            <h2>Recent memories</h2>
            <Link href="/memories">
              View all <ArrowUpRight size={14} />
            </Link>
          </header>
          {memories.error && (
            <p role="alert" className="panel-note">
              Could not load recent memories. Refresh to try again.
            </p>
          )}
          {!memories.error && !totalMemories && (
            <p className="panel-note">
              Your first saved source will appear here. <Link href="/capture">Capture a source</Link>
            </p>
          )}
          {safeMemories.slice(0, 6).map((memory) => (
            <Link
              className="recent-row"
              key={memory.id}
              href={`/memories?memory=${memory.id}#memory-${memory.id}`}
            >
              <SourceMark type={memory.source_type} />
              <div>
                <strong>{memory.title}</strong>
                <small>
                  {memory.category || 'Note'}
                  <span aria-hidden="true"> · </span>
                  {dateFormat.format(new Date(memory.created_at))}
                </small>
              </div>
              <ChevronRight size={16} className="row-arrow" />
            </Link>
          ))}
        </section>
        <div className="desk-side">
          <section className="desk-panel">
            <header className="section-heading">
              <h2>Upcoming</h2>
              <CalendarDays size={17} />
            </header>
            {!schedule && (
              <p role="alert" className="panel-note">
                Could not load upcoming items.
              </p>
            )}
            {schedule?.length === 0 && <p className="panel-note">No upcoming events or expiries.</p>}
            {schedule?.map((item) => (
              <Link
                className="agenda-row block hover:bg-secondary/50"
                key={item.id + item.date + item.kind}
                href={`/memories?memory=${item.memory_id}#memory-${item.memory_id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <time dateTime={item.date}>{dateFormat.format(new Date(item.date))}</time>
                  {item.kind === 'COUPON_EXPIRY' && (
                    <span className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900">
                      {expiryLabel(item.date)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <strong>{item.title}</strong>
                  <ChevronRight size={15} aria-hidden="true" />
                </div>
              </Link>
            ))}
          </section>
          <section className="desk-panel">
            <header className="section-heading">
              <h2>Connected entities</h2>
              <Link href="/graph" aria-label="Open knowledge graph">
                <Waypoints size={18} />
              </Link>
            </header>
            {entities.error && (
              <p role="alert" className="panel-note">
                Could not load connected entities.
              </p>
            )}
            {!entities.error && !totalUniqueEntities && (
              <p className="panel-note">
                People, places and organisations appear here when a source mentions them.
              </p>
            )}
            {mostConnectedEntities.map(([name, data]) => (
              <div className="entity-row" key={name}>
                <div>
                  <strong>{name}</strong>
                  <small>{data.type.toLowerCase()}</small>
                </div>
                <span title={data.count + ' connections'} aria-label={data.count + ' connections'}>
                  {data.count}
                </span>
              </div>
            ))}
            {!entities.error && totalUniqueEntities > 0 && (
              <Link className="panel-footer" href="/graph">
                Explore {totalUniqueEntities} entities <ArrowUpRight size={15} />
              </Link>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

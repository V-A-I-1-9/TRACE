import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Bell, Zap, Link as LinkIcon } from 'lucide-react'
import { format } from 'date-fns'

interface ContextCardProps {
  title: string
  summary: string | null
  category: string | null
  eventDate?: string | null
  entities?: string[]
  relatedMemories?: { id: string, title: string }[]
  events?: { id: string, title: string, type: string }[]
  reminders?: { id: string, title: string, status: string }[]
}

export function ContextCard({ title, summary, category, eventDate, entities, relatedMemories, events, reminders }: ContextCardProps) {
  return (
    <Card className="bg-card border-border shadow-sm hover:border-primary/50 transition-colors flex flex-col h-full">
      <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-4">
        <CardTitle className="text-lg font-semibold leading-tight">{title}</CardTitle>
        {category && (
          <Badge variant="secondary" className="shrink-0">{category}</Badge>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <p className="text-sm text-muted-foreground flex-1">
          {summary || 'No summary available.'}
        </p>
        
        {eventDate && (
          <div className="flex items-center text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
            <Calendar className="w-3 h-3 mr-1" />
            {format(new Date(eventDate), 'MMM d, yyyy')}
          </div>
        )}

        {(entities && entities.length > 0) && (
          <div className="mt-4 pt-4 border-t border-border space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {entities.slice(0, 5).map((e, i) => (
                <Badge key={i} variant="outline" className="text-[10px] uppercase font-medium bg-muted/20">
                  {e}
                </Badge>
              ))}
              {entities.length > 5 && (
                <Badge variant="outline" className="text-[10px] bg-muted/20">+{entities.length - 5}</Badge>
              )}
            </div>
          </div>
        )}

        {(relatedMemories && relatedMemories.length > 0) && (
          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
            <p className="text-[10px] uppercase font-bold text-muted-foreground/70 tracking-wider">Related Memories</p>
            <div className="flex flex-col gap-1">
              {relatedMemories.slice(0, 3).map((rm, i) => (
                <div key={i} className="flex items-center text-xs text-primary/80 hover:text-primary transition-colors cursor-pointer">
                  <LinkIcon className="w-3 h-3 mr-1.5 opacity-50" />
                  <span className="truncate">{rm.title}</span>
                </div>
              ))}
              {relatedMemories.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{relatedMemories.length - 3} more</span>
              )}
            </div>
          </div>
        )}

        {(events && events.length > 0) && (
          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
            <p className="text-[10px] uppercase font-bold text-muted-foreground/70 tracking-wider flex items-center"><Zap className="w-3 h-3 mr-1 text-primary"/> Detected Events</p>
            <div className="flex flex-col gap-1.5">
              {events.map((e, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="truncate font-medium">{e.title}</span>
                  <Badge variant="secondary" className="ml-2 text-[9px] px-1 py-0 h-4">{e.type}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {(reminders && reminders.length > 0) && (
          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
            <p className="text-[10px] uppercase font-bold text-muted-foreground/70 tracking-wider flex items-center"><Bell className="w-3 h-3 mr-1 text-orange-500"/> Reminders</p>
            <div className="flex flex-col gap-1">
              {reminders.map((r, i) => (
                <div key={i} className="flex items-center text-xs">
                  <span className={`truncate ${r.status === 'COMPLETED' ? 'line-through text-muted-foreground' : 'font-medium'}`}>{r.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Loader2, AlertCircle, FileText, CheckCircle2, Lightbulb, Sparkles, Plus, MessageSquare, Trash2, Send, CheckSquare, Image as ImageIcon, Mic, ExternalLink } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ThinkingAnimation } from '@/components/domain/ThinkingAnimation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/browser'
import { cn } from '@/lib/utils'
type AskState = 'idle' | 'searching' | 'success' | 'error'

interface Evidence {
  title: string
  category: string
  source_type?: string
  source_path?: string
  event_date: string | null
  claims: { text: string, status: string }[]
  entities: { name: string, type: string }[]
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  evidence?: Evidence[]
  facts?: string[]
  inferences?: string[]
  recommendations?: { category: string, items: string[] }[]
  timings?: Record<string, number>
}

interface Conversation {
  id: string
  title: string
  updated_at: string
}

export default function AskPage() {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<AskState>('idle')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  
  const [selectedSource, setSelectedSource] = useState<{ path: string, type: string } | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [isSourceLoading, setIsSourceLoading] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations')
      if (res.ok) {
        const data = await res.json()
        setConversations(data)
      }
    } catch (err) {
      console.error('Failed to load conversations', err)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchConversations()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    async function loadSourceUrl() {
      if (!selectedSource?.path) return
      setIsSourceLoading(true)
      setSourceUrl(null)

      const { data, error } = await supabase.storage.from('trace-sources').createSignedUrl(selectedSource.path, 3600)
      
      if (!error && data?.signedUrl) {
        // PDFs: open directly in a new tab, don't load into dialog
        if (selectedSource.type === 'DOCUMENT' || selectedSource.type === 'PDF') {
          window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
          setSelectedSource(null)
          setIsSourceLoading(false)
          return
        }
        setSourceUrl(data.signedUrl)
      } else {
        setSourceUrl(null)
      }
      setIsSourceLoading(false)
    }
    loadSourceUrl()
  }, [selectedSource, supabase])

  const handleSelectConversation = async (id: string) => {
    setCurrentConversationId(id)
    setMessages([])
    setState('idle')
    setErrorMsg('')
    setQuery('')
    
    try {
      const res = await fetch(`/api/conversations/${id}`)
      if (res.ok) {
        const data = await res.json()
        const formattedMessages: ChatMessage[] = data.map((msg: { id: string, role: 'user'|'assistant', content: string, structured_response?: Record<string, unknown> }) => {
          const structured = msg.structured_response || {}
          return {
            id: msg.id,
            role: msg.role,
            content: msg.content,
            evidence: structured.evidence,
            facts: structured.facts,
            inferences: structured.inferences,
            recommendations: structured.recommendations,
            timings: structured.timings,
          }
        })
        setMessages(formattedMessages)
      }
    } catch (err) {
      console.error('Failed to load messages', err)
    }
  }

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setConversations(prev => prev.filter(c => c.id !== id))
        if (currentConversationId === id) {
          setCurrentConversationId(null)
          setMessages([])
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation', err)
    }
  }

  const startNewChat = () => {
    setCurrentConversationId(null)
    setMessages([])
    setState('idle')
    setErrorMsg('')
    setQuery('')
  }

  const handleAsk = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!query.trim() || state === 'searching') return

    const currentQuery = query.trim()
    const userMessage: ChatMessage = { id: Date.now().toString(), role: 'user', content: currentQuery }
    
    setMessages(prev => [...prev, userMessage])
    setQuery('')
    setState('searching')
    setErrorMsg('')

    let currentAssistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
    }
    setMessages(prev => [...prev, currentAssistantMessage])

    try {
      let convId = currentConversationId

      if (!convId) {
        // Create new conversation
        const convRes = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: currentQuery })
        })
        if (!convRes.ok) throw new Error('Failed to create conversation')
        const newConv = await convRes.json()
        convId = newConv.id
        setCurrentConversationId(newConv.id)
        setConversations(prev => [newConv, ...prev])
      }

      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: currentQuery, conversation_id: convId })
      })

      if (!res.ok) {
        let errStr = 'Failed to get an answer'
        try {
           const errData = await res.json()
           errStr = errData.error || errStr
        } catch {}
        throw new Error(errStr)
      }

      if (!res.body) throw new Error('Streaming is not supported in this browser.')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      
      let done = false
      let buffer = ''
      
      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        if (value) {
          buffer += decoder.decode(value, { stream: !done })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const data = JSON.parse(line)
              if (data.type === 'chunk') {
                currentAssistantMessage = {
                  ...currentAssistantMessage,
                  content: currentAssistantMessage.content + data.text
                }
                setMessages(prev => {
                  const newMsgs = [...prev]
                  newMsgs[newMsgs.length - 1] = currentAssistantMessage
                  return newMsgs
                })
              } else if (data.type === 'complete') {
                currentAssistantMessage = {
                  ...currentAssistantMessage,
                  content: data.data.answer,
                  evidence: data.data.evidence,
                  facts: data.data.facts,
                  inferences: data.data.inferences,
                  recommendations: data.data.recommendations,
                  timings: data.data.timings
                }
                setMessages(prev => {
                  const newMsgs = [...prev]
                  newMsgs[newMsgs.length - 1] = currentAssistantMessage
                  return newMsgs
                })
              } else if (data.type === 'error') {
                throw new Error(data.error)
              }
            } catch (e) {
               console.error('Error parsing chunk:', e)
            }
          }
        }
      }

      setState('success')
    } catch (err) {
      console.error(err)
      setState('error')
      setErrorMsg(err instanceof Error ? err.message : 'TRACE is temporarily unavailable. Your data is safe. Please try again.')
      setMessages(prev => {
        const newMsgs = [...prev]
        if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === 'assistant' && !newMsgs[newMsgs.length - 1].content) {
          newMsgs.pop()
        }
        return newMsgs
      })
    }
  }

  const getProvenanceBadgeColor = (status: string) => {
    switch(status) {
      case 'OBSERVED': return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
      case 'INFERRED': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
      case 'UNKNOWN': return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
      default: return 'bg-muted text-muted-foreground border-border'
    }
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] pt-4 pb-20 md:pb-4 gap-6 max-w-[1400px] mx-auto">
      
      {/* Sidebar: Conversation History */}
      <div className="hidden lg:flex w-64 flex-col gap-4 h-full">
        <Button onClick={startNewChat} variant="default" className="w-full justify-start gap-2 bg-primary/10 text-primary hover:bg-primary/20">
          <Plus className="w-4 h-4" />
          New Conversation
        </Button>
        <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-none">
          {conversations.map(conv => (
            <div 
              key={conv.id} 
              className={cn(
                "group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border",
                currentConversationId === conv.id 
                  ? "bg-white/10 border-white/20" 
                  : "bg-transparent border-transparent hover:bg-white/5"
              )}
              onClick={() => handleSelectConversation(conv.id)}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <MessageSquare className="w-4 h-4 shrink-0 opacity-50" />
                <span className="text-sm truncate text-foreground/80 group-hover:text-foreground">{conv.title}</span>
              </div>
              <button 
                onClick={(e) => handleDeleteConversation(conv.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 hover:text-destructive rounded transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              No previous conversations.
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full max-w-4xl mx-auto w-full relative">
        <div className="flex-1 overflow-y-auto scrollbar-none px-4">
          
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center space-y-6 animate-in fade-in zoom-in duration-500">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center space-y-2 max-w-md">
                <h2 className="text-2xl font-semibold tracking-tight">How can I help you today?</h2>
                <p className="text-muted-foreground">Ask TRACE to retrieve your context, summarize events, or give recommendations based on your memories.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-8 pb-8 pt-4">
              {messages.map((msg, idx) => (
                <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  
                  {msg.role === 'user' ? (
                    <div className="bg-primary text-primary-foreground px-5 py-3 rounded-2xl rounded-tr-sm max-w-[85%] shadow-sm">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                    </div>
                  ) : (
                    <div className="w-full max-w-[95%] space-y-4">
                      {/* Assistant Bubble */}
                      <div className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                          <Sparkles className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 space-y-6 text-foreground/90 leading-relaxed text-sm">
                          
                          {/* Answer Content */}
                          {msg.content ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                              {msg.content}
                            </div>
                          ) : state === 'searching' && idx === messages.length - 1 ? (
                            <ThinkingAnimation />
                          ) : null}

                          {/* Recommendations Section */}
                          {msg.recommendations && msg.recommendations.length > 0 && (
                            <div className="mt-6 space-y-3 bg-secondary/30 rounded-xl p-5 border border-white/5">
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
                                <Lightbulb className="w-4 h-4 text-amber-500" />
                                TRACE Recommendations
                              </h4>
                              {msg.recommendations.map((rec, i) => (
                                <div key={i} className="space-y-2">
                                  <h5 className="font-medium text-foreground">{rec.category}</h5>
                                  <div className="grid gap-2 pl-1">
                                    {rec.items.map((item, j) => (
                                      <div key={j} className="flex items-start gap-2 text-sm text-muted-foreground bg-background/50 p-2 rounded-lg border border-white/5">
                                        <CheckSquare className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                                        <span>{item}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Reasoning & Evidence Accordion */}
                          {(msg.facts?.length || msg.inferences?.length || msg.evidence?.length) ? (
                            <details className="group [&_summary::-webkit-details-marker]:hidden mt-4">
                              <summary className="flex items-center gap-2 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors bg-white/5 inline-flex px-3 py-1.5 rounded-full border border-white/5">
                                <Search className="w-3.5 h-3.5" />
                                <span>View TRACE Reasoning & Sources</span>
                              </summary>
                              
                              <div className="mt-4 space-y-6 bg-black/10 dark:bg-white/5 rounded-xl p-6 border border-white/5 animate-in slide-in-from-top-2 duration-200">
                                
                                {/* Facts & Inferences */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {msg.facts && msg.facts.length > 0 && (
                                    <div className="space-y-2">
                                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Verified Facts</h5>
                                      <ul className="space-y-2">
                                        {msg.facts.map((fact, i) => (
                                          <li key={i} className="text-xs flex gap-2 items-start"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" /> <span className="leading-relaxed">{fact}</span></li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  
                                  {msg.inferences && msg.inferences.length > 0 && (
                                    <div className="space-y-2">
                                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Inferences</h5>
                                      <ul className="space-y-2">
                                        {msg.inferences.map((inf, i) => (
                                          <li key={i} className="text-xs flex gap-2 items-start"><Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" /> <span className="leading-relaxed">{inf}</span></li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>

                                {/* Evidence Sources */}
                                {msg.evidence && msg.evidence.length > 0 && (
                                  <div className="space-y-3 pt-4 border-t border-white/5">
                                    <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supporting Memories</h5>
                                    <div className="grid grid-cols-1 gap-3">
                                      {msg.evidence.map((ev, i) => {
                                        const isImage = ev.source_type === 'IMAGE'
                                        const isPdf = ev.source_type === 'DOCUMENT' || ev.source_type === 'PDF'
                                        const isAudio = ev.source_type === 'VOICE' || ev.source_type === 'AUDIO'
                                        const SourceIcon = isImage ? ImageIcon : isAudio ? Mic : FileText
                                        const buttonLabel = isImage ? 'View Image' : isPdf ? 'Open PDF' : isAudio ? 'Play Audio' : 'View Source'

                                        return (
                                        <div 
                                          key={i} 
                                          className="bg-background rounded-lg p-4 border border-white/5 space-y-3"
                                        >
                                          <div className="flex justify-between items-start gap-4">
                                            <div className="flex items-center gap-2">
                                              <SourceIcon className={cn("w-4 h-4 shrink-0", isImage ? "text-blue-400" : isAudio ? "text-amber-400" : "text-muted-foreground")} />
                                              <span className="text-sm font-medium">{ev.title}</span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider hidden sm:inline-flex">{ev.category}</Badge>
                                              {ev.source_path && (
                                                <Button 
                                                  variant="outline" 
                                                  size="sm" 
                                                  className="h-6 text-[10px] px-2 gap-1 bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                                                  onClick={() => setSelectedSource({ path: ev.source_path as string, type: ev.source_type || 'TEXT' })}
                                                >
                                                  {isPdf && <ExternalLink className="w-3 h-3" />}
                                                  {buttonLabel}
                                                </Button>
                                              )}
                                            </div>
                                          </div>
                                          
                                          {ev.claims.length > 0 && (
                                            <div className="space-y-2 pl-6">
                                              {ev.claims.map((claim, j) => (
                                                <div key={j} className="flex gap-2 items-start text-xs">
                                                  <Badge variant="outline" className={cn("text-[8px] py-0 px-1 shrink-0", getProvenanceBadgeColor(claim.status))}>
                                                    {claim.status}
                                                  </Badge>
                                                  <span className="text-muted-foreground">{claim.text}</span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )})}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </details>
                          ) : null}

                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {state === 'error' && (
                <div className="flex items-center space-x-2 bg-destructive/10 text-destructive px-4 py-3 rounded-lg text-sm border border-destructive/20 w-fit">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-background/80 backdrop-blur-xl border-t border-white/5 z-10 sticky bottom-0">
          <form onSubmit={handleAsk} className="relative flex items-center max-w-3xl mx-auto">
            <Input 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask anything about your memories..." 
              className="pr-12 py-6 rounded-2xl bg-secondary/50 border-white/10 text-base shadow-sm focus-visible:ring-1 focus-visible:ring-primary/50"
              disabled={state === 'searching'}
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={state === 'searching' || !query.trim()} 
              className="absolute right-2 rounded-xl h-10 w-10 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all"
            >
              {state === 'searching' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
            </Button>
          </form>
          <div className="text-center mt-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">TRACE AI can make mistakes. Verify important information.</p>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedSource} onOpenChange={(open) => {
        if (!open) {
          setSelectedSource(null)
          setSourceUrl(null)
        }
      }}>
        <DialogContent className="sm:max-w-3xl border-white/10 bg-black/95 p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/5">
            <DialogTitle className="text-sm font-medium">Source Evidence</DialogTitle>
          </DialogHeader>
          <div className="w-full min-h-[40vh] max-h-[80vh] flex items-center justify-center p-4 overflow-auto">
            {isSourceLoading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <p className="text-xs text-muted-foreground">Loading secure source...</p>
              </div>
            ) : sourceUrl ? (
              selectedSource?.type === 'IMAGE' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sourceUrl} alt="Evidence" className="max-w-full max-h-[75vh] object-contain rounded-lg" />
              ) : selectedSource?.type === 'VOICE' || selectedSource?.type === 'AUDIO' ? (
                <div className="p-8 w-full max-w-md space-y-4">
                  <div className="text-center text-sm text-muted-foreground mb-4">Voice Memo Evidence</div>
                  <audio src={sourceUrl} controls className="w-full" />
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">This memory was captured from text input.</div>
              )
            ) : (
              <div className="text-sm text-destructive flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Could not generate secure URL for this source.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

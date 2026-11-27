'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Loader2, AlertCircle, FileText, CheckCircle2, Lightbulb, Fingerprint, Plus, MessageSquare, Send, CheckSquare, Image as ImageIcon, Mic } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { ThinkingAnimation } from '@/components/domain/ThinkingAnimation'
import { DeleteAction } from '@/components/domain/DeleteAction'
import { SourcePreview } from '@/components/domain/SourcePreview'
import {responseLines} from '@/lib/stream'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { cn } from '@/lib/utils'
type AskState = 'idle' | 'searching' | 'success' | 'error'

interface Evidence {
  title: string
  category: string
  source_deleted?: boolean
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
  return <Suspense><Chat /></Suspense>
}

function Chat() {
  const params = useSearchParams()
  const [focused, setFocused] = useState(params.get('memory'))
  const loadVersion = useRef(0)
  const [query, setQuery] = useState('')
  const [state, setState] = useState<AskState>('idle')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)


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
    try {
      const draft = sessionStorage.getItem('trace-question-draft')
      if (draft) setQuery(draft)
      sessionStorage.removeItem('trace-question-draft')
    } catch { /* Tab storage may be unavailable. */ }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSelectConversation = async (id: string) => {
    if (state === 'searching') return
    const version = ++loadVersion.current
    setFocused(null)
    setCurrentConversationId(id)
    setMessages([])
    setState('idle')
    setErrorMsg('')
    setQuery('')
    
    try {
      const res = await fetch(`/api/conversations/${id}`)
      if (!res.ok) throw new Error('Could not load this conversation. Select it again to retry.')
      {
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
        if (version === loadVersion.current) setMessages(formattedMessages)
      }
    } catch (err) {
      if (version===loadVersion.current) {
        setState('error')
        setErrorMsg(err instanceof Error ? err.message : 'Could not load this conversation.')
      }
    }
  }

  const deleteChatButton = (conv:Conversation) => state !== 'searching' && (
    <DeleteAction kind="conversation" title={conv.title} compact
      onDelete={async()=>{
        const res=await fetch('/api/conversations/'+conv.id,{method:'DELETE'})
        if (!res.ok && res.status!==404) throw new Error('Could not delete conversation. Please try again.')
        return 'Conversation deleted.'
      }}
      onSuccess={()=>{
        setConversations(prev=>prev.filter(item=>item.id!==conv.id))
        if (currentConversationId===conv.id) startNewChat()
      }}
    />
  )
  const activeConversation = conversations.find(c=>c.id===currentConversationId)

  const startNewChat = () => {
    if (state === 'searching') return
    loadVersion.current++
    setFocused(null)
    setCurrentConversationId(null)
    setMessages([])
    setState('idle')
    setErrorMsg('')
    setQuery('')
  }

  const handleAsk = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!query.trim() || state === 'searching') return

    loadVersion.current++
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
        body: JSON.stringify({ query: currentQuery, conversation_id: convId, memory_id: focused })
      })

      let complete = false
      for await (const event of responseLines(res)) {
        if (event.type === 'error') throw new Error(event.error)
        if (event.type === 'chunk') currentAssistantMessage = {...currentAssistantMessage,content:currentAssistantMessage.content + event.text}
        if (event.type === 'complete') {
          complete = true
          currentAssistantMessage = {...currentAssistantMessage,...event.data,content:event.data.answer}
        }
        const update = currentAssistantMessage
        setMessages(prev=>prev.map(m=>m.id===update.id ? update : m))
      }
      if (!complete) throw new Error('The reply was interrupted. Send your question again.')
      setState('success')
    } catch (err) {
      console.error(err)
      setState('error')
      setErrorMsg(err instanceof Error ? err.message : 'TRACE is temporarily unavailable. Your data is safe. Please try again.')
      setQuery(currentQuery)
      setMessages(prev => prev.filter(m => m.id !== currentAssistantMessage.id && m.id !== userMessage.id))

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
    <div className="workspace-page ask-page">
      
      {/* Sidebar: Conversation History */}
      <div className="conversation-rail">
        <Button onClick={startNewChat} variant="default" className="w-full justify-start gap-2 bg-primary/10 text-primary hover:bg-primary/20">
          <Plus className="w-4 h-4" />
          New conversation
        </Button>
        <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-none">
          {conversations.map(conv => (
            <div 
              key={conv.id} 
              className={cn(
                "group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border",
                currentConversationId === conv.id 
                  ? "bg-secondary border-border"
                  : "bg-transparent border-transparent hover:bg-secondary/60"
              )}
            >
              <button className="conversation-select" onClick={() => handleSelectConversation(conv.id)} aria-current={currentConversationId===conv.id ? "true" : undefined} disabled={state==="searching"}>
                <MessageSquare className="w-4 h-4 shrink-0 opacity-50" />
                <span className="text-sm truncate text-foreground/80 group-hover:text-foreground">{conv.title}</span>
              </button>
              {deleteChatButton(conv)}
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
      <div className="conversation-pane">
        <div className="compact-history">
          <select aria-label="Conversation history" value={currentConversationId || ''} disabled={state==='searching'} onChange={e=>e.target.value ? handleSelectConversation(e.target.value) : startNewChat()} className="min-w-0 flex-1 rounded-lg border bg-card p-2 text-sm">
            <option value="">New conversation</option>
            {conversations.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={startNewChat} disabled={state==='searching'}>New chat</Button>
          {activeConversation && deleteChatButton(activeConversation)}
        </div>
        <div className="conversation-scroll">
          
          {messages.length === 0 ? (
            <div className="ask-empty">
              <div className="ask-emblem">
                <Fingerprint className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center space-y-2 max-w-md">
                <h1>Ask your memories</h1>
                <p className="text-muted-foreground">Ask about a saved coupon, a travel plan, or a detail you remember.</p>
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
                          <Fingerprint className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-6 text-foreground/90 leading-relaxed text-sm">
                          
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
                            <div className="mt-6 space-y-3 bg-secondary/30 rounded-xl p-5 border border-border">
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
                                <Lightbulb className="w-4 h-4 text-amber-500" />
                                TRACE Recommendations
                              </h4>
                              {msg.recommendations.map((rec, i) => (
                                <div key={i} className="space-y-2">
                                  <h5 className="font-medium text-foreground">{rec.category}</h5>
                                  <div className="grid gap-2 pl-1">
                                    {rec.items.map((item, j) => (
                                      <div key={j} className="flex items-start gap-2 text-sm text-muted-foreground bg-background/50 p-2 rounded-lg border border-border">
                                        <CheckSquare className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                                        <span>{item}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {msg.evidence?.filter(e=>e.source_path).map((e,i)=><div key={i} className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><SourcePreview title={e.title} path={e.source_path!} type={e.source_type || 'TEXT'}/>{e.title}</div>)}
                          {msg.evidence?.filter(e=>e.source_deleted).map((e,i)=><p key={i} className="text-xs text-muted-foreground">{e.title} · Original deleted</p>)}
                          {/* Reasoning & Evidence Accordion */}
                          {(msg.facts?.length || msg.inferences?.length || msg.evidence?.length) ? (
                            <details className="group [&_summary::-webkit-details-marker]:hidden mt-4">
                              <summary className="flex items-center gap-2 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors bg-white/5 inline-flex px-3 py-1.5 rounded-full border border-border">
                                <Search className="w-3.5 h-3.5" />
                                <span>Evidence details</span>
                              </summary>
                              
                              <div className="mt-4 space-y-6 bg-secondary/50 rounded-xl p-6 border border-border animate-in slide-in-from-top-2 duration-200">
                                
                                {/* Facts & Inferences */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {msg.facts && msg.facts.length > 0 && (
                                    <div className="space-y-2">
                                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Captured facts</h5>
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
                                          <li key={i} className="text-xs flex gap-2 items-start"><Fingerprint className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" /> <span className="leading-relaxed">{inf}</span></li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>

                                {/* Evidence Sources */}
                                {msg.evidence && msg.evidence.length > 0 && (
                                  <div className="space-y-3 pt-4 border-t border-border">
                                    <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supporting Memories</h5>
                                    <div className="grid grid-cols-1 gap-3">
                                      {msg.evidence.map((ev, i) => {
                                        const isImage = ev.source_type === 'IMAGE'
                                        const isAudio = ev.source_type === 'VOICE' || ev.source_type === 'AUDIO'
                                        const SourceIcon = isImage ? ImageIcon : isAudio ? Mic : FileText

                                        return (
                                        <div 
                                          key={i} 
                                          className="bg-background rounded-lg p-4 border border-border space-y-3"
                                        >
                                          <div className="flex justify-between items-start gap-4">
                                            <div className="flex items-center gap-2">
                                              <SourceIcon className={cn("w-4 h-4 shrink-0", isImage ? "text-blue-400" : isAudio ? "text-amber-400" : "text-muted-foreground")} />
                                              <span className="text-sm font-medium">{ev.title}</span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider hidden sm:inline-flex">{ev.category}</Badge>

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
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {focused && <div className="px-4 py-2 text-sm text-primary">Searching the selected memory <button className="ml-2 underline" onClick={()=>setFocused(null)}>Search all</button></div>}
              {state === 'error' && (
                <div className="flex items-center space-x-2 bg-destructive/10 text-destructive px-4 py-3 rounded-lg text-sm border border-destructive/20 w-fit">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
              )}
        {/* Input Area */}
        <div className="ask-composer">
          <form onSubmit={handleAsk} className="relative flex items-center max-w-3xl mx-auto">
            <Input 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={1500}
              aria-label="Question"
              placeholder="Ask anything about your memories..." 
              className="pr-12 py-6 rounded-2xl bg-secondary/50 border-border text-base shadow-sm focus-visible:ring-1 focus-visible:ring-primary/50"
              disabled={state === 'searching'}
            />
            <Button 
              aria-label="Send question"
              type="submit" 
              size="icon"
              disabled={state === 'searching' || !query.trim()} 
              className="absolute right-2 rounded-xl h-10 w-10 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all"
            >
              {state === 'searching' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
            </Button>
          </form>
          <div className="text-center mt-2">
            <p className="text-xs text-muted-foreground">Open a cited source to verify an answer.</p>
          </div>
        </div>
      </div>

    </div>
  )
}

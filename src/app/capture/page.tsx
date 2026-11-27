'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { responseLines } from '@/lib/stream'
import { CameraCapture } from '@/components/domain/CameraCapture'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Image as ImageIcon, FileText, Mic, Type, Loader2, AlertCircle, CheckCircle2, Square, AudioLines, Sparkles, Clock, MapPin, PersonStanding, Calendar, Archive } from 'lucide-react'
import { ExtractedClaim, ExtractedEntity, CaptureResponse, ExtractedEvent } from '@/lib/validation/gemini'
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardContent } from '@/components/domain/GlassCard'
import { cn } from '@/lib/utils'

type CaptureState = 'idle' | 'selected' | 'analyzing' | 'success' | 'error' | 'text_input' | 'voice_input' | 'image_input'
type CaptureMode = 'IMAGE' | 'DOCUMENT' | 'VOICE' | 'TEXT'
type ProcessingStage = 'received' | 'understanding' | 'verifying' | 'saving' | 'complete'

const STAGES = [
  { id: 'received', label: 'Upload received', desc: 'Securely transferred file.' },
  { id: 'understanding', label: 'Understanding content', desc: 'Reading the source for facts and entities.' },
  { id: 'saving', label: 'Saving memory', desc: 'Storing your source and linking its facts.' }
]

export default function CapturePage() {
  const router = useRouter()
  const [state, setState] = useState<CaptureState>('idle')
  const [captureMode, setCaptureMode] = useState<CaptureMode>('IMAGE')
  const [processingStage, setProcessingStage] = useState<ProcessingStage | null>(null)
  
  const [file, setFile] = useState<File | null>(null)
  const [fromCamera,setFromCamera] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string>('')
  
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [result, setResult] = useState<CaptureResponse & { notice?: string; memory: { id: string, title: string, summary: string, category: string } } | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])
  const recordingAttempt = useRef(0)
  const audioInput = useRef<HTMLInputElement>(null)
  useEffect(() => () => {
    recordingAttempt.current++
    const recorder = mediaRecorderRef.current
    if (recorder) {
      recorder.onstop = null
      recorder.stream.getTracks().forEach(track => track.stop())
    }
  }, [])

  const captureTypes = [
    { title: 'Image', description: 'Take a photo or upload an image', icon: ImageIcon, mode: 'IMAGE' as CaptureMode, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { title: 'Document', description: 'PDF, plain text, Markdown or CSV', icon: FileText, mode: 'DOCUMENT' as CaptureMode, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { title: 'Voice', description: 'Record audio or upload a voice note', icon: Mic, mode: 'VOICE' as CaptureMode, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { title: 'Text', description: 'Type a note or paste an excerpt', icon: Type, mode: 'TEXT' as CaptureMode, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  ]

  const selectImage = (selectedFile: File, camera = false) => {
    setFromCamera(camera)
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(selectedFile.type)) {
      setState('error')
      setErrorMsg('Unsupported file type. Please upload PNG, JPEG, or WEBP.')
      return
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setState('error')
      setErrorMsg('File is too large. Maximum size is 10MB.')
      return
    }
    setFile(selectedFile)
    setPreviewUrl(URL.createObjectURL(selectedFile))
    setCaptureMode('IMAGE')
    setState('selected')
    setErrorMsg('')
  }

  const handleDocSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    if (!['application/pdf', 'text/plain', 'text/markdown', 'text/csv'].includes(selectedFile.type)) {
      setState('error')
      setErrorMsg('Unsupported document type. Please upload PDF or Text files.')
      return
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setState('error')
      setErrorMsg('File is too large. Maximum size is 10MB.')
      return
    }
    setFile(selectedFile)
    setPreviewUrl(null)
    setCaptureMode('DOCUMENT')
    setState('selected')
    setErrorMsg('')
  }

  const startRecording = async () => {
    const attempt = ++recordingAttempt.current
    let stream: MediaStream | undefined
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (recordingAttempt.current !== attempt) {
        stream.getTracks().forEach(track=>track.stop())
        return
      }
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      const chunks: Blob[] = []
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      
      mediaRecorder.onstop = () => {
        const mime = mediaRecorder.mimeType.split(';')[0] || 'audio/webm'
        const audioFile = new File(chunks, 'recording.' + (mime === 'audio/mp4' ? 'm4a' : 'webm'), {type:mime})
        setFile(audioFile)
        setState('selected')
      }
      
      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      stream?.getTracks().forEach(track=>track.stop())
      if (recordingAttempt.current !== attempt) return
      console.error(err)
      setState('error')
      setErrorMsg('Microphone access denied or not supported in this browser.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
      setIsRecording(false)
    }
  }

  const handleCancel = () => {
    recordingAttempt.current++
    if (mediaRecorderRef.current) mediaRecorderRef.current.onstop = null
    stopRecording()
    setProcessingStage(null)
    if (audioInput.current) audioInput.current.value = ''
    setFromCamera(false)
    setFile(null)
    setPreviewUrl(null)
    setTextContent('')
    setState('idle')
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (docInputRef.current) docInputRef.current.value = ''
  }

  const handleAnalyze = async () => {
    if (captureMode === 'TEXT' && !textContent.trim()) return
    if (captureMode !== 'TEXT' && !file) return

    setState('analyzing')
    setProcessingStage('received')
    setErrorMsg('')

    try {
      let res
      
      if (captureMode === 'TEXT') {
        res = await fetch('/api/capture/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textContent })
        })
      } else if (captureMode === 'DOCUMENT') {
        const formData = new FormData()
        formData.append('file', file!)
        res = await fetch('/api/capture/document', { method: 'POST', body: formData })
      } else if (captureMode === 'VOICE') {
        const formData = new FormData()
        formData.append('file', file!)
        res = await fetch('/api/capture/voice', { method: 'POST', body: formData })
      } else {
        const formData = new FormData()
        formData.append('file', file!)
        res = await fetch('/api/capture/image', { method: 'POST', body: formData })
      }
      
      let complete = false
      for await (const data of responseLines(res)) {
        if (data.error) throw new Error(data.error)
        if (data.stage) setProcessingStage(data.stage)
        if (data.success) {
          complete = true
          setResult(data)
          setState('success')
          router.refresh()
        }
      }
      if (!complete) throw new Error('Capture was interrupted. Retry the same source.')
    } catch (err) {
      console.error(err)
      setState('error')
      setErrorMsg(err instanceof Error ? err.message : 'TRACE is temporarily unavailable. Your data is safe. Please try again.')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const getEntityIcon = (type: string) => {
    const t = type.toUpperCase()
    if (t === 'PERSON') return <PersonStanding className="w-3 h-3" />
    if (t === 'LOCATION') return <MapPin className="w-3 h-3" />
    if (t === 'EVENT' || t === 'DATE') return <Calendar className="w-3 h-3" />
    return <Archive className="w-3 h-3" />
  }

  return (
    <div className="workspace-page capture-page space-y-6">
      <div className="page-heading block">
        <h1 className="text-3xl font-semibold tracking-tight">Capture a source</h1>
        <p className="text-muted-foreground">Choose what you want to save. You can open the original again from Memories.</p>
      </div>

      <input type="file" ref={audioInput} accept="audio/*" className="hidden" onChange={e=>{
        const selected = e.target.files?.[0]
        if (selected) { setFile(selected); setCaptureMode('VOICE'); setState('selected') }
      }}/>
      {state === 'error' && !file && captureMode !== 'TEXT' && <div role="alert" className="rounded-lg border p-4">{errorMsg} <Button variant="ghost" onClick={handleCancel}>Choose another source</Button></div>}
      <input type="file" accept="image/png, image/jpeg, image/webp" className="hidden" ref={fileInputRef} onChange={e=>{const selected=e.target.files?.[0]; if(selected) selectImage(selected);e.target.value=''}} />
      <input type="file" accept="application/pdf, text/plain, text/markdown, text/csv" className="hidden" ref={docInputRef} onChange={handleDocSelect} />

      {state === 'idle' && (
        <div className="capture-grid">
          {captureTypes.map((type) => (
            <button type="button" aria-label={type.title}
              key={type.mode} data-format={type.mode} className="capture-tile"
              onClick={() => {
                setCaptureMode(type.mode)
                if (type.mode === 'IMAGE') setState('image_input')
                else if (type.mode === 'DOCUMENT') docInputRef.current?.click()
                else if (type.mode === 'TEXT') { setCaptureMode('TEXT'); setState('text_input') }
                else if (type.mode === 'VOICE') { setCaptureMode('VOICE'); setState('voice_input') }
              }}
            >
              <span className={'source-mark tone-'+type.mode.toLowerCase()}><type.icon size={23} strokeWidth={1.6}/></span>
              <span className="capture-tile-text"><strong>{type.title}</strong><small>{type.description}</small></span>
              <span className="tile-arrow" aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
      )}

      {state==='image_input' && <CameraCapture onPhoto={photo=>selectImage(photo,true)} onUpload={()=>fileInputRef.current?.click()} onCancel={handleCancel} />}
      {/* TEXT INPUT UI */}
      {(state === 'text_input' || (captureMode === 'TEXT' && (state === 'analyzing' || state === 'error'))) && (
        <GlassCard>
          <GlassCardHeader className="border-b border-border pb-4">
            <GlassCardTitle className="flex items-center gap-2">
              <Type className="w-5 h-5 text-primary" /> Text note
            </GlassCardTitle>
          </GlassCardHeader>
          <GlassCardContent className="p-6 space-y-6">
            <Textarea 
              aria-label="Text note" placeholder="Write or paste your note…"
              className="min-h-[150px] resize-none bg-background/50 border-border text-base"
              maxLength={16000}
              value={textContent}
              onChange={e => setTextContent(e.target.value)}
              disabled={state === 'analyzing'}
            />
            {state === 'error' && (
              <div className="flex items-center space-x-2 bg-destructive/10 text-destructive px-4 py-3 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="font-medium">{errorMsg}</span>
              </div>
            )}
            
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={handleCancel} disabled={state === 'analyzing'}>Cancel</Button>
              <Button onClick={handleAnalyze} disabled={state === 'analyzing' || !textContent.trim()} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {state === 'analyzing' ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing</> : <><Sparkles className="w-4 h-4 mr-2" />Save note</>}
              </Button>
            </div>
          </GlassCardContent>
        </GlassCard>
      )}

      {/* VOICE INPUT UI */}
      {state === 'voice_input' && (
        <GlassCard>
          <GlassCardHeader className="border-b border-border pb-4">
            <GlassCardTitle className="flex items-center gap-2">
              <Mic className="w-5 h-5 text-primary" /> Voice note
            </GlassCardTitle>
          </GlassCardHeader>
          <GlassCardContent className="p-12 flex flex-col items-center justify-center space-y-8">
            <div className="relative flex justify-center items-center">
              {isRecording && <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping scale-150" />}
              <button 
                className={cn(
                  "w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-lg z-10",
                  isRecording ? "bg-red-500 hover:bg-red-600 text-white" : "bg-primary hover:bg-primary/90 text-primary-foreground"
                )}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? <Square className="w-8 h-8 fill-current" /> : <Mic className="w-10 h-10" />}
              </button>
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium text-xl">{isRecording ? 'Listening...' : 'Tap to Record'}</p>
              <p className="text-sm text-muted-foreground">Speak your thoughts clearly.</p>
            </div>
            <div className="pt-4">
              <Button variant="outline" disabled={isRecording} onClick={()=>audioInput.current?.click()}>Upload voice note</Button>
              <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
            </div>
          </GlassCardContent>
        </GlassCard>
      )}

      {/* FILE PREVIEW & PROCESSING UI */}
      {(state === 'selected' || (captureMode !== 'TEXT' && (state === 'analyzing' || state === 'error'))) && file && (
        <div className="space-y-6">
          <GlassCard>
            <GlassCardHeader className="border-b border-border pb-4">
              <GlassCardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {captureMode === 'IMAGE' ? <ImageIcon className="w-5 h-5 text-primary" /> : captureMode === 'VOICE' ? <Mic className="w-5 h-5 text-primary" /> : <FileText className="w-5 h-5 text-primary" />}
                  Original Source
                </span>
                <span className="text-xs text-muted-foreground font-normal bg-secondary px-2 py-1 rounded-md">
                  {formatFileSize(file.size)}
                </span>
              </GlassCardTitle>
            </GlassCardHeader>
            <GlassCardContent className="p-6">
              <div className="flex flex-col items-center justify-center min-h-[200px] bg-black/5 dark:bg-white/5 rounded-xl border border-border">
                {captureMode === 'IMAGE' && previewUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={previewUrl} alt="Preview" className="max-h-[300px] object-contain rounded-lg" />
                ) : captureMode === 'VOICE' ? (
                  <AudioLines className="w-16 h-16 text-primary/50" />
                ) : (
                  <div className="text-center">
                    <FileText className="w-16 h-16 text-muted-foreground/50 mx-auto mb-2" />
                    <span className="text-sm font-medium">{file.name}</span>
                  </div>
                )}
              </div>
              
              {state === 'selected' && (
                <div className="flex flex-wrap justify-end gap-3 mt-6">
                  {fromCamera && <Button variant="outline" onClick={()=>{setFile(null);setPreviewUrl(null);setState('image_input')}}>Retake photo</Button>}
                  <Button variant="ghost" onClick={handleCancel}>Discard</Button>
                  <Button onClick={handleAnalyze} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Sparkles className="w-4 h-4 mr-2" /> Save source
                  </Button>
                </div>
              )}
            </GlassCardContent>
          </GlassCard>

          {/* Vertical Processing Timeline */}
          {(state === 'analyzing' || state === 'error') && (
            <GlassCard>
              <GlassCardContent className="p-8">
                <div className="space-y-6">
                  {STAGES.map((s, idx) => {
                    const currentIndex = STAGES.findIndex(x => x.id === processingStage)
                    const isCompleted = processingStage === 'complete' || (currentIndex > -1 && idx < currentIndex)
                    const isCurrent = state === 'analyzing' && s.id === processingStage
                    const isFailed = state === 'error' && s.id === processingStage

                    return (
                      <div key={s.id} className="flex gap-4 relative">
                        {idx !== STAGES.length - 1 && (
                          <div className={cn(
                            "absolute left-[11px] top-8 bottom-[-24px] w-[2px]",
                            isCompleted ? "bg-primary" : "bg-border"
                          )} />
                        )}
                        <div className="relative z-10 bg-background/50 backdrop-blur-sm rounded-full mt-1">
                          {isCompleted ? (
                            <CheckCircle2 className="w-6 h-6 text-primary bg-background rounded-full" />
                          ) : isFailed ? (
                            <AlertCircle className="w-6 h-6 text-destructive bg-background rounded-full" />
                          ) : isCurrent ? (
                            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                          ) : (
                            <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30 bg-background" />
                          )}
                        </div>
                        <div className={cn("pt-1", isCurrent || isCompleted ? "opacity-100" : "opacity-40")}>
                          <h4 className={cn("text-sm font-semibold", isFailed ? "text-destructive" : "")}>{s.label}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                {state === 'error' && (
                  <div className="mt-8">
                    <div className="flex items-center space-x-2 bg-destructive/10 text-destructive px-4 py-3 rounded-lg text-sm mb-4">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span className="font-medium">{errorMsg}</span>
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button variant="ghost" onClick={handleCancel}>Discard</Button>
                      <Button onClick={handleAnalyze}>Try Again</Button>
                    </div>
                  </div>
                )}
              </GlassCardContent>
            </GlassCard>
          )}
        </div>
      )}

      {/* SUCCESS RESULT UI */}
      {state === 'success' && result && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-2xl font-medium flex items-center tracking-tight">
              <Sparkles className="w-6 h-6 text-primary mr-2" />
              Memory saved
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <Link className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground" href={'/ask?memory='+result.memory.id}>Ask about this memory</Link>
              <Link className="text-sm text-primary underline" href={'/memories?memory='+result.memory.id+'#memory-'+result.memory.id}>View in Memories</Link>
              <Button variant="ghost" onClick={handleCancel}>Capture another</Button>
            </div>
          </div>

          {result.notice && <p role="status" className="text-sm text-muted-foreground">{result.notice}</p>}
          <GlassCard className="border-primary/20 overflow-hidden">
            <div className="bg-primary/5 p-6 border-b border-border flex justify-between items-start">
              <div className="space-y-1">
                <span className="text-xs font-bold text-primary tracking-wider uppercase">{result.memory.category}</span>
                <h3 className="text-xl font-semibold leading-tight">{result.memory.title}</h3>
                <p className="text-sm text-muted-foreground max-w-2xl mt-2">{result.memory.summary}</p>
              </div>
            </div>
            
            <div className="p-6 space-y-8">
              {/* Claims Section */}
              {result.claims && result.claims.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Extracted claims</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {result.claims.map((claim: ExtractedClaim, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-border">
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                        <span className="text-sm leading-snug">{claim.claim_text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Entities Section */}
              {result.entities && result.entities.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connected entities</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.entities.map((entity: ExtractedEntity, i: number) => (
                      <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/80 text-xs font-medium border border-border">
                        {getEntityIcon(entity.type)}
                        <span>{entity.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Events Section */}
              {result.events && result.events.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Upcoming Actions</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {result.events.map((event: ExtractedEvent, i: number) => (
                      <div key={i} className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex flex-col gap-1">
                        <span className="text-sm font-semibold">{event.title}</span>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center"><Clock className="w-3 h-3 mr-1"/> {event.event_type}</span>
                          <span className="flex items-center"><Calendar className="w-3 h-3 mr-1"/> {event.due_date || event.event_date || 'Soon'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      )}

    </div>
  )
}

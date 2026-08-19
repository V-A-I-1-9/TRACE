'use client'

import React, { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const phrases = [
  "Connecting context...",
  "Retrieving memories...",
  "Synthesizing facts...",
  "Analyzing relationships...",
  "Refining intelligence...",
  "Formulating insights..."
]

export function ThinkingAnimation({ className }: { className?: string }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % phrases.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className={cn("flex items-center gap-3 mt-2 py-2 px-1", className)}>
      <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
        {/* Glow effect */}
        <div className="absolute w-8 h-8 rounded-full bg-primary/20 blur-md animate-pulse" />
        
        {/* Spinning gradient border effect */}
        <div className="absolute w-6 h-6 rounded-full border-2 border-t-primary border-r-primary/50 border-b-primary/10 border-l-transparent animate-spin" />
        
        {/* Core icon */}
        <Sparkles className="w-3.5 h-3.5 text-primary relative z-10" />
      </div>

      <div 
        key={index}
        className="flex-1 text-sm font-medium text-foreground/80 animate-in fade-in slide-in-from-bottom-1 duration-500"
      >
        {phrases[index]}
      </div>
    </div>
  )
}

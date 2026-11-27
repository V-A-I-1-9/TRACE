'use client'
import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function SourcePreview({ path, type, title }: { path: string; type: string; title: string }) {
  const [open, setOpen] = useState(false)
  const url = '/api/source?path=' + encodeURIComponent(path)
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-primary/30 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10"
      >
        <FileText size={14} />
        View original
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {type === 'IMAGE' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={title} className="mx-auto max-h-[65vh] object-contain" />
          ) : ['VOICE', 'AUDIO'].includes(type) ? (
            <audio controls src={url} className="w-full" />
          ) : (
            <iframe sandbox="" src={url} title={title} className="h-[55vh] w-full rounded bg-white" />
          )}
          <a href={url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
            Open original in a new tab
          </a>
        </DialogContent>
      </Dialog>
    </span>
  )
}

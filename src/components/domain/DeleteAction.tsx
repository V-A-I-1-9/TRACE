'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function DeleteAction({
  kind,
  title,
  detail,
  compact,
  onDelete,
  onSuccess,
}: {
  kind: 'memory' | 'conversation'
  title: string
  detail?: string
  compact?: boolean
  onDelete: () => Promise<string>
  onSuccess: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function confirm() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const message = await onDelete()
      setOpen(false)
      onSuccess(message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm deletion. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value)
          setError('')
        }
      }}
    >
      <DialogTrigger
        className={
          compact
            ? 'p-2 text-muted-foreground hover:text-destructive'
            : 'inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10'
        }
        aria-label={'Delete ' + kind + ' ' + title}
      >
        <Trash2 size={15} />
        {!compact && 'Delete ' + kind}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="max-h-[85dvh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Delete this {kind}?</DialogTitle>
          <DialogDescription>
            {kind === 'memory'
              ? 'This permanently removes this memory, its graph links and reminders. Past chat replies keep their text.'
              : 'This permanently removes the conversation and all its messages.'}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-secondary/50 p-3 break-words">
          <strong>{title}</strong>
          {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={confirm}>
            {busy ? 'Deleting…' : 'Delete ' + kind}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

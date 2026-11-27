import { FileText, Image as ImageIcon, AudioLines, AlignLeft } from 'lucide-react'

const formats = {
  IMAGE: { label: 'Image', icon: ImageIcon, tone: 'image' },
  DOCUMENT: { label: 'Document', icon: FileText, tone: 'document' },
  AUDIO: { label: 'Voice', icon: AudioLines, tone: 'voice' },
  TEXT: { label: 'Text', icon: AlignLeft, tone: 'text' },
}

export function sourceFormat(type: string) {
  const key = type === 'VOICE' ? 'AUDIO' : type === 'PDF' ? 'DOCUMENT' : type
  return formats[key as keyof typeof formats] ?? formats.TEXT
}

export function SourceMark({ type }: { type: string }) {
  const { icon: Icon, tone, label } = sourceFormat(type)
  return (
    <span className={'source-mark tone-' + tone} role="img" aria-label={label}>
      <Icon size={19} strokeWidth={1.65} />
    </span>
  )
}

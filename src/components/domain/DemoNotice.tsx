import { AlertCircle } from 'lucide-react'

interface DemoNoticeProps {
  message?: string
}

export function DemoNotice({ message = 'This is demo data. AI processing is coming in a later phase.' }: DemoNoticeProps) {
  return (
    <div className="flex items-center space-x-2 bg-secondary/50 text-secondary-foreground px-4 py-2 rounded-md text-sm border border-secondary">
      <AlertCircle className="w-4 h-4 text-muted-foreground" />
      <span className="font-medium text-muted-foreground">{message}</span>
    </div>
  )
}

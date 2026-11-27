import { LayoutDashboard, Archive, MessagesSquare, ScanLine, Waypoints } from 'lucide-react'

export const navigation = [
  { name: 'Dashboard', short: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Capture', short: 'Capture', href: '/capture', icon: ScanLine },
  { name: 'Ask TRACE', short: 'Ask', href: '/ask', icon: MessagesSquare },
  { name: 'Memories', short: 'Library', href: '/memories', icon: Archive },
  { name: 'Graph', short: 'Graph', href: '/graph', icon: Waypoints },
]

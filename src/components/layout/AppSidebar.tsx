'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ScanText, BrainCircuit, Search, Network, ChevronLeft, ChevronRight, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Capture', href: '/capture', icon: ScanText },
  { name: 'Ask TRACE', href: '/ask', icon: Search },
  { name: 'Memories', href: '/memories', icon: BrainCircuit },
  { name: 'Graph', href: '/graph', icon: Network },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setUserEmail(data.user.email)
      }
    })
  }, [supabase.auth])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside 
      className={cn(
        "hidden md:flex flex-col bg-white/5 backdrop-blur-xl border-r border-white/10 h-full text-card-foreground transition-all duration-300 relative z-20",
        "dark:bg-black/20 dark:border-white/10",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      <div className={cn("flex items-center pt-8 pb-4", isCollapsed ? "justify-center px-0" : "px-6")}>
        <Link href="/dashboard" className="flex items-center space-x-3 group">
          <div className="bg-primary/10 p-2 rounded-xl group-hover:bg-primary/20 transition-colors">
            <BrainCircuit className="w-6 h-6 text-primary" />
          </div>
          {!isCollapsed && <span className="text-xl font-semibold tracking-tight">TRACE</span>}
        </Link>
      </div>
      
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-10 bg-background border border-border rounded-full p-1 hover:bg-secondary transition-colors"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
        {!isCollapsed && (
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Intelligence
          </p>
        )}
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href) || (pathname === '/' && item.href === '/dashboard')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center rounded-xl transition-all duration-200 group',
                isCollapsed ? 'justify-center p-3' : 'px-3 py-2.5 space-x-3',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
              title={isCollapsed ? item.name : undefined}
            >
              <item.icon className={cn("w-5 h-5", isActive ? "text-primary-foreground" : "")} />
              {!isCollapsed && <span className="font-medium text-sm">{item.name}</span>}
            </Link>
          )
        })}
      </div>

      <div className="p-3 border-t border-white/5">

        {!isCollapsed && (
          <div className="mt-4 px-3 flex items-center justify-between pb-2">
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-primary">
                  {userEmail ? userEmail.charAt(0).toUpperCase() : 'U'}
                </span>
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-medium leading-tight truncate">
                  {userEmail || 'User'}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Logged In
                </span>
              </div>
            </div>
            
            <button 
              onClick={handleSignOut}
              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors ml-2 shrink-0"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

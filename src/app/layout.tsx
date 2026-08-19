import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { MobileNav } from '@/components/layout/MobileNav'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'TRACE | Ask. Retrieve. Verify.',
  description: 'Trusted Retrieval and Associated Context Engine',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable}`}>
      <body className="flex h-screen bg-background text-foreground overflow-hidden font-sans antialiased">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <MobileNav />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}

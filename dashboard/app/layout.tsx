import type { Metadata } from 'next'
import './globals.css'
import Link from 'next/link'
import { Activity, ShieldCheck, Dumbbell, UserPlus, TrendingUp } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Fitness AI System',
  description: 'Explainable AI Engine Dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col antialiased">
        <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-2">
                <Dumbbell className="text-emerald-500 w-6 h-6" />
                <span className="font-bold text-xl tracking-tight text-white">Fitness<span className="text-emerald-500">AI</span></span>
              </div>

              <div className="flex gap-6">
                <Link
                  href="/onboarding"
                  className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  <UserPlus className="w-4 h-4 text-emerald-400" />
                  Onboarding
                </Link>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  <Activity className="w-4 h-4" />
                  User Dashboard
                </Link>
                <Link
                  href="/progress"
                  className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  Progress
                </Link>
                <Link
                  href="/admin"
                  className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  <ShieldCheck className="w-4 h-4 text-rose-400" />
                  Admin Controls
                </Link>
              </div>
            </div>
          </div>
        </nav>

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  )
}

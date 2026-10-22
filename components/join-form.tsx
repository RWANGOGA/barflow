'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, LogOut, Ticket, Wine } from 'lucide-react'
import { signOut } from '@/lib/auth-client'

export default function JoinForm({ code, email, name }: { code: string; email: string; name: string }) {
  const router = useRouter()
  const [value, setValue] = useState(code.toUpperCase())
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function accept(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    const result = await fetch('/api/team/invitations/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: value }),
    })
    if (!result.ok) {
      const body = await result.json().catch(() => ({}))
      setError(body?.error ?? 'Could not join that bar. Ask for a new invitation.')
      setPending(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  const switchAccount = async () => {
    await signOut()
    window.location.assign('/sign-in')
  }

  return <main className="flex min-h-screen flex-col items-center justify-center bg-[#f6f8fa] p-4 text-[#1f2328]">
    <div className="w-full max-w-[400px]">
      <div className="mb-4 flex items-center justify-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-[#1f883d] text-white"><Wine className="size-4"/></span>
        <span className="text-sm font-semibold">Bar management</span>
      </div>
      <div className="rounded-md border border-[#d0d7de] bg-white p-6 shadow-[0_1px_0_rgba(27,31,36,.04)]">
        <h1 className="text-xl font-semibold tracking-tight">Join your bar team</h1>
        <p className="mt-1 text-sm text-[#57606a]">You are signed in as <b className="text-[#1f2328]">{name || email}</b> ({email}).</p>

        <form onSubmit={accept} className="mt-5 flex flex-col gap-4">
          <label className="block text-sm font-semibold">Invitation code
            <input
              required
              autoFocus={!code}
              value={value}
              onChange={e=>setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12))}
              placeholder="e.g. K7QM2XP4RD"
              className="mt-1.5 h-9 w-full rounded-md border border-[#d0d7de] bg-white px-3 font-mono text-sm tracking-[.18em] outline-none transition focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20"
            />
          </label>
          <p className="flex items-start gap-2 rounded-md border border-[#ddf4ff] bg-[#ddf4ff]/40 px-3 py-2 text-[11px] leading-relaxed text-[#0969da]">
            <Ticket className="mt-0.5 size-3.5 shrink-0"/>
            <span>The invitation must have been sent to {email}. Your role is set by the person who invited you.</span>
          </p>
          {error && <p role="alert" className="rounded-md border border-[#ffcecb] bg-[#ffebe9] px-3 py-2 text-xs font-semibold text-[#cf222e]">{error}</p>}
          <button disabled={pending || value.length < 6} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#1f883d] text-sm font-semibold text-white transition hover:bg-[#1a7f37] disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? 'Joining…' : 'Join the bar'}{!pending && <ArrowRight className="size-4"/>}
          </button>
        </form>

        <button onClick={switchAccount} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#57606a] hover:text-[#1f2328]">
          <LogOut className="size-3.5"/>Use a different account
        </button>
      </div>
    </div>
  </main>
}

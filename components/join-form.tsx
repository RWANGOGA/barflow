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

  return <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12 text-ink">
    <div className="w-full max-w-[404px]">
      <div className="flex items-center justify-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-[7px] bg-ink text-white"><Wine className="size-3.5"/></span>
        <span className="display text-[14px]">Barflow</span>
      </div>
      <div className="mt-10">
        <p className="eyebrow justify-center">Invitation</p>
        <h1 className="display mt-4 text-center text-[34px] text-balance sm:text-[38px]">Join your bar team.</h1>
        <p className="mx-auto mt-3 max-w-[340px] text-center text-[13px] leading-relaxed text-ink-muted">You are signed in as <b className="font-medium text-ink">{name || email}</b>{name ? ` (${email})` : ''}.</p>

        <form onSubmit={accept} className="mt-8 flex flex-col gap-4 border-t border-line pt-6">
          <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Invitation code
            <input
              required
              autoFocus={!code}
              value={value}
              onChange={e=>setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12))}
              placeholder="e.g. K7QM2XP4RD"
              className="field mt-2 font-mono text-sm font-normal normal-case tracking-[.18em]"
            />
          </label>
          <p className="flex items-start gap-2.5 border-l-2 border-line pl-3 text-[11px] leading-relaxed text-ink-muted">
            <Ticket className="mt-0.5 size-3.5 shrink-0 text-ink-soft"/>
            <span>The invitation must have been sent to <b className="font-medium text-ink">{email}</b>. Your role is set by the person who invited you.</span>
          </p>
          {error && <p role="alert" className="border-l-2 border-alert bg-alert-tint/70 px-3 py-2 text-[12px] font-medium text-alert">{error}</p>}
          <button disabled={pending || value.length < 6} className="group mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-ink text-[13px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? 'Joining…' : 'Join the bar'}{!pending && <ArrowRight className="size-4 transition group-hover:translate-x-0.5"/>}
          </button>
        </form>
      </div>

      <div className="mt-8 flex justify-center border-t border-line pt-4">
        <button onClick={switchAccount} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-muted transition hover:text-ink">
          <LogOut className="size-3.5"/>Use a different account
        </button>
      </div>
    </div>
  </main>
}

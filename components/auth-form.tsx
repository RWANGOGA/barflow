'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, ShieldCheck, Ticket, Wine } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { TERMS_VERSION } from '@/lib/terms'

const field = 'mt-1.5 h-9 w-full rounded-md border border-[#d0d7de] bg-white px-3 text-sm outline-none transition focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20'

type Onboarding = 'create' | 'join'

export default function AuthForm({
  mode,
  initialPath = 'create',
  initialCode = '',
  initialEmail = '',
}: {
  mode: 'sign-in' | 'sign-up'
  initialPath?: Onboarding
  initialCode?: string
  initialEmail?: string
}) {
  const router = useRouter()
  const isSignUp = mode === 'sign-up'
  const [path, setPath] = useState<Onboarding>(initialPath)
  const [name, setName] = useState('')
  const [barName, setBarName] = useState('')
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState(initialCode.toUpperCase())
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const [retryJoin, setRetryJoin] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setRetryJoin(false)

    if (isSignUp && !accepted) {
      setError('Please accept the terms to continue.')
      return
    }
    if (isSignUp && path === 'create' && barName.trim().length < 2) {
      setError('Enter the name of your bar or restaurant.')
      return
    }
    if (isSignUp && path === 'join' && code.trim().length < 6) {
      setError('Enter the invitation code from your manager.')
      return
    }

    setPending(true)

    if (!isSignUp) {
      const result = await authClient.signIn.email({ email, password })
      if (result.error) {
        setError('We could not sign you in with those details. Check your email and password and try again.')
        setPending(false)
        return
      }
      router.push('/dashboard')
      router.refresh()
      return
    }

    const result = await authClient.signUp.email({ name, email, password })
    if (result.error) {
      setError(
        result.error.message?.toLowerCase().includes('exist')
          ? 'An account with that email already exists. Sign in instead, then accept your invitation.'
          : 'We could not create your account. Check your details and try again.',
      )
      setPending(false)
      return
    }

    // The account exists from here on. Record consent before any workspace work.
    await fetch('/api/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: TERMS_VERSION }),
    }).catch(() => null)

    if (path === 'join') {
      const join = await fetch('/api/team/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!join.ok) {
        const body = await join.json().catch(() => ({}))
        setError(body?.error ?? 'Your account is ready, but we could not join that bar.')
        setRetryJoin(true)
        setPending(false)
        return
      }
    } else {
      // Creates the workspace lazily and stores the real bar name for receipts.
      await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: barName.trim() }),
      }).catch(() => null)
    }

    router.push('/dashboard')
    router.refresh()
  }

  return <main className="flex min-h-screen flex-col items-center justify-center bg-[#f6f8fa] p-4 text-[#1f2328]">
    <div className="w-full max-w-[400px]">
      <div className="mb-4 flex items-center justify-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-[#1f883d] text-white"><Wine className="size-4"/></span>
        <span className="text-sm font-semibold">Bar management</span>
      </div>
      <div className="rounded-md border border-[#d0d7de] bg-white p-6 shadow-[0_1px_0_rgba(27,31,36,.04)]">
        <h1 className="text-xl font-semibold tracking-tight">{isSignUp ? 'Create your account' : 'Sign in'}</h1>
        <p className="mt-1 text-sm text-[#57606a]">{isSignUp ? 'Start a new bar, or join the team you were invited to.' : 'Sign in to manage today’s operation.'}</p>

        {isSignUp && <div className="mt-4 grid grid-cols-2 gap-1 rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-1">
          <button type="button" onClick={() => { setPath('create'); setError('') }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${path === 'create' ? 'bg-white text-[#1f2328] shadow-sm' : 'text-[#57606a]'}`}>Create a bar</button>
          <button type="button" onClick={() => { setPath('join'); setError('') }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${path === 'join' ? 'bg-white text-[#1f2328] shadow-sm' : 'text-[#57606a]'}`}>Join with a code</button>
        </div>}

        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          {isSignUp && path === 'create' && <div className="flex items-start gap-2 rounded-md border border-[#ddf4ff] bg-[#ddf4ff]/40 px-3 py-2 text-[11px] leading-relaxed text-[#0969da]">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0"/>
            <span>You will be the <b>Owner</b> of this bar. Add the rest of your team later from Team &amp; permissions.</span>
          </div>}
          {isSignUp && path === 'join' && <div className="flex items-start gap-2 rounded-md border border-[#ddf4ff] bg-[#ddf4ff]/40 px-3 py-2 text-[11px] leading-relaxed text-[#0969da]">
            <Ticket className="mt-0.5 size-3.5 shrink-0"/>
            <span>Your role is chosen by the person who invited you, so it is not selectable here.</span>
          </div>}

          {isSignUp && <label className="block text-sm font-semibold">Full name<input required value={name} onChange={e=>setName(e.target.value)} autoComplete="name" className={field}/></label>}
          {isSignUp && path === 'create' && <label className="block text-sm font-semibold">Bar or restaurant name<input required value={barName} onChange={e=>setBarName(e.target.value)} placeholder="e.g. The Sipper" className={field}/></label>}
          <label className="block text-sm font-semibold">Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className={field}/></label>
          <label className="block text-sm font-semibold">Password<input required minLength={8} type="password" autoComplete={isSignUp?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} className={field}/>{isSignUp&&<span className="mt-1 block text-[11px] font-normal text-[#57606a]">At least 8 characters.</span>}</label>
          {isSignUp && path === 'join' && <label className="block text-sm font-semibold">Invitation code<input required value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12))} autoComplete="one-time-code" placeholder="e.g. K7QM2XP4RD" className={`${field} font-mono tracking-[.18em]`}/></label>}

          {isSignUp && <label className="flex items-start gap-2 text-[11px] leading-relaxed text-[#57606a]">
            <input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} className="mt-0.5 size-3.5 rounded border-[#d0d7de]"/>
            <span>I accept the <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold text-[#0969da] hover:underline">terms of use</a>, including manager approval of sensitive actions and the audit trail that records them.</span>
          </label>}

          {error && <div role="alert" className="rounded-md border border-[#ffcecb] bg-[#ffebe9] px-3 py-2 text-xs font-semibold text-[#cf222e]">
            <p>{error}</p>
            {retryJoin && <a href={`/join?code=${encodeURIComponent(code)}`} className="mt-1 inline-flex items-center gap-1 font-semibold underline"><Mail className="size-3"/>Retry joining the bar</a>}
          </div>}

          <button disabled={pending} className="mt-1 inline-flex h-9 items-center justify-center rounded-md bg-[#1f883d] text-sm font-semibold text-white transition hover:bg-[#1a7f37] disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? 'Please wait…' : !isSignUp ? 'Sign in' : path === 'join' ? 'Create account and join' : 'Create account'}
          </button>
        </form>
      </div>
      <p className="mt-4 rounded-md border border-[#d0d7de] bg-white px-4 py-3 text-center text-sm text-[#57606a]">{isSignUp ? 'Already have an account?' : 'Need an account?'} <a className="font-semibold text-[#0969da] hover:underline" href={isSignUp?'/sign-in':'/sign-up'}>{isSignUp?'Sign in':'Create one'}</a></p>
      {!isSignUp && <p className="mt-2 text-center text-xs text-[#57606a]">Invited to a bar? <a href="/join" className="font-semibold text-[#0969da] hover:underline">Enter your code</a></p>}
    </div>
  </main>
}

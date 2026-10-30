'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Mail, ShieldCheck, Ticket, Wine } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { TERMS_VERSION } from '@/lib/terms'

const field =
  'mt-2 h-11 w-full rounded-[8px] border border-line-strong bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-ink-soft focus:border-ink focus:ring-4 focus:ring-ink/[0.06]'

type Onboarding = 'create' | 'join'

const shift = [
  ['01', 'Open the day', 'Count the float, unlock selling.'],
  ['02', 'Serve the floor', 'Tabs, rounds and receipts.'],
  ['03', 'Count the till', 'Cash variance and stock close.'],
]

/** The left-hand plate: the product promise, set like a hotel directory page. */
function BrandPlate() {
  return (
    <aside className="relative hidden overflow-hidden bg-[#0b0c0e] px-12 py-12 text-white lg:flex lg:w-[46%] lg:flex-col xl:w-[48%]">
      <div aria-hidden className="pointer-events-none absolute -right-28 -top-28 size-[430px] rounded-full border border-white/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-36 -left-24 size-[400px] rounded-full border border-white/[0.07]" />
      <div className="relative flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-[8px] bg-white text-[#0b0c0e]">
          <Wine className="size-5" />
        </span>
        <div>
          <p className="display text-lg leading-none">Barflow</p>
          <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">Bar management</p>
        </div>
      </div>
      <div className="relative mt-auto max-w-[430px]">
        <p className="flex items-center gap-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">
          <span className="h-px w-8 bg-white/25" />
          One shift, end to end
        </p>
        <h2 className="display mt-5 text-[46px] leading-[1.03]">The bar, in order.</h2>
        <p className="mt-4 max-w-[380px] text-sm leading-relaxed text-white/70">
          Take the order, keep the tab straight, watch the stock leave the shelf and count the till at close.
          One system the whole team can read at a glance.
        </p>
        <ol className="mt-9">
          {shift.map(([step, title, detail]) => (
            <li key={step} className="flex items-baseline gap-4 border-t border-white/10 py-4">
              <span className="font-mono text-[11px] tabular-nums text-white/40">{step}</span>
              <span>
                <b className="block text-sm font-semibold">{title}</b>
                <span className="text-xs text-white/55">{detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="relative mt-10 text-[11px] text-white/30">Built for the floor, not the back office.</p>
    </aside>
  )
}

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

  const heading = !isSignUp ? 'Welcome back' : path === 'join' ? 'Join your team' : 'Start your bar'
  const subheading = !isSignUp
    ? 'Sign in to open the day and serve the floor.'
    : path === 'join'
      ? 'Create your account, then enter the code your manager sent you.'
      : 'Create the workspace you will run the shifts from.'

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <BrandPlate />

      <main className="flex min-h-screen w-full flex-col px-5 py-7 sm:px-10 lg:w-[54%] xl:w-[52%]">
        <div className="flex items-center gap-2.5 lg:hidden">
          <span className="flex size-8 items-center justify-center rounded-[8px] bg-ink text-white">
            <Wine className="size-4" />
          </span>
          <span className="display text-sm">Barflow</span>
        </div>

        <div className="mx-auto flex w-full max-w-[404px] flex-1 flex-col justify-start py-8 lg:justify-center lg:py-10">
          <p className="eyebrow justify-center">{isSignUp ? (path === 'join' ? 'Invitation' : 'New workspace') : 'Staff access'}</p>
          <h1 className="display mt-4 text-center text-[34px] text-balance sm:text-[38px]">{heading}</h1>
          <p className="mx-auto mt-3 max-w-[340px] text-center text-[13px] leading-relaxed text-ink-muted">{subheading}</p>

          {isSignUp && (
            <div className="mt-8 grid grid-cols-2 border-b border-line">
              <button
                type="button"
                onClick={() => { setPath('create'); setError('') }}
                className={`-mb-px border-b-2 px-3 pb-2.5 text-[12px] font-medium transition ${path === 'create' ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
              >
                Start a bar
              </button>
              <button
                type="button"
                onClick={() => { setPath('join'); setError('') }}
                className={`-mb-px border-b-2 px-3 pb-2.5 text-[12px] font-medium transition ${path === 'join' ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
              >
                Join with a code
              </button>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            {isSignUp && path === 'create' && (
              <div className="flex items-start gap-2.5 border-l-2 border-line pl-3 text-[11px] leading-relaxed text-ink-muted">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ink-soft" />
                <span>You will be the <b className="font-medium text-ink">Owner</b> of this bar. Add the rest of your team later from Team &amp; permissions.</span>
              </div>
            )}
            {isSignUp && path === 'join' && (
              <div className="flex items-start gap-2.5 border-l-2 border-line pl-3 text-[11px] leading-relaxed text-ink-muted">
                <Ticket className="mt-0.5 size-3.5 shrink-0 text-ink-soft" />
                <span>Your role is chosen by the person who invited you, so it is not selectable here.</span>
              </div>
            )}

            {isSignUp && (
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Full name
                <input required value={name} onChange={e => setName(e.target.value)} autoComplete="name" className={field} placeholder="Grace Mwangi" />
              </label>
            )}
            {isSignUp && path === 'create' && (
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Bar or restaurant
                <input required value={barName} onChange={e => setBarName(e.target.value)} placeholder="e.g. The Sipper" className={field} />
              </label>
            )}
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Email
              <input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={field} placeholder="you@bar.com" />
            </label>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Password
              <input required minLength={8} type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} className={field} placeholder="At least 8 characters" />
            </label>
            {isSignUp && path === 'join' && (
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Invitation code
                <input required value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))} autoComplete="one-time-code" placeholder="K7QM2XP4RD" className={`${field} font-mono tracking-[0.18em]`} />
              </label>
            )}

            {isSignUp && (
              <label className="flex items-start gap-2.5 text-[11px] leading-relaxed text-ink-muted">
                <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="mt-0.5 size-3.5 rounded border-line-strong accent-brand" />
                <span>I accept the <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand">terms of use</a>, including manager approval of sensitive actions and the audit trail that records them.</span>
              </label>
            )}

            {error && (
              <div role="alert" className="border-l-2 border-alert bg-alert-tint/70 px-3 py-2.5 text-[12px] font-medium text-alert">
                <p>{error}</p>
                {retryJoin && (
                  <a href={`/join?code=${encodeURIComponent(code)}`} className="mt-1.5 inline-flex items-center gap-1 font-medium underline underline-offset-2">
                    <Mail className="size-3" />
                    Retry joining the bar
                  </a>
                )}
              </div>
            )}

            <button
              disabled={pending}
              className="group mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-ink text-[13px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Please wait…' : !isSignUp ? 'Sign in' : path === 'join' ? 'Create account and join' : 'Create account'}
              {!pending && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
            </button>
          </form>
        </div>

        <div className="mx-auto w-full max-w-[404px] border-t border-line pt-4 text-center text-xs text-ink-muted">
          {isSignUp ? 'Already have an account?' : 'Need an account?'}{' '}
          <a className="font-semibold text-ink underline decoration-ink/20 underline-offset-2 hover:decoration-ink" href={isSignUp ? '/sign-in' : '/sign-up'}>
            {isSignUp ? 'Sign in' : 'Create one'}
          </a>
          {!isSignUp && (
            <p className="mt-1.5 text-[11px]">
              Invited to a bar?{' '}
              <a href="/join" className="font-semibold text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand">Enter your code</a>
            </p>
          )}
        </div>
      </main>
    </div>
  )
}

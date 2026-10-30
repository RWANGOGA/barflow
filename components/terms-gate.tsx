'use client'

import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { TERMS_VERSION } from '@/lib/terms'

/**
 * Records acceptance of the current terms for every account, including accounts created
 * before terms existed. If the consent endpoint is unreachable we do not trap the user.
 */
export default function TermsGate({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState(false)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/consent', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { accepted: true }))
      .then((body) => { if (active) setPending(body?.accepted === false) })
      .catch(() => undefined)
      .finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])

  const accept = async () => {
    setSaving(true)
    setError('')
    const response = await fetch('/api/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: TERMS_VERSION }),
    })
    setSaving(false)
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      setError(body?.error ?? 'Could not record your acceptance. Please try again.')
      return
    }
    setPending(false)
  }

  return <>
    {children}
    {ready && pending && <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="terms-gate-title">
      <div className="dialog max-w-lg p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[7px] bg-ink text-white"><ShieldCheck className="size-4"/></span>
          <div>
            <p className="micro">Consent required</p>
            <h2 id="terms-gate-title" className="mt-2 text-[20px] font-semibold tracking-tight">Updated terms of use</h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">Version {TERMS_VERSION}. Please review and accept before continuing to manage the bar.</p>
          </div>
        </div>

        <ul className="mt-5 space-y-2 border-l-2 border-line pl-4 text-[12px] leading-relaxed text-ink-muted">
          <li>Every person uses their own account; logins are never shared.</li>
          <li>Voids and discounts need a manager PIN at the till, and the approver is recorded.</li>
          <li>Sensitive actions are written to an audit log that cannot be edited.</li>
          <li>Removing a member ends their access immediately; history is kept.</li>
        </ul>

        {error && <p role="alert" className="mt-3 border-l-2 border-alert bg-alert-tint/70 px-3 py-2 text-[12px] font-medium text-alert">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          <a href="/terms" target="_blank" rel="noreferrer" className="rounded-[8px] border border-line-strong px-3.5 py-2 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink">Read full terms</a>
          <button onClick={() => void accept()} disabled={saving} className="inline-flex items-center gap-2 rounded-[8px] bg-ink px-4 py-2 text-[12px] font-medium text-white transition hover:bg-black disabled:opacity-60">
            {saving && <Loader2 className="size-4 animate-spin"/>}I accept
          </button>
        </div>
      </div>
    </div>}
  </>
}

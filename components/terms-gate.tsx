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
    {ready && pending && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1f2328]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="terms-gate-title">
      <div className="w-full max-w-lg rounded-lg border border-[#d0d7de] bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#dafbe1] text-[#1a7f37]"><ShieldCheck className="size-5"/></span>
          <div>
            <h2 id="terms-gate-title" className="text-lg font-semibold">Updated terms of use</h2>
            <p className="mt-1 text-sm text-[#57606a]">Version {TERMS_VERSION}. Please review and accept before continuing to manage the bar.</p>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5 rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-4 text-xs leading-relaxed text-[#57606a]">
          <li>• Every person uses their own account; logins are never shared.</li>
          <li>• Voids and discounts need a manager PIN at the till, and the approver is recorded.</li>
          <li>• Sensitive actions are written to an audit log that cannot be edited.</li>
          <li>• Removing a member ends their access immediately; history is kept.</li>
        </ul>

        {error && <p role="alert" className="mt-3 rounded-md border border-[#ffcecb] bg-[#ffebe9] px-3 py-2 text-xs font-semibold text-[#cf222e]">{error}</p>}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <a href="/terms" target="_blank" rel="noreferrer" className="rounded-md border border-[#d0d7de] px-4 py-2.5 text-sm font-semibold text-[#1f2328] hover:bg-[#f6f8fa]">Read full terms</a>
          <button onClick={() => void accept()} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-[#1f883d] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {saving && <Loader2 className="size-4 animate-spin"/>}I accept
          </button>
        </div>
      </div>
    </div>}
  </>
}

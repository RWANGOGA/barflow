'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wine } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

const field = 'mt-1.5 h-9 w-full rounded-md border border-[#d0d7de] bg-white px-3 text-sm outline-none transition focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20'

export default function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const isSignUp = mode === 'sign-up'
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError('')
    const result = isSignUp ? await authClient.signUp.email({ name, email, password }) : await authClient.signIn.email({ email, password })
    if (result.error) { setError('We could not sign you in with those details. Check your email and password and try again.'); setPending(false); return }
    router.push('/dashboard'); router.refresh()
  }
  return <main className="flex min-h-screen flex-col items-center justify-center bg-[#f6f8fa] p-4 text-[#1f2328]">
    <div className="w-full max-w-[360px]">
      <div className="mb-4 flex items-center justify-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-[#1f883d] text-white"><Wine className="size-4"/></span>
        <span className="text-sm font-semibold">Bar management</span>
      </div>
      <div className="rounded-md border border-[#d0d7de] bg-white p-6 shadow-[0_1px_0_rgba(27,31,36,.04)]">
        <h1 className="text-xl font-semibold tracking-tight">{isSignUp ? 'Create your account' : 'Sign in'}</h1>
        <p className="mt-1 text-sm text-[#57606a]">{isSignUp ? 'Set up secure access for your bar team.' : 'Sign in to manage today’s operation.'}</p>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          {isSignUp&&<label className="block text-sm font-semibold">Full name<input required value={name} onChange={e=>setName(e.target.value)} className={field}/></label>}
          <label className="block text-sm font-semibold">Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className={field}/></label>
          <label className="block text-sm font-semibold">Password<input required minLength={8} type="password" autoComplete={isSignUp?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} className={field}/></label>
          {error&&<p role="alert" className="rounded-md border border-[#ffcecb] bg-[#ffebe9] px-3 py-2 text-xs font-semibold text-[#cf222e]">{error}</p>}
          <button disabled={pending} className="mt-1 inline-flex h-9 items-center justify-center rounded-md bg-[#1f883d] text-sm font-semibold text-white transition hover:bg-[#1a7f37] disabled:cursor-not-allowed disabled:opacity-60">{pending ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}</button>
        </form>
      </div>
      <p className="mt-4 rounded-md border border-[#d0d7de] bg-white px-4 py-3 text-center text-sm text-[#57606a]">{isSignUp ? 'Already have an account?' : 'Need an account?'} <a className="font-semibold text-[#0969da] hover:underline" href={isSignUp?'/sign-in':'/sign-up'}>{isSignUp?'Sign in':'Create one'}</a></p>
    </div>
  </main>
}

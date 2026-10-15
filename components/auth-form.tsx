'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

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
  return <main className="flex min-h-screen items-center justify-center bg-[#dce9fb] p-4 text-[#292d34]"><div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl sm:p-10"><div className="mb-8"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#8a96a5]">The Sipper · bar management</p><h1 className="mt-3 text-3xl font-bold">{isSignUp ? 'Create your workspace' : 'Welcome back'}</h1><p className="mt-2 text-sm text-[#7c8796]">{isSignUp ? 'Set up secure access for your bar team.' : 'Sign in to manage today’s operation.'}</p></div><form onSubmit={submit} className="flex flex-col gap-4">{isSignUp&&<label className="text-sm font-semibold">Full name<input required value={name} onChange={e=>setName(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#dce3ec] px-3 outline-none focus:border-[#7aa2d6]" /></label>}<label className="text-sm font-semibold">Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#dce3ec] px-3 outline-none focus:border-[#7aa2d6]" /></label><label className="text-sm font-semibold">Password<input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#dce3ec] px-3 outline-none focus:border-[#7aa2d6]" /></label>{error&&<p role="alert" className="rounded-xl bg-[#fff0e8] p-3 text-sm text-[#a85f43]">{error}</p>}<button disabled={pending} className="h-12 rounded-xl bg-[#292d34] font-bold text-white disabled:opacity-60">{pending ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}</button></form><p className="mt-6 text-center text-sm text-[#7c8796]">{isSignUp ? 'Already have an account?' : 'Need an account?'} <a className="font-bold text-[#292d34] underline" href={isSignUp?'/sign-in':'/sign-up'}>{isSignUp?'Sign in':'Create one'}</a></p></div></main>
}

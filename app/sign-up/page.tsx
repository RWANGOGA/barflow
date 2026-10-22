import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import AuthForm from '@/components/auth-form'

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; code?: string; email?: string }>
}) {
  const { mode, code, email } = await searchParams
  const joining = mode === 'join'
  const session = await auth.api.getSession({ headers: await headers() })

  // An invited person who already has an account can accept from the join page.
  if (session?.user) redirect(joining ? `/join?code=${encodeURIComponent(code ?? '')}` : '/dashboard')

  return (
    <AuthForm
      mode="sign-up"
      initialPath={joining ? 'join' : 'create'}
      initialCode={code ?? ''}
      initialEmail={email ?? ''}
    />
  )
}

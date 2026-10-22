import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import JoinForm from '@/components/join-form'

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const { code } = await searchParams
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) {
    redirect(`/sign-up?mode=join&code=${encodeURIComponent(code ?? '')}`)
  }

  return <JoinForm code={code ?? ''} email={session.user.email} name={session.user.name} />
}

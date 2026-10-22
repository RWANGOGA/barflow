import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import TermsGate from '@/components/terms-gate'

/**
 * Server-side gate for the whole dashboard. Every dashboard API is already authenticated,
 * but redirecting here means a signed-out visitor never sees the shell or a flash of data.
 * A session row that was deleted (member removed) fails getSession and lands on sign-in.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  return <TermsGate>{children}</TermsGate>
}

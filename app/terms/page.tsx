import Link from 'next/link'
import { Wine } from 'lucide-react'
import { TERMS_UPDATED_AT, TERMS_VERSION } from '@/lib/terms'

const sections: { title: string; body: React.ReactNode }[] = [
  {
    title: '1. Your account',
    body: <>
      Every person who works in the bar needs their own account. Accounts are personal: do not share a
      login or a password, because the audit trail records who did what. You are responsible for what
      happens under your account and for keeping your password private.
    </>,
  },
  {
    title: '2. Roles and approval',
    body: <>
      The person who creates a bar becomes its Owner and can invite Admins, Managers, Cashiers and
      Storekeepers. A person&apos;s role is chosen by the person inviting them and can be changed or revoked
      later by an Owner, Admin or Manager with sufficient seniority. Sensitive actions such as voiding a
      tab, voiding a sale or applying a discount require approval: a manager enters their PIN at the till,
      or the Owner/Admin confirms their own. Approval attempts are rate limited.
    </>,
  },
  {
    title: '3. Audit trail',
    body: <>
      Sensitive and record-changing actions are written to an audit log with the person who performed
      them, the approval method, and the related record. The log is append-only in the product: it cannot
      be edited from the interface. Do not use the audit log to store passwords, PINs or customer payment
      details.
    </>,
  },
  {
    title: '4. Your data',
    body: <>
      Sales, stock, menu, team and settings data belong to the bar that created them. Members of one bar
      cannot see another bar&apos;s data. The Owner can export the bar&apos;s records at any time and can remove
      members, which ends their access immediately.
    </>,
  },
  {
    title: '5. Acceptable use',
    body: <>
      Use the service for legitimate bar and restaurant management. Do not attempt to bypass approvals,
      impersonate another person, probe other workspaces, or use the service to record false sales or
      stock movements. We may suspend access that puts other users or the service at risk.
    </>,
  },
  {
    title: '6. Availability and changes',
    body: <>
      The service is provided as-is while it is being improved. Features may change, and planned
      maintenance may interrupt access. We will publish a new version of these terms when the rules
      change; continuing to use the service after that means you accept the new version.
    </>,
  },
]

export const metadata = { title: 'Terms of use · Bar management' }

export default function TermsPage() {
  return <main className="min-h-screen bg-[#f6f8fa] px-4 py-10 text-[#1f2328]">
    <div className="mx-auto w-full max-w-3xl">
      <Link href="/sign-up" className="inline-flex items-center gap-2 text-sm font-semibold text-[#57606a] hover:text-[#1f2328]">
        <span className="flex size-7 items-center justify-center rounded-md bg-[#1f883d] text-white"><Wine className="size-4"/></span>
        Bar management
      </Link>

      <article className="mt-6 rounded-lg border border-[#d0d7de] bg-white p-6 shadow-[0_1px_0_rgba(27,31,36,.04)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[.06em] text-[#57606a]">Legal</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Terms of use</h1>
        <p className="mt-1 text-sm text-[#57606a]">Version {TERMS_VERSION} · updated {TERMS_UPDATED_AT}</p>

        <p className="mt-6 text-sm leading-relaxed text-[#1f2328]">
          These terms cover the use of this bar management service by a bar, its owner and its staff.
          By creating an account or accepting an invitation you agree to them.
        </p>

        <div className="mt-6 flex flex-col gap-6">
          {sections.map((section) => <section key={section.title}>
            <h2 className="text-sm font-semibold">{section.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#57606a]">{section.body}</p>
          </section>)}
        </div>

        <div className="mt-8 rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-4 text-sm">
          <p className="font-semibold">Questions about these terms?</p>
          <p className="mt-1 text-[#57606a]">Speak to the owner of your bar, who controls the workspace and its data.</p>
        </div>
      </article>

      <p className="mt-4 text-center text-xs text-[#57606a]">
        <Link href="/sign-up" className="font-semibold text-[#0969da] hover:underline">Back to sign up</Link>
      </p>
    </div>
  </main>
}

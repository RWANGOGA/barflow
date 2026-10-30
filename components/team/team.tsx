'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  Clock,
  Copy,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react'
import { formatDate, readCachedRegional } from '@/lib/locale'

type Role = 'Owner' | 'Admin' | 'Manager' | 'Cashier' | 'Storekeeper'

type Member = {
  id: string
  userId: string
  name: string
  email: string
  role: Role
  status: string
  createdAt: string
  isOwner: boolean
}

type Invitation = {
  id: string
  email: string
  role: Role
  expiresAt: string
  createdAt: string
  invitedBy: string | null
}

type TeamData = {
  workspace: { id: string; name: string; ownerId: string }
  me: { actorId: string; name: string; email: string; role: Role }
  members: Member[]
  invitations: Invitation[]
  matrix: { permission: string; label: string; roles: Role[] }[]
  roles: { role: Role; rank: number; description: string; grantable: boolean }[]
}

const dateLabel = (value?: string | null) =>
  value ? formatDate(value, readCachedRegional()) : '—'

const roleTone: Record<Role, string> = {
  Owner: 'text-ink',
  Admin: 'text-ink',
  Manager: 'text-ink',
  Cashier: 'text-ink-muted',
  Storekeeper: 'text-ink-muted',
}

function RoleBadge({ role }: { role: Role }) {
  return <span className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${roleTone[role] ?? roleTone.Cashier}`}>{role}</span>
}

export function TeamPanel({ toast }: { toast: (message: string) => void }) {
  const [data, setData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'members' | 'invitations' | 'permissions'>('members')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('Cashier')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [issued, setIssued] = useState<{ code: string; joinUrl: string; email: string; role: Role; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [confirming, setConfirming] = useState<{ kind: 'member' | 'invite'; id: string; label: string } | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/team', { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        setError(body?.error ?? 'Could not load the team.')
        return
      }
      setData(body)
      setError('')
    } catch {
      setError('Could not reach the server. Check your connection and retry.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const rank = useMemo(() => {
    const map = new Map<Role, number>()
    data?.roles.forEach((entry) => map.set(entry.role, entry.rank))
    return map
  }, [data])

  const grantable = useMemo(() => {
    if (!data) return [] as TeamData['roles']
    const myRank = rank.get(data.me.role) ?? 0
    return data.roles.filter((entry) => entry.grantable && entry.rank <= myRank)
  }, [data, rank])

  useEffect(() => {
    if (grantable.length && !grantable.some((entry) => entry.role === inviteRole)) {
      setInviteRole(grantable[grantable.length - 1].role)
    }
  }, [grantable, inviteRole])

  const canManage = (member: Member) => {
    if (!data) return false
    if (member.role === 'Owner') return false
    if (member.userId === data.me.actorId) return false
    const myRank = rank.get(data.me.role) ?? 0
    return (rank.get(member.role) ?? 0) < myRank
  }

  const changeRole = async (member: Member, role: Role) => {
    if (role === member.role) return
    setBusyId(member.id)
    const response = await fetch(`/api/team/members/${member.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    setBusyId('')
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      toast(body?.error ?? 'Could not change the role.')
      return
    }
    toast(`${member.name} is now ${role}.`)
    await load()
  }

  const sendInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    setInviteError('')
    setInviteBusy(true)
    const response = await fetch('/api/team/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    })
    const body = await response.json().catch(() => ({}))
    setInviteBusy(false)
    if (!response.ok) {
      setInviteError(body?.error ?? 'Could not create the invitation.')
      return
    }
    setIssued({ code: body.code, joinUrl: body.joinUrl, email: body.invitation.email, role: body.invitation.role, expiresAt: body.expiresAt })
    setInviteEmail('')
    toast(`Invitation ready for ${body.invitation.email}.`)
    await load()
  }

  const copyCode = async () => {
    if (!issued) return
    const link = `${window.location.origin}${issued.joinUrl}`
    await navigator.clipboard.writeText(`${link}\nCode: ${issued.code}`).catch(() => undefined)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const confirmAction = async () => {
    if (!confirming) return
    setConfirmBusy(true)
    const url = confirming.kind === 'member'
      ? `/api/team/members/${confirming.id}`
      : `/api/team/invitations/${confirming.id}`
    const response = await fetch(url, { method: 'DELETE' })
    const body = await response.json().catch(() => ({}))
    setConfirmBusy(false)
    if (!response.ok) {
      toast(body?.error ?? 'Could not complete that action.')
      return
    }
    toast(confirming.kind === 'member' ? `${confirming.label} was removed.` : 'Invitation revoked.')
    setConfirming(null)
    await load()
  }

  const header = <div className="border-b border-line pb-10 text-center">
    <p className="eyebrow justify-center">Access control</p>
    <h2 className="display mx-auto mt-4 max-w-3xl text-balance text-[34px] sm:text-[44px]">Team &amp; permissions</h2>
    <p className="mx-auto mt-4 max-w-xl text-[13px] leading-relaxed text-ink-muted sm:text-sm">
      Each person signs in with their own account. Accounts are never shared, and every sensitive action records who approved it.
    </p>
    <div className="mt-7 flex justify-center">
      <button onClick={() => { setInviteOpen(true); setIssued(null); setInviteError('') }} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[8px] bg-ink px-3.5 py-2 text-[12px] font-medium text-white transition hover:bg-black">
        <UserPlus className="size-3.5"/>Invite member
      </button>
    </div>
  </div>

  if (loading && !data) {
    return <div className="mx-auto w-full max-w-[1180px]">
      {header}
      <div className="mt-10 flex items-center justify-center gap-2 border-t border-line pt-10 text-[12px] text-ink-muted"><Loader2 className="size-3.5 animate-spin"/>Loading members…</div>
    </div>
  }

  if (error && !data) {
    return <div className="mx-auto w-full max-w-[1180px]">
      {header}
      <div role="alert" className="mt-10 flex flex-wrap items-center justify-between gap-3 border-y border-line py-4 text-[12px] font-medium text-alert">
        <span>{error}</span>
        <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:text-ink"><RefreshCw className="size-3.5"/>Retry</button>
      </div>
    </div>
  }

  if (!data) return null

  const pendingMembers = data.members.filter((member) => member.status !== 'active').length
  const tabs: { id: typeof tab; label: string; count?: number }[] = [
    { id: 'members', label: 'Members', count: data.members.length },
    { id: 'invitations', label: 'Invitations', count: data.invitations.length },
    { id: 'permissions', label: 'Permission matrix' },
  ]

  return <div className="mx-auto w-full max-w-[1180px]">
    {header}

    <div className="mt-10 grid gap-px border-y border-line bg-line sm:grid-cols-3">
      {[
        { label: 'Workspace', value: data.workspace.name, note: 'Bar this team belongs to' },
        { label: 'Active members', value: String(data.members.length - pendingMembers), note: pendingMembers ? `${pendingMembers} suspended` : 'Everyone can sign in' },
        { label: 'Pending invites', value: String(data.invitations.length), note: data.invitations.length ? 'Waiting to be accepted' : 'No outstanding invites' },
      ].map((card) => <div key={card.label} className="bg-canvas px-5 py-6">
        <p className="micro">{card.label}</p>
        <p className="mt-3 truncate text-[19px] font-medium tracking-tight">{card.value}</p>
        <p className="mt-1 text-[11px] text-ink-muted">{card.note}</p>
      </div>)}
    </div>

    <div className="mt-8 flex gap-6 overflow-x-auto border-b border-line">
      {tabs.map((entry) => <button key={entry.id} onClick={() => setTab(entry.id)} className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 pb-2.5 text-[12px] font-medium transition ${tab === entry.id ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}>
        {entry.label}
        {entry.count !== undefined && <span className="text-[10px] tabular-nums text-ink-soft">{entry.count}</span>}
      </button>)}
    </div>

    {tab === 'members' && <div className="mt-8">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="border-b border-line text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            <tr><th className="px-3 pb-2 font-semibold">Member</th><th className="px-3 pb-2 font-semibold">Role</th><th className="px-3 pb-2 font-semibold">Status</th><th className="px-3 pb-2 font-semibold">Joined</th><th className="px-3 pb-2 text-right font-semibold">Actions</th></tr>
          </thead>
          <tbody>
            {data.members.map((member) => {
              const editable = canManage(member)
              return <tr key={member.id} className="border-b border-line align-middle last:border-0">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-well text-[10px] font-medium text-ink">{member.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()??'').join('')||'??'}</span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-medium">{member.name}{member.userId === data.me.actorId && <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-soft">You</span>}</p>
                      <p className="truncate text-[11px] text-ink-muted">{member.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  {editable
                    ? <select value={member.role} disabled={busyId === member.id} onChange={(event) => void changeRole(member, event.target.value as Role)} aria-label={`Role for ${member.name}`} className="field h-8 w-auto text-[12px] disabled:opacity-50">
                        {grantable.map((entry) => <option key={entry.role} value={entry.role}>{entry.role}</option>)}
                      </select>
                    : <RoleBadge role={member.role}/>}
                </td>
                <td className="px-3 py-3"><span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${member.status === 'active' ? 'text-ink' : 'text-warn'}`}><span className="size-1.5 rounded-full bg-current"/>{member.status === 'active' ? 'Active' : 'Suspended'}</span></td>
                <td className="px-3 py-3 text-[11px] text-ink-muted">{dateLabel(member.createdAt)}</td>
                <td className="px-3 py-3 text-right">
                  {editable
                    ? <button onClick={() => setConfirming({ kind: 'member', id: member.id, label: member.name })} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-alert transition hover:underline"><Trash2 className="size-3"/>Remove</button>
                    : <span className="text-[11px] text-ink-soft">{member.role === 'Owner' ? 'Owner is protected' : '—'}</span>}
                </td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-start gap-2 border-t border-line py-3 text-[11px] leading-relaxed text-ink-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ink-soft"/>
        <p>Removing a member deletes their membership and ends their sessions immediately. The Owner can never be removed or demoted.</p>
      </div>
    </div>}

    {tab === 'invitations' && <div className="mt-8">
      {data.invitations.length === 0
        ? <div className="flex flex-col items-center gap-2 border-b border-line py-14 text-center">
            <Mail className="size-5 text-ink-soft"/>
            <p className="text-[13px] font-medium text-ink-muted">No pending invitations</p>
            <p className="max-w-sm text-[12px] leading-relaxed text-ink-soft">Invite a manager, cashier or storekeeper and share the one-time code with them. Codes expire after 7 days.</p>
            <button onClick={() => setInviteOpen(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-[7px] bg-ink px-3.5 py-2 text-[11px] font-medium text-white transition hover:bg-black"><UserPlus className="size-3"/>Invite member</button>
          </div>
        : <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-[13px]">
              <thead className="border-b border-line text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                <tr><th className="px-3 pb-2 font-semibold">Email</th><th className="px-3 pb-2 font-semibold">Role</th><th className="px-3 pb-2 font-semibold">Invited by</th><th className="px-3 pb-2 font-semibold">Expires</th><th className="px-3 pb-2 text-right font-semibold">Actions</th></tr>
              </thead>
              <tbody>
                {data.invitations.map((invite) => <tr key={invite.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-3 font-medium">{invite.email}</td>
                  <td className="px-3 py-3"><RoleBadge role={invite.role}/></td>
                  <td className="px-3 py-3 text-[11px] text-ink-muted">{invite.invitedBy ?? '—'}</td>
                  <td className="px-3 py-3 text-[11px] text-ink-muted"><span className="inline-flex items-center gap-1.5"><Clock className="size-3"/>{dateLabel(invite.expiresAt)}</span></td>
                  <td className="px-3 py-3 text-right"><button onClick={() => setConfirming({ kind: 'invite', id: invite.id, label: invite.email })} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-alert transition hover:underline"><X className="size-3"/>Revoke</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>}
    </div>}

    {tab === 'permissions' && <div className="mt-8">
      <div className="border-b border-line pb-4">
        <p className="flex items-center gap-2 text-[13px] font-medium"><UsersRound className="size-3.5 text-ink-soft"/>Who can do what</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">Owner and Admin hold every capability. Voids and discounts additionally need an approval PIN at the till.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="border-b border-line text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            <tr>
              <th className="px-3 pb-2 font-semibold">Capability</th>
              {(['Owner','Admin','Manager','Cashier','Storekeeper'] as Role[]).map((role) => <th key={role} className="px-3 pb-2 text-center font-semibold">{role}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row) => <tr key={row.permission} className="border-b border-line last:border-0">
              <td className="px-3 py-2.5">
                <p className="font-medium">{row.label}</p>
                <p className="font-mono text-[10px] text-ink-soft">{row.permission}</p>
              </td>
              {(['Owner','Admin','Manager','Cashier','Storekeeper'] as Role[]).map((role) => <td key={role} className="px-3 py-2.5 text-center">
                {row.roles.includes(role)
                  ? <Check className="mx-auto size-3.5 text-ink" aria-label={`${role} allowed`}/>
                  : <span className="text-ink-soft" aria-label={`${role} not allowed`}>—</span>}
              </td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line pt-5">
        <p className="micro">Role notes</p>
        <div className="mt-3 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.roles.map((entry) => <div key={entry.role} className="border-t border-line pt-2.5">
            <RoleBadge role={entry.role}/>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">{entry.description}</p>
          </div>)}
        </div>
      </div>
    </div>}

    {inviteOpen && <div className="scrim" role="dialog" aria-modal="true" aria-label="Invite a team member">
      <div className="dialog max-w-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="micro">Team invite</p>
            <h3 className="mt-2 text-[20px] font-semibold tracking-tight">{issued ? 'Share the invitation' : 'Invite a team member'}</h3>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">{issued ? 'The code works once and is bound to the email below.' : 'They will create their own account. You choose the role; they never choose it themselves.'}</p>
          </div>
          <button aria-label="Close" onClick={() => { setInviteOpen(false); setIssued(null); setInviteError('') }} className="rounded-[6px] p-1.5 text-ink-muted hover:bg-canvas"><X className="size-4"/></button>
        </div>

        {!issued ? <form onSubmit={sendInvite} className="mt-5 flex flex-col gap-4">
          <label className="text-[11px] font-medium text-ink-muted">Work email
            <input required type="email" autoFocus value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@bar.com" className="field mt-1.5"/>
          </label>
          <label className="text-[11px] font-medium text-ink-muted">Role
            <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)} className="field mt-1.5">
              {grantable.map((entry) => <option key={entry.role} value={entry.role}>{entry.role}</option>)}
            </select>
          </label>
          <p className="border-l-2 border-line pl-3 text-[12px] leading-relaxed text-ink-muted">{data.roles.find((entry) => entry.role === inviteRole)?.description}</p>
          {inviteError && <p role="alert" className="border-l-2 border-alert bg-alert-tint/60 px-3 py-2 text-[11px] font-medium text-alert">{inviteError}</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button type="button" onClick={() => setInviteOpen(false)} className="rounded-[8px] border border-line-strong px-3.5 py-2 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink">Cancel</button>
            <button disabled={inviteBusy} className="inline-flex items-center gap-2 rounded-[8px] bg-ink px-4 py-2 text-[12px] font-medium text-white transition hover:bg-black disabled:opacity-60">{inviteBusy ? <Loader2 className="size-3.5 animate-spin"/> : <Mail className="size-3.5"/>}Create invitation</button>
          </div>
        </form> : <div className="mt-5">
          <div className="border-y border-line py-6 text-center">
            <p className="micro">One-time code</p>
            <p className="mt-2 font-mono text-[26px] font-semibold tracking-[0.18em]">{issued.code}</p>
            <p className="mt-2 text-[11px] text-ink-muted">{issued.email} · {issued.role} · expires {dateLabel(issued.expiresAt)}</p>
          </div>
          <button onClick={() => void copyCode()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[8px] border border-line-strong px-4 py-2 text-[12px] font-medium transition hover:border-ink">
            {copied ? <><Check className="size-3.5 text-ink"/>Copied</> : <><Copy className="size-3.5"/>Copy code and join link</>}
          </button>
          <p className="mt-3 break-all border border-line px-2 py-1.5 font-mono text-[10px] text-ink-muted">{`${typeof window !== 'undefined' ? window.location.origin : ''}${issued.joinUrl}`}</p>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">Only the hash is stored, so this code cannot be shown again. Create a new invite if it is lost.</p>
          <div className="mt-5 flex justify-end border-t border-line pt-4"><button onClick={() => { setInviteOpen(false); setIssued(null) }} className="rounded-[8px] bg-ink px-4 py-2 text-[12px] font-medium text-white transition hover:bg-black">Done</button></div>
        </div>}
      </div>
    </div>}

    {confirming && <div className="scrim" role="dialog" aria-modal="true" aria-label="Confirm removal">
      <div className="dialog max-w-md p-6">
        <h3 className="text-[20px] font-semibold tracking-tight">{confirming.kind === 'member' ? 'Remove member?' : 'Revoke invitation?'}</h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">{confirming.kind === 'member'
          ? `${confirming.label} will lose access immediately and their sessions will be ended. History stays in the audit log.`
          : `${confirming.label} will no longer be able to use this invitation code.`}</p>
        <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
          <button onClick={() => setConfirming(null)} className="rounded-[8px] border border-line-strong px-3.5 py-2 text-[12px] font-medium text-ink-muted transition hover:border-ink hover:text-ink">Cancel</button>
          <button disabled={confirmBusy} onClick={() => void confirmAction()} className="inline-flex items-center gap-2 rounded-[8px] bg-alert px-4 py-2 text-[12px] font-medium text-white transition hover:bg-[#8a201a] disabled:opacity-60">{confirmBusy && <Loader2 className="size-3.5 animate-spin"/>}{confirming.kind === 'member' ? 'Remove member' : 'Revoke'}</button>
        </div>
      </div>
    </div>}
  </div>
}

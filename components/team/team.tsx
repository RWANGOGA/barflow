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
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const roleTone: Record<Role, string> = {
  Owner: 'border-[#d8b9ff] bg-[#fbefff] text-[#8250df]',
  Admin: 'border-[#b6e3ff] bg-[#ddf4ff] text-[#0969da]',
  Manager: 'border-[#aceebb] bg-[#dafbe1] text-[#1a7f37]',
  Cashier: 'border-[#d0d7de] bg-[#f6f8fa] text-[#57606a]',
  Storekeeper: 'border-[#f5d9a8] bg-[#fff8c5] text-[#9a6700]',
}

function RoleBadge({ role }: { role: Role }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${roleTone[role] ?? roleTone.Cashier}`}>{role}</span>
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

  const header = <div className="flex flex-col gap-3 border-b border-[#d8dee4] pb-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p className="text-xs font-semibold text-[#57606a]">Access control</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">Team &amp; permissions</h2>
      <p className="mt-1 max-w-2xl text-sm text-[#57606a]">
        Each person signs in with their own account. Accounts are never shared, and every sensitive action records who approved it.
      </p>
    </div>
    <button onClick={() => { setInviteOpen(true); setIssued(null); setInviteError('') }} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-[#1f883d] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1a7f37]">
      <UserPlus className="size-4"/>Invite member
    </button>
  </div>

  if (loading && !data) {
    return <div className="mx-auto w-full max-w-[1200px]">
      {header}
      <div className="mt-6 flex items-center gap-2 rounded-lg border border-[#d0d7de] bg-white p-8 text-sm text-[#57606a]"><Loader2 className="size-4 animate-spin"/>Loading members…</div>
    </div>
  }

  if (error && !data) {
    return <div className="mx-auto w-full max-w-[1200px]">
      {header}
      <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#ffcecb] bg-[#ffebe9] p-5 text-sm font-semibold text-[#cf222e]">
        <span>{error}</span>
        <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-md border border-[#cf222e]/30 bg-white px-3 py-1.5 text-xs font-semibold"><RefreshCw className="size-3.5"/>Retry</button>
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

  return <div className="mx-auto w-full max-w-[1200px]">
    {header}

    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      {[
        { label: 'Workspace', value: data.workspace.name, note: 'Bar this team belongs to' },
        { label: 'Active members', value: String(data.members.length - pendingMembers), note: pendingMembers ? `${pendingMembers} suspended` : 'Everyone can sign in' },
        { label: 'Pending invites', value: String(data.invitations.length), note: data.invitations.length ? 'Waiting to be accepted' : 'No outstanding invites' },
      ].map((card) => <div key={card.label} className="rounded-lg border border-[#d0d7de] bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[.06em] text-[#57606a]">{card.label}</p>
        <p className="mt-1 truncate text-lg font-semibold">{card.value}</p>
        <p className="mt-0.5 text-xs text-[#57606a]">{card.note}</p>
      </div>)}
    </div>

    <div className="mt-5 flex gap-1 overflow-x-auto rounded-md border border-[#d0d7de] bg-white p-1">
      {tabs.map((entry) => <button key={entry.id} onClick={() => setTab(entry.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${tab === entry.id ? 'bg-[#f6f8fa] text-[#1f2328]' : 'text-[#57606a] hover:text-[#1f2328]'}`}>
        {entry.label}
        {entry.count !== undefined && <span className="rounded-full bg-[#eaeef2] px-1.5 text-[10px] font-bold text-[#57606a]">{entry.count}</span>}
      </button>)}
    </div>

    {tab === 'members' && <div className="mt-4 overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#f6f8fa] text-[11px] uppercase tracking-[.04em] text-[#57606a]">
            <tr><th className="px-4 py-3 font-semibold">Member</th><th className="px-4 py-3 font-semibold">Role</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Joined</th><th className="px-4 py-3 text-right font-semibold">Actions</th></tr>
          </thead>
          <tbody>
            {data.members.map((member) => {
              const editable = canManage(member)
              return <tr key={member.id} className="border-t border-[#eaeef2] align-middle">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#eaeef2] text-[11px] font-bold text-[#57606a]">{member.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()??'').join('')||'??'}</span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-semibold">{member.name}{member.userId === data.me.actorId && <span className="rounded-full bg-[#ddf4ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#0969da]">You</span>}</p>
                      <p className="truncate text-xs text-[#57606a]">{member.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {editable
                    ? <select value={member.role} disabled={busyId === member.id} onChange={(event) => void changeRole(member, event.target.value as Role)} aria-label={`Role for ${member.name}`} className="h-8 rounded-md border border-[#d0d7de] bg-white px-2 text-xs font-semibold disabled:opacity-50">
                        {grantable.map((entry) => <option key={entry.role} value={entry.role}>{entry.role}</option>)}
                      </select>
                    : <RoleBadge role={member.role}/>}
                </td>
                <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${member.status === 'active' ? 'bg-[#dafbe1] text-[#1a7f37]' : 'bg-[#fff8c5] text-[#9a6700]'}`}><span className="size-1.5 rounded-full bg-current"/>{member.status === 'active' ? 'Active' : 'Suspended'}</span></td>
                <td className="px-4 py-3 text-xs text-[#57606a]">{dateLabel(member.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  {editable
                    ? <button onClick={() => setConfirming({ kind: 'member', id: member.id, label: member.name })} className="inline-flex items-center gap-1.5 rounded-md border border-[#d0d7de] px-2.5 py-1.5 text-xs font-semibold text-[#cf222e] hover:bg-[#ffebe9]"><Trash2 className="size-3.5"/>Remove</button>
                    : <span className="text-xs text-[#57606a]">{member.role === 'Owner' ? 'Owner is protected' : '—'}</span>}
                </td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-start gap-2 border-t border-[#eaeef2] bg-[#f6f8fa] px-4 py-3 text-xs text-[#57606a]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#1a7f37]"/>
        <p>Removing a member deletes their membership and ends their sessions immediately. The Owner can never be removed or demoted.</p>
      </div>
    </div>}

    {tab === 'invitations' && <div className="mt-4 overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
      {data.invitations.length === 0
        ? <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Mail className="size-6 text-[#57606a]"/>
            <p className="text-sm font-semibold">No pending invitations</p>
            <p className="max-w-sm text-xs text-[#57606a]">Invite a manager, cashier or storekeeper and share the one-time code with them. Codes expire after 7 days.</p>
            <button onClick={() => setInviteOpen(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#1f883d] px-3 py-2 text-xs font-semibold text-white"><UserPlus className="size-3.5"/>Invite member</button>
          </div>
        : <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-[#f6f8fa] text-[11px] uppercase tracking-[.04em] text-[#57606a]">
                <tr><th className="px-4 py-3 font-semibold">Email</th><th className="px-4 py-3 font-semibold">Role</th><th className="px-4 py-3 font-semibold">Invited by</th><th className="px-4 py-3 font-semibold">Expires</th><th className="px-4 py-3 text-right font-semibold">Actions</th></tr>
              </thead>
              <tbody>
                {data.invitations.map((invite) => <tr key={invite.id} className="border-t border-[#eaeef2]">
                  <td className="px-4 py-3 font-semibold">{invite.email}</td>
                  <td className="px-4 py-3"><RoleBadge role={invite.role}/></td>
                  <td className="px-4 py-3 text-xs text-[#57606a]">{invite.invitedBy ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-[#57606a]"><span className="inline-flex items-center gap-1.5"><Clock className="size-3.5"/>{dateLabel(invite.expiresAt)}</span></td>
                  <td className="px-4 py-3 text-right"><button onClick={() => setConfirming({ kind: 'invite', id: invite.id, label: invite.email })} className="inline-flex items-center gap-1.5 rounded-md border border-[#d0d7de] px-2.5 py-1.5 text-xs font-semibold text-[#cf222e] hover:bg-[#ffebe9]"><X className="size-3.5"/>Revoke</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>}
    </div>}

    {tab === 'permissions' && <div className="mt-4 overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
      <div className="border-b border-[#eaeef2] px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold"><UsersRound className="size-4"/>Who can do what</p>
        <p className="mt-1 text-xs text-[#57606a]">Owner and Admin hold every capability. Voids and discounts additionally need an approval PIN at the till.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#f6f8fa] text-[11px] uppercase tracking-[.04em] text-[#57606a]">
            <tr>
              <th className="px-4 py-3 font-semibold">Capability</th>
              {(['Owner','Admin','Manager','Cashier','Storekeeper'] as Role[]).map((role) => <th key={role} className="px-3 py-3 text-center font-semibold">{role}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row) => <tr key={row.permission} className="border-t border-[#eaeef2]">
              <td className="px-4 py-2.5">
                <p className="font-medium">{row.label}</p>
                <p className="font-mono text-[10px] text-[#57606a]">{row.permission}</p>
              </td>
              {(['Owner','Admin','Manager','Cashier','Storekeeper'] as Role[]).map((role) => <td key={role} className="px-3 py-2.5 text-center">
                {row.roles.includes(role)
                  ? <Check className="mx-auto size-4 text-[#1a7f37]" aria-label={`${role} allowed`}/>
                  : <span className="text-[#d0d7de]" aria-label={`${role} not allowed`}>—</span>}
              </td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[#eaeef2] bg-[#f6f8fa] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[.06em] text-[#57606a]">Role notes</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.roles.map((entry) => <div key={entry.role} className="rounded-md border border-[#d0d7de] bg-white p-3">
            <RoleBadge role={entry.role}/>
            <p className="mt-1.5 text-xs leading-relaxed text-[#57606a]">{entry.description}</p>
          </div>)}
        </div>
      </div>
    </div>}

    {inviteOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f2328]/50 p-4" role="dialog" aria-modal="true" aria-label="Invite a team member">
      <div className="w-full max-w-lg rounded-lg border border-[#d0d7de] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.06em] text-[#57606a]">Team invite</p>
            <h3 className="mt-1 text-lg font-semibold">{issued ? 'Share the invitation' : 'Invite a team member'}</h3>
            <p className="mt-1 text-sm text-[#57606a]">{issued ? 'The code works once and is bound to the email below.' : 'They will create their own account. You choose the role; they never choose it themselves.'}</p>
          </div>
          <button aria-label="Close" onClick={() => { setInviteOpen(false); setIssued(null); setInviteError('') }} className="rounded-md p-2 text-[#57606a] hover:bg-[#f6f8fa]"><X className="size-5"/></button>
        </div>

        {!issued ? <form onSubmit={sendInvite} className="mt-5 flex flex-col gap-4">
          <label className="text-xs font-semibold text-[#57606a]">Work email
            <input required type="email" autoFocus value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@bar.com" className="mt-1.5 h-10 w-full rounded-md border border-[#d0d7de] px-3 text-sm font-normal text-[#1f2328] outline-none focus:border-[#0969da] focus:ring-2 focus:ring-[#0969da]/20"/>
          </label>
          <label className="text-xs font-semibold text-[#57606a]">Role
            <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)} className="mt-1.5 h-10 w-full rounded-md border border-[#d0d7de] bg-white px-3 text-sm font-normal text-[#1f2328]">
              {grantable.map((entry) => <option key={entry.role} value={entry.role}>{entry.role}</option>)}
            </select>
          </label>
          <p className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-3 text-xs leading-relaxed text-[#57606a]">{data.roles.find((entry) => entry.role === inviteRole)?.description}</p>
          {inviteError && <p role="alert" className="rounded-md border border-[#ffcecb] bg-[#ffebe9] px-3 py-2 text-xs font-semibold text-[#cf222e]">{inviteError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setInviteOpen(false)} className="rounded-md border border-[#d0d7de] px-4 py-2.5 text-sm font-semibold">Cancel</button>
            <button disabled={inviteBusy} className="inline-flex items-center gap-2 rounded-md bg-[#1f883d] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{inviteBusy ? <Loader2 className="size-4 animate-spin"/> : <Mail className="size-4"/>}Create invitation</button>
          </div>
        </form> : <div className="mt-5">
          <div className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#57606a]">One-time code</p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-[.2em]">{issued.code}</p>
            <p className="mt-1 text-xs text-[#57606a]">{issued.email} · {issued.role} · expires {dateLabel(issued.expiresAt)}</p>
          </div>
          <button onClick={() => void copyCode()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#d0d7de] px-4 py-2.5 text-sm font-semibold hover:bg-[#f6f8fa]">
            {copied ? <><Check className="size-4 text-[#1a7f37]"/>Copied</> : <><Copy className="size-4"/>Copy code and join link</>}
          </button>
          <p className="mt-2 break-all rounded-md bg-[#f6f8fa] p-2 font-mono text-[10px] text-[#57606a]">{`${typeof window !== 'undefined' ? window.location.origin : ''}${issued.joinUrl}`}</p>
          <p className="mt-2 text-xs text-[#57606a]">Only the hash is stored, so this code cannot be shown again. Create a new invite if it is lost.</p>
          <div className="mt-4 flex justify-end"><button onClick={() => { setInviteOpen(false); setIssued(null) }} className="rounded-md bg-[#1f883d] px-4 py-2.5 text-sm font-semibold text-white">Done</button></div>
        </div>}
      </div>
    </div>}

    {confirming && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f2328]/50 p-4" role="dialog" aria-modal="true" aria-label="Confirm removal">
      <div className="w-full max-w-md rounded-lg border border-[#d0d7de] bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold">{confirming.kind === 'member' ? 'Remove member?' : 'Revoke invitation?'}</h3>
        <p className="mt-1 text-sm text-[#57606a]">{confirming.kind === 'member'
          ? `${confirming.label} will lose access immediately and their sessions will be ended. History stays in the audit log.`
          : `${confirming.label} will no longer be able to use this invitation code.`}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setConfirming(null)} className="rounded-md border border-[#d0d7de] px-4 py-2.5 text-sm font-semibold">Cancel</button>
          <button disabled={confirmBusy} onClick={() => void confirmAction()} className="inline-flex items-center gap-2 rounded-md bg-[#cf222e] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{confirmBusy && <Loader2 className="size-4 animate-spin"/>}{confirming.kind === 'member' ? 'Remove member' : 'Revoke'}</button>
        </div>
      </div>
    </div>}
  </div>
}

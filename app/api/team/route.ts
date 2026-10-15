import { and, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { teamMembers } from '@/lib/db/schema'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await import('next/headers').then(({ headers }) => headers()) })
  return session?.user.id
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await db.select({ id: teamMembers.id, name: teamMembers.name, role: teamMembers.role, createdAt: teamMembers.createdAt }).from(teamMembers).where(eq(teamMembers.userId, userId)).orderBy(desc(teamMembers.createdAt)))
}

export async function POST(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const role = typeof body.role === 'string' ? body.role : 'Cashier'
  const pin = typeof body.pin === 'string' ? body.pin : ''
  if (!name || !['Cashier', 'Manager', 'Storekeeper'].includes(role) || !/^\d{4,8}$/.test(pin)) return NextResponse.json({ error: 'Invalid team member' }, { status: 400 })
  const member = { id: crypto.randomUUID(), userId, name, role, pin }
  return NextResponse.json((await db.insert(teamMembers).values(member).returning({ id: teamMembers.id, name: teamMembers.name, role: teamMembers.role }))[0], { status: 201 })
}

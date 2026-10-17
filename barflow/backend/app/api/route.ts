import { desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { teamMembers } from '@/lib/db/schema'
import { requireRole, handleAuthError } from '@/lib/permissions'

export async function GET() {
  try {
    // Only Admin and Manager can view the team list
    const user = await requireRole(['Admin', 'Manager'])

    const rows = await db
      .select({
        id: teamMembers.id,
        name: teamMembers.name,
        role: teamMembers.role,
        createdAt: teamMembers.createdAt,
      })
      .from(teamMembers)
      .where(eq(teamMembers.userId, user.id))
      .orderBy(desc(teamMembers.createdAt))

    return NextResponse.json(rows)
  } catch (error) {
    return handleAuthError(error)
  }
}

export async function POST(request: Request) {
  try {
    // Only Admin and Manager can create team members
    const user = await requireRole(['Admin', 'Manager'])

    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const role = typeof body.role === 'string' ? body.role : 'Cashier'
    const pin = typeof body.pin === 'string' ? body.pin : ''

    if (
      !name ||
      !['Cashier', 'Manager', 'Storekeeper'].includes(role) ||
      !/^\d{4,8}$/.test(pin)
    ) {
      return NextResponse.json({ error: 'Invalid team member' }, { status: 400 })
    }

    const member = {
      id: crypto.randomUUID(),
      userId: user.id,
      name,
      role,
      pin,
    }

    const [created] = await db
      .insert(teamMembers)
      .values(member)
      .returning({
        id: teamMembers.id,
        name: teamMembers.name,
        role: teamMembers.role,
      })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return handleAuthError(error)
  }
}
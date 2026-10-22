import { and, eq } from 'drizzle-orm'
import { db } from '../lib/db'
import { memberships, settings, user as users, workspaces } from '../lib/db/schema'

/**
 * Give every existing account a workspace it owns. Existing rows are already scoped by
 * `user_id`, so the owner id becomes the workspace's tenant key; staff added later inherit it.
 */
async function main() {
  const accounts = await db.select({ id: users.id, name: users.name }).from(users)
  let created = 0

  for (const account of accounts) {
    const [nameSetting] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(and(eq(settings.userId, account.id), eq(settings.key, 'bar_name')))
      .limit(1)

    const inserted = await db
      .insert(workspaces)
      .values({
        id: `ws_${account.id}`,
        name: nameSetting?.value?.trim() || `${account.name || 'My'} bar`,
        ownerId: account.id,
      })
      .onConflictDoNothing()
      .returning({ id: workspaces.id })

    await db
      .insert(memberships)
      .values({
        id: `mem_${account.id}`,
        workspaceId: `ws_${account.id}`,
        userId: account.id,
        role: 'Owner',
        status: 'active',
      })
      .onConflictDoNothing()

    created += inserted.length
  }

  console.info(`Backfilled ${created} workspace(s) across ${accounts.length} account(s).`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

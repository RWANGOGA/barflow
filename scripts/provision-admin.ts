import { createHash, timingSafeEqual } from 'node:crypto'
import { stdin as input, stdout as output } from 'node:process'
import { config } from 'dotenv'
import { and, eq, sql } from 'drizzle-orm'

config({ path: '.env.local' })
config()

function promptForToken(): Promise<string> {
  output.write('Enter the one-time Admin provisioning token (input hidden): ')
  input.setRawMode(true)
  input.resume()

  return new Promise((resolve, reject) => {
    let token = ''
    const finish = (error?: Error) => {
      input.setRawMode(false)
      input.pause()
      input.removeListener('data', onData)
      output.write('\n')
      if (error) reject(error)
      else resolve(token)
    }
    const onData = (chunk: Buffer) => {
      const value = chunk.toString('utf8')
      if (value === '\u0003') return finish(new Error('Provisioning cancelled.'))
      if (value === '\r' || value === '\n') return finish()
      if (value === '\u007f' || value === '\b') {
        token = token.slice(0, -1)
        return
      }
      if (/^[\x20-\x7e]+$/.test(value)) token += value
    }
    input.on('data', onData)
  })
}

async function main() {
  const connectionString = (process.env.NEON_MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL)?.trim()
  const expectedTokenHash = process.env.ADMIN_PROVISIONING_TOKEN_HASH?.trim().toLowerCase()
  const configuredEmail = process.env.ADMIN_PROVISIONING_EMAIL?.trim().toLowerCase()
  const tokenExpiresAt = Date.parse(process.env.ADMIN_PROVISIONING_TOKEN_EXPIRES_AT ?? '')
  const emailArg = process.argv.find((arg) => arg.startsWith('--email='))?.slice('--email='.length)
  const targetEmail = emailArg?.trim().toLowerCase()

  if (!connectionString) throw new Error('Set NEON_MIGRATION_DATABASE_URL or DATABASE_URL in .env.local.')
  if (!expectedTokenHash || !/^[a-f0-9]{64}$/.test(expectedTokenHash)) {
    throw new Error('Set ADMIN_PROVISIONING_TOKEN_HASH to the SHA-256 hex digest of a unique 32-byte provisioning token.')
  }
  if (!configuredEmail || !targetEmail || configuredEmail !== targetEmail) {
    throw new Error('The requested --email must exactly match ADMIN_PROVISIONING_EMAIL generated for this token.')
  }
  if (!Number.isFinite(tokenExpiresAt) || Date.now() >= tokenExpiresAt) {
    throw new Error('Set ADMIN_PROVISIONING_TOKEN_EXPIRES_AT to the token expiry printed by pnpm db:token; the token expires in 15 minutes.')
  }
  if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    throw new Error('Usage: pnpm db:admin -- --email=owner@example.com')
  }
  if (!input.isTTY || !output.isTTY || !input.setRawMode) {
    throw new Error('Admin provisioning requires an interactive terminal so the token can be entered without echo.')
  }

  const suppliedToken = await promptForToken()
  const suppliedTokenHash = createHash('sha256').update(`${targetEmail}:${suppliedToken}`).digest()
  const expectedHashBytes = Buffer.from(expectedTokenHash, 'hex')
  if (!timingSafeEqual(suppliedTokenHash, expectedHashBytes)) {
    throw new Error('Invalid Admin provisioning token.')
  }

  const [{ drizzle }, { Pool }, { schema }] = await Promise.all([
    import('drizzle-orm/node-postgres'),
    import('pg'),
    import('../lib/db/schema'),
  ])
  const { user, auditLogs, adminBootstrapTokens } = schema
  const pool = new Pool({ connectionString, max: 1 })
  const db = drizzle(pool, { schema })

  try {
    await db.transaction(async (tx) => {
      // Serialize attempts so two CLI runs cannot both create the initial Admin.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('barflow:initial-admin-provisioning'))`)

      const [existingAdmin] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.role, 'Admin'))
        .limit(1)
      if (existingAdmin) throw new Error('An Admin already exists; initial provisioning is already complete.')

      const [candidate] = await tx
        .select({ id: user.id, email: user.email, role: user.role })
        .from(user)
        .where(sql`lower(${user.email}) = ${targetEmail}`)
        .limit(1)
      if (!candidate) throw new Error(`No existing account found for ${targetEmail}. Create the account first, then retry.`)
      if (candidate.role !== 'Cashier') {
        throw new Error(`Only a Cashier account can be promoted by bootstrap; ${targetEmail} currently has role ${candidate.role}.`)
      }

      const [consumedToken] = await tx
        .insert(adminBootstrapTokens)
        .values({ tokenHash: expectedTokenHash, targetEmail, consumedBy: candidate.id })
        .onConflictDoNothing()
        .returning({ tokenHash: adminBootstrapTokens.tokenHash })
      if (!consumedToken) throw new Error('This provisioning token has already been consumed.')

      const [promoted] = await tx
        .update(user)
        .set({ role: 'Admin', updatedAt: new Date() })
        .where(and(eq(user.id, candidate.id), eq(user.role, 'Cashier')))
        .returning({ id: user.id, email: user.email })
      if (!promoted) throw new Error('The account changed during provisioning; no role was updated.')

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        userId: promoted.id,
        actorRole: 'bootstrap_cli',
        action: 'bootstrap_admin',
        entityType: 'user',
        entityId: promoted.id,
        reason: 'One-time initial owner provisioning',
        metadata: { source: 'pnpm db:admin' },
        recordLabel: promoted.email,
        approval: 'bootstrap_cli',
      })
    })

    console.info(`Initial Admin role assigned to ${targetEmail}. Remove the temporary ADMIN_PROVISIONING_* values from .env.local now.`)
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Admin provisioning failed.')
  process.exitCode = 1
})

import { createHash, randomBytes } from 'node:crypto'

const emailArg = process.argv.find((arg) => arg.startsWith('--email='))?.slice('--email='.length)
const email = emailArg?.trim().toLowerCase()
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Usage: pnpm db:token -- --email=owner@example.com')
}

const token = randomBytes(32).toString('base64url')
const tokenHash = createHash('sha256').update(`${email}:${token}`).digest('hex')
const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
console.info(`Target email: ${email}`)
console.info(`One-time token (expires at ${expiresAt}): ${token}`)
console.info(`SHA-256 hex for ADMIN_PROVISIONING_TOKEN_HASH: ${tokenHash}`)
console.info(`Expiry for ADMIN_PROVISIONING_TOKEN_EXPIRES_AT: ${expiresAt}`)
console.info('Store the token securely; put only the digest, email and expiry in .env.local. The raw token is never written to disk.')

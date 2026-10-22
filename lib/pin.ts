import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Approval PINs are short and low-entropy, so a plain digest is trivially
 * reversed from a leaked table. New PINs are stored as a salted scrypt hash;
 * `verifyPin` still accepts legacy SHA-256 digests so existing accounts keep
 * working and upgrade on their next successful check.
 */
const PARAMS = { N: 16384, r: 8, p: 1 } as const
const KEY_LENGTH = 64
const SALT_BYTES = 16
const MAX_MEMORY = 64 * 1024 * 1024

export function hashPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES)
  const hash = scryptSync(pin, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEMORY })
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('hex'), hash.toString('hex')].join('$')
}

/** Older accounts stored a bare 64-character SHA-256 digest. */
export function isLegacyPinHash(stored: string): boolean {
  return /^[a-f0-9]{64}$/i.test(stored)
}

export function verifyPin(pin: string, stored: string): boolean {
  if (isLegacyPinHash(stored)) {
    const expected = Buffer.from(stored, 'hex')
    const actual = createHash('sha256').update(pin).digest()
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }

  const [scheme, n, r, p, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false

  const N = Number(n)
  const blockSize = Number(r)
  const parallel = Number(p)
  if (!Number.isInteger(N) || !Number.isInteger(blockSize) || !Number.isInteger(parallel)) return false
  if (N < 1024 || blockSize < 1 || parallel < 1) return false
  // Refuse absurd parameters from a tampered row instead of allocating unbounded memory.
  if (N > 1_048_576 || blockSize > 32 || parallel > 4) return false

  const expected = Buffer.from(hashHex, 'hex')
  if (expected.length < 32 || expected.length > 128) return false

  const actual = scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length, {
    N,
    r: blockSize,
    p: parallel,
    maxmem: MAX_MEMORY,
  })
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

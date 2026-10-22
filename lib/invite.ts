import { createHash, randomInt } from 'node:crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 10

/** Codes avoid look-alike characters (0/O, 1/I) so they survive being read aloud or written down. */
export function generateInviteCode(): string {
  let code = ''
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)]
  }
  return code
}

export function normalizeInviteCode(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(normalizeInviteCode(code)).digest('hex')
}

export const INVITE_TTL_DAYS = 7

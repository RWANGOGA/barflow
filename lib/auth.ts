import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'

function requiredEnv(name: 'BETTER_AUTH_URL' | 'BETTER_AUTH_SECRET') {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const authBaseURL = requiredEnv('BETTER_AUTH_URL')
const authSecret = requiredEnv('BETTER_AUTH_SECRET')

let authOrigin: string
try {
  const parsedURL = new URL(authBaseURL)
  if (parsedURL.protocol !== 'http:' && parsedURL.protocol !== 'https:') {
    throw new Error('Unsupported protocol')
  }
  // Loopback is a secure context in every browser, so a production build served from
  // localhost (CI, Docker, `next start` on a till) must not be forced onto TLS.
  const loopback = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'].includes(parsedURL.hostname)
  if (process.env.NODE_ENV === 'production' && parsedURL.protocol !== 'https:' && !loopback) {
    throw new Error('Production BETTER_AUTH_URL must use HTTPS')
  }
  authOrigin = parsedURL.origin
} catch {
  throw new Error('BETTER_AUTH_URL must be a valid absolute HTTP(S) URL (HTTPS in production, except on loopback).')
}

if (authSecret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters. Generate a random secret before starting the app.')
}

const deploymentOrigins = [
  ...(process.env.NODE_ENV === 'development'
    ? [
        process.env.V0_RUNTIME_URL,
        process.env.V0_DEV_APP_URL,
        process.env.V0_BUILD_URL,
        process.env.V0_SANDBOX_URL,
      ]
    : []),
  ...(process.env.NODE_ENV === 'production'
    ? [
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
        process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : null,
      ]
    : []),
].filter((origin): origin is string => Boolean(origin))

export const auth = betterAuth({
  secret: authSecret,
  database: pool,
  baseURL: authBaseURL,

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    // Long enough to resist offline guessing, short enough that no password manager complains.
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  /**
   * Throttle credential endpoints. A till on a shared network is exactly the place where an
   * unattended sign-in form gets hammered; without this, Better Auth would accept unlimited
   * password guesses from one address.
   */
  rateLimit: {
    enabled: true,
    window: 60,
    max: 120,
    customRules: {
      '/sign-in/email': { window: 60, max: 8 },
      '/sign-up/email': { window: 300, max: 5 },
      '/change-password': { window: 300, max: 5 },
      '/set-password': { window: 300, max: 5 },
      '/forget-password': { window: 300, max: 3 },
      '/reset-password': { window: 300, max: 5 },
    },
  },

  // Self-registered accounts start with the least-privileged supported role.
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'Cashier',
        input: false,
      },
    },
  },

  trustedOrigins: [...new Set([authOrigin, ...deploymentOrigins])],

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },

  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
})

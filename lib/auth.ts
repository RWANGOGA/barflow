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
  if (process.env.NODE_ENV === 'production' && parsedURL.protocol !== 'https:') {
    throw new Error('Production BETTER_AUTH_URL must use HTTPS')
  }
  authOrigin = parsedURL.origin
} catch {
  throw new Error('BETTER_AUTH_URL must be a valid absolute HTTP(S) URL (HTTPS in production).')
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

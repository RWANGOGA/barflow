import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Next.js loads .env.local automatically; Drizzle's CLI does not.
config({ path: '.env.local' })
config()

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
})

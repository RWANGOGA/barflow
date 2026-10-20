import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { Pool } from 'pg'
import { products, settings, teamMembers, user } from '../lib/db/schema'

config({ path: '.env.local' })
config()

// Demo catalogue for local development. Prices are whole UGX, matching the dashboard money format.
const DEMO_PRODUCTS = [
  { id: 'seed-nile-special', name: 'Nile Special', category: 'Beer', price: 4000, cost: 3000, stock: 48, reorder: 12, unit: 'bottle', tone: 'gold' },
  { id: 'seed-club-pilsener', name: 'Club Pilsener', category: 'Beer', price: 4000, cost: 3000, stock: 36, reorder: 12, unit: 'bottle', tone: 'gold' },
  { id: 'seed-tusker-lite', name: 'Tusker Lite', category: 'Beer', price: 4500, cost: 3200, stock: 30, reorder: 12, unit: 'bottle', tone: 'slate' },
  { id: 'seed-waragi', name: 'Uganda Waragi', category: 'Spirits', price: 3000, cost: 1800, stock: 60, reorder: 15, unit: 'shot', tone: 'burgundy' },
  { id: 'seed-jw-red', name: 'Johnnie Walker Red', category: 'Spirits', price: 6000, cost: 4500, stock: 12, reorder: 6, unit: 'shot', tone: 'burgundy' },
  { id: 'seed-smirnoff-ice', name: 'Smirnoff Ice', category: 'Cider', price: 5000, cost: 3500, stock: 24, reorder: 6, unit: 'bottle', tone: 'green' },
  { id: 'seed-coke', name: 'Coca-Cola 300ml', category: 'Soft drinks', price: 2000, cost: 1200, stock: 72, reorder: 24, unit: 'bottle', tone: 'rose' },
  { id: 'seed-water', name: 'Rwenzori Water 500ml', category: 'Soft drinks', price: 1500, cost: 800, stock: 96, reorder: 24, unit: 'bottle', tone: 'teal' },
  { id: 'seed-drostdy', name: 'Drostdy-Hof', category: 'Wine', price: 15000, cost: 11000, stock: 8, reorder: 4, unit: 'bottle', tone: 'pink' },
  { id: 'seed-mojito', name: 'Mojito', category: 'Cocktails', price: 12000, cost: 7000, stock: 20, reorder: 5, unit: 'glass', tone: 'peach' },
]

const DEMO_TEAM = [
  { id: 'seed-team-sarah', name: 'Sarah Nakato', role: 'Manager' },
  { id: 'seed-team-brian', name: 'Brian Okello', role: 'Cashier' },
  { id: 'seed-team-peter', name: 'Peter Mwesigwa', role: 'Storekeeper' },
]

const DEMO_SETTINGS = {
  currency: 'UGX',
  tax_rate: '0',
  language: 'en',
  date_format: 'DD/MM/YYYY',
  allow_negative_stock: 'false',
}

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) throw new Error('DATABASE_URL is not set. Add it to .env.local.')

  const url = new URL(connectionString)
  const isLocal = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(url.hostname)
  if (!isLocal && !process.argv.includes('--allow-remote')) {
    throw new Error(
      `Refusing to seed ${url.hostname}: demo rows must not land in a real database. Re-run with --allow-remote if that is intended.`,
    )
  }

  const pool = new Pool({ connectionString, max: 1 })
  const db = drizzle(pool)

  try {
    const [admin] = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.role, 'Admin'))
      .limit(1)

    if (!admin) {
      throw new Error('No Admin account yet. Sign up at /sign-up, promote that account, then run `pnpm db:seed` again.')
    }

    const insertedProducts = await db
      .insert(products)
      .values(DEMO_PRODUCTS.map((product) => ({ ...product, userId: admin.id })))
      .onConflictDoNothing()
      .returning({ id: products.id })

    const insertedTeam = await db
      .insert(teamMembers)
      .values(DEMO_TEAM.map((member) => ({ ...member, userId: admin.id })))
      .onConflictDoNothing()
      .returning({ id: teamMembers.id })

    const insertedSettings = await db
      .insert(settings)
      .values(Object.entries(DEMO_SETTINGS).map(([key, value]) => ({ userId: admin.id, key, value })))
      .onConflictDoNothing()
      .returning({ key: settings.key })

    console.info(`Owner    ${admin.email}`)
    console.info(`Products ${insertedProducts.length} added, ${DEMO_PRODUCTS.length - insertedProducts.length} already present`)
    console.info(`Team     ${insertedTeam.length} added, ${DEMO_TEAM.length - insertedTeam.length} already present`)
    console.info(`Settings ${insertedSettings.length} added, ${Object.keys(DEMO_SETTINGS).length - insertedSettings.length} already present`)
    console.info('Demo data is idempotent: re-running only fills what is missing.')
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seeding failed.')
  process.exitCode = 1
})

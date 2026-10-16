import { integer, pgTable, text, timestamp, boolean, date, primaryKey } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('Manager'), // ← NEW
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull(),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const products = pgTable('bar_product', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  price: integer('price').notNull(),
  stock: integer('stock').notNull().default(0),
  reorder: integer('reorder').notNull().default(0),
  cost: integer('cost').notNull().default(0),
  unit: text('unit').notNull(),
  tone: text('tone').notNull().default('slate'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sales = pgTable('bar_sale', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  paymentMethod: text('payment_method').notNull(),
  total: integer('total').notNull(),
  tableLabel: text('table_label'),
  status: text('status').notNull().default('completed'),
  tenderedAmount: integer('tendered_amount'),
  changeDue: integer('change_due'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const saleItems = pgTable('bar_sale_item', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  saleId: text('sale_id').notNull(),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  category: text('category').notNull(),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
  lineTotal: integer('line_total').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const receipts = pgTable('bar_receipts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  saleId: text('sale_id').notNull(),
  receiptNumber: integer('receipt_number').notNull(),
  isCopy: boolean('is_copy').notNull().default(false),
  copyOf: text('copy_of'),
  printedAt: timestamp('printed_at', { withTimezone: true }).notNull().defaultNow(),
  printedBy: text('printed_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const receiptCounter = pgTable('bar_receipt_counter', {
  userId: text('user_id').primaryKey(),
  nextNumber: integer('next_number').notNull().default(1),
})

export const salePayments = pgTable('bar_sale_payment', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  saleId: text('sale_id').notNull(),
  method: text('method').notNull(),
  amount: integer('amount').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const settings = pgTable(
  'bar_settings',
  {
    userId: text('user_id').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.key] }),
  })
)

export const userPins = pgTable('bar_user_pin', {
  userId: text('user_id').primaryKey(),
  pinHash: text('pin_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const discounts = pgTable('bar_discount', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  saleId: text('sale_id'),
  amount: integer('amount').notNull(),
  reason: text('reason').notNull(),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const menuStockLinks = pgTable('bar_menu_stock_link', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  menuItemId: text('menu_item_id').notNull(),
  stockItemId: text('stock_item_id').notNull(),
  quantityPerUnit: integer('quantity_per_unit').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const stockDeliveries = pgTable('bar_stock_delivery', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  supplier: text('supplier').notNull(),
  productId: text('product_id').notNull(),
  quantity: integer('quantity').notNull(),
  costPrice: integer('cost_price').notNull(),
  deliveryDate: date('delivery_date').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const stockTransfers = pgTable('bar_stock_transfer', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  productId: text('product_id').notNull(),
  quantity: integer('quantity').notNull(),
  fromLocation: text('from_location').notNull(),
  toLocation: text('to_location').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const stockMovements = pgTable('bar_stock_movement', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  productId: text('product_id').notNull(),
  quantity: integer('quantity').notNull(),
  movementType: text('movement_type').notNull(),
  reference: text('reference'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tradingDays = pgTable('bar_day', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  businessDate: date('business_date').notNull(),
  status: text('status').notNull().default('open'),
  openingFloat: integer('opening_float').notNull().default(0),
  countedCash: integer('counted_cash'),
  expectedCash: integer('expected_cash'),
  cashVariance: integer('cash_variance'),
  stockVarianceUnits: integer('stock_variance_units'),
  stockVarianceValue: integer('stock_variance_value'),
  varianceAccepted: boolean('variance_accepted').notNull().default(false),
  varianceReason: text('variance_reason'),
  locked: boolean('locked').notNull().default(false),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
})

export const stockCounts = pgTable('bar_stock_count', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  dayId: text('day_id').notNull(),
  productId: text('product_id').notNull(),
  countedQuantity: integer('counted_quantity').notNull(),
  expectedQuantity: integer('expected_quantity').notNull(),
  varianceUnits: integer('variance_units').notNull(),
  varianceValue: integer('variance_value').notNull(),
  countedAt: timestamp('counted_at', { withTimezone: true }).notNull().defaultNow(),
})

export const varianceTolerances = pgTable(
  'bar_variance_tolerance',
  {
    userId: text('user_id').notNull(),
    productId: text('product_id').notNull(),
    toleranceUnits: integer('tolerance_units').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.productId] }),
  })
)

export const varianceHistory = pgTable('bar_variance_history', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  dayId: text('day_id').notNull(),
  productId: text('product_id').notNull(),
  varianceUnits: integer('variance_units').notNull(),
  varianceValue: integer('variance_value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tabs = pgTable('bar_tab', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tableLabel: text('table_label').notNull(),
  ownerName: text('owner_name').notNull(),
  total: integer('total').notNull().default(0),
  status: text('status').notNull().default('open'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  voidReason: text('void_reason'),
  voidedBy: text('voided_by'),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
})

export const teamMembers = pgTable('bar_team_member', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  pin: text('pin'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const auditLogs = pgTable('bar_audit_log', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  action: text('action').notNull(),
  recordLabel: text('record_label').notNull(),
  approval: text('approval').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const schema = {
  user,
  session,
  account,
  verification,
  products,
  sales,
  saleItems,
  stockMovements,
  tradingDays,
  tabs,
  teamMembers,
  auditLogs,
  receipts,
  receiptCounter,
  salePayments,
  settings,
  userPins,
  discounts,
  menuStockLinks,
  stockDeliveries,
  stockTransfers,
  stockCounts,
  varianceTolerances,
  varianceHistory,
}

export type ProductRow = typeof products.$inferSelect

export const loginAttempts = pgTable('bar_login_attempts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  success: boolean('success').notNull().default(false),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
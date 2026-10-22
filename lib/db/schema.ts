import { sql } from 'drizzle-orm'
import {
  AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('Cashier'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('user_role_check', sql`${table.role} IN ('Admin', 'Manager', 'Cashier', 'Storekeeper')`),
])

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id),
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
  userId: text('user_id').notNull().references(() => user.id),
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
}, (table) => [
  index('bar_product_user_idx').on(table.userId),
  check('bar_product_price_check', sql`${table.price} > 0`),
  check('bar_product_stock_check', sql`${table.stock} >= 0`),
  check('bar_product_reorder_check', sql`${table.reorder} >= 0`),
  check('bar_product_cost_check', sql`${table.cost} >= 0`),
])

export const sales = pgTable('bar_sale', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  paymentMethod: text('payment_method').notNull(),
  total: integer('total').notNull(),
  tableLabel: text('table_label'),
  status: text('status').notNull().default('completed'),
  idempotencyKey: text('idempotency_key'),
  voided: boolean('voided').notNull().default(false),
  voidReason: text('void_reason'),
  voidedBy: text('voided_by'),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  tenderedAmount: integer('tendered_amount'),
  changeDue: integer('change_due'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_sale_user_created_idx').on(table.userId, table.createdAt),
  uniqueIndex('bar_sale_idempotency_idx').on(table.userId, table.idempotencyKey).where(sql`${table.idempotencyKey} IS NOT NULL`),
  check('bar_sale_total_check', sql`${table.total} > 0`),
  check('bar_sale_status_check', sql`${table.status} IN ('completed', 'voided')`),
  check('bar_sale_tendered_amount_check', sql`${table.tenderedAmount} IS NULL OR ${table.tenderedAmount} >= 0`),
  check('bar_sale_change_due_check', sql`${table.changeDue} IS NULL OR ${table.changeDue} >= 0`),
])

export const saleItems = pgTable('bar_sale_item', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  saleId: text('sale_id').notNull().references(() => sales.id),
  productId: text('product_id').notNull().references(() => products.id),
  productName: text('product_name').notNull(),
  category: text('category').notNull(),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
  lineTotal: integer('line_total').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_sale_item_user_created_idx').on(table.userId, table.createdAt),
  index('bar_sale_item_sale_idx').on(table.saleId),
  index('bar_sale_item_category_idx').on(table.userId, table.category, table.createdAt),
  check('bar_sale_item_unit_price_check', sql`${table.unitPrice} >= 0`),
  check('bar_sale_item_quantity_check', sql`${table.quantity} > 0`),
  check('bar_sale_item_line_total_check', sql`${table.lineTotal} >= 0`),
])

export const salePayments = pgTable('bar_sale_payment', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  saleId: text('sale_id').notNull().references(() => sales.id),
  method: text('method').notNull(),
  amount: integer('amount').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_sale_payment_sale_idx').on(table.saleId),
  check('bar_sale_payment_method_check', sql`${table.method} IN ('cash', 'mobile_money', 'card')`),
  check('bar_sale_payment_amount_check', sql`${table.amount} > 0`),
])

export const receipts = pgTable('bar_receipts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  saleId: text('sale_id').notNull().references(() => sales.id),
  receiptNumber: integer('receipt_number').notNull(),
  isCopy: boolean('is_copy').notNull().default(false),
  copyOf: text('copy_of').references((): AnyPgColumn => receipts.id),
  printedAt: timestamp('printed_at', { withTimezone: true }).notNull().defaultNow(),
  printedBy: text('printed_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('bar_receipts_user_number_idx').on(table.userId, table.receiptNumber),
  index('bar_receipts_sale_idx').on(table.saleId),
])

export const receiptCounter = pgTable('bar_receipt_counter', {
  userId: text('user_id').primaryKey().references(() => user.id),
  nextNumber: integer('next_number').notNull().default(1),
})

export const settings = pgTable('bar_settings', {
  userId: text('user_id').notNull().references(() => user.id),
  key: text('key').notNull(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.key] }),
])

export const userPins = pgTable('bar_user_pin', {
  userId: text('user_id').primaryKey().references(() => user.id),
  pinHash: text('pin_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const discounts = pgTable('bar_discount', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  saleId: text('sale_id').references(() => sales.id),
  amount: integer('amount').notNull(),
  reason: text('reason').notNull(),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_discount_user_created_idx').on(table.userId, table.createdAt),
  check('bar_discount_amount_check', sql`${table.amount} > 0`),
])

export const menuStockLinks = pgTable('bar_menu_stock_link', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  menuItemId: text('menu_item_id').notNull().references(() => products.id),
  stockItemId: text('stock_item_id').notNull().references(() => products.id),
  quantityPerUnit: integer('quantity_per_unit').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_menu_stock_link_menu_idx').on(table.userId, table.menuItemId),
  check('bar_menu_stock_link_quantity_check', sql`${table.quantityPerUnit} > 0`),
])

export const stockDeliveries = pgTable('bar_stock_delivery', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  supplier: text('supplier').notNull(),
  productId: text('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  costPrice: integer('cost_price').notNull(),
  deliveryDate: date('delivery_date').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_stock_delivery_user_date_idx').on(table.userId, table.deliveryDate),
  check('bar_stock_delivery_quantity_check', sql`${table.quantity} > 0`),
  check('bar_stock_delivery_cost_check', sql`${table.costPrice} >= 0`),
])

export const stockTransfers = pgTable('bar_stock_transfer', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  productId: text('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  fromLocation: text('from_location').notNull(),
  toLocation: text('to_location').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_stock_transfer_user_created_idx').on(table.userId, table.createdAt),
  check('bar_stock_transfer_quantity_check', sql`${table.quantity} > 0`),
])

export const stockMovements = pgTable('bar_stock_movement', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  productId: text('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  movementType: text('movement_type').notNull(),
  reference: text('reference'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_stock_movement_user_created_idx').on(table.userId, table.createdAt),
  check('bar_stock_movement_quantity_check', sql`${table.quantity} <> 0`),
])

export const tradingDays = pgTable('bar_day', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
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
}, (table) => [
  uniqueIndex('bar_day_one_open_idx').on(table.userId).where(sql`${table.status} = 'open'`),
  check('bar_day_status_check', sql`${table.status} IN ('open', 'closed')`),
  check('bar_day_opening_float_check', sql`${table.openingFloat} >= 0`),
  check('bar_day_counted_cash_check', sql`${table.countedCash} IS NULL OR ${table.countedCash} >= 0`),
])

export const tabs = pgTable('bar_tab', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  tableLabel: text('table_label').notNull(),
  ownerName: text('owner_name').notNull(),
  total: integer('total').notNull().default(0),
  status: text('status').notNull().default('open'),
  paymentMethod: text('payment_method'),
  settledBy: text('settled_by'),
  saleId: text('sale_id').references(() => sales.id),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  voidReason: text('void_reason'),
  voidedBy: text('voided_by'),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  reopenedBy: text('reopened_by'),
  reopenReason: text('reopen_reason'),
}, (table) => [
  index('bar_tab_user_status_idx').on(table.userId, table.status),
  index('bar_tab_sale_idx').on(table.saleId),
  check('bar_tab_total_check', sql`${table.total} >= 0`),
  check('bar_tab_status_check', sql`${table.status} IN ('open', 'settled', 'voided')`),
])

export const tabItems = pgTable('bar_tab_item', {
  id: text('id').primaryKey(),
  tabId: text('tab_id').notNull().references(() => tabs.id),
  userId: text('user_id').notNull().references(() => user.id),
  productId: text('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
  lineTotal: integer('line_total').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_tab_item_user_tab_idx').on(table.userId, table.tabId),
  check('bar_tab_item_quantity_check', sql`${table.quantity} > 0`),
  check('bar_tab_item_unit_price_check', sql`${table.unitPrice} >= 0`),
  check('bar_tab_item_line_total_check', sql`${table.lineTotal} >= 0`),
])

export const stockCounts = pgTable('bar_stock_count', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  dayId: text('day_id').notNull().references(() => tradingDays.id),
  productId: text('product_id').notNull().references(() => products.id),
  countedQuantity: integer('counted_quantity').notNull(),
  expectedQuantity: integer('expected_quantity').notNull(),
  varianceUnits: integer('variance_units').notNull(),
  varianceValue: integer('variance_value').notNull(),
  countedAt: timestamp('counted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_stock_count_day_idx').on(table.userId, table.dayId),
  check('bar_stock_count_counted_quantity_check', sql`${table.countedQuantity} >= 0`),
])

export const varianceTolerances = pgTable('bar_variance_tolerance', {
  userId: text('user_id').notNull().references(() => user.id),
  productId: text('product_id').notNull().references(() => products.id),
  toleranceUnits: integer('tolerance_units').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.productId] }),
  check('bar_variance_tolerance_units_check', sql`${table.toleranceUnits} >= 0`),
])

export const varianceHistory = pgTable('bar_variance_history', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  dayId: text('day_id').notNull().references(() => tradingDays.id),
  productId: text('product_id').notNull().references(() => products.id),
  varianceUnits: integer('variance_units').notNull(),
  varianceValue: integer('variance_value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_variance_history_user_idx').on(table.userId, table.createdAt),
])

export const teamMembers = pgTable('bar_team_member', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  name: text('name').notNull(),
  role: text('role').notNull(),
  pin: text('pin'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_team_member_user_idx').on(table.userId),
  check('bar_team_member_role_check', sql`${table.role} IN ('Admin', 'Manager', 'Cashier', 'Storekeeper')`),
])

export const workspaces = pgTable('bar_workspace', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull().references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // One workspace per owner keeps every existing `user_id` tenant key unambiguous.
  uniqueIndex('bar_workspace_owner_idx').on(table.ownerId),
])

export const memberships = pgTable('bar_membership', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('Cashier'),
  status: text('status').notNull().default('active'),
  invitedBy: text('invited_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('bar_membership_workspace_user_idx').on(table.workspaceId, table.userId),
  index('bar_membership_user_idx').on(table.userId),
  check('bar_membership_role_check', sql`${table.role} IN ('Owner', 'Admin', 'Manager', 'Cashier', 'Storekeeper')`),
  check('bar_membership_status_check', sql`${table.status} IN ('active', 'suspended')`),
])

export const invitations = pgTable('bar_invitation', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  /** Only the digest is stored; the shareable code is shown once when it is created. */
  codeHash: text('code_hash').notNull(),
  invitedBy: text('invited_by').notNull().references(() => user.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedBy: text('accepted_by').references(() => user.id),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('bar_invitation_code_idx').on(table.codeHash),
  index('bar_invitation_workspace_email_idx').on(table.workspaceId, table.email),
  check('bar_invitation_role_check', sql`${table.role} IN ('Admin', 'Manager', 'Cashier', 'Storekeeper')`),
])

export const termsAcceptances = pgTable('bar_terms_acceptance', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('bar_terms_user_version_idx').on(table.userId, table.version),
])

export const pinAttempts = pgTable('bar_pin_attempt', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id),
  success: boolean('success').notNull().default(false),
  attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_pin_attempt_user_time_idx').on(table.userId, table.attemptedAt),
])

export const auditLogs = pgTable('bar_audit_log', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  actorId: text('actor_id'),
  actorRole: text('actor_role'),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  reason: text('reason'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  recordLabel: text('record_label').notNull().default(''),
  approval: text('approval').notNull().default('Recorded'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_audit_log_user_created_idx').on(table.userId, table.createdAt),
  index('bar_audit_log_entity_idx').on(table.entityType, table.entityId, table.createdAt),
])

export const idempotencyKeys = pgTable('bar_idempotency_key', {
  userId: text('user_id').notNull().references(() => user.id),
  idempotencyKey: text('idempotency_key').notNull(),
  requestHash: text('request_hash').notNull(),
  responseJson: jsonb('response_json').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.idempotencyKey] }),
])

export const inventoryCounts = pgTable('bar_inventory_count', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  productId: text('product_id').notNull().references(() => products.id),
  systemQuantity: integer('system_quantity').notNull(),
  countedQuantity: integer('counted_quantity').notNull(),
  variance: integer('variance').notNull(),
  countedBy: text('counted_by').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_inventory_count_user_created_idx').on(table.userId, table.createdAt),
])

export const stockAdjustments = pgTable('bar_stock_adjustment', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  productId: text('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  adjustmentType: text('adjustment_type').notNull(),
  reason: text('reason').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bar_stock_adjustment_user_created_idx').on(table.userId, table.createdAt),
  check('bar_stock_adjustment_type_check', sql`${table.adjustmentType} IN ('wastage', 'adjustment')`),
  check('bar_stock_adjustment_quantity_check', sql`${table.quantity} <> 0`),
])

export const loginAttempts = pgTable('bar_login_attempts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  success: boolean('success').notNull().default(false),
  ipAddress: text('ip_address'),
})

export const adminBootstrapTokens = pgTable('bar_admin_bootstrap_token', {
  tokenHash: text('token_hash').primaryKey(),
  targetEmail: text('target_email').notNull(),
  consumedBy: text('consumed_by').notNull().references(() => user.id),
  consumedAt: timestamp('consumed_at', { withTimezone: true }).notNull().defaultNow(),
})

export const schema = {
  user,
  session,
  account,
  verification,
  products,
  sales,
  saleItems,
  salePayments,
  receipts,
  receiptCounter,
  settings,
  userPins,
  discounts,
  menuStockLinks,
  stockDeliveries,
  stockTransfers,
  stockMovements,
  tradingDays,
  tabs,
  tabItems,
  stockCounts,
  varianceTolerances,
  varianceHistory,
  teamMembers,
  workspaces,
  memberships,
  invitations,
  termsAcceptances,
  pinAttempts,
  auditLogs,
  idempotencyKeys,
  inventoryCounts,
  stockAdjustments,
  loginAttempts,
  adminBootstrapTokens,
}

export type ProductRow = typeof products.$inferSelect

import {
  pgTable,
  uuid,
  text,
  varchar,
  numeric,
  boolean,
  integer,
  timestamp,
  date,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";

// Nota: auth.users es de Supabase. Referenciamos su id por UUID sin
// declarar la tabla aquí (vive en el schema `auth`).

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("COP"),
  country: varchar("country", { length: 2 }).notNull().default("CO"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const householdMembers = pgTable(
  "household_members",
  {
    householdId: uuid("household_id").notNull().references(() => households.id),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.householdId, t.userId] }) }),
);

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  name: text("name").notNull(),
  brand: text("brand"),
  locationText: text("location_text"),
  nit: varchar("nit", { length: 20 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").references(() => households.id),
  name: text("name").notNull(),
  icon: text("icon"),
  color: varchar("color", { length: 7 }),
  parentId: uuid("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const canonicalProducts = pgTable("canonical_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  name: text("name").notNull(),
  brand: text("brand"),
  presentation: text("presentation"),
  categoryId: uuid("category_id").references(() => categories.id),
  unit: text("unit"),
  unitQuantity: numeric("unit_quantity", { precision: 10, scale: 4 }),
  barcode: text("barcode"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const productAliases = pgTable("product_aliases", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalProductId: uuid("canonical_product_id").notNull().references(() => canonicalProducts.id),
  alias: text("alias").notNull(),
  source: text("source").notNull(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  createdBy: uuid("created_by").notNull(),
  storeId: uuid("store_id").references(() => stores.id),
  purchasedAt: date("purchased_at"),
  total: numeric("total", { precision: 15, scale: 4 }),
  currency: varchar("currency", { length: 3 }),
  exchangeRate: numeric("exchange_rate", { precision: 10, scale: 6 }),
  totalBase: numeric("total_base", { precision: 15, scale: 4 }),
  source: text("source").notNull(),
  rawData: jsonb("raw_data"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const receiptItems = pgTable("receipt_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  receiptId: uuid("receipt_id").notNull().references(() => receipts.id),
  canonicalProductId: uuid("canonical_product_id").references(() => canonicalProducts.id),
  rawName: text("raw_name").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 4 }),
  unit: text("unit"),
  unitPrice: numeric("unit_price", { precision: 15, scale: 4 }),
  regularPrice: numeric("regular_price", { precision: 15, scale: 4 }),
  isPromo: boolean("is_promo").notNull().default(false),
  totalPrice: numeric("total_price", { precision: 15, scale: 4 }),
  categoryId: uuid("category_id").references(() => categories.id),
  position: integer("position"),
  needsReview: boolean("needs_review").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const manualExpenses = pgTable("manual_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  createdBy: uuid("created_by").notNull(),
  categoryId: uuid("category_id").references(() => categories.id),
  description: text("description"),
  amount: numeric("amount", { precision: 15, scale: 4 }),
  currency: varchar("currency", { length: 3 }),
  occurredAt: date("occurred_at"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const shoppingLists = pgTable("shopping_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  createdBy: uuid("created_by").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  estimatedTotal: numeric("estimated_total", { precision: 15, scale: 4 }),
  estimatedAt: timestamp("estimated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const shoppingListItems = pgTable("shopping_list_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  shoppingListId: uuid("shopping_list_id").notNull().references(() => shoppingLists.id),
  canonicalProductId: uuid("canonical_product_id").references(() => canonicalProducts.id),
  rawName: text("raw_name"),
  quantity: numeric("quantity", { precision: 10, scale: 4 }),
  unit: text("unit"),
  estimatedUnitPrice: numeric("estimated_unit_price", { precision: 15, scale: 4 }),
  estimatedSource: text("estimated_source"),
  checked: boolean("checked").notNull().default(false),
  position: integer("position"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const priceAlerts = pgTable("price_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  canonicalProductId: uuid("canonical_product_id").notNull().references(() => canonicalProducts.id),
  previousPrice: numeric("previous_price", { precision: 15, scale: 4 }),
  currentPrice: numeric("current_price", { precision: 15, scale: 4 }),
  changePercent: numeric("change_percent", { precision: 5, scale: 2 }),
  storeId: uuid("store_id").references(() => stores.id),
  detectedAt: timestamp("detected_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey(),
  activeHouseholdId: uuid("active_household_id").references(() => households.id),
  preferredAiProvider: text("preferred_ai_provider"),
  priceAlertThreshold: numeric("price_alert_threshold", { precision: 5, scale: 2 }).notNull().default("10.00"),
  theme: text("theme").notNull().default("system"),
  locale: varchar("locale", { length: 5 }).notNull().default("es-CO"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

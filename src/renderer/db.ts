import { Session } from '@petradb/engine'
import { quarry, table, serial, text, integer, boolean } from '@petradb/quarry'
import type { InferSelect, InferInsert } from '@petradb/quarry'

const session = new Session({ storage: 'memory' })
export const db = quarry(session)

export const places = table('places', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  icon: text('icon'),
  sortOrder: integer('sort_order').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
})

export type Place = InferSelect<typeof places>
export type NewPlace = InferInsert<typeof places>

export async function initDb() {
  await db.createTable(places)

  // Seed default places
  const home = process.env.HOME ?? '/home'
  await db.insert(places).values(
    { name: 'Home', path: home, icon: 'home', sortOrder: 0, isDefault: true },
    { name: 'Desktop', path: `${home}/Desktop`, icon: 'desktop', sortOrder: 1, isDefault: true },
    { name: 'Documents', path: `${home}/Documents`, icon: 'documents', sortOrder: 2, isDefault: true },
    { name: 'Downloads', path: `${home}/Downloads`, icon: 'downloads', sortOrder: 3, isDefault: true },
  ).execute()
}

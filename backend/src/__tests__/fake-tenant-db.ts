/**
 * A tiny in-memory stand-in for the Prisma client, used by the tenant
 * isolation tests. Unlike a jest mock that returns canned values, it really
 * applies each query's `where` to rows that belong to several workspaces — so
 * a query that forgets its `teamId` filter returns another workspace's rows
 * and the test notices.
 *
 * It supports only what those tests use: equality plus `in`, `not`, `gt` and
 * `gte`, a relation filter matched against a nested object already on the row
 * (the row "as loaded with include"), and compound unique keys such as
 * `teamId_userId`. Any other operator fails closed (matches nothing) rather
 * than silently matching everything.
 */
export type Row = Record<string, any>

const OPERATORS = ['in', 'not', 'gt', 'gte'] as const

const matchesCondition = (value: any, condition: any): boolean => {
  if (
    condition === null ||
    typeof condition !== 'object' ||
    condition instanceof Date
  ) {
    return value === condition
  }
  const operator = OPERATORS.find((name) => name in condition)
  switch (operator) {
    case 'in':
      return condition.in.includes(value)
    case 'not':
      return value !== condition.not
    case 'gt':
      return value > condition.gt
    case 'gte':
      return value >= condition.gte
    default:
      return false
  }
}

const isNestedCondition = (condition: any): boolean =>
  condition !== null &&
  typeof condition === 'object' &&
  !(condition instanceof Date) &&
  !OPERATORS.some((name) => name in condition)

export const matches = (row: Row, where: Row = {}): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (!isNestedCondition(condition)) {
      return matchesCondition(row[key], condition)
    }
    const target = row[key]
    // A relation filter reads the related row embedded on this one.
    if (target !== null && typeof target === 'object') {
      return matches(target, condition)
    }
    // A compound unique key (`teamId_userId`) is just its fields side by side.
    if (target === undefined && key.includes('_')) {
      return matches(row, condition)
    }
    return false
  })

export const createFakeModel = (name: string, initial: Row[]) => {
  const rows: Row[] = initial.map((row) => ({ ...row }))
  let counter = 0

  const find = (where: Row = {}) => rows.filter((row) => matches(row, where))
  const missing = () => new Error(`${name}: record not found`)

  return {
    rows,
    findMany: async (args: Row = {}) => {
      let found = find(args.where)
      if (args.cursor) {
        const index = found.findIndex((row) => row.id === args.cursor.id)
        found = index < 0 ? [] : found.slice(index + (args.skip ?? 0))
      }
      return (args.take === undefined ? found : found.slice(0, args.take)).map(
        (row) => ({ ...row }),
      )
    },
    findFirst: async (args: Row = {}) => {
      const row = find(args.where)[0]
      return row ? { ...row } : null
    },
    findUnique: async (args: Row) => {
      const row = find(args.where)[0]
      return row ? { ...row } : null
    },
    findUniqueOrThrow: async (args: Row) => {
      const row = find(args.where)[0]
      if (!row) throw missing()
      return { ...row }
    },
    count: async (args: Row = {}) => find(args.where).length,
    create: async ({ data }: Row) => {
      counter += 1
      const row = { id: `${name}-new-${counter}`, ...data }
      rows.push(row)
      return { ...row }
    },
    upsert: async ({ where, create, update }: Row) => {
      const row = find(where)[0]
      if (row) {
        Object.assign(row, update)
        return { ...row }
      }
      counter += 1
      const created = { id: `${name}-new-${counter}`, ...create }
      rows.push(created)
      return { ...created }
    },
    update: async ({ where, data }: Row) => {
      const row = find(where)[0]
      if (!row) throw missing()
      Object.assign(row, data)
      return { ...row }
    },
    updateMany: async ({ where, data }: Row) => {
      const found = find(where)
      found.forEach((row) => Object.assign(row, data))
      return { count: found.length }
    },
    delete: async ({ where }: Row) => {
      const row = find(where)[0]
      if (!row) throw missing()
      rows.splice(rows.indexOf(row), 1)
      return { ...row }
    },
    deleteMany: async ({ where }: Row = {}) => {
      const found = find(where)
      found.forEach((row) => rows.splice(rows.indexOf(row), 1))
      return { count: found.length }
    },
  }
}

export type FakeModel = ReturnType<typeof createFakeModel>

export const createFakeDb = (tables: Record<string, Row[]>) => {
  const models = Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [
      name,
      createFakeModel(name, rows),
    ]),
  ) as Record<string, FakeModel>

  const db: Record<string, any> = {
    ...models,
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
  }
  db.$transaction = async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)
  return db as Record<string, FakeModel> & {
    $queryRaw: () => Promise<never[]>
    $transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>
  }
}

/** Every row of the given tables that belongs to a workspace, as plain JSON — for before/after comparison. */
export const snapshotTeam = (
  db: Record<string, FakeModel>,
  teamId: string,
  tableNames: string[],
): string =>
  JSON.stringify(
    tableNames.map((name) =>
      db[name].rows.filter((row) => row.teamId === teamId),
    ),
  )

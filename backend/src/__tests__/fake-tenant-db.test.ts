import { createFakeDb, matches, snapshotTeam } from './fake-tenant-db'

describe('matches', () => {
  it('compares equality, including Dates by identity of value', () => {
    expect(matches({ a: 1 }, { a: 1 })).toBe(true)
    expect(matches({ a: 1 }, { a: 2 })).toBe(false)
    expect(matches({ a: null }, { a: null })).toBe(true)
  })

  it('supports in, not, gt and gte', () => {
    expect(matches({ a: 2 }, { a: { in: [1, 2] } })).toBe(true)
    expect(matches({ a: 3 }, { a: { in: [1, 2] } })).toBe(false)
    expect(matches({ a: 3 }, { a: { not: 2 } })).toBe(true)
    expect(matches({ a: 3 }, { a: { gt: 3 } })).toBe(false)
    expect(matches({ a: 3 }, { a: { gte: 3 } })).toBe(true)
  })

  it('fails closed on an operator it does not know', () => {
    expect(matches({ a: 'x' }, { a: { contains: 'x' } })).toBe(false)
  })

  it('matches everything when there is no filter', () => {
    expect(matches({ a: 1 })).toBe(true)
  })
})

describe('createFakeDb', () => {
  const make = () =>
    createFakeDb({
      item: [
        { id: 'i1', teamId: 'A', n: 1 },
        { id: 'i2', teamId: 'B', n: 2 },
        { id: 'i3', teamId: 'B', n: 3 },
      ],
    })

  it('reads with filters, take and cursor', async () => {
    const db = make()
    expect(await db.item.findMany({ where: { teamId: 'B' } })).toHaveLength(2)
    expect(await db.item.findMany({ take: 1 })).toHaveLength(1)
    expect(
      (
        await db.item.findMany({
          where: { teamId: 'B' },
          cursor: { id: 'i2' },
          skip: 1,
        })
      ).map((row) => row.id),
    ).toEqual(['i3'])
    expect(await db.item.findMany({ cursor: { id: 'nope' } })).toEqual([])
    expect(await db.item.findFirst({ where: { teamId: 'C' } })).toBeNull()
    expect((await db.item.findFirst({ where: { n: 2 } }))?.id).toBe('i2')
    expect(await db.item.findUnique({ where: { id: 'i9' } })).toBeNull()
    expect((await db.item.findUnique({ where: { id: 'i1' } }))?.n).toBe(1)
    expect(await db.item.count({ where: { teamId: 'B' } })).toBe(2)
  })

  it('throws when a required record is missing', async () => {
    const db = make()
    await expect(
      db.item.findUniqueOrThrow({ where: { id: 'i9' } }),
    ).rejects.toThrow('item: record not found')
    await expect(
      db.item.update({ where: { id: 'i9' }, data: {} }),
    ).rejects.toThrow()
    await expect(db.item.delete({ where: { id: 'i9' } })).rejects.toThrow()
    expect((await db.item.findUniqueOrThrow({ where: { id: 'i1' } })).n).toBe(1)
  })

  it('writes only where the filter says', async () => {
    const db = make()
    await db.item.create({ data: { teamId: 'A', n: 9 } })
    expect(db.item.rows).toHaveLength(4)
    expect(
      (await db.item.update({ where: { id: 'i1' }, data: { n: 5 } })).n,
    ).toBe(5)
    expect(
      await db.item.updateMany({ where: { teamId: 'B' }, data: { n: 0 } }),
    ).toEqual({ count: 2 })
    expect(await db.item.delete({ where: { id: 'i1' } })).toMatchObject({
      id: 'i1',
    })
    expect(await db.item.deleteMany({ where: { teamId: 'B' } })).toEqual({
      count: 2,
    })
    expect(await db.item.deleteMany()).toEqual({ count: 1 })
  })

  it('runs transactions against itself and answers raw queries with nothing', async () => {
    const db = make()
    expect(await db.$transaction(async (tx) => tx === db)).toBe(true)
    expect(await db.$queryRaw()).toEqual([])
    expect(await (db as any).$executeRaw()).toBe(0)
  })

  it('snapshots only the requested workspace', () => {
    const db = make()
    expect(JSON.parse(snapshotTeam(db, 'B', ['item']))).toEqual([
      [
        { id: 'i2', teamId: 'B', n: 2 },
        { id: 'i3', teamId: 'B', n: 3 },
      ],
    ])
  })
})

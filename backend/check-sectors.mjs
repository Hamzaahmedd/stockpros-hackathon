import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const rows = await prisma.position.findMany({
  select: { symbol: true, sector: true, quantity: true, avgEntryPrice: true },
  take: 30,
})
console.log(JSON.stringify(rows, null, 2))
await prisma.$disconnect()

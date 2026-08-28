import { Queue, Worker }           from 'bullmq'
import { getRedisClient }          from '../../../shared/infrastructure/cache'
import { prisma }                  from '../../../shared/infrastructure/database'
import {
  fetchAndIngestAllSymbols,
  fetchAndIngestGeneralNews,
} from './news-fetcher'
import { toDateStr, daysAgo }      from '../news'
import { NEWS_RETENTION_DAYS, SYMBOL_FETCH_DAYS_BACK } from '../constants'
import { logger }                  from '../../../shared/infrastructure/logger'

const connection = getRedisClient()

export const runSymbolNewsFetchJob = async (): Promise<void> => {
  const [watchlistRows, portfolios] = await Promise.all([
    prisma.watchlist.findMany({ select: { symbol: true }, distinct: ['symbol'] }),
    prisma.portfolio.findMany({ include: { positions: { select: { symbol: true } } } }),
  ])

  const allSymbols = [
    ...new Set([
      ...watchlistRows.map((r: { symbol: string }) => r.symbol),
      ...portfolios.flatMap((p) => p.positions.map((pos: { symbol: string }) => pos.symbol)),
    ]),
  ]

  if (allSymbols.length === 0) return

  const fromDate = toDateStr(daysAgo(SYMBOL_FETCH_DAYS_BACK))
  logger.info(`[NewsCron] Fetching news for ${allSymbols.length} symbols (12s delay between calls)`)

  await fetchAndIngestAllSymbols(allSymbols, fromDate)
}

export const runGeneralNewsFetchJob = async (): Promise<void> => {
  await fetchAndIngestGeneralNews()
}

export const runNewsCleanupJob = async (): Promise<void> => {
  const result = await prisma.newsArticle.deleteMany({
    where: {
      publishedAt:  { lt: daysAgo(NEWS_RETENTION_DAYS) },
      savedByUsers: { none: {} },
    },
  })
  logger.info(`[NewsCron] Cleanup — deleted ${result.count} articles`)
}

const JOB_DEFINITIONS = [
  { name: 'news-symbol-fetch',  handler: runSymbolNewsFetchJob,  pattern: '*/15 * * * *' },
  { name: 'news-general-fetch', handler: runGeneralNewsFetchJob, pattern: '*/30 * * * *' },
  { name: 'news-cleanup',       handler: runNewsCleanupJob,      pattern: '0 2 * * *'    },
]

const queues:  Queue[]  = []
const workers: Worker[] = []

export const startNewsCronJobs = async (): Promise<void> => {
  if (!connection) {
    logger.warn('[NewsCron] No Redis connection found — news fetch jobs will not be registered.')
    return
  }

  for (const job of JOB_DEFINITIONS) {
    const queue = new Queue(job.name, { connection, skipVersionCheck: true })

    await queue.add(job.name, {}, {
      repeat:           { pattern: job.pattern },
      attempts:         3,
      backoff:          { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail:     { age: 72 * 60 * 60 },
    })

    queues.push(queue)

    const worker = new Worker(job.name, async () => { await job.handler() }, { connection, skipVersionCheck: true })
    worker.on('completed', () => logger.info(`[NewsCron] ${job.name} completed`))
    worker.on('failed', (_, err) => logger.error(`[NewsCron] ${job.name} failed: ${err.message}`))
    workers.push(worker)
  }
}

export const stopNewsCronJobs = async (): Promise<void> => {
  await Promise.all(workers.map(w => w.close()))
  await Promise.all(queues.map(q => q.close()))
}
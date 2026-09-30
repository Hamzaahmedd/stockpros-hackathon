import config from '@/config'
import express from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import request from 'supertest'
import { errorHandler } from '../error-handler'
import {
  getComputeLimiter,
  PriorityLimiter,
  priorityQueue,
  QueueFullError,
  QueueTier,
  QueueWaitTimeoutError,
  resetComputeLimiter,
  resolveTier,
} from '../priority-queue'

const waitFor = async (condition: () => boolean, timeoutMs = 2000) => {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

// supertest requests are lazy (nothing is sent until .then/.end), so fire them explicitly.
const send = (test: request.Test): Promise<request.Response> =>
  Promise.resolve(test.then((response) => response))

const tick = () => new Promise((resolve) => setImmediate(resolve))

describe('PriorityLimiter', () => {
  it('admits up to `concurrency` holders immediately and reports counts', async () => {
    const limiter = new PriorityLimiter(2, 10)
    const r1 = await limiter.acquire(QueueTier.NORMAL)
    await limiter.acquire(QueueTier.NORMAL)
    expect(limiter.activeCount).toBe(2)

    let third = false
    void limiter.acquire(QueueTier.NORMAL).then(() => (third = true))
    await tick()
    expect(third).toBe(false)
    expect(limiter.pendingCount).toBe(1)

    r1()
    await waitFor(() => third)
    expect(limiter.pendingCount).toBe(0)
    expect(limiter.activeCount).toBe(2)
  })

  it('admits a later high-priority waiter ahead of earlier normal waiters', async () => {
    const limiter = new PriorityLimiter(1, 10)
    const holder = await limiter.acquire(QueueTier.NORMAL)
    const order: string[] = []
    const enqueue = (name: string, tier: QueueTier) =>
      limiter.acquire(tier).then((release) => {
        order.push(name)
        release()
      })

    const pending = [
      enqueue('normal-1', QueueTier.NORMAL),
      enqueue('normal-2', QueueTier.NORMAL),
      enqueue('high-1', QueueTier.HIGH),
      enqueue('normal-3', QueueTier.NORMAL),
      enqueue('high-2', QueueTier.HIGH),
    ]
    holder()
    await Promise.all(pending)

    expect(order).toEqual([
      'high-1',
      'high-2',
      'normal-1',
      'normal-2',
      'normal-3',
    ])
  })

  it('under a concurrent surge every high-priority task starts before any still-queued normal task', async () => {
    const limiter = new PriorityLimiter(2, 100)
    const started: string[] = []
    const job = async (name: string, tier: QueueTier) => {
      const release = await limiter.acquire(tier)
      started.push(name)
      await new Promise((resolve) => setTimeout(resolve, 5)) // simulated compute
      release()
    }

    // 20 standard requests arrive first, 5 Team requests arrive last.
    const jobs: Promise<void>[] = []
    for (let i = 0; i < 20; i += 1) jobs.push(job(`n${i}`, QueueTier.NORMAL))
    for (let i = 0; i < 5; i += 1) jobs.push(job(`h${i}`, QueueTier.HIGH))
    await Promise.all(jobs)

    // The first two normals grabbed the free slots before anyone queued.
    const afterInitial = started.slice(2)
    const lastHigh = Math.max(
      ...['h0', 'h1', 'h2', 'h3', 'h4'].map((h) => afterInitial.indexOf(h)),
    )
    const firstQueuedNormal = Math.min(
      ...afterInitial
        .filter((n) => n.startsWith('n'))
        .map((n) => afterInitial.indexOf(n)),
    )
    expect(lastHigh).toBeLessThan(firstQueuedNormal)
    expect(started).toHaveLength(25)
  })

  it('is first-come-first-served within a tier', async () => {
    const limiter = new PriorityLimiter(1, 10)
    const holder = await limiter.acquire(QueueTier.HIGH)
    const order: number[] = []
    const all = [1, 2, 3].map((n) =>
      limiter.acquire(QueueTier.HIGH).then((release) => {
        order.push(n)
        release()
      }),
    )
    holder()
    await Promise.all(all)
    expect(order).toEqual([1, 2, 3])
  })

  it('rejects with QueueFullError when the wait queue is at capacity', async () => {
    const limiter = new PriorityLimiter(1, 2)
    await limiter.acquire(QueueTier.NORMAL)
    void limiter.acquire(QueueTier.NORMAL)
    void limiter.acquire(QueueTier.NORMAL)

    await expect(limiter.acquire(QueueTier.HIGH)).rejects.toBeInstanceOf(
      QueueFullError,
    )
    expect(limiter.pendingCount).toBe(2)
  })

  it('removes an aborted waiter, rejects with the reason, and does not lose a slot', async () => {
    const limiter = new PriorityLimiter(1, 10)
    const holder = await limiter.acquire(QueueTier.NORMAL)
    const controller = new AbortController()
    const aborted = limiter.acquire(QueueTier.NORMAL, controller.signal)
    const survivor = limiter.acquire(QueueTier.NORMAL)

    controller.abort(new Error('client left'))
    await expect(aborted).rejects.toThrow('client left')
    expect(limiter.pendingCount).toBe(1)

    holder()
    const release = await survivor
    expect(limiter.activeCount).toBe(1)
    release()
    expect(limiter.activeCount).toBe(0)
  })

  it('rejects immediately for an already-aborted signal', async () => {
    const limiter = new PriorityLimiter(1, 10)
    const controller = new AbortController()
    controller.abort(new Error('gone'))
    await expect(
      limiter.acquire(QueueTier.NORMAL, controller.signal),
    ).rejects.toThrow('gone')
    expect(limiter.activeCount).toBe(0)
  })

  it('ignores an abort that arrives after the waiter was already granted', async () => {
    const limiter = new PriorityLimiter(1, 10)
    const holder = await limiter.acquire(QueueTier.NORMAL)
    const controller = new AbortController()
    const granted = limiter.acquire(QueueTier.NORMAL, controller.signal)
    holder()
    const release = await granted
    controller.abort(new Error('late'))
    expect(limiter.activeCount).toBe(1)
    release()
  })

  it('makes release idempotent so a double release cannot free a slot twice', async () => {
    const limiter = new PriorityLimiter(1, 10)
    const release = await limiter.acquire(QueueTier.NORMAL)
    release()
    release()
    expect(limiter.activeCount).toBe(0)
    await limiter.acquire(QueueTier.NORMAL)
    let second = false
    void limiter.acquire(QueueTier.NORMAL).then(() => (second = true))
    await tick()
    expect(second).toBe(false) // concurrency still enforced
  })
})

describe('resolveTier', () => {
  it('uses the server-set team context flag', () => {
    expect(
      resolveTier({ teamContext: { isHighPriority: true } } as never),
    ).toBe(QueueTier.HIGH)
    expect(
      resolveTier({ teamContext: { isHighPriority: false } } as never),
    ).toBe(QueueTier.NORMAL)
    expect(resolveTier({} as never)).toBe(QueueTier.NORMAL)
  })

  it('ranks HIGH strictly ahead of NORMAL (1 vs 10)', () => {
    expect(QueueTier.HIGH).toBe(1)
    expect(QueueTier.NORMAL).toBe(10)
  })

  it('never trusts a client-supplied X-Queue-Priority request header', () => {
    const req = {
      headers: { 'x-queue-priority': 'HIGH' },
      teamContext: { isHighPriority: false },
    }
    expect(resolveTier(req as never)).toBe(QueueTier.NORMAL)
  })
})

describe('getComputeLimiter', () => {
  afterEach(() => resetComputeLimiter())

  it('is a lazily built singleton configured from config.priorityQueue', () => {
    const a = getComputeLimiter()
    expect(getComputeLimiter()).toBe(a)
    resetComputeLimiter()
    expect(getComputeLimiter()).not.toBe(a)
  })
})

describe('priorityQueue middleware (HTTP)', () => {
  const mutableQueueConfig = config.priorityQueue as { maxWaitMs: number }
  const originalMaxWait = mutableQueueConfig.maxWaitMs

  let started: string[]
  let gates: Map<string, () => void>

  /** Test app: `x-test-high` simulates attachTeamContext flagging a Team request. */
  const buildApp = (limiter: PriorityLimiter) => {
    const app = express()
    app.get(
      '/work/:id',
      (req, _res, next) => {
        ;(req as never as { teamContext: unknown }).teamContext = {
          isHighPriority: req.headers['x-test-high'] === '1',
        }
        next()
      },
      priorityQueue(limiter),
      (req, res) => {
        const id = String(req.params.id)
        started.push(id)
        void new Promise<void>((resolve) => gates.set(id, resolve)).then(() =>
          res.json({ id }),
        )
      },
    )
    app.use(errorHandler)
    return app
  }

  beforeEach(() => {
    started = []
    gates = new Map()
  })

  afterEach(() => {
    mutableQueueConfig.maxWaitMs = originalMaxWait
    for (const open of gates.values()) open() // never leave a request hanging
  })

  it('serves queued high-priority requests ahead of standard ones under load', async () => {
    const limiter = new PriorityLimiter(1, 10)
    const app = buildApp(limiter)
    const responses: Promise<request.Response>[] = []

    responses.push(send(request(app).get('/work/A'))) // takes the only slot
    await waitFor(() => started.includes('A'))

    responses.push(send(request(app).get('/work/B'))) // standard, queued first
    await waitFor(() => limiter.pendingCount === 1)
    responses.push(send(request(app).get('/work/C').set('x-test-high', '1'))) // Team, queued later
    await waitFor(() => limiter.pendingCount === 2)
    responses.push(send(request(app).get('/work/D'))) // standard, queued last
    await waitFor(() => limiter.pendingCount === 3)

    const releaseNext = async (expectedStarted: number) => {
      const running = started[started.length - 1]
      gates.get(running)!()
      await waitFor(() => started.length === expectedStarted)
    }
    await releaseNext(2)
    await releaseNext(3)
    await releaseNext(4)
    gates.get(started[3])!()

    const results = await Promise.all(responses)
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200])
    expect(started).toEqual(['A', 'C', 'B', 'D'])
  })

  it('does not let a spoofed request header jump the queue', async () => {
    const limiter = new PriorityLimiter(1, 10)
    const app = buildApp(limiter)
    const responses: Promise<request.Response>[] = []

    responses.push(send(request(app).get('/work/A')))
    await waitFor(() => started.includes('A'))
    responses.push(send(request(app).get('/work/B')))
    await waitFor(() => limiter.pendingCount === 1)
    // Claims HIGH via the real header name — ignored, only team context counts.
    responses.push(
      send(request(app).get('/work/C').set('X-Queue-Priority', 'HIGH')),
    )
    await waitFor(() => limiter.pendingCount === 2)

    gates.get('A')!()
    await waitFor(() => started.length === 2)
    expect(started).toEqual(['A', 'B'])
    gates.get('B')!()
    await waitFor(() => started.length === 3)
    gates.get('C')!()
    await Promise.all(responses)
  })

  it('frees the slot when the response completes so the next request runs', async () => {
    const limiter = new PriorityLimiter(1, 10)
    const app = buildApp(limiter)
    const first = send(request(app).get('/work/A'))
    await waitFor(() => limiter.activeCount === 1)
    gates.get('A')!()
    expect((await first).status).toBe(200)
    await waitFor(() => limiter.activeCount === 0)
  })

  it('sheds load with a 503 when the wait queue is full', async () => {
    const limiter = new PriorityLimiter(1, 1)
    const app = buildApp(limiter)
    const held = send(request(app).get('/work/A'))
    await waitFor(() => started.includes('A'))
    const queued = send(request(app).get('/work/B'))
    await waitFor(() => limiter.pendingCount === 1)

    const rejected = await request(app).get('/work/C')

    expect(rejected.status).toBe(503)
    expect(rejected.body.message).toBe('Server is busy — please retry shortly')
    gates.get('A')!()
    await held
    await waitFor(() => started.includes('B'))
    gates.get('B')!()
    await queued
  })

  it('sheds a request that waits longer than maxWaitMs with a 503', async () => {
    mutableQueueConfig.maxWaitMs = 40
    const limiter = new PriorityLimiter(1, 10)
    const app = buildApp(limiter)
    const held = send(request(app).get('/work/A'))
    await waitFor(() => started.includes('A'))

    const timedOut = await request(app).get('/work/B')

    expect(timedOut.status).toBe(503)
    expect(timedOut.body.message).toBe(new QueueWaitTimeoutError().message)
    expect(limiter.pendingCount).toBe(0)
    gates.get('A')!()
    await held
  })

  it('drops a queued request whose client disconnects, without leaking a slot', async () => {
    const limiter = new PriorityLimiter(1, 10)
    const app = buildApp(limiter)
    const server = http.createServer(app)
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const { port } = server.address() as AddressInfo

    try {
      const holder = send(request(app).get('/work/A'))
      await waitFor(() => started.includes('A'))

      const clientRequest = http.get({ port, path: '/work/B' })
      clientRequest.on('error', () => undefined)
      await waitFor(() => limiter.pendingCount === 1)

      clientRequest.destroy() // browser tab closed while waiting
      await waitFor(() => limiter.pendingCount === 0)
      expect(started).toEqual(['A']) // B never ran

      gates.get('A')!()
      await holder
      await waitFor(() => limiter.activeCount === 0)
    } finally {
      server.close()
    }
  })
})

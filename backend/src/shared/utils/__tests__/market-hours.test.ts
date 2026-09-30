import { logger } from '../../infrastructure/logger'
import {
  isEmergencyClosed,
  isMarketSpikeWindow,
  isNyseHoliday,
  isNyseMarketOpen,
  setEmergencyClosed,
} from '../market-hours'

// New York offsets from UTC: EDT (Mar–Nov) is -4h, EST (Nov–Mar) is -5h.
const EDT_OFFSET_HOURS = 4
const EST_OFFSET_HOURS = 5

/** A UTC instant for a New York wall-clock time. `offsetHours` is the ET→UTC shift for that date. */
const at = (
  date: string,
  offsetHours: number,
  hour: number,
  minute: number,
): Date => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hour + offsetHours, minute))
}

/** Midday ET on a date — safely inside the session so only the calendar decides the result. */
const noon = (date: string, offsetHours: number): Date =>
  at(date, offsetHours, 12, 0)

// 2026-07-15 is a Wednesday in EDT; 2026-01-14 is a Wednesday in EST.
const ordinaryDays = [
  ['EDT', '2026-07-15', EDT_OFFSET_HOURS],
  ['EST', '2026-01-14', EST_OFFSET_HOURS],
] as const

const spikeCases: ReadonlyArray<[string, number, number, boolean]> = [
  ['before open', 9, 29, false],
  ['open spike start', 9, 30, true],
  ['open spike last minute', 9, 59, true],
  ['open spike end', 10, 0, false],
  ['midday', 12, 0, false],
  ['before close spike', 15, 29, false],
  ['close spike start', 15, 30, true],
  ['close spike last minute', 15, 59, true],
  ['close spike end', 16, 0, false],
  ['midnight', 0, 0, false],
]

describe.each(ordinaryDays)(
  'isMarketSpikeWindow (%s weekday)',
  (_l, date, offset) => {
    it.each(spikeCases)(
      '%s (%i:%i ET) => %s',
      (_name, hour, minute, expected) => {
        expect(isMarketSpikeWindow(at(date, offset, hour, minute))).toBe(
          expected,
        )
      },
    )
  },
)

describe('isMarketSpikeWindow (weekend)', () => {
  it('is false on Saturday during the open window', () => {
    expect(isMarketSpikeWindow(at('2026-07-18', EDT_OFFSET_HOURS, 9, 45))).toBe(
      false,
    )
  })

  it('is false on Sunday during the close window', () => {
    expect(
      isMarketSpikeWindow(at('2026-01-18', EST_OFFSET_HOURS, 15, 45)),
    ).toBe(false)
  })
})

describe('default argument', () => {
  afterEach(() => jest.useRealTimers())

  it('uses the current time when no date is passed', () => {
    jest
      .useFakeTimers()
      .setSystemTime(at('2026-07-15', EDT_OFFSET_HOURS, 9, 30))
    expect(isMarketSpikeWindow()).toBe(true)
    expect(isNyseMarketOpen()).toBe(true)
    expect(isNyseHoliday()).toBe(false)
    jest.setSystemTime(at('2026-07-15', EDT_OFFSET_HOURS, 17, 0))
    expect(isMarketSpikeWindow()).toBe(false)
    expect(isNyseMarketOpen()).toBe(false)
  })
})

// [label, date, ET→UTC offset] — every entry is a full-day NYSE closure.
const HOLIDAYS: ReadonlyArray<readonly [string, string, number]> = [
  // 2026
  ["New Year's Day 2026 (Thu)", '2026-01-01', EST_OFFSET_HOURS],
  ['MLK Day 2026 (3rd Mon of Jan)', '2026-01-19', EST_OFFSET_HOURS],
  [
    "Washington's Birthday 2026 (3rd Mon of Feb)",
    '2026-02-16',
    EST_OFFSET_HOURS,
  ],
  ['Good Friday 2026 (Easter Apr 5)', '2026-04-03', EDT_OFFSET_HOURS],
  ['Memorial Day 2026 (last Mon of May)', '2026-05-25', EDT_OFFSET_HOURS],
  ['Juneteenth 2026 (Fri)', '2026-06-19', EDT_OFFSET_HOURS],
  [
    'Independence Day 2026 observed (Jul 4 is Sat → Fri Jul 3)',
    '2026-07-03',
    EDT_OFFSET_HOURS,
  ],
  ['Labor Day 2026 (1st Mon of Sep)', '2026-09-07', EDT_OFFSET_HOURS],
  ['Thanksgiving 2026 (4th Thu of Nov)', '2026-11-26', EST_OFFSET_HOURS],
  ['Christmas 2026 (Fri)', '2026-12-25', EST_OFFSET_HOURS],
  // Movable dates in other years
  ['Good Friday 2025 (Easter Apr 20)', '2025-04-18', EDT_OFFSET_HOURS],
  ['Good Friday 2024 (Easter Mar 31)', '2024-03-29', EDT_OFFSET_HOURS],
  ['Thanksgiving 2025', '2025-11-27', EST_OFFSET_HOURS],
  ['Memorial Day 2025', '2025-05-26', EDT_OFFSET_HOURS],
  ['Independence Day 2025 (Fri)', '2025-07-04', EDT_OFFSET_HOURS],
  // Observed-day shifts
  [
    'Independence Day 2027 observed (Jul 4 is Sun → Mon Jul 5)',
    '2027-07-05',
    EDT_OFFSET_HOURS,
  ],
  [
    'Christmas 2027 observed (Dec 25 is Sat → Fri Dec 24)',
    '2027-12-24',
    EST_OFFSET_HOURS,
  ],
  [
    "New Year's Day 2023 observed (Jan 1 is Sun → Mon Jan 2)",
    '2023-01-02',
    EST_OFFSET_HOURS,
  ],
  [
    'Christmas 2022 observed (Dec 25 is Sun → Mon Dec 26)',
    '2022-12-26',
    EST_OFFSET_HOURS,
  ],
  [
    'Juneteenth 2022 observed (Jun 19 is Sun → Mon Jun 20)',
    '2022-06-20',
    EDT_OFFSET_HOURS,
  ],
]

describe.each(HOLIDAYS)('NYSE holiday: %s', (_label, date, offset) => {
  it('is detected as a holiday', () => {
    expect(isNyseHoliday(noon(date, offset))).toBe(true)
  })

  it('is not an open market', () => {
    expect(isNyseMarketOpen(noon(date, offset))).toBe(false)
  })

  it.each([
    ['the open spike', 9, 45],
    ['the close spike', 15, 45],
  ])('is not a spike window during %s', (_when, hour, minute) => {
    expect(isMarketSpikeWindow(at(date, offset, hour, minute))).toBe(false)
  })
})

// Days that look like holidays but are ordinary trading days.
const TRADING_DAYS: ReadonlyArray<readonly [string, string, number]> = [
  [
    "Fri Dec 31 2027 — NYSE does not observe a Saturday New Year's Day",
    '2027-12-31',
    EST_OFFSET_HOURS,
  ],
  [
    'Sat Jan 1 2028 is not a weekday but Mon Jan 3 2028 is open',
    '2028-01-03',
    EST_OFFSET_HOURS,
  ],
  [
    'Thu Jul 3 2025 (Jul 4 is a Friday holiday, Jul 3 trades — early close)',
    '2025-07-03',
    EDT_OFFSET_HOURS,
  ],
  ['Day before Good Friday 2026', '2026-04-02', EDT_OFFSET_HOURS],
  ['Monday after Thanksgiving 2026', '2026-11-30', EST_OFFSET_HOURS],
  [
    'Columbus/Veterans Day are not NYSE holidays (Oct 12 2026)',
    '2026-10-12',
    EDT_OFFSET_HOURS,
  ],
  [
    'Juneteenth before it was a holiday (Fri Jun 18 2021 → Sat, nothing to observe)',
    '2021-06-18',
    EDT_OFFSET_HOURS,
  ],
]

describe.each(TRADING_DAYS)(
  'ordinary trading day: %s',
  (_label, date, offset) => {
    it('is not a holiday and the market is open at midday', () => {
      expect(isNyseHoliday(noon(date, offset))).toBe(false)
      expect(isNyseMarketOpen(noon(date, offset))).toBe(true)
    })
  },
)

describe('Juneteenth is only observed from 2022', () => {
  it('2021-06-19 was a Saturday and 2021-06-18 traded normally', () => {
    expect(isNyseHoliday(noon('2021-06-18', EDT_OFFSET_HOURS))).toBe(false)
  })

  it('2022-06-20 is closed, 2022-06-17 is not', () => {
    expect(isNyseHoliday(noon('2022-06-20', EDT_OFFSET_HOURS))).toBe(true)
    expect(isNyseHoliday(noon('2022-06-17', EDT_OFFSET_HOURS))).toBe(false)
  })
})

describe('isNyseMarketOpen session bounds', () => {
  it.each([
    [9, 29, false],
    [9, 30, true],
    [12, 0, true],
    [15, 59, true],
    [16, 0, false],
    [0, 0, false],
  ])('%i:%i ET on an ordinary day => %s', (hour, minute, expected) => {
    expect(
      isNyseMarketOpen(at('2026-07-15', EDT_OFFSET_HOURS, hour, minute)),
    ).toBe(expected)
  })

  it('is false on weekends', () => {
    expect(isNyseMarketOpen(noon('2026-07-18', EDT_OFFSET_HOURS))).toBe(false)
  })
})

describe('early-close days (13:00 ET)', () => {
  // Day after Thanksgiving 2025, Christmas Eve 2025, Jul 3 2025.
  const EARLY = [
    ['day after Thanksgiving 2025', '2025-11-28', EST_OFFSET_HOURS],
    ['Christmas Eve 2025', '2025-12-24', EST_OFFSET_HOURS],
    ['Jul 3 2025', '2025-07-03', EDT_OFFSET_HOURS],
  ] as const

  describe.each(EARLY)('%s', (_label, date, offset) => {
    it('closes at 13:00 instead of 16:00', () => {
      expect(isNyseMarketOpen(at(date, offset, 12, 59))).toBe(true)
      expect(isNyseMarketOpen(at(date, offset, 13, 0))).toBe(false)
      expect(isNyseMarketOpen(at(date, offset, 15, 45))).toBe(false)
    })

    it('has its close spike at 12:30–13:00, not 15:30–16:00', () => {
      expect(isMarketSpikeWindow(at(date, offset, 12, 29))).toBe(false)
      expect(isMarketSpikeWindow(at(date, offset, 12, 30))).toBe(true)
      expect(isMarketSpikeWindow(at(date, offset, 12, 59))).toBe(true)
      expect(isMarketSpikeWindow(at(date, offset, 13, 0))).toBe(false)
      expect(isMarketSpikeWindow(at(date, offset, 15, 45))).toBe(false)
    })

    it('still has the normal open spike', () => {
      expect(isMarketSpikeWindow(at(date, offset, 9, 45))).toBe(true)
    })
  })

  it('Christmas Eve is a full holiday when Christmas is observed on it (2027)', () => {
    expect(isNyseMarketOpen(noon('2027-12-24', EST_OFFSET_HOURS))).toBe(false)
  })

  it('a weekend Dec 24 is not an early-close weekday', () => {
    expect(isNyseMarketOpen(noon('2028-12-24', EST_OFFSET_HOURS))).toBe(false)
  })
})

describe('holiday calendar across years', () => {
  it('handles many consecutive years without a false Thanksgiving/Christmas gap', () => {
    for (let year = 2022; year <= 2035; year += 1) {
      // 4th Thursday of November: find it independently by scanning.
      const thursdays = [...Array(30).keys()]
        .map((i) => i + 1)
        .filter((d) => new Date(Date.UTC(year, 10, d)).getUTCDay() === 4)
      const thanksgiving = `${year}-11-${String(thursdays[3]).padStart(2, '0')}`
      expect(isNyseHoliday(noon(thanksgiving, EST_OFFSET_HOURS))).toBe(true)
    }
  })

  it('a repeated lookup for the same year is consistent (cache)', () => {
    const a = isNyseHoliday(noon('2026-12-25', EST_OFFSET_HOURS))
    const b = isNyseHoliday(noon('2026-12-25', EST_OFFSET_HOURS))
    expect(a && b).toBe(true)
  })
})

// The US switches to DST on the 2nd Sunday of March and back on the 1st Sunday
// of November. The *UTC* instant of 09:30 ET moves by an hour across each
// change; the New York wall-clock session must not. Instants below are given
// in UTC on purpose, so nothing here depends on the host timezone.
describe('DST transitions (America/New_York)', () => {
  const utc = (iso: string) => new Date(iso)

  describe('spring forward — Sunday 2026-03-08', () => {
    it('Friday 03-06 (EST): 09:30 ET is 14:30Z', () => {
      expect(isNyseMarketOpen(utc('2026-03-06T14:29:00Z'))).toBe(false)
      expect(isNyseMarketOpen(utc('2026-03-06T14:30:00Z'))).toBe(true)
      expect(isNyseMarketOpen(utc('2026-03-06T20:59:00Z'))).toBe(true) // 15:59 ET
      expect(isNyseMarketOpen(utc('2026-03-06T21:00:00Z'))).toBe(false) // 16:00 ET
    })

    it('Monday 03-09 (EDT): 09:30 ET is now 13:30Z — the open did not drift', () => {
      expect(isNyseMarketOpen(utc('2026-03-09T13:29:00Z'))).toBe(false)
      expect(isNyseMarketOpen(utc('2026-03-09T13:30:00Z'))).toBe(true)
      expect(isNyseMarketOpen(utc('2026-03-09T19:59:00Z'))).toBe(true) // 15:59 ET
      expect(isNyseMarketOpen(utc('2026-03-09T20:00:00Z'))).toBe(false) // 16:00 ET
    })

    it('the same UTC clock time means different sessions before and after the change', () => {
      // 13:30Z is 08:30 ET (closed) on Friday but 09:30 ET (open) on Monday.
      expect(isNyseMarketOpen(utc('2026-03-06T13:30:00Z'))).toBe(false)
      expect(isNyseMarketOpen(utc('2026-03-09T13:30:00Z'))).toBe(true)
    })

    it('spike windows follow ET on both sides', () => {
      expect(isMarketSpikeWindow(utc('2026-03-06T14:45:00Z'))).toBe(true) // 09:45 EST
      expect(isMarketSpikeWindow(utc('2026-03-09T13:45:00Z'))).toBe(true) // 09:45 EDT
      expect(isMarketSpikeWindow(utc('2026-03-09T14:45:00Z'))).toBe(false) // 10:45 EDT
      expect(isMarketSpikeWindow(utc('2026-03-09T19:30:00Z'))).toBe(true) // 15:30 EDT
    })
  })

  describe('fall back — Sunday 2026-11-01', () => {
    it('Friday 10-30 (EDT): 09:30 ET is 13:30Z', () => {
      expect(isNyseMarketOpen(utc('2026-10-30T13:29:00Z'))).toBe(false)
      expect(isNyseMarketOpen(utc('2026-10-30T13:30:00Z'))).toBe(true)
      expect(isNyseMarketOpen(utc('2026-10-30T19:59:00Z'))).toBe(true) // 15:59 ET
      expect(isNyseMarketOpen(utc('2026-10-30T20:00:00Z'))).toBe(false) // 16:00 ET
    })

    it('Monday 11-02 (EST): 09:30 ET is now 14:30Z — the open did not drift', () => {
      expect(isNyseMarketOpen(utc('2026-11-02T14:29:00Z'))).toBe(false)
      expect(isNyseMarketOpen(utc('2026-11-02T14:30:00Z'))).toBe(true)
      expect(isNyseMarketOpen(utc('2026-11-02T20:59:00Z'))).toBe(true) // 15:59 ET
      expect(isNyseMarketOpen(utc('2026-11-02T21:00:00Z'))).toBe(false) // 16:00 ET
    })

    it('spike windows follow ET on both sides', () => {
      expect(isMarketSpikeWindow(utc('2026-10-30T13:45:00Z'))).toBe(true) // 09:45 EDT
      expect(isMarketSpikeWindow(utc('2026-11-02T14:45:00Z'))).toBe(true) // 09:45 EST
      expect(isMarketSpikeWindow(utc('2026-11-02T15:45:00Z'))).toBe(false) // 10:45 EST
      expect(isMarketSpikeWindow(utc('2026-11-02T20:30:00Z'))).toBe(true) // 15:30 EST
    })
  })

  it('a UTC instant that is already the next calendar day still resolves to the right ET date', () => {
    // 2026-11-27T01:00Z is still Thanksgiving evening (20:00 ET, Nov 26) in New York,
    // even though the UTC calendar date has already rolled over to Friday.
    expect(isNyseHoliday(utc('2026-11-27T01:00:00Z'))).toBe(true)
    expect(isNyseHoliday(utc('2026-11-26T15:00:00Z'))).toBe(true)
    // ...and 2026-11-26T03:00Z is still Wednesday 22:00 ET (Nov 25): not a holiday.
    expect(isNyseHoliday(utc('2026-11-26T03:00:00Z'))).toBe(false)
  })
})

describe('emergency market halt (runtime kill-switch)', () => {
  // Wednesday 2026-07-15 09:45 ET — normally an open market inside the open spike.
  const openSpike = new Date('2026-07-15T13:45:00Z')

  afterEach(() => {
    setEmergencyClosed(false)
    jest.restoreAllMocks()
  })

  it('is off by default in tests, so the calendar decides', () => {
    expect(isEmergencyClosed()).toBe(false)
    expect(isNyseMarketOpen(openSpike)).toBe(true)
    expect(isMarketSpikeWindow(openSpike)).toBe(true)
  })

  it('can be switched on at runtime and forces both checks to false', () => {
    setEmergencyClosed(true)
    expect(isEmergencyClosed()).toBe(true)
    expect(isNyseMarketOpen(openSpike)).toBe(false)
    expect(isMarketSpikeWindow(openSpike)).toBe(false)
  })

  it('also applies at the close spike', () => {
    setEmergencyClosed(true)
    expect(isMarketSpikeWindow(new Date('2026-07-15T19:45:00Z'))).toBe(false)
  })

  it('takes effect immediately and lifts immediately when cleared — no restart', () => {
    setEmergencyClosed(true)
    expect(isNyseMarketOpen(openSpike)).toBe(false)
    setEmergencyClosed(false)
    expect(isEmergencyClosed()).toBe(false)
    expect(isNyseMarketOpen(openSpike)).toBe(true)
    expect(isMarketSpikeWindow(openSpike)).toBe(true)
  })

  it('does not rewrite the holiday calendar', () => {
    setEmergencyClosed(true)
    expect(isNyseHoliday(new Date('2026-07-15T13:45:00Z'))).toBe(false)
    expect(isNyseHoliday(new Date('2026-11-26T15:00:00Z'))).toBe(true)
  })

  it('logs every real change for audit, and stays quiet when nothing changed', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger)

    setEmergencyClosed(true)
    setEmergencyClosed(true) // no-op
    setEmergencyClosed(false)
    setEmergencyClosed(false) // no-op

    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenNthCalledWith(1, expect.stringContaining('ENABLED'))
    expect(warn).toHaveBeenNthCalledWith(2, expect.stringContaining('CLEARED'))
  })

  describe('initial value comes from EMERGENCY_MARKET_CLOSED (config.market.emergencyClosed)', () => {
    const load = (emergencyClosed: boolean) => {
      let mod!: typeof import('../market-hours')
      jest.isolateModules(() => {
        jest.doMock('@/config', () => ({
          __esModule: true,
          default: { market: { emergencyClosed } },
        }))
        jest.doMock('../../infrastructure/logger', () => ({
          logger: { warn: jest.fn() },
        }))
        mod = require('../market-hours')
      })
      return mod
    }

    it('starts closed when the env flag was set at boot, and can then be cleared at runtime', () => {
      const fresh = load(true)
      expect(fresh.isEmergencyClosed()).toBe(true)
      expect(fresh.isNyseMarketOpen(openSpike)).toBe(false)

      fresh.setEmergencyClosed(false)
      expect(fresh.isNyseMarketOpen(openSpike)).toBe(true)
    })

    it('starts open when the env flag was unset at boot, and can then be set at runtime', () => {
      const fresh = load(false)
      expect(fresh.isEmergencyClosed()).toBe(false)
      expect(fresh.isMarketSpikeWindow(openSpike)).toBe(true)

      fresh.setEmergencyClosed(true)
      expect(fresh.isMarketSpikeWindow(openSpike)).toBe(false)
    })

    it('keeps the runtime state per module instance (no bleed between loads)', () => {
      const a = load(false)
      const b = load(false)
      a.setEmergencyClosed(true)
      expect(b.isEmergencyClosed()).toBe(false)
    })
  })
})

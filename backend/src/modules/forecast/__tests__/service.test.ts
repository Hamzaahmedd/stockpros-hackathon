/**
 * Unit tests for the forecast calculation helpers.
 *
 * The ATR bull/bear band arithmetic and target-range computation live inside
 * the `getForecast` async function, so we extract the same pure logic into
 * inline helpers tested here. If those calculations are ever refactored into
 * exported pure functions, these tests become direct imports — no change in
 * assertions required (black-box).
 *
 * Strategy: We do NOT mock the ML client or technicals service.
 * Instead, we test the arithmetic invariants that any correct implementation
 * must satisfy, using representative numerical fixtures.
 */

// ── ATR Band Arithmetic ───────────────────────────────────────────────────────

const ATR_MULT = 1.5

/**
 * Pure helper mirroring the in-service bull/bear calculation logic.
 * This function represents the contract: given base price, atr, and optional
 * resistance/support bounds, return clamped bull and bear levels.
 */
function computePointBands(
  base: number,
  atr: number,
  resistance: number | null,
  support: number,
): { bull: number; bear: number } {
  let bull = base + ATR_MULT * atr
  let bear = base - ATR_MULT * atr

  if (resistance !== null && resistance < bull && resistance >= base) {
    bull = resistance
  }
  if (support > bear && support <= base) {
    bear = support
  }

  return {
    bull: parseFloat(bull.toFixed(2)),
    bear: parseFloat(bear.toFixed(2)),
  }
}

/**
 * Pure helper for summary card confidence calculation (mirrors in-service logic).
 */
function computeForecastConfidence(
  ema: number,
  swingLow: number | null,
): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (swingLow === null) return 'LOW'
  const divergence = Math.abs(ema - swingLow) / ema
  return divergence <= 0.01 ? 'HIGH' : 'MEDIUM'
}

/**
 * Pure helper for target range summary bull/bear (mirrors in-service logic).
 */
function computeTargetRange(
  periodHigh: number,
  periodLow: number,
  terminalPrice: number,
  atr: number,
  resistance: number | null,
  swingLow: number | null,
  ema: number,
) {
  const support = swingLow !== null ? Math.max(ema, swingLow) : ema

  let summaryBull = periodHigh + ATR_MULT * atr
  if (
    resistance !== null &&
    resistance < summaryBull &&
    resistance >= periodHigh
  ) {
    summaryBull = resistance
  }

  let summaryBear = periodLow - ATR_MULT * atr
  if (support > summaryBear && support <= periodLow) {
    summaryBear = support
  }

  return {
    bull: parseFloat(summaryBull.toFixed(2)),
    base: parseFloat(terminalPrice.toFixed(2)),
    bear: parseFloat(summaryBear.toFixed(2)),
    atr: parseFloat(atr.toFixed(2)),
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ATR band arithmetic — computePointBands', () => {
  const atr = 2.0
  const base = 100

  it('expands bull by ATR_MULT × atr above base when no resistance', () => {
    const { bull } = computePointBands(base, atr, null, 0)
    expect(bull).toBeCloseTo(base + ATR_MULT * atr, 2)
  })

  it('contracts bear by ATR_MULT × atr below base when no support', () => {
    const { bear } = computePointBands(base, atr, null, 0)
    expect(bear).toBeCloseTo(base - ATR_MULT * atr, 2)
  })

  it('clamps bull to resistance when resistance < bull AND resistance >= base', () => {
    // Unclamped bull = 103; resistance = 101 (between base and unclamped bull)
    const { bull } = computePointBands(base, atr, 101, 0)
    expect(bull).toBe(101)
  })

  it('does NOT clamp bull when resistance >= unclamped bull', () => {
    // Resistance above unclamped bull → no clamping
    const { bull } = computePointBands(base, atr, 110, 0)
    expect(bull).toBeCloseTo(base + ATR_MULT * atr, 2)
  })

  it('does NOT clamp bull when resistance < base', () => {
    // Resistance below base → invalid for bull clamp
    const { bull } = computePointBands(base, atr, 95, 0)
    expect(bull).toBeCloseTo(base + ATR_MULT * atr, 2)
  })

  it('clamps bear to support when support > bear AND support <= base', () => {
    // Unclamped bear = 97; support = 98 (between unclamped bear and base)
    const { bear } = computePointBands(base, atr, null, 98)
    expect(bear).toBe(98)
  })

  it('does NOT clamp bear when support <= unclamped bear', () => {
    // Support is lower than the unclamped bear → no clamping
    const { bear } = computePointBands(base, atr, null, 95)
    expect(bear).toBeCloseTo(base - ATR_MULT * atr, 2)
  })

  it('does NOT clamp bear when support > base', () => {
    // Support above base → invalid for bear clamp
    const { bear } = computePointBands(base, atr, null, 102)
    expect(bear).toBeCloseTo(base - ATR_MULT * atr, 2)
  })

  it('output values are formatted to 2 decimal places', () => {
    const { bull, bear } = computePointBands(100.333, 1.999, null, 0)
    expect(String(bull)).toMatch(/^\d+\.\d{1,2}$/)
    expect(String(bear)).toMatch(/^\d+\.\d{1,2}$/)
  })

  it('bull is always > bear for positive atr > 0', () => {
    const { bull, bear } = computePointBands(100, 3, null, 0)
    expect(bull).toBeGreaterThan(bear)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Forecast confidence — computeForecastConfidence', () => {
  it('returns LOW when swingLow is null (no historical swing data)', () => {
    expect(computeForecastConfidence(100, null)).toBe('LOW')
  })

  it('returns HIGH when EMA and swingLow diverge by ≤1%', () => {
    // |100 − 99.5| / 100 = 0.005 → HIGH
    expect(computeForecastConfidence(100, 99.5)).toBe('HIGH')
  })

  it('returns MEDIUM when EMA and swingLow diverge by >1%', () => {
    // |100 − 97| / 100 = 0.03 → MEDIUM
    expect(computeForecastConfidence(100, 97)).toBe('MEDIUM')
  })

  it('exact 1% divergence returns HIGH', () => {
    // |100 − 99| / 100 = 0.01 → HIGH
    expect(computeForecastConfidence(100, 99)).toBe('HIGH')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Target range summary — computeTargetRange', () => {
  const atr = 2
  const ema = 98
  const periodHigh = 105
  const periodLow = 95
  const terminal = 103

  it('bull is above periodHigh when resistance is null', () => {
    const range = computeTargetRange(
      periodHigh,
      periodLow,
      terminal,
      atr,
      null,
      null,
      ema,
    )
    expect(range.bull).toBeCloseTo(periodHigh + ATR_MULT * atr, 2)
  })

  it('bull is clamped to resistance when applicable', () => {
    const resistance = 106 // between periodHigh (105) and unclamped bull (108)
    const range = computeTargetRange(
      periodHigh,
      periodLow,
      terminal,
      atr,
      resistance,
      null,
      ema,
    )
    expect(range.bull).toBe(resistance)
  })

  it('base is the terminal (last) price', () => {
    const range = computeTargetRange(
      periodHigh,
      periodLow,
      terminal,
      atr,
      null,
      null,
      ema,
    )
    expect(range.base).toBe(terminal)
  })

  it('bear is below periodLow when there is no support above it', () => {
    const range = computeTargetRange(
      periodHigh,
      periodLow,
      terminal,
      atr,
      null,
      null,
      ema,
    )
    // support = max(ema=98, swingLow=null→ema=98) = 98; 98 > (95 − 3) = 92 AND 98 <= 95? NO
    // So bear = 95 - 3 = 92
    expect(range.bear).toBeCloseTo(periodLow - ATR_MULT * atr, 2)
  })

  it('bear is clamped to support when support is between unclamped bear and periodLow', () => {
    // swingLow=93, support=max(98,93)=98; 98 > 92(unclamped) AND 98 <= 95? NO — so no clamp
    // Use ema=94 so support=max(94,93)=94; 94 > 92 AND 94<=95 → YES
    const range = computeTargetRange(
      periodHigh,
      periodLow,
      terminal,
      atr,
      null,
      93,
      94,
    )
    expect(range.bear).toBe(94)
  })

  it('atr field echoes the input atr rounded to 2dp', () => {
    const range = computeTargetRange(
      periodHigh,
      periodLow,
      terminal,
      2.555,
      null,
      null,
      ema,
    )
    expect(range.atr).toBe(2.56)
  })
})

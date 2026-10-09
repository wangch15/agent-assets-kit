import { describe, expect, test } from 'claude-code/testing'

import type { UsageSnapshot } from '../types'
import {
  EMPTY_SNAPSHOT,
  WINDOW_SPAN_MS,
  addTurnTokens,
  applyMeasure,
  elapsedFraction,
  formatTokens,
  hasAnyData,
  longCountdown,
  shortCountdown,
  terminalLine,
  textBar,
  usageLevel,
} from '../hooks/usage'
import { usageStrip } from '../hooks/strip'

const NOW = Date.parse('2026-10-09T12:00:00Z')
const IN_3H05M = '2026-10-09T15:05:00Z'
const IN_2D4H = '2026-10-11T16:00:00Z'

const FILLED: UsageSnapshot = {
  fiveHour: { percentUsed: 42, resetsAt: IN_3H05M },
  sevenDay: { percentUsed: 91.5, resetsAt: IN_2D4H },
  costUsd: 1.234,
  tokens: { input: 12_345, output: 678, cacheRead: 2_500_000 },
}

describe('讀數', () => {
  test('session.measure：只更新有讀到的視窗，花費沒給就保留', () => {
    const first = applyMeasure(EMPTY_SNAPSHOT, [{ kind: 'five_hour', percentUsed: 10, resetsAt: IN_3H05M }], 0.5)
    const second = applyMeasure(first, [{ kind: 'seven_day', percentUsed: 30 }], undefined)
    expect(second.fiveHour).toEqual({ percentUsed: 10, resetsAt: IN_3H05M })
    expect(second.sevenDay).toEqual({ percentUsed: 30 })
    expect(second.costUsd).toBe(0.5)
    expect(EMPTY_SNAPSHOT.fiveHour).toBeNull()
  })

  test('未知的視窗種類（spend_limit）不採用', () => {
    expect(applyMeasure(EMPTY_SNAPSHOT, [{ kind: 'spend_limit', percentUsed: 50 }], undefined)).toEqual(EMPTY_SNAPSHOT)
  })

  test('turn.complete：輸入含寫入快取，快取讀取另外累加', () => {
    const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 300, cache_creation_input_tokens: 40 }
    const twice = addTurnTokens(addTurnTokens(EMPTY_SNAPSHOT, usage), usage)
    expect(twice.tokens).toEqual({ input: 280, output: 40, cacheRead: 600 })
    expect(EMPTY_SNAPSHOT.tokens.input).toBe(0)
  })

  test('有任何資料才算有資料', () => {
    expect(hasAnyData(EMPTY_SNAPSHOT)).toBe(false)
    expect(hasAnyData({ ...EMPTY_SNAPSHOT, costUsd: 0 })).toBe(true)
    expect(hasAnyData({ ...EMPTY_SNAPSHOT, tokens: { input: 0, output: 1, cacheRead: 0 } })).toBe(true)
  })
})

describe('格式化', () => {
  test('token 單位', () => {
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(12_345)).toBe('12.3k')
    expect(formatTokens(2_500_000)).toBe('2.5M')
    expect(formatTokens(999_960)).toBe('1.0M')
    expect(formatTokens(999)).toBe('999')
  })

  test('重置倒數', () => {
    expect(shortCountdown(IN_3H05M, NOW)).toBe('3h 05m')
    expect(shortCountdown(IN_2D4H, NOW)).toBe('2d 4h')
    expect(shortCountdown(undefined, NOW)).toBe('')
    expect(longCountdown(IN_3H05M, NOW)).toBe('3 小時 5 分後重置')
    expect(longCountdown(IN_2D4H, NOW)).toBe('2 天 4 小時後重置')
    expect(longCountdown('2026-10-09T12:30:00Z', NOW)).toBe('30 分後重置')
    expect(longCountdown('not a date', NOW)).toBe('重置時間未知')
    expect(shortCountdown('2026-10-09T11:00:00Z', NOW)).toBe('已重置')
    expect(longCountdown('2026-10-09T11:00:00Z', NOW)).toContain('已重置')
  })

  test('警示等級', () => {
    expect(usageLevel(74.9)).toBe('normal')
    expect(usageLevel(75)).toBe('warning')
    expect(usageLevel(90)).toBe('critical')
  })

  test('時段已經過的比例', () => {
    // 5h 視窗還剩 3h05m → 已經過 1h55m
    const elapsed = elapsedFraction({ percentUsed: 0, resetsAt: IN_3H05M }, WINDOW_SPAN_MS.fiveHour, NOW)
    expect(Math.abs((elapsed ?? 0) - 115 / 300)).toBeLessThan(1e-9)
    expect(elapsedFraction({ percentUsed: 0 }, WINDOW_SPAN_MS.fiveHour, NOW)).toBeNull()
  })

  test('終端長條與整行', () => {
    expect(textBar({ percentUsed: 50 }, WINDOW_SPAN_MS.fiveHour, NOW)).toBe('━━━━────')
    expect(textBar({ percentUsed: 50, resetsAt: IN_3H05M }, WINDOW_SPAN_MS.fiveHour, NOW)).toBe('━━━┃────')
    const line = terminalLine(FILLED, NOW)
    expect(line).toContain('5h ')
    expect(line).toContain('42% ↻ 3h 05m')
    expect(line).toContain('92% ↻ 2d 4h')
    expect(line).toContain('⇧ 12.3k  ⇩ 678  ▤ 2.5M')
    expect(line).toContain('$1.23')
    expect(terminalLine(EMPTY_SNAPSHOT, NOW)).toBe('⇧ 0  ⇩ 0  ▤ 0')
  })
})

describe('Desktop SVG', () => {
  test('每顆膠囊都有 tooltip；超過 90% 用紅色', () => {
    const { svg, width } = usageStrip(FILLED, NOW)
    expect(width).toBeGreaterThan(0)
    expect(svg.match(/<title>/g)?.length).toBe(6)
    expect(svg).toContain('7 天每週額度：已用 92%')
    expect(svg).toContain('#EF4444')
    expect(svg).toContain('$1.23')
  })

  test('沒有額度與花費時只畫 token 三顆', () => {
    const { svg } = usageStrip(EMPTY_SNAPSHOT, NOW)
    expect(svg.match(/<title>/g)?.length).toBe(3)
    expect(svg).not.toContain('5 小時')
  })
})

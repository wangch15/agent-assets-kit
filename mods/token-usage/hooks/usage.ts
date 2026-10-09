// 純邏輯：額度視窗、token 加總、格式化。不碰 `$`，方便測試。
import type { UsageSnapshot, UsageWindow } from '../types'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR

/** 倒數與時間標記多久重畫一次（不呼叫模型） */
export const REDRAW_MS = 5 * MINUTE_MS

export type WindowKind = 'fiveHour' | 'sevenDay'

/** 引擎的 rateLimits.kind → 本 mod 的視窗 */
const RATE_LIMIT_KIND: Readonly<Record<WindowKind, string>> = {
  fiveHour: 'five_hour',
  sevenDay: 'seven_day',
}

/** 每個視窗的長度，用來算「這個時段過了多少」 */
export const WINDOW_SPAN_MS: Readonly<Record<WindowKind, number>> = {
  fiveHour: 5 * HOUR_MS,
  sevenDay: 7 * DAY_MS,
}

/** 用量警示門檻（百分比） */
export const LEVEL_THRESHOLD = { warning: 75, critical: 90 } as const
export type UsageLevel = 'normal' | 'warning' | 'critical'

export const EMPTY_SNAPSHOT: UsageSnapshot = {
  fiveHour: null,
  sevenDay: null,
  costUsd: null,
  tokens: { input: 0, output: 0, cacheRead: 0 },
}

type RateLimitReading = { readonly kind: string; readonly percentUsed: number; readonly resetsAt?: string }
type TurnTokens = {
  readonly input_tokens: number
  readonly output_tokens: number
  readonly cache_read_input_tokens: number
  readonly cache_creation_input_tokens: number
}

function findWindow(readings: readonly RateLimitReading[], kind: WindowKind): UsageWindow | null {
  const reading = readings.find(r => r.kind === RATE_LIMIT_KIND[kind])
  if (!reading) return null
  return reading.resetsAt
    ? { percentUsed: reading.percentUsed, resetsAt: reading.resetsAt }
    : { percentUsed: reading.percentUsed }
}

/** session.measure：有新讀數的視窗才更新，沒讀到的保留上次的值 */
export function applyMeasure(
  snapshot: UsageSnapshot,
  readings: readonly RateLimitReading[],
  costUsd: number | undefined,
): UsageSnapshot {
  return {
    ...snapshot,
    fiveHour: findWindow(readings, 'fiveHour') ?? snapshot.fiveHour,
    sevenDay: findWindow(readings, 'sevenDay') ?? snapshot.sevenDay,
    costUsd: costUsd ?? snapshot.costUsd,
  }
}

/** turn.complete：累加這一輪的 token。輸入含寫入快取的部分，快取讀取另外算 */
export function addTurnTokens(snapshot: UsageSnapshot, usage: TurnTokens): UsageSnapshot {
  return {
    ...snapshot,
    tokens: {
      input: snapshot.tokens.input + usage.input_tokens + usage.cache_creation_input_tokens,
      output: snapshot.tokens.output + usage.output_tokens,
      cacheRead: snapshot.tokens.cacheRead + usage.cache_read_input_tokens,
    },
  }
}

export function hasAnyData(snapshot: UsageSnapshot): boolean {
  const { input, output } = snapshot.tokens
  return snapshot.fiveHour !== null || snapshot.sevenDay !== null || snapshot.costUsd !== null || input + output > 0
}

export function usageLevel(percentUsed: number): UsageLevel {
  if (percentUsed >= LEVEL_THRESHOLD.critical) return 'critical'
  if (percentUsed >= LEVEL_THRESHOLD.warning) return 'warning'
  return 'normal'
}

/** 0～1：已用比例，超過 100% 也只畫滿 */
export function usedFraction(window: UsageWindow): number {
  return Math.max(0, Math.min(1, window.percentUsed / 100))
}

/** 0～1：這個時段已經過了多少時間；不知道重置時間就回傳 null */
export function elapsedFraction(window: UsageWindow, spanMs: number, now: number): number | null {
  if (!window.resetsAt) return null
  const remaining = Date.parse(window.resetsAt) - now
  if (Number.isNaN(remaining)) return null
  return Math.max(0, Math.min(1, 1 - remaining / spanMs))
}

export function formatPercent(window: UsageWindow): string {
  return `${Math.round(window.percentUsed)}%`
}

const THOUSAND = 1_000
const MILLION = 1_000_000

/** 以四捨五入後的值判斷單位，避免 999,950 顯示成 `1000.0k` */
const ROUNDS_UP_TO_NEXT_UNIT = 999.95

export function formatTokens(count: number): string {
  if (count / THOUSAND >= ROUNDS_UP_TO_NEXT_UNIT) return `${(count / MILLION).toFixed(1)}M`
  if (count >= ROUNDS_UP_TO_NEXT_UNIT) return `${(count / THOUSAND).toFixed(1)}k`
  return `${count}`
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`
}

type Countdown = { readonly days: number; readonly hours: number; readonly minutes: number }

/** 重置時間已過、還沒有新讀數時顯示的字 */
export const RESET_PASSED_SHORT = '已重置'
const RESET_PASSED_LONG = '已重置，下一次回應後更新用量'

function hasResetPassed(resetsAt: string | undefined, now: number): boolean {
  return resetsAt !== undefined && Date.parse(resetsAt) <= now
}

function countdown(resetsAt: string | undefined, now: number): Countdown | null {
  if (!resetsAt) return null
  const ms = Date.parse(resetsAt) - now
  if (Number.isNaN(ms)) return null
  const total = Math.max(0, Math.round(ms / MINUTE_MS))
  return {
    days: Math.floor(total / MINUTES_PER_DAY),
    hours: Math.floor((total % MINUTES_PER_DAY) / MINUTES_PER_HOUR),
    minutes: total % MINUTES_PER_HOUR,
  }
}

/** 膠囊上的短倒數：`2d 4h`、`3h 05m`；不知道重置時間就是空字串 */
export function shortCountdown(resetsAt: string | undefined, now: number): string {
  if (hasResetPassed(resetsAt, now)) return RESET_PASSED_SHORT
  const left = countdown(resetsAt, now)
  if (!left) return ''
  if (left.days > 0) return `${left.days}d ${left.hours}h`
  return `${left.hours}h ${String(left.minutes).padStart(2, '0')}m`
}

/** tooltip 用的完整說法 */
export function longCountdown(resetsAt: string | undefined, now: number): string {
  if (hasResetPassed(resetsAt, now)) return RESET_PASSED_LONG
  const left = countdown(resetsAt, now)
  if (!left) return '重置時間未知'
  if (left.days > 0) return `${left.days} 天 ${left.hours} 小時後重置`
  if (left.hours > 0) return `${left.hours} 小時 ${left.minutes} 分後重置`
  return `${left.minutes} 分後重置`
}

const TEXT_BAR_CELLS = 8
const TEXT_BAR = { filled: '━', empty: '─', marker: '┃' } as const

/** 終端的文字長條：已用的部分加粗，直線是時段已經過的時間 */
export function textBar(window: UsageWindow, spanMs: number, now: number): string {
  const filled = Math.round(usedFraction(window) * TEXT_BAR_CELLS)
  const elapsed = elapsedFraction(window, spanMs, now)
  const marker = elapsed === null ? -1 : Math.min(TEXT_BAR_CELLS - 1, Math.floor(elapsed * TEXT_BAR_CELLS))
  return Array.from({ length: TEXT_BAR_CELLS }, (_, i) => {
    if (i === marker) return TEXT_BAR.marker
    return i < filled ? TEXT_BAR.filled : TEXT_BAR.empty
  }).join('')
}

const WINDOW_LABEL: Readonly<Record<WindowKind, string>> = { fiveHour: '5h', sevenDay: '7d' }

function textWindow(kind: WindowKind, window: UsageWindow | null, now: number): string | null {
  if (!window) return null
  const reset = shortCountdown(window.resetsAt, now)
  const bar = textBar(window, WINDOW_SPAN_MS[kind], now)
  return `${WINDOW_LABEL[kind]} ${bar} ${formatPercent(window)}${reset ? ` ↻ ${reset}` : ''}`
}

/** 終端整行：5h │ 7d │ token │ 花費 */
export function terminalLine(snapshot: UsageSnapshot, now: number): string {
  const { input, output, cacheRead } = snapshot.tokens
  const parts = [
    textWindow('fiveHour', snapshot.fiveHour, now),
    textWindow('sevenDay', snapshot.sevenDay, now),
    `⇧ ${formatTokens(input)}  ⇩ ${formatTokens(output)}  ▤ ${formatTokens(cacheRead)}`,
    snapshot.costUsd === null ? null : formatUsd(snapshot.costUsd),
  ]
  return parts.filter((part): part is string => part !== null).join('  │  ')
}

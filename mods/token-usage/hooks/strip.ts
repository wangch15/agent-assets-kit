// Desktop 的用量條：一張 SVG，裡面是一排圓角膠囊（額度視窗＋token＋花費），滑過有 tooltip。不碰 `$`。
import type { UsageSnapshot, UsageWindow } from '../types'
import type { UsageLevel, WindowKind } from './usage'
import {
  WINDOW_SPAN_MS,
  elapsedFraction,
  formatPercent,
  formatTokens,
  formatUsd,
  longCountdown,
  shortCountdown,
  usageLevel,
  usedFraction,
} from './usage'

/** 尺寸：等寬字 13px 的字寬約 7.9 */
const SIZE = {
  height: 28,
  radius: 14,
  fontSize: 13,
  charWidth: 7.9,
  boldExtra: 0.5,
  paddingX: 11,
  icon: 16,
  iconGap: 5,
  bar: 56,
  barHeight: 5,
  markerHeight: 11,
  gap: 8,
  groupGap: 18,
  textBaseline: 18.3,
} as const

const FONT = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'

/** 深色膠囊底：淺色與深色 app 主題上都讀得清楚 */
const PALETTE = {
  card: '#1B2336',
  text: '#F8FAFC',
  muted: '#94A3B8',
  track: '#334155',
  level: { warning: '#FBBF24', critical: '#EF4444' } satisfies Record<Exclude<UsageLevel, 'normal'>, string>,
} as const

/** 每顆膠囊的主色（外框／底色）與 icon 色 */
type Tint = { readonly base: string; readonly icon: string }
const TINT = {
  fiveHour: { base: '#22C55E', icon: '#4ADE80' },
  sevenDay: { base: '#8B5CF6', icon: '#A78BFA' },
  input: { base: '#F43F5E', icon: '#FB7185' },
  output: { base: '#10B981', icon: '#34D399' },
  cacheRead: { base: '#6366F1', icon: '#818CF8' },
  cost: { base: '#F59E0B', icon: '#FBBF24' },
} as const satisfies Record<string, Tint>

type IconName = 'gauge' | 'calendar' | 'clock' | 'input' | 'output' | 'cache' | 'coin'

/** 16×16 線條 icon */
const ICON_PATH: Readonly<Record<IconName, string>> = {
  gauge: '<path d="M2.6 12.4a6 6 0 1 1 10.8 0"/><path d="M8 10.8 10.4 7.6"/><circle cx="8" cy="11" r=".6"/>',
  calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 6.8h11M5.5 2v3M10.5 2v3"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2.1 1.3"/>',
  input: '<path d="M8 10.5V2.8M5.2 5.4 8 2.6l2.8 2.8"/><path d="M3 10.5v2.5h10v-2.5"/>',
  output: '<path d="M8 2.8v7.7M5.2 7.9 8 10.7l2.8-2.8"/><path d="M3 10.5v2.5h10v-2.5"/>',
  cache: '<path d="M8 2.5 13.5 5.3 8 8.1 2.5 5.3z"/><path d="M2.5 8.2 8 11l5.5-2.8M2.5 11 8 13.8l5.5-2.8"/>',
  coin: '<circle cx="8" cy="8" r="5.8"/><path d="M8 4.6v6.8M9.8 6.2c-.4-.6-1-.9-1.8-.9-1 0-1.8.5-1.8 1.3 0 1.8 3.6.8 3.6 2.6 0 .8-.8 1.3-1.8 1.3-.8 0-1.5-.3-1.9-.9"/>',
}

type Pill = { readonly svg: string; readonly width: number }

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function textWidth(text: string, isBold = false): number {
  return text.length * (SIZE.charWidth + (isBold ? SIZE.boldExtra : 0))
}

function icon(name: IconName, x: number, color: string): string {
  const y = (SIZE.height - SIZE.icon) / 2
  return (
    `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1.4" ` +
    `stroke-linecap="round" stroke-linejoin="round">${ICON_PATH[name]}</g>`
  )
}

function label(x: number, text: string, color: string, isBold = false): string {
  const weight = isBold ? ' font-weight="700"' : ''
  return (
    `<text x="${x}" y="${SIZE.textBaseline}" font-family="${FONT}" font-size="${SIZE.fontSize}"${weight} ` +
    `fill="${color}">${escapeXml(text)}</text>`
  )
}

/** 膠囊外框：深色底＋主色半透明疊層；<title> 是原生 tooltip（Svg 需 isInteractive） */
function frame(x: number, width: number, tint: Tint, body: string, tooltip: string): string {
  const tip = tooltip.split('\n').map(escapeXml).join('&#10;')
  const { height, radius } = SIZE
  return (
    `<g class="pill"><title>${tip}</title>` +
    `<rect x="${x}" y="0" width="${width}" height="${height}" rx="${radius}" fill="${PALETTE.card}"/>` +
    `<rect class="hl" x="${x + 0.5}" y="0.5" width="${width - 1}" height="${height - 1}" rx="${radius - 0.5}" ` +
    `fill="${tint.base}" fill-opacity=".14" stroke="${tint.base}" stroke-opacity=".38"/>${body}</g>`
  )
}

function levelColor(percentUsed: number, fallback: string): string {
  const level = usageLevel(percentUsed)
  return level === 'normal' ? fallback : PALETTE.level[level]
}

/** 長條：底軌＋已用的部分＋時段已經過的時間標記 */
function progressBar(x: number, window: UsageWindow, kind: WindowKind, color: string, now: number): string {
  const top = (SIZE.height - SIZE.barHeight) / 2
  const radius = SIZE.barHeight / 2
  const filled = usedFraction(window) * SIZE.bar
  const track = `<rect x="${x}" y="${top}" width="${SIZE.bar}" height="${SIZE.barHeight}" rx="${radius}" fill="${PALETTE.track}"/>`
  const fill =
    filled > 0
      ? `<rect x="${x}" y="${top}" width="${Math.max(SIZE.barHeight, filled)}" height="${SIZE.barHeight}" rx="${radius}" fill="${color}"/>`
      : ''
  const elapsed = elapsedFraction(window, WINDOW_SPAN_MS[kind], now)
  const markerTop = (SIZE.height - SIZE.markerHeight) / 2
  const marker =
    elapsed === null
      ? ''
      : `<rect x="${x + elapsed * (SIZE.bar - 2)}" y="${markerTop}" width="2" height="${SIZE.markerHeight}" rx="1" fill="${PALETTE.text}"/>`
  return track + fill + marker
}

const WINDOW_META: Readonly<Record<WindowKind, { label: string; title: string; icon: IconName }>> = {
  fiveHour: { label: '5h', title: '5 小時工作階段額度', icon: 'gauge' },
  sevenDay: { label: '7d', title: '7 天每週額度', icon: 'calendar' },
}

/** 額度膠囊：icon 5h ▬▬▬ 42% │ ⏱ 3h 05m */
function windowPill(x: number, kind: WindowKind, window: UsageWindow, now: number): Pill {
  const meta = WINDOW_META[kind]
  const tint = TINT[kind]
  const percent = formatPercent(window)
  const reset = shortCountdown(window.resetsAt, now)
  let cursor = x + SIZE.paddingX
  let body = icon(meta.icon, cursor, tint.icon)
  cursor += SIZE.icon + SIZE.iconGap
  body += label(cursor, meta.label, PALETTE.muted)
  cursor += textWidth(meta.label) + SIZE.iconGap
  body += progressBar(cursor, window, kind, levelColor(window.percentUsed, tint.icon), now)
  cursor += SIZE.bar + SIZE.gap
  body += label(cursor, percent, PALETTE.text, true)
  cursor += textWidth(percent, true) + SIZE.gap
  if (reset) {
    body += `<rect x="${cursor}" y="8" width="1" height="12" fill="${PALETTE.muted}" opacity=".35"/>`
    cursor += SIZE.gap
    body += icon('clock', cursor, tint.icon)
    cursor += SIZE.icon + SIZE.iconGap
    body += label(cursor, reset, PALETTE.muted)
    cursor += textWidth(reset)
  }
  const width = cursor + SIZE.paddingX - x
  const tooltip = `${meta.title}：已用 ${percent}，${longCountdown(window.resetsAt, now)}\n長條上的直線＝這個時段已經過了多少時間`
  return { svg: frame(x, width, tint, body, tooltip), width }
}

/** 數值膠囊：icon 12.3k */
function valuePill(x: number, name: IconName, tint: Tint, value: string, tooltip: string): Pill {
  const width = SIZE.paddingX * 2 + SIZE.icon + SIZE.iconGap + textWidth(value)
  const body = icon(name, x + SIZE.paddingX, tint.icon) + label(x + SIZE.paddingX + SIZE.icon + SIZE.iconGap, value, PALETTE.text)
  return { svg: frame(x, width, tint, body, tooltip), width }
}

type PillFactory = { readonly make: (x: number) => Pill; readonly gapAfter: number }

function windowFactories(snapshot: UsageSnapshot, now: number): PillFactory[] {
  const present = (['fiveHour', 'sevenDay'] as const).flatMap(kind => {
    const window = snapshot[kind]
    return window ? [{ kind, window }] : []
  })
  // 最後一個額度膠囊後面留大一點的間距，和 token 群組分開
  return present.map(({ kind, window }, i) => ({
    make: (x: number) => windowPill(x, kind, window, now),
    gapAfter: i === present.length - 1 ? SIZE.groupGap : SIZE.gap,
  }))
}

function tokenFactories(snapshot: UsageSnapshot): PillFactory[] {
  const input = formatTokens(snapshot.tokens.input)
  const output = formatTokens(snapshot.tokens.output)
  const cacheRead = formatTokens(snapshot.tokens.cacheRead)
  return [
    {
      make: x => valuePill(x, 'input', TINT.input, input, `輸入 token：本工作階段送給模型的內容共 ${input}`),
      gapAfter: SIZE.gap,
    },
    {
      make: x => valuePill(x, 'output', TINT.output, output, `輸出 token：模型在本工作階段產生的內容共 ${output}`),
      gapAfter: SIZE.gap,
    },
    {
      make: x => valuePill(x, 'cache', TINT.cacheRead, cacheRead, `快取讀取 token：從提示快取重複使用 ${cacheRead}，計費比一般輸入低`),
      gapAfter: SIZE.groupGap,
    },
  ]
}

function costFactories(costUsd: number | null): PillFactory[] {
  if (costUsd === null) return []
  const cost = formatUsd(costUsd)
  return [{ make: x => valuePill(x, 'coin', TINT.cost, cost, `工作階段費用：依 API 牌價估算約 ${cost} 美元`), gapAfter: 0 }]
}

/** 由左到右排好每顆膠囊，回傳整張 SVG 與寬度 */
export function usageStrip(snapshot: UsageSnapshot, now: number): { readonly svg: string; readonly width: number } {
  const factories = [...windowFactories(snapshot, now), ...tokenFactories(snapshot), ...costFactories(snapshot.costUsd)]
  const { pills, end } = factories.reduce<{ pills: readonly Pill[]; end: number; next: number }>(
    (acc, factory) => {
      const pill = factory.make(acc.next)
      return { pills: [...acc.pills, pill], end: acc.next + pill.width, next: acc.next + pill.width + factory.gapAfter }
    },
    { pills: [], end: 0, next: 0 },
  )
  const width = Math.ceil(end)
  const style =
    ':root{color-scheme:light dark;background:transparent}.pill{cursor:help}' +
    '.pill .hl{transition:fill-opacity .12s}.pill:hover .hl{fill-opacity:.26}'
  return {
    width,
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${SIZE.height}" viewBox="0 0 ${width} ${SIZE.height}">` +
      `<style>${style}</style>${pills.map(p => p.svg).join('')}</svg>`,
  }
}

export const STRIP_HEIGHT = SIZE.height

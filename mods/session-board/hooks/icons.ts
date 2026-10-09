// 看板用的 icon：Desktop 畫 16×16 線條 SVG，終端改用不會被畫成 emoji 的字元。不碰 `$`。
import type { SessionEnv, SessionStatus } from '../types'

export type IconName = 'board' | 'user' | 'folder' | SessionEnv | SessionStatus

/** 16×16 viewBox 的線條路徑；status 類的動畫另外加 */
const PATHS: Readonly<Record<IconName, string>> = {
  board: '<rect x="2" y="2.5" width="12" height="11" rx="2"/><path d="M2 6h12M6 6v7.5"/>',
  user: '<circle cx="8" cy="5.5" r="2.8"/><path d="M2.8 13.8c.8-2.6 2.8-4 5.2-4s4.4 1.4 5.2 4"/>',
  folder: '<path d="M2 4.5a1 1 0 0 1 1-1h3.2l1.5 1.6H13a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/>',
  desktop: '<rect x="1.8" y="2.5" width="12.4" height="8.5" rx="1.5"/><path d="M5.5 13.8h5M8 11v2.8"/>',
  cli: '<rect x="1.8" y="2.5" width="12.4" height="11" rx="1.8"/><path d="M4.6 6.4 6.8 8.4 4.6 10.4M8.4 10.6h3"/>',
  'needs-input': '<path d="M2.5 3.5h11v7h-6l-3 2.6v-2.6h-2z"/><path d="M8 5.4v2.2M8 9.2v.1"/>',
  running: '<circle cx="8" cy="8" r="5.5" stroke-opacity=".25"/><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5"/>',
  done: '<circle cx="8" cy="8" r="5.5"/><path d="M5.4 8.2 7.2 10l3.4-3.8"/>',
}

/** 執行中的 icon 會轉、等你回應的會呼吸，其餘靜止 */
const ANIMATION: Partial<Record<IconName, string>> = {
  running:
    '<animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="1.1s" repeatCount="indefinite"/>',
  'needs-input': '<animate attributeName="opacity" values="1;.35;1" dur="1.6s" repeatCount="indefinite"/>',
}

/** 終端的替代字元：都選沒有 emoji 版本的 */
export const ICON_GLYPH: Readonly<Record<IconName, string>> = {
  board: '▤',
  user: '◉',
  folder: '▸',
  desktop: '▣',
  cli: '›',
  'needs-input': '◆',
  running: '●',
  done: '✓',
}

export const ICON_SIZE = 14

/** 線條 icon 的 SVG 原始碼；顏色由呼叫端給（色票見 view.tsx） */
export function iconSvg(name: IconName, color: string, size: number = ICON_SIZE): string {
  const animation = ANIMATION[name] ?? ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16">` +
    `<g fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
    `${PATHS[name]}${animation}</g></svg>`
  )
}

/** 給 badge 內嵌用：只回傳 <g>，位置由外層 SVG 決定 */
export function iconGroup(name: IconName, color: string, x: number, y: number, size: number): string {
  const scale = size / 16
  return (
    `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="1.6" ` +
    `stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</g>`
  )
}

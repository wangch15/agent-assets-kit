// 看板畫面（右側 Pane）：只負責畫，不碰 `$`；互動由 register.tsx 傳入的 callback 處理。
// Pane 是窄欄，所以每個 session 分兩行：第一行狀態 icon＋標題＋移除，第二行狀態文字、環境 badge、專案。
import type { ElementTable } from 'claude-code'

import type { BoardEntry, SessionEnv, SessionStatus } from '../types'
import type { UserGroup } from './board'
import { ENV_LABEL, STATUS_TEXT, groupByUser, statusCounts } from './board'
import type { IconName } from './icons'
import { ICON_GLYPH, ICON_SIZE, iconGroup, iconSvg } from './icons'

/** 按鈕字元：都選沒有 emoji 版本的字元，不會被畫成彩色圖示 */
const BUTTON_GLYPH = {
  expanded: '▼',
  collapsed: '►',
  dismiss: '✕',
} as const

/** 色票：中間調，淺色與深色背景都讀得清楚 */
const COLOR = {
  muted: '#8A8A93',
  hoverBg: '#80808022',
  transparent: '#00000000',
  status: {
    'needs-input': '#F59E0B',
    running: '#3B82F6',
    done: '#22C55E',
  } satisfies Record<SessionStatus, string>,
  env: {
    desktop: '#D97757',
    cli: '#A78BFA',
  } satisfies Record<SessionEnv, string>,
} as const

/** 第二行縮排：對齊標題（跳過狀態 icon 與間距） */
const DETAIL_INDENT = 3

export type BoardViewProps = {
  readonly entries: readonly BoardEntry[]
  readonly selfId: string
  readonly collapsedUsers: readonly string[]
  readonly onToggleUser: (userKey: string) => void
  readonly onJump: (entry: BoardEntry) => void
  readonly onDismiss: (entry: BoardEntry) => void
}

/** 單一 icon：Desktop 用 SVG，其他用替代字元（終端的 table 也有 Svg 但畫不出來，所以看 isDesktop） */
function Icon(els: ElementTable, name: IconName, color: string, alt: string, isDesktop: boolean) {
  if (isDesktop && 'Svg' in els) {
    const { Box, Svg } = els
    return (
      <Box flexShrink={0}>
        <Svg source={iconSvg(name, color)} alt={alt} width={ICON_SIZE} height={ICON_SIZE} />
      </Box>
    )
  }
  const { Text } = els
  return <Text color={color}>{ICON_GLYPH[name]}</Text>
}

/** 膠囊 badge（Desktop）：用 SVG 畫才能控制字級、全圓角與內嵌 icon；寬度依字數估算 */
const BADGE = { height: 18, fontSize: 10.5, charWidth: 6.1, paddingX: 8, iconSize: 11, iconGap: 4 } as const

function badgeWidth(label: string): number {
  return Math.ceil(BADGE.paddingX * 2 + BADGE.iconSize + BADGE.iconGap + label.length * BADGE.charWidth)
}

function badgeSvg(env: SessionEnv, label: string, color: string): string {
  const width = badgeWidth(label)
  const { height, fontSize, paddingX, iconSize, iconGap } = BADGE
  const textX = paddingX + iconSize + iconGap
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${(height - 1) / 2}" ` +
    `fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-opacity="0.55"/>` +
    iconGroup(env, color, paddingX, (height - iconSize) / 2, iconSize) +
    `<text x="${textX}" y="50%" dominant-baseline="central" fill="${color}" ` +
    `font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" ` +
    `font-size="${fontSize}" font-weight="500">${label}</text></svg>`
  )
}

function EnvBadge(els: ElementTable, entry: BoardEntry, isDesktop: boolean) {
  const env = entry.env
  const color = COLOR.env[env]
  const label = ENV_LABEL[env]
  if (isDesktop && 'Svg' in els) {
    const { Box, Svg } = els
    return (
      <Box key={`badge-${entry.sessionId}`} flexShrink={0}>
        <Svg source={badgeSvg(env, label, color)} alt={label} width={badgeWidth(label)} height={BADGE.height} />
      </Box>
    )
  }
  const { Text } = els
  return (
    <Text backgroundColor={color} color="#FFFFFF">
      {` ${ICON_GLYPH[env]} ${label} `}
    </Text>
  )
}

/** 移除按鈕：常駐的淡色 x-mark；不用顯示／隱藏，避免版面跳動 */
function DismissButton(els: ElementTable, entry: BoardEntry, props: BoardViewProps) {
  const { Button } = els
  return (
    <Button
      key={`dismiss-${entry.sessionId}`}
      plain
      dimColor
      label={BUTTON_GLYPH.dismiss}
      onPress={() => props.onDismiss(entry)}
    />
  )
}

function SessionDetail(els: ElementTable, entry: BoardEntry, isSelf: boolean, isDesktop: boolean) {
  const { Box, Text } = els
  const hasProject = entry.project !== '' && entry.project !== entry.title
  return (
    <Box flexDirection="row" alignItems="center" columnGap={1} paddingLeft={DETAIL_INDENT} overflow="hidden">
      <Text color={COLOR.status[entry.status]} bold={entry.status === 'needs-input'}>
        {STATUS_TEXT[entry.status]}
      </Text>
      {EnvBadge(els, entry, isDesktop)}
      {hasProject ? Icon(els, 'folder', COLOR.muted, '專案', isDesktop) : null}
      {hasProject ? (
        <Text color={COLOR.muted} wrap="truncate-end">
          {entry.project}
        </Text>
      ) : null}
      {isSelf ? <Text color={COLOR.muted}>· 目前</Text> : null}
    </Box>
  )
}

function SessionRow(els: ElementTable, entry: BoardEntry, props: BoardViewProps, isDesktop: boolean) {
  const { Box, Button } = els
  const isSelf = entry.sessionId === props.selfId
  return (
    <Box
      key={`row-${entry.sessionId}`}
      flexDirection="column"
      paddingX={1}
      paddingY={isDesktop ? 1 : 0}
      {...(isDesktop ? { borderStyle: 'round', borderColor: COLOR.transparent } : {})}
      hover={{ backgroundColor: COLOR.hoverBg }}
    >
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        {Icon(els, entry.status, COLOR.status[entry.status], STATUS_TEXT[entry.status], isDesktop)}
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Button key={`jump-${entry.sessionId}`} plain label={entry.title} onPress={() => props.onJump(entry)} />
        </Box>
        {DismissButton(els, entry, props)}
      </Box>
      {SessionDetail(els, entry, isSelf, isDesktop)}
    </Box>
  )
}

/** 標題列：第一行標題，第二行各狀態計數；窄欄也排得下 */
function BoardHeader(els: ElementTable, props: BoardViewProps, isDesktop: boolean) {
  const { Box, Text } = els
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        {Icon(els, 'board', COLOR.muted, 'Sessions', isDesktop)}
        <Text bold>Sessions</Text>
        <Text color={COLOR.muted}>{props.entries.length}</Text>
      </Box>
      <Box flexDirection="row" alignItems="center" columnGap={2}>
        {statusCounts(props.entries).map(({ status, count }) => (
          <Box key={`count-${status}`} flexDirection="row" alignItems="center" columnGap={1}>
            {Icon(els, status, COLOR.status[status], STATUS_TEXT[status], isDesktop)}
            <Text color={COLOR.status[status]} bold={status === 'needs-input'}>
              {count} {STATUS_TEXT[status]}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function UserGroupHeader(els: ElementTable, group: UserGroup, isOpen: boolean, props: BoardViewProps, isDesktop: boolean) {
  const { Box, Text, Button } = els
  return (
    <Box flexDirection="row" alignItems="center" columnGap={1}>
      <Button
        key={`toggle-${group.userKey}`}
        plain
        dimColor
        label={isOpen ? BUTTON_GLYPH.expanded : BUTTON_GLYPH.collapsed}
        onPress={() => props.onToggleUser(group.userKey)}
      />
      {Icon(els, 'user', COLOR.muted, '用戶', isDesktop)}
      <Text bold>{group.userName}</Text>
      <Text color={COLOR.muted}>{group.entries.length}</Text>
      {group.needsInput > 0 ? <Text color={COLOR.status['needs-input']}>· {group.needsInput} 個等你</Text> : null}
    </Box>
  )
}

export function BoardView(els: ElementTable, props: BoardViewProps, isDesktop: boolean) {
  const { Box, Text } = els
  if (props.entries.length === 0) {
    return (
      <Box flexDirection="column" rowGap={1}>
        {BoardHeader(els, props, isDesktop)}
        <Text color={COLOR.muted}>目前沒有進行中的 session</Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" rowGap={1}>
      {BoardHeader(els, props, isDesktop)}
      {groupByUser(props.entries).map(group => {
        const isOpen = !props.collapsedUsers.includes(group.userKey)
        return (
          <Box key={`user-${group.userKey}`} flexDirection="column">
            {UserGroupHeader(els, group, isOpen, props, isDesktop)}
            {isOpen ? group.entries.map(entry => SessionRow(els, entry, props, isDesktop)) : null}
          </Box>
        )
      })}
    </Box>
  )
}

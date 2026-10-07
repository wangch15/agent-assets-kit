// 看板畫面：只負責畫，不碰 `$`；互動由 register.tsx 傳入的 callback 處理。
import type { ElementTable } from 'claude-code'

import type { BoardEntry, SessionEnv, SessionStatus } from '../types'
import { ENV_LABEL, STATUS_TEXT, groupByUser, statusCounts } from './board'

/** 圖示字元：都選沒有 emoji 版本的字元，不會被畫成彩色圖示 */
const ICON = {
  expanded: '▼',
  collapsed: '►',
  dismiss: '✕',
} as const

/** 色票：中間調，淺色與深色背景都讀得清楚 */
const COLOR = {
  border: '#3F3F46',
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

export type BoardViewProps = {
  readonly entries: readonly BoardEntry[]
  readonly selfId: string
  readonly isCollapsed: boolean
  readonly collapsedUsers: readonly string[]
  readonly onToggleBoard: () => void
  readonly onToggleUser: (userKey: string) => void
  readonly onJump: (entry: BoardEntry) => void
  readonly onDismiss: (entry: BoardEntry) => void
}

/** 膠囊 badge（Desktop）：用 SVG 畫才能控制字級與全圓角；寬度依字數估算 */
const BADGE = { height: 18, fontSize: 10.5, charWidth: 6.1, paddingX: 9 } as const

function badgeWidth(label: string): number {
  return Math.ceil(label.length * BADGE.charWidth + BADGE.paddingX * 2)
}

function badgeSvg(label: string, color: string): string {
  const width = badgeWidth(label)
  const { height, fontSize } = BADGE
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${(height - 1) / 2}" ` +
    `fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-opacity="0.55"/>` +
    `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="${color}" ` +
    `font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" ` +
    `font-size="${fontSize}" font-weight="500">${label}</text></svg>`
  )
}

/** 狀態圓點：Desktop 用 SVG（執行中／等你回應會呼吸閃爍），終端用實心圓字元 */
function dotSvg(color: string, isPulsing: boolean): string {
  const pulse = isPulsing
    ? '<circle cx="6" cy="6" r="3" fill="none" stroke="' + color + '" stroke-width="1.5">' +
      '<animate attributeName="r" values="3;5.5;3" dur="1.6s" repeatCount="indefinite"/>' +
      '<animate attributeName="opacity" values="0.9;0;0.9" dur="1.6s" repeatCount="indefinite"/></circle>'
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">${pulse}<circle cx="6" cy="6" r="3" fill="${color}"/></svg>`
}

function StatusDot(els: ElementTable, status: SessionStatus) {
  const color = COLOR.status[status]
  const isPulsing = status === 'running' || status === 'needs-input'
  if ('Svg' in els) {
    const { Svg } = els
    return <Svg source={dotSvg(color, isPulsing)} alt={STATUS_TEXT[status]} width={12} height={12} />
  }
  const { Text } = els
  return <Text color={color}>●</Text>
}

function EnvBadge(els: ElementTable, entry: BoardEntry, isDesktop: boolean) {
  const env = entry.env
  const color = COLOR.env[env]
  const label = ENV_LABEL[env]
  if (isDesktop && 'Svg' in els) {
    const { Box, Svg } = els
    return (
      <Box key={`badge-${entry.sessionId}`} flexShrink={0}>
        <Svg source={badgeSvg(label, color)} alt={label} width={badgeWidth(label)} height={BADGE.height} />
      </Box>
    )
  }
  const { Text } = els
  return (
    <Text backgroundColor={color} color="#FFFFFF">
      {` ${ENV_LABEL[env]} `}
    </Text>
  )
}

function SessionRow(els: ElementTable, entry: BoardEntry, props: BoardViewProps, isDesktop: boolean) {
  const { Box, Text, Button } = els
  const isSelf = entry.sessionId === props.selfId
  const statusColor = COLOR.status[entry.status]
  return (
    <Box
      key={`row-${entry.sessionId}`}
      flexDirection="row"
      alignItems="center"
      columnGap={1}
      paddingLeft={2}
      paddingRight={1}
      paddingY={isDesktop ? 1 : 0}
      {...(isDesktop ? { borderStyle: 'round', borderColor: COLOR.transparent } : {})}
      hover={{ backgroundColor: COLOR.hoverBg }}
    >
      {StatusDot(els, entry.status)}
      <Box flexGrow={1} flexShrink={1} flexDirection="row" columnGap={1} overflow="hidden">
        <Button
          key={`jump-${entry.sessionId}`}
          plain
          label={entry.title}
          onPress={() => props.onJump(entry)}
        />
        {entry.project && entry.project !== entry.title ? (
          <Text color={COLOR.muted} wrap="truncate-end">
            {entry.project}
          </Text>
        ) : null}
        {isSelf ? <Text color={COLOR.muted}>· 目前</Text> : null}
      </Box>
      <Text color={statusColor} bold={entry.status === 'needs-input'}>
        {STATUS_TEXT[entry.status]}
      </Text>
      {EnvBadge(els, entry, isDesktop)}
      {DismissButton(els, entry, props)}
    </Box>
  )
}

/** 移除按鈕：常駐的淡色 x-mark，滑過變亮；不用顯示／隱藏，避免版面跳動 */
function DismissButton(els: ElementTable, entry: BoardEntry, props: BoardViewProps) {
  const { Button } = els
  return (
    <Button
      key={`dismiss-${entry.sessionId}`}
      plain
      dimColor
      label={ICON.dismiss}
      onPress={() => props.onDismiss(entry)}
    />
  )
}

/** 標題列：左邊標題，右邊各狀態計數與收合鈕；收合後仍看得到有沒有事等你 */
function BoardHeader(els: ElementTable, props: BoardViewProps) {
  const { Box, Text, Button } = els
  return (
    <Box flexDirection="row" alignItems="center" justifyContent="space-between" columnGap={2}>
      <Text bold>Sessions</Text>
      <Box flexDirection="row" alignItems="center" columnGap={2}>
        {statusCounts(props.entries).map(({ status, count }) => (
          <Text key={`count-${status}`} color={COLOR.status[status]} bold={status === 'needs-input'}>
            ● {count} {STATUS_TEXT[status]}
          </Text>
        ))}
        <Button
          key="toggle-board"
          plain
          dimColor
          label={props.isCollapsed ? ICON.collapsed : ICON.expanded}
          onPress={props.onToggleBoard}
        />
      </Box>
    </Box>
  )
}

export function BoardView(els: ElementTable, props: BoardViewProps, isDesktop: boolean) {
  const { Box, Text, Button } = els
  const groups = groupByUser(props.entries)

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={COLOR.border}
      paddingX={1}
      rowGap={props.isCollapsed ? 0 : 1}
    >
      {BoardHeader(els, props)}
      {props.isCollapsed
        ? null
        : groups.map(group => {
            const isOpen = !props.collapsedUsers.includes(group.userKey)
            return (
              <Box key={`user-${group.userKey}`} flexDirection="column">
                <Box flexDirection="row" alignItems="center" columnGap={1}>
                  <Button
                    key={`toggle-${group.userKey}`}
                    plain
                    label={`${isOpen ? ICON.expanded : ICON.collapsed}  ${group.userName}`}
                    onPress={() => props.onToggleUser(group.userKey)}
                  />
                  <Text color={COLOR.muted}>{group.entries.length}</Text>
                  {group.needsInput > 0 ? (
                    <Text color={COLOR.status['needs-input']}>· {group.needsInput} 個等你</Text>
                  ) : null}
                </Box>
                {isOpen ? group.entries.map(entry => SessionRow(els, entry, props, isDesktop)) : null}
              </Box>
            )
          })}
    </Box>
  )
}

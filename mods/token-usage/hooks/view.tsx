// 用量條畫面：Desktop 畫一張 SVG 膠囊條，其他（終端等）畫一行文字。不碰 `$`。
// 注意：終端的 element table 也有 Svg，但畫不出東西，所以要看 surface 而不是看 table。
import type { ElementTable } from 'claude-code'

import type { UsageSnapshot } from '../types'
import { STRIP_HEIGHT, usageStrip } from './strip'
import { hasAnyData, terminalLine } from './usage'

export const WAITING_TEXT = 'token-usage：等第一次回應後顯示額度…'
export const STRIP_ALT = '5h／7d 額度、token 與花費'

export function UsageBand(els: ElementTable, snapshot: UsageSnapshot, now: number, isDesktop: boolean) {
  const { Box, Text } = els
  if (!hasAnyData(snapshot)) {
    return (
      <Box>
        <Text dimColor>{WAITING_TEXT}</Text>
      </Box>
    )
  }
  if (isDesktop && 'Svg' in els) {
    const { Svg } = els
    const { svg, width } = usageStrip(snapshot, now)
    return (
      <Box key="usage-strip">
        <Svg source={svg} alt={STRIP_ALT} width={width} height={STRIP_HEIGHT} isInteractive />
      </Box>
    )
  }
  return (
    <Box key="usage-line">
      <Text>{terminalLine(snapshot, now)}</Text>
    </Box>
  )
}

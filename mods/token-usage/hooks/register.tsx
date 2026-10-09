// token-usage：在輸入框上方顯示 5h／7d 額度、本 session 的 token 加總與估算花費。
// 額度與花費來自 session.measure，token 來自每輪的 turn.complete；不額外呼叫模型。
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { EMPTY_SNAPSHOT, REDRAW_MS, addTurnTokens, applyMeasure } from './usage'
import { UsageBand } from './view'

const snapshotAtom = atom({ plugin: 'token-usage', key: 'snapshot' } as const, EMPTY_SNAPSHOT)
const tickAtom = atom({ plugin: 'token-usage', key: 'tick' } as const, 0)

export const register: Register = on => {
  // 定時重畫，讓重置倒數與時間標記持續走動
  on('session.start', async ($, e, next) => {
    $.clock.every(REDRAW_MS, () => void update($, tickAtom, n => n + 1))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, snapshotAtom, snapshot => applyMeasure(snapshot, e.rateLimits, e.cost?.usd))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const usage = e.usage
    if (usage) await update($, snapshotAtom, snapshot => addTurnTokens(snapshot, usage))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    await read($, tickAtom) // 只為了訂閱定時重畫
    return UsageBand($.ui.resolve(e), await read($, snapshotAtom), await $.clock.now(), e.surface === 'desktop')
  })
}

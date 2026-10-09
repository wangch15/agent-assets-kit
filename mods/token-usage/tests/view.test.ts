// 整合測試：啟動 session、送進額度讀數與一輪 token 用量，在 desktop／terminal 畫輸入框上方的用量條
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const USAGE = {
  input_tokens: 1_000,
  output_tokens: 250,
  cache_read_input_tokens: 4_000,
  cache_creation_input_tokens: 500,
  model: 'claude-opus-5-5',
}

test('等第一次回應前顯示提示，之後顯示額度、token 與花費', async ($, on) => {
  mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => null as never)

  await $.session.start({ cwd: '/tmp/project', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'token-usage', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /等第一次回應/ })).toBeDefined()
    await ui.unmount()
  }

  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 42 },
      { kind: 'seven_day', percentUsed: 80 },
    ],
    cost: { usd: 0.75 },
    changed: ['rateLimits', 'cost'],
  })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: USAGE })

  const terminal = await $.ui.mount({ plugin: 'token-usage', surface: 'terminal', ...BAND })
  const line = (await terminal.find({ type: 'Text', text: /⇧/ }))?.text ?? ''
  expect(line).toContain('42%')
  expect(line).toContain('80%')
  expect(line).toContain('⇧ 1.5k  ⇩ 250  ▤ 4.0k')
  expect(line).toContain('$0.75')
  await terminal.unmount()

  const desktop = await $.ui.mount({ plugin: 'token-usage', surface: 'desktop', ...BAND })
  const strip = await desktop.find({ type: 'Svg' })
  const source = String((strip as { props?: { source?: unknown } } | undefined)?.props?.source ?? '')
  expect(source).toContain('5 小時工作階段額度：已用 42%')
  expect(source).toContain('$0.75')
  await desktop.unmount()
})

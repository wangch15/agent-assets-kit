// 整合測試：模擬 ~/.claude/sessions 註冊表與 ps，啟動 session 後在 desktop／terminal 畫看板
import { expect, mock, test } from 'claude-code/testing'

const HOME = '/Users/me'
const SESSIONS = `${HOME}/.claude/sessions`

const FILES: Readonly<Record<string, string>> = {
  [`${SESSIONS}/1.json`]: JSON.stringify({
    pid: 1,
    sessionId: 'self',
    cwd: '/Users/me/GitHub/bd2db',
    entrypoint: 'claude-desktop',
    name: '多帳號 session 監控面板',
    nameSource: 'user',
    status: 'busy',
    hostSessionId: 'local_self',
    statusUpdatedAt: 10,
  }),
  [`${SESSIONS}/2.json`]: JSON.stringify({
    pid: 2,
    sessionId: 'orca',
    cwd: '/Users/me/GitHub/travel-planner',
    entrypoint: 'cli',
    name: 'travel-planner-1c',
    nameSource: 'derived',
    status: 'waiting',
    statusUpdatedAt: 20,
  }),
  [`${SESSIONS}/3.json`]: JSON.stringify({
    pid: 3,
    sessionId: 'dead',
    cwd: '/x',
    entrypoint: 'cli',
    name: '已結束',
    nameSource: 'user',
    status: 'idle',
  }),
  [`${HOME}/.claude.json`]: JSON.stringify({
    oauthAccount: { accountUuid: 'uuid-b', emailAddress: 'bob@x.com', displayName: 'Bob' },
  }),
}

type Entry = { name: string; kind: 'file' | 'dir'; size: number; mtimeMs: number; isLink: boolean }

function listing(path: string): Entry[] {
  const entry = (name: string, kind: 'file' | 'dir'): Entry => ({ name, kind, size: 1, mtimeMs: 1, isLink: false })
  if (path === SESSIONS) return ['1.json', '2.json', '3.json', '1.abc.key'].map(n => entry(n, 'file'))
  if (path.endsWith('claude-code-sessions')) return [entry('uuid-a', 'dir')]
  return [entry('org', 'dir')]
}

function runResult(argv: readonly string[]) {
  const [cmd, ...args] = argv
  const stdout =
    cmd === 'ps' && args[0] === '-p'
      ? '    1\n    2\n'
      : cmd === 'ps' && args[0] === '-E'
        ? 'claude ORCA_TERMINAL_HANDLE=term_42 HOME=/Users/me'
        : cmd === 'awk'
          ? '\n景點卡片排版\n'
          : ''
  return { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false }
}

/** badge 外層 Box 底下那個 Svg 的 alt */
function badgeAlt(found: { children: unknown[] } | undefined): unknown {
  const svg = found?.children[0] as { props?: { alt?: unknown } } | undefined
  return svg?.props?.alt
}

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('列出所有活著的 session，依用戶分組，可開合', async ($, on) => {
  mock.clock(on)
  mock.store(on, { accounts: { 'uuid-a': { name: 'Alice', email: 'alice@x.com' } } })
  mock.env(on, {
    HOME,
    CLAUDE_CODE_ACCOUNT_UUID: 'uuid-a',
    CLAUDE_CODE_USER_EMAIL: 'alice@x.com',
    CLAUDE_CODE_SESSION_ID: 'self',
  })
  const logs: string[] = []
  on('ui.log', (_$, e) => {
    logs.push(JSON.stringify(e))
    return { value: undefined } as never
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { name: 'board' } }) as never)
  on('fs.list', (_$, e) => ({ value: listing(e.path) }) as never)
  on('fs.read', (_$, e) => {
    const text = FILES[e.path]
    return (text === undefined ? { deny: `ENOENT ${e.path}` } : { value: text }) as never
  })
  on('fs.exists', (_$, e) => ({
    value: e.path.endsWith('local_self.json') || e.path.endsWith('orca.jsonl'),
  }))
  on('process.run', (_$, e) => ({ value: runResult(e.argv) }) as never)
  on('ui.render', () => null as never)

  await $.session.start({ cwd: '/Users/me/GitHub/bd2db', surface: 'desktop', isInteractive: true })

  expect(logs).toEqual([])
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'session-board', surface, ...BAND })
    // 用戶名分組
    expect(await ui.find({ key: 'toggle-uuid-a' })).toBeDefined()
    expect(await ui.find({ key: 'toggle-uuid-b' })).toBeDefined()
    // 任務標題：Desktop 用自己的名稱，CLI 用 transcript 的 AI 標題；已結束的行程不出現
    expect((await ui.find({ key: 'jump-self' }))?.text).toContain('多帳號 session 監控面板')
    expect(await ui.find({ type: 'Text', text: /目前/ })).toBeDefined()
    expect((await ui.find({ key: 'jump-orca' }))?.text).toContain('景點卡片排版')
    expect(await ui.find({ key: 'jump-dead' })).toBeUndefined()
    // 環境 badge 與狀態
    // Desktop 的 badge 是 SVG 膠囊（以 alt 為文字），終端是 Text
    if (surface === 'desktop') {
      expect(badgeAlt(await ui.find({ key: 'badge-self' }))).toBe('Claude Desktop')
      expect(badgeAlt(await ui.find({ key: 'badge-orca' }))).toBe('Claude Code CLI')
    } else {
      expect(await ui.find({ type: 'Text', text: /Claude Desktop/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Claude Code CLI/ })).toBeDefined()
    }
    expect(await ui.find({ type: 'Text', text: /等你回應/ })).toBeDefined()
    // 開合用戶分組
    await ui.press({ key: 'toggle-uuid-b' })
    expect(await ui.find({ key: 'jump-orca' })).toBeUndefined()
    expect(await ui.find({ key: 'jump-self' })).toBeDefined()
    await ui.press({ key: 'toggle-uuid-b' })
    expect(await ui.find({ key: 'jump-orca' })).toBeDefined()
    // 手動移除
    if (surface === 'desktop') {
      await ui.press({ key: 'dismiss-orca' })
      expect(await ui.find({ key: 'jump-orca' })).toBeUndefined()
      expect(await ui.find({ key: 'jump-self' })).toBeDefined()
    }
    await ui.unmount()
  }
})

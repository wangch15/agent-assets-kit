import { describe, expect, test } from 'claude-code/testing'

import type { BoardEntry } from '../types'
import {
  TITLE_MAX,
  chooseTitle,
  groupByUser,
  jumpCommands,
  mapStatus,
  parseAccountCache,
  parseAlivePids,
  parseOauthAccount,
  parseOrcaHandle,
  parseProfile,
  parseRegistry,
  pickTranscriptTitle,
  projectDirName,
  shortTitle,
  sortEntries,
  toggleIn,
  statusCounts,
  dismissKey,
  parseDismissed,
  pruneDismissed,
  withoutDismissed,
} from '../hooks/board'
import { iconGroup, iconSvg } from '../hooks/icons'

const base: BoardEntry = {
  sessionId: 's1',
  pid: 100,
  env: 'desktop',
  userKey: 'uuid-a',
  userName: 'Alice',
  userHint: 'alice',
  status: 'running',
  project: 'bd2db',
  title: '首頁優化',
  hostSessionId: 'local_1',
  statusSince: 1_000,
}

const registryJson = (extra: Record<string, unknown>) =>
  JSON.stringify({
    pid: 100,
    sessionId: 's1',
    cwd: '/Users/me/GitHub/bd2db',
    entrypoint: 'claude-desktop',
    name: '首頁優化',
    nameSource: 'user',
    status: 'busy',
    statusUpdatedAt: 5,
    ...extra,
  })

describe('session 註冊表', () => {
  test('解析 Desktop 紀錄', async () => {
    const record = parseRegistry(registryJson({ hostSessionId: 'local_1' }))
    expect(record?.hostSessionId).toBe('local_1')
    expect(record?.entrypoint).toBe('claude-desktop')
  })
  test('壞資料與備用行程不採用', async () => {
    expect(parseRegistry('nope')).toBeNull()
    expect(parseRegistry(JSON.stringify({ sessionId: 's1' }))).toBeNull()
    expect(parseRegistry(registryJson({ spare: true }))).toBeNull()
  })
  test('狀態對應：busy 執行中、waiting 等你回應、idle 已完成', async () => {
    expect(mapStatus('busy')).toBe('running')
    expect(mapStatus('waiting')).toBe('needs-input')
    expect(mapStatus('idle')).toBe('done')
  })
  test('ps 輸出 → 活著的 pid', async () => {
    expect([...parseAlivePids('  100\n 200 \n\n')]).toEqual([100, 200])
  })
  test('從 ps -E 找 Orca terminal handle', async () => {
    expect(parseOrcaHandle('claude TERM=x ORCA_TERMINAL_HANDLE=term_ab-12 HOME=/u')).toBe('term_ab-12')
    expect(parseOrcaHandle('claude HOME=/u')).toBeUndefined()
  })
})

describe('任務標題', () => {
  test('使用者／Desktop 取的名稱直接用', async () => {
    const record = parseRegistry(registryJson({}))!
    expect(chooseTitle(record, 'AI 標題')).toBe('首頁優化')
  })
  test('自動推導的名稱改用 transcript 標題，沒有就用原名', async () => {
    const record = parseRegistry(registryJson({ name: 'bd2db-b7', nameSource: 'derived' }))!
    expect(chooseTitle(record, '排版修正')).toBe('排版修正')
    expect(chooseTitle(record, '')).toBe('bd2db-b7')
  })
  test('/rename 優先於 AI 標題', async () => {
    expect(pickTranscriptTitle('我的名字\nAI 標題\n')).toBe('我的名字')
    expect(pickTranscriptTitle('\nAI 標題\n')).toBe('AI 標題')
  })
  test('過長標題截斷', async () => {
    expect(shortTitle('字'.repeat(80)).length).toBe(TITLE_MAX)
  })
  test('transcript 資料夾命名', async () => {
    expect(projectDirName('/Users/me/My App.v2')).toBe('-Users-me-My-App-v2')
  })
})

describe('帳號', () => {
  test('~/.claude.json 的 CLI 帳號', async () => {
    const text = JSON.stringify({
      oauthAccount: { accountUuid: 'u1', emailAddress: 'bob@x.com', displayName: 'Bob' },
    })
    expect(parseOauthAccount(text)).toEqual({ uuid: 'u1', email: 'bob@x.com', name: 'Bob' })
    expect(parseOauthAccount('{}')).toBeNull()
  })
  test('profile 回應', async () => {
    const text = JSON.stringify({ account: { uuid: 'u2', email: 'amy@x.com', display_name: 'Amy' } })
    expect(parseProfile(text)?.name).toBe('Amy')
  })
  test('帳號快取逐筆驗證', async () => {
    expect(parseAccountCache({ a: { name: 'A', email: 'a@x' }, b: { nope: 1 } })).toEqual({
      a: { uuid: 'a', email: 'a@x', name: 'A' },
    })
    expect(parseAccountCache('bad')).toEqual({})
  })
})

describe('分組與排序', () => {
  test('依用戶分組，等你回應的用戶與 session 排前面', async () => {
    const entries: BoardEntry[] = [
      { ...base, sessionId: 'a1', status: 'running' },
      { ...base, sessionId: 'a2', status: 'done' },
      { ...base, sessionId: 'b1', userKey: 'uuid-b', userName: 'Bob', status: 'needs-input' },
    ]
    const groups = groupByUser(entries)
    expect(groups.map(g => g.userName)).toEqual(['Bob', 'Alice'])
    expect(groups[1]?.entries.map(e => e.sessionId)).toEqual(['a2', 'a1'])
  })
  test('同名用戶補上 email 帳號名', async () => {
    const groups = groupByUser([
      base,
      { ...base, sessionId: 's2', userKey: 'uuid-b', userHint: 'alice2' },
    ])
    expect(groups.map(g => g.userName)).toContain('Alice（alice）')
    expect(groups.map(g => g.userName)).toContain('Alice（alice2）')
  })
  test('沒有 session 就沒有分組', async () => {
    expect(groupByUser([])).toEqual([])
  })
  test('sortEntries 不改動原陣列；toggleIn 開合', async () => {
    const list: BoardEntry[] = [{ ...base, status: 'done' }, { ...base, sessionId: 'x', status: 'needs-input' }]
    expect(sortEntries(list)[0]?.sessionId).toBe('x')
    expect(list[0]?.status).toBe('done')
    expect(toggleIn(['a'], 'a')).toEqual([])
    expect(toggleIn([], 'a')).toEqual(['a'])
  })
})

describe('跳轉', () => {
  test('Desktop 用 hostSessionId 的深層連結', async () => {
    expect(jumpCommands(base)).toEqual([
      ['open', 'claude://code/continue?session=local_1&source=session-board'],
    ])
  })
  test('Orca 先帶到前景再切換終端', async () => {
    expect(jumpCommands({ ...base, env: 'cli', terminalHandle: 'term_1' })).toEqual([
      ['open', '-a', 'Orca'],
      ['orca', 'terminal', 'switch', '--terminal', 'term_1'],
    ])
  })
  test('一般終端的 CLI 無法跳轉', async () => {
    expect(jumpCommands({ ...base, env: 'cli', hostSessionId: undefined })).toEqual([])
  })
})

describe('手動移除', () => {
  test('移除後隱藏，狀態改變就重新出現', async () => {
    const dismissed = [dismissKey(base)]
    expect(withoutDismissed([base], dismissed)).toEqual([])
    const resumed = { ...base, status: 'running' as const, statusSince: 9_999 }
    expect(withoutDismissed([resumed], dismissed)).toEqual([resumed])
  })
  test('已結束 session 的移除紀錄會被清掉；壞資料忽略', async () => {
    expect(pruneDismissed(['s1@1000', 'gone@1'], [base])).toEqual(['s1@1000'])
    expect(parseDismissed(['a', 1, null])).toEqual(['a'])
    expect(parseDismissed('x')).toEqual([])
  })
})

describe('標題列計數', () => {
  test('依等你回應 → 執行中 → 已完成排列，數量為 0 的不列', async () => {
    const list: BoardEntry[] = [
      { ...base, sessionId: 'a', status: 'done' },
      { ...base, sessionId: 'b', status: 'needs-input' },
      { ...base, sessionId: 'c', status: 'done' },
    ]
    expect(statusCounts(list)).toEqual([
      { status: 'needs-input', count: 1 },
      { status: 'done', count: 2 },
    ])
  })
})

describe('icon', () => {
  test('執行中會轉、等你回應會呼吸、已完成靜止；顏色由呼叫端決定', () => {
    expect(iconSvg('running', '#3B82F6')).toContain('animateTransform')
    expect(iconSvg('needs-input', '#F59E0B')).toContain('<animate ')
    expect(iconSvg('done', '#22C55E')).not.toContain('animate')
    expect(iconSvg('user', '#123456')).toContain('stroke="#123456"')
  })

  test('badge 內嵌 icon 依大小縮放', () => {
    expect(iconGroup('cli', '#fff', 8, 3.5, 11)).toContain('translate(8 3.5) scale(0.6875)')
  })
})

// session-board：讀 Claude Code 自己維護的 session 註冊表（~/.claude/sessions/<pid>.json），
// 在 prompt 上方依「用戶」分組列出這台電腦所有進行中的 session（Desktop 與 CLI 皆可），點擊即跳轉。
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BoardEntry } from '../types'
import type { Account, RegistryRecord } from './board'
import {
  POLL_MS,
  TITLE_AWK,
  TITLE_TTL_MS,
  accountLabel,
  basename,
  chooseTitle,
  detectEnv,
  dismissKey,
  emailLocalPart,
  jumpCommands,
  mapStatus,
  parseAccountCache,
  parseAlivePids,
  parseDismissed,
  parseOauthAccount,
  parseOrcaHandle,
  parseProfile,
  parseRegistry,
  pickTranscriptTitle,
  projectDirName,
  pruneDismissed,
  toggleIn,
  withoutDismissed,
} from './board'
import { BoardView } from './view'

const entriesAtom = atom({ plugin: 'session-board', key: 'entries' } as const, [])
const selfIdAtom = atom({ plugin: 'session-board', key: 'selfId' } as const, '')
const collapsedAtom = atom({ plugin: 'session-board', key: 'isCollapsed' } as const, false)
const collapsedUsersAtom = atom({ plugin: 'session-board', key: 'collapsedUsers' } as const, [])
const dismissedAtom = atom({ plugin: 'session-board', key: 'dismissed' } as const, [])

/** Orca CLI 可能的位置（desktop app 啟動的行程 PATH 不一定包含） */
const ORCA_FALLBACKS: readonly string[] = ['/usr/local/bin/orca', '/opt/homebrew/bin/orca']
const PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile'
const ACCOUNT_CACHE_KEY = 'accounts'
const DISMISSED_KEY = 'dismissed'
const DESKTOP_SESSIONS = 'Library/Application Support/Claude/claude-code-sessions'

type $ = EngineInterface
type CachedTitle = { readonly title: string; readonly checkedAt: number }

// 模組變數只是快取；hot reload 後由 session.start 重建
let home = ''
let lastSerialized = ''
let isPolling = false
let accounts: Readonly<Record<string, Account>> = {}
let cliAccountUuid = ''
let titleCache: ReadonlyMap<string, CachedTitle> = new Map()
let hostAccountCache: ReadonlyMap<string, string> = new Map()
let handleCache: ReadonlyMap<number, string | null> = new Map()

async function runText($: $, argv: readonly string[]): Promise<string> {
  try {
    const result = await $.process.run(argv, { timeoutMs: 5_000 })
    return result.stdout
  } catch {
    return ''
  }
}

async function readRegistry($: $): Promise<RegistryRecord[]> {
  const dir = `${home}/.claude/sessions`
  try {
    const files = (await $.fs.list(dir)).filter(f => f.kind === 'file' && f.name.endsWith('.json'))
    const records = await Promise.all(files.map(f => readRecord($, `${dir}/${f.name}`)))
    return records.filter((r): r is RegistryRecord => r !== null)
  } catch {
    return []
  }
}

async function readRecord($: $, path: string): Promise<RegistryRecord | null> {
  try {
    return parseRegistry(await $.fs.read(path))
  } catch {
    return null
  }
}

/** 註冊表會留下已結束行程的檔案：用 ps 確認 pid 還活著 */
async function filterAlive($: $, records: readonly RegistryRecord[]): Promise<RegistryRecord[]> {
  if (records.length === 0) return []
  const output = await runText($, ['ps', '-p', records.map(r => r.pid).join(','), '-o', 'pid='])
  const alive = parseAlivePids(output)
  return records.filter(r => alive.has(r.pid))
}

/** 帳號：快取 + CLI 的 ~/.claude.json + 本 session 自己的帳號（Desktop 由 profile 查名字） */
async function loadAccounts($: $): Promise<void> {
  const cached = parseAccountCache(await $.store.get(ACCOUNT_CACHE_KEY))
  const cli = await readCliAccount($)
  const own = await resolveOwnAccount($, cached)
  cliAccountUuid = cli?.uuid ?? ''
  accounts = {
    ...cached,
    ...(cli ? { [cli.uuid]: cli } : {}),
    ...(own ? { [own.uuid]: own } : {}),
  }
  await $.store.set(ACCOUNT_CACHE_KEY, accounts)
}

async function readCliAccount($: $): Promise<Account | null> {
  try {
    return parseOauthAccount(await $.fs.read(`${home}/.claude.json`))
  } catch {
    return null
  }
}

async function resolveOwnAccount($: $, cached: Readonly<Record<string, Account>>): Promise<Account | null> {
  const uuid = await $.env.get('CLAUDE_CODE_ACCOUNT_UUID')
  if (!uuid) return null
  const known = cached[uuid]
  if (known) return known
  const email = (await $.env.get('CLAUDE_CODE_USER_EMAIL')) ?? ''
  const profile = await fetchProfile($)
  if (profile && profile.uuid === uuid) return profile
  return { uuid, email, name: email ? emailLocalPart(email) : `帳號 ${uuid.slice(0, 8)}` }
}

async function fetchProfile($: $): Promise<Account | null> {
  try {
    const auth = await $.session.authorize()
    if (!auth?.handle) return null
    const response = await $.http.fetch(PROFILE_URL, {
      auth: auth.handle,
      headers: { 'anthropic-beta': 'oauth-2025-04-20' },
    })
    return response.ok ? parseProfile(response.text) : null
  } catch (error) {
    $.ui.log(`session-board: 查詢用戶資料失敗：${String(error)}`)
    return null
  }
}

/** Desktop session 屬於哪個帳號：claude-code-sessions/<帳號>/<組織>/<hostSessionId>.json */
async function desktopAccountOf($: $, hostSessionId: string): Promise<string> {
  const cached = hostAccountCache.get(hostSessionId)
  if (cached !== undefined) return cached
  const root = `${home}/${DESKTOP_SESSIONS}`
  let found = ''
  try {
    for (const account of await $.fs.list(root)) {
      if (account.kind !== 'dir') continue
      for (const org of await $.fs.list(`${root}/${account.name}`)) {
        if (org.kind === 'dir' && (await $.fs.exists(`${root}/${account.name}/${org.name}/${hostSessionId}.json`))) {
          found = account.name
        }
      }
    }
  } catch {
    found = ''
  }
  hostAccountCache = new Map([...hostAccountCache, [hostSessionId, found]])
  return found
}

/** CLI 的 AI 標題在 transcript 裡，用 awk 撈最後一筆；有快取避免每次都掃 */
async function transcriptTitleOf($: $, record: RegistryRecord, now: number): Promise<string> {
  if (record.nameSource !== 'derived' && record.name) return ''
  const cached = titleCache.get(record.sessionId)
  if (cached && now - cached.checkedAt < TITLE_TTL_MS) return cached.title
  const path = `${home}/.claude/projects/${projectDirName(record.cwd)}/${record.sessionId}.jsonl`
  const title = (await $.fs.exists(path)) ? pickTranscriptTitle(await runText($, ['awk', TITLE_AWK, path])) : ''
  titleCache = new Map([...titleCache, [record.sessionId, { title, checkedAt: now }]])
  return title
}

/** Orca 終端裡的 CLI：從行程環境變數拿 terminal handle（同一個 pid 不會變，快取起來） */
async function orcaHandleOf($: $, pid: number): Promise<string | undefined> {
  const cached = handleCache.get(pid)
  if (cached !== undefined) return cached ?? undefined
  const handle = parseOrcaHandle(await runText($, ['ps', '-E', '-p', String(pid), '-o', 'command=']))
  handleCache = new Map([...handleCache, [pid, handle ?? null]])
  return handle
}

async function toEntry($: $, record: RegistryRecord, now: number): Promise<BoardEntry> {
  const env = detectEnv(record.entrypoint)
  const userKey =
    env === 'desktop' && record.hostSessionId
      ? (await desktopAccountOf($, record.hostSessionId)) || 'unknown'
      : cliAccountUuid || 'unknown'
  const account = accounts[userKey]
  const terminalHandle = env === 'cli' ? await orcaHandleOf($, record.pid) : undefined
  return {
    sessionId: record.sessionId,
    pid: record.pid,
    env,
    userKey,
    userName: accountLabel(accounts, userKey),
    userHint: account?.email ? emailLocalPart(account.email) : userKey.slice(0, 6),
    status: mapStatus(record.status),
    project: basename(record.cwd),
    title: chooseTitle(record, await transcriptTitleOf($, record, now)),
    ...(record.hostSessionId ? { hostSessionId: record.hostSessionId } : {}),
    ...(terminalHandle ? { terminalHandle } : {}),
    statusSince: record.statusUpdatedAt,
  }
}

async function refresh($: $): Promise<void> {
  if (!home || isPolling) return
  isPolling = true
  try {
    const now = await $.clock.now()
    const records = await filterAlive($, await readRegistry($))
    const all = await Promise.all(records.map(r => toEntry($, r, now)))
    // 移除紀錄存在 store，各 session 共用；每次輪詢同步一次
    const dismissed = pruneDismissed(parseDismissed(await $.store.get(DISMISSED_KEY)), all)
    const entries = withoutDismissed(all, dismissed)
    const serialized = JSON.stringify(entries)
    if (serialized !== lastSerialized) {
      lastSerialized = serialized
      await update($, entriesAtom, () => entries)
      await update($, dismissedAtom, () => dismissed)
    }
  } catch (error) {
    $.ui.log(`session-board: 讀取 session 失敗：${String(error)}`)
  } finally {
    isPolling = false
  }
}

async function dismiss($: $, entry: BoardEntry): Promise<void> {
  const key = dismissKey(entry)
  const stored = parseDismissed(await $.store.get(DISMISSED_KEY))
  const next = stored.includes(key) ? stored : [...stored, key]
  await $.store.set(DISMISSED_KEY, next)
  await update($, dismissedAtom, () => next)
  await update($, entriesAtom, list => withoutDismissed(list, next))
  lastSerialized = ''
}

async function runJump($: $, entry: BoardEntry): Promise<void> {
  const commands = jumpCommands(entry)
  if (commands.length === 0) {
    $.ui.toast('這個 session 不在 Claude Desktop 或 Orca 裡，無法跳轉')
    return
  }
  for (const argv of commands) {
    if (!(await tryRun($, argv))) {
      $.ui.toast(`跳轉失敗：${argv.join(' ')}`)
      return
    }
  }
}

async function tryRun($: $, argv: readonly string[]): Promise<boolean> {
  const candidates =
    argv[0] === 'orca' ? [argv, ...ORCA_FALLBACKS.map(bin => [bin, ...argv.slice(1)])] : [argv]
  for (const candidate of candidates) {
    try {
      const result = await $.process.run(candidate, { timeoutMs: 5_000 })
      if (result.exitCode === 0) return true
    } catch {
      // 找不到執行檔就試下一個
    }
  }
  return false
}

async function start($: $): Promise<void> {
  home = (await $.env.get('HOME')) ?? ''
  await loadAccounts($)
  const id = await ownSessionId($)
  await update($, selfIdAtom, () => id)
  await refresh($)
}

/** 標示「目前」用：只影響顯示，拿不到就算了 */
async function ownSessionId($: $): Promise<string> {
  try {
    return (await $.env.get('CLAUDE_CODE_SESSION_ID')) || (await $.session.id())
  } catch {
    return ''
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await start($)
    } catch (error) {
      $.ui.log(`session-board: 初始化失敗：${String(error)}`)
    }
    $.clock.every(POLL_MS, () => void refresh($))
    await $.command.register({ name: 'board', description: '收合／展開 session 看板' })
    return next(e)
  })

  on('command.run', { command: 'board' }, async $ => {
    const isCollapsed = await read($, collapsedAtom)
    await update($, collapsedAtom, () => !isCollapsed)
    return { text: isCollapsed ? 'Session 看板已展開' : 'Session 看板已收合' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const entries = await read($, entriesAtom)
    if (e.props.hasSurvey || entries.length === 0) return next(e)
    return BoardView(
      $.ui.resolve(e),
      {
        entries,
        selfId: await read($, selfIdAtom),
        isCollapsed: await read($, collapsedAtom),
        collapsedUsers: await read($, collapsedUsersAtom),
        onToggleBoard: () => update($, collapsedAtom, v => !v),
        onToggleUser: userKey => update($, collapsedUsersAtom, list => toggleIn(list, userKey)),
        onJump: entry => runJump($, entry),
        onDismiss: entry => dismiss($, entry),
      },
      e.surface === 'desktop',
    )
  })
}

// 純邏輯：解析 Claude Code 的 session 註冊表、帳號、標題，分組排序與跳轉指令。不碰 `$`，方便測試。
import type { BoardEntry, SessionEnv, SessionStatus } from '../types'

/** 讀取看板的間隔 */
export const POLL_MS = 3_000
/** CLI 的 AI 標題多久重新讀一次 transcript */
export const TITLE_TTL_MS = 30_000
/** 標題最長字數 */
export const TITLE_MAX = 48

export const ENV_LABEL: Readonly<Record<SessionEnv, string>> = {
  desktop: 'Claude Desktop',
  cli: 'Claude Code CLI',
}

export const STATUS_TEXT: Readonly<Record<SessionStatus, string>> = {
  'needs-input': '等你回應',
  running: '執行中',
  done: '已完成',
}

/** 排序權重：需要你的排最前面 */
const STATUS_RANK: Readonly<Record<SessionStatus, number>> = {
  'needs-input': 0,
  done: 1,
  running: 2,
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** ~/.claude/sessions/<pid>.json：每個 Claude Code 行程（Desktop 與 CLI）都會維護 */
export type RegistryRecord = {
  readonly pid: number
  readonly sessionId: string
  readonly cwd: string
  readonly entrypoint: string
  readonly name: string
  readonly nameSource: string
  readonly status: string
  readonly hostSessionId?: string
  readonly statusUpdatedAt: number
}

/** 註冊表檔案是外部資料：驗證後才採用；備用行程（spare）不列出 */
export function parseRegistry(text: string): RegistryRecord | null {
  try {
    const r = asRecord(JSON.parse(text))
    if (!r || r.spare === true) return null
    if (typeof r.pid !== 'number' || typeof r.sessionId !== 'string') return null
    const hostSessionId = asText(r.hostSessionId)
    return {
      pid: r.pid,
      sessionId: r.sessionId,
      cwd: asText(r.cwd),
      entrypoint: asText(r.entrypoint),
      name: asText(r.name),
      nameSource: asText(r.nameSource),
      status: asText(r.status),
      ...(hostSessionId ? { hostSessionId } : {}),
      statusUpdatedAt: typeof r.statusUpdatedAt === 'number' ? r.statusUpdatedAt : 0,
    }
  } catch {
    return null
  }
}

export function detectEnv(entrypoint: string): SessionEnv {
  return entrypoint === 'claude-desktop' ? 'desktop' : 'cli'
}

/** 註冊表的 status：busy／waiting／idle */
export function mapStatus(status: string): SessionStatus {
  if (status === 'waiting') return 'needs-input'
  if (status === 'busy') return 'running'
  return 'done'
}

/** `ps -p a,b -o pid=` 的輸出 → 還活著的 pid */
export function parseAlivePids(output: string): Set<number> {
  return new Set(
    output
      .split('\n')
      .map(line => Number.parseInt(line.trim(), 10))
      .filter(pid => Number.isInteger(pid) && pid > 0),
  )
}

/** `ps -E` 的輸出裡找 Orca 的 terminal handle */
export function parseOrcaHandle(output: string): string | undefined {
  return /ORCA_TERMINAL_HANDLE=(term_[A-Za-z0-9-]+)/.exec(output)?.[1]
}

export function basename(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts.at(-1) ?? path
}

export function shortTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= TITLE_MAX) return oneLine
  return `${oneLine.slice(0, TITLE_MAX - 1)}…`
}

export function emailLocalPart(email: string): string {
  return email.split('@')[0] ?? email
}

/** Claude Code 存 transcript 的資料夾名稱：非英數字元換成 - */
export function projectDirName(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

/** 從 transcript 找最後的 customTitle（/rename）與 aiTitle，輸出兩行 */
export const TITLE_AWK =
  'match($0,/"customTitle":"[^"]*"/){c=substr($0,RSTART+15,RLENGTH-16)} ' +
  'match($0,/"aiTitle":"[^"]*"/){a=substr($0,RSTART+11,RLENGTH-12)} ' +
  'END{print c; print a}'

/** 解析 TITLE_AWK 的輸出：/rename 優先，其次 AI 標題 */
export function pickTranscriptTitle(output: string): string {
  const [custom = '', ai = ''] = output.split('\n').map(s => s.trim())
  return custom || ai
}

/** 註冊表的名稱若是使用者或 Desktop 取的就直接用；自動推導的（如 bd2db-b7）改用 transcript 標題 */
export function chooseTitle(record: RegistryRecord, transcriptTitle: string): string {
  const isDerived = record.nameSource === 'derived' || !record.name
  const title = isDerived ? transcriptTitle || record.name : record.name
  return shortTitle(title || basename(record.cwd))
}

export type Account = { readonly uuid: string; readonly email: string; readonly name: string }

/** ~/.claude.json 的 oauthAccount：CLI 登入的帳號 */
export function parseOauthAccount(text: string): Account | null {
  try {
    const account = asRecord(asRecord(JSON.parse(text))?.oauthAccount)
    const uuid = asText(account?.accountUuid)
    const email = asText(account?.emailAddress)
    if (!uuid) return null
    const name = asText(account?.displayName) || asText(account?.fullName) || emailLocalPart(email)
    return { uuid, email, name }
  } catch {
    return null
  }
}

/** /api/oauth/profile 的回應 */
export function parseProfile(text: string): Account | null {
  try {
    const account = asRecord(asRecord(JSON.parse(text))?.account)
    const uuid = asText(account?.uuid)
    const email = asText(account?.email) || asText(account?.email_address)
    const name = asText(account?.display_name) || asText(account?.full_name) || emailLocalPart(email)
    return uuid && name ? { uuid, email, name } : null
  } catch {
    return null
  }
}

/** $.store 裡的帳號快取：外部資料，逐筆驗證 */
export function parseAccountCache(raw: unknown): Readonly<Record<string, Account>> {
  const record = asRecord(raw)
  if (!record) return {}
  return Object.fromEntries(
    Object.entries(record).flatMap(([uuid, value]) => {
      const v = asRecord(value)
      const name = asText(v?.name)
      return name ? [[uuid, { uuid, email: asText(v?.email), name }]] : []
    }),
  )
}

export function accountLabel(accounts: Readonly<Record<string, Account>>, uuid: string): string {
  return accounts[uuid]?.name || (uuid ? `帳號 ${uuid.slice(0, 8)}` : '未知用戶')
}

export function sortEntries(entries: readonly BoardEntry[]): BoardEntry[] {
  return [...entries].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.statusSince - a.statusSince,
  )
}

/** 標題列用：各狀態的數量，依「等你回應 → 執行中 → 已完成」排列，0 的不列 */
export function statusCounts(entries: readonly BoardEntry[]): { status: SessionStatus; count: number }[] {
  const order: readonly SessionStatus[] = ['needs-input', 'running', 'done']
  return order
    .map(status => ({ status, count: entries.filter(e => e.status === status).length }))
    .filter(item => item.count > 0)
}

export function countNeedsInput(entries: readonly BoardEntry[]): number {
  return entries.filter(e => e.status === 'needs-input').length
}

export type UserGroup = {
  readonly userKey: string
  readonly userName: string
  readonly userHint: string
  readonly entries: readonly BoardEntry[]
  readonly needsInput: number
}

/** 依用戶分組；沒有 session 的用戶自然不會出現。有事等你的用戶排前面 */
export function groupByUser(entries: readonly BoardEntry[]): UserGroup[] {
  const keys = [...new Set(entries.map(e => e.userKey))]
  const groups = keys.map(userKey => {
    const own = sortEntries(entries.filter(e => e.userKey === userKey))
    return {
      userKey,
      userName: own[0]?.userName ?? userKey,
      userHint: own[0]?.userHint || userKey.slice(0, 6),
      entries: own,
      needsInput: countNeedsInput(own),
    }
  })
  return disambiguateNames(groups).sort(
    (a, b) => b.needsInput - a.needsInput || a.userName.localeCompare(b.userName),
  )
}

/** 兩個帳號顯示名稱相同時，補上 email 帳號名以便區分 */
function disambiguateNames(groups: readonly UserGroup[]): UserGroup[] {
  return groups.map(group => {
    const isDuplicate = groups.some(
      other => other.userKey !== group.userKey && other.userName === group.userName,
    )
    return isDuplicate ? { ...group, userName: `${group.userName}（${group.userHint}）` } : group
  })
}

export function toggleIn(list: readonly string[], key: string): string[] {
  return list.includes(key) ? list.filter(k => k !== key) : [...list, key]
}

/** 跳轉要執行的指令（每個都是 argv，不經 shell） */
export function jumpCommands(entry: BoardEntry): string[][] {
  if (entry.terminalHandle) {
    return [
      ['open', '-a', 'Orca'],
      ['orca', 'terminal', 'switch', '--terminal', entry.terminalHandle],
    ]
  }
  if (entry.env === 'desktop' && entry.hostSessionId) {
    const url = `claude://code/continue?session=${encodeURIComponent(entry.hostSessionId)}&source=session-board`
    return [['open', url]]
  }
  return []
}

/** 移除鍵：綁定當下的狀態時間，session 之後狀態改變（再次執行、等你回應）就會重新出現 */
export function dismissKey(entry: BoardEntry): string {
  return `${entry.sessionId}@${entry.statusSince}`
}

export function withoutDismissed(entries: readonly BoardEntry[], dismissed: readonly string[]): BoardEntry[] {
  const hidden = new Set(dismissed)
  return entries.filter(entry => !hidden.has(dismissKey(entry)))
}

/** 只保留仍對應到現存 session 的移除紀錄，避免無限累積 */
export function pruneDismissed(dismissed: readonly string[], entries: readonly BoardEntry[]): string[] {
  const live = new Set(entries.map(dismissKey))
  return dismissed.filter(key => live.has(key))
}

export function parseDismissed(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : []
}

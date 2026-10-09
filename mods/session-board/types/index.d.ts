export type SessionStatus = 'needs-input' | 'running' | 'done'

/** 執行環境：Claude Desktop 或 Claude Code CLI（Orca 終端也算 CLI） */
export type SessionEnv = 'desktop' | 'cli'

/** 看板上的一列：從 ~/.claude/sessions/<pid>.json 讀來再補上用戶名與標題 */
export type BoardEntry = {
  sessionId: string
  pid: number
  env: SessionEnv
  /** 用戶識別（帳號 uuid），分組用 */
  userKey: string
  /** 顯示用的用戶名 */
  userName: string
  /** 同名用戶時用來區分（email 的 @ 前段） */
  userHint: string
  status: SessionStatus
  /** 專案資料夾名稱 */
  project: string
  /** 任務標題 */
  title: string
  /** 跳轉用：Claude Desktop 的 session id（local_…） */
  hostSessionId?: string
  /** 跳轉用：Orca 的 terminal handle */
  terminalHandle?: string
  statusSince: number
}

declare module 'claude-code' {
  interface PluginState {
    'session-board': {
      entries: readonly BoardEntry[]
      selfId: string
      collapsedUsers: readonly string[]
      /** 手動移除的 session（sessionId@statusSince），狀態再變就會重新出現 */
      dismissed: readonly string[]
    }
  }
}

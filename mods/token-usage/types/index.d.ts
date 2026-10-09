/** 一個額度視窗（5 小時或 7 天）的最新讀數 */
export type UsageWindow = {
  /** 0～100，可能有一位小數 */
  percentUsed: number
  /** 重置時間，ISO 8601 */
  resetsAt?: string
}

/** 本 session 的 token 加總 */
export type TokenTotals = {
  /** 未快取的輸入＋寫入快取的輸入 */
  input: number
  output: number
  /** 從提示快取讀取的輸入 */
  cacheRead: number
}

export type UsageSnapshot = {
  fiveHour: UsageWindow | null
  sevenDay: UsageWindow | null
  /** 引擎估算的花費（美元）；沒有帳本時是 null */
  costUsd: number | null
  tokens: TokenTotals
}

declare module 'claude-code' {
  interface PluginState {
    'token-usage': {
      snapshot: UsageSnapshot
      /** 每隔一段時間 +1，讓倒數與時間標記重畫 */
      tick: number
    }
  }
}

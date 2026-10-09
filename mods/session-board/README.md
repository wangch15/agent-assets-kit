# session-board

Claude Code mod：在每個 session 的右側 Pane（側邊欄）顯示一個看板，依「用戶（帳號）」分組列出這台電腦上所有進行中的 Claude Code session，包括 Claude Desktop 和 CLI（例如 Orca 終端）。點擊任一列就能跳到那個 session。

- **任務標題：**
  - Desktop 用 app 裡的 session 標題。
  - CLI 用 `/rename` 的名稱，沒有的話用 transcript 裡 AI 產生的標題。
- **狀態：** 等你回應、執行中、已完成（各有顏色與 icon；執行中會轉、等你回應會呼吸），標題列顯示各狀態數量。
- **Icon：** Desktop 用 SVG 線條 icon（看板、用戶、專案資料夾、環境、狀態）；終端改用不會被畫成 emoji 的字元（`◆` 等你回應、`●` 執行中、`✓` 已完成）。
- **環境 badge：** `Claude Desktop`／`Claude Code CLI`。
- **位置：** 右側 Pane。session 啟動時自動打開：Desktop 與 144 欄以上的全螢幕終端會直接擺在右側，較窄的終端要打 `/board` 才會出現。Pane 右上角的關閉鈕或 `/board` 可關閉。
- **開合：** 每個用戶分組都可以開合。
- **移除：** 每列的 `✕` 可以手動移除該列，該 session 之後狀態改變（再次執行或需要你回應）會自動重新出現。
- **跳轉：**
  - Desktop session 開啟 `claude://code/continue?session=<hostSessionId>`。
  - Orca 裡的 CLI session 執行 `orca terminal switch --terminal <handle>`。
  - 一般終端機裡的 CLI 無法跳轉，只會提示。

## 運作方式

mod 不需要每個 session 自己回報狀態，而是每 3 秒讀 Claude Code 自己維護的 session 註冊表：

| 資料 | 來源 |
| --- | --- |
| session 清單、狀態（`busy`／`waiting`／`idle`）、名稱、cwd | `~/.claude/sessions/<pid>.json` |
| 行程是否還活著 | `ps -p <pids> -o pid=` |
| Desktop session 屬於哪個帳號 | `~/Library/Application Support/Claude/claude-code-sessions/<帳號 uuid>/<組織>/<hostSessionId>.json` |
| CLI 的帳號與顯示名稱 | `~/.claude.json` 的 `oauthAccount` |
| Desktop 帳號的顯示名稱 | session 憑證呼叫 `https://api.anthropic.com/api/oauth/profile`，查不到就用 email `@` 前段；結果快取在 mod 的 `$.store`（key `accounts`） |
| CLI 的 AI 標題 | `awk` 從 `~/.claude/projects/<cwd 轉成 - 的資料夾>/<sessionId>.jsonl` 撈最後一筆 `customTitle`／`aiTitle` |
| Orca terminal handle | `ps -E -p <pid>` 讀行程環境變數 `ORCA_TERMINAL_HANDLE` |

移除紀錄存在 `$.store`（key `dismissed`），所有 session 共用。

## 檔案

```text
mods/session-board/
  .claude-plugin/plugin.json   # mod manifest
  hooks/hooks.json             # 指向 register.tsx
  hooks/register.tsx           # 讀取 session、補用戶名與標題、跳轉
  hooks/view.tsx               # 看板畫面與樣式（Desktop／terminal 各自調整）
  hooks/icons.ts               # SVG 線條 icon 與終端替代字元
  hooks/board.ts               # 純邏輯：解析、分組、排序、移除、跳轉指令
  types/index.d.ts             # $.state 型別契約
  tests/*.test.ts              # claude plugin test 跑的測試
```

## 安裝（給在新機器上處理安裝的 agent）

1. 確認 Claude Code 版本，並在新機器上驗證與測試：

   ```bash
   claude --version
   claude plugin validate <repo>/mods/session-board
   claude plugin test <repo>/mods/session-board
   ```

   這個 mod 是在 Claude Code 2.1.289～2.1.292 上開發與驗證的。function hooks API 還在 early access，版本差太多時 validate 可能報錯，請依錯誤訊息和該版本產生的型別（mod 載入後會出現在 `.claude-plugin/types/claude-code/index.d.ts`）修正。

2. 在 `~/.claude/settings.json` 的 `env` 加上 `CLAUDE_CODE_PLUGIN_DIRS`，**直接指向 repo 裡的這個資料夾**，之後 `git pull` 就會更新，不需要再複製：

   ```json
   "env": {
     "CLAUDE_CODE_PLUGIN_DIRS": "~/GitHub/agent-assets-kit/mods/session-board"
   }
   ```

   - 先讀現有的 `settings.json` 再合併，不要整個覆蓋。
   - 如果 `CLAUDE_CODE_PLUGIN_DIRS` 已經有值，用 `:` 串接（它是 path list）。
   - Claude Desktop 和終端機（含 Orca）的 claude 都讀同一份 `~/.claude/settings.json`，兩邊都會生效。

3. 新開一個 session 確認看板出現。已經開著的 session 要重開才會載入。

停用：從 `CLAUDE_CODE_PLUGIN_DIRS` 移除這個路徑，重開 session。

## 換機器時要檢查的環境差異

這個 mod 是在下面這種環境寫的，新機器不一樣的地方需要調整：

- **只支援 macOS。** 用到 `ps -E`、`open`、`~/Library/Application Support/Claude/...`。
- **Claude 設定目錄是 `~/.claude`。** 如果新機器用 `CLAUDE_CONFIG_DIR` 指到別處，`register.tsx` 裡寫死的 `~/.claude/sessions`、`~/.claude/projects`、`~/.claude.json` 要改。
- **帳號配置：** 原機器是 Claude Desktop 登入 A 帳號、終端機（Orca）的 claude 登入 B 帳號。
  - mod 不寫死帳號，而是依上表自動判斷，所以帳號配置不同也能用。
  - 但如果新機器用多個 `CLAUDE_CONFIG_DIR` 來切換 CLI 帳號，目前只會讀預設那一份 `~/.claude.json`。
- **Orca CLI 位置：** 依序找 `orca`、`/usr/local/bin/orca`、`/opt/homebrew/bin/orca`（見 `register.tsx` 的 `ORCA_FALLBACKS`）。沒裝 Orca 不影響看板，只是 CLI session 不能跳轉。
- **Desktop 深層連結：** `claude://code/continue?session=<hostSessionId>` 是從 Claude Desktop app 內部找到的，不是公開文件記載的介面；新版 app 改掉的話，跳轉會失效。
- **Pane 支援：** 看板畫在 Pane 裡。舊版 Claude Desktop 不擺 Pane（`$.ui.open` 會回 `isPlaced: false`），要更新 app；終端在 144 欄以下不會自動打開，打 `/board` 即可。
- **`awk`：** 用 macOS 內建 awk 撈標題；transcript 裡標題含跳脫的 `"` 時可能截斷。

## 開發

改完後在 mod 資料夾跑：

```bash
claude plugin validate .
claude plugin test .
```

`.claude-plugin/types/` 和 `tsconfig.json` 是 Claude Code 載入 mod 時自動產生的，已在 repo 的 `.gitignore` 排除。

# token-usage

Claude Code mod：在輸入框上方顯示一條用量列。功能參考 [letswritetw/claude-mod-token-usage](https://github.com/letswritetw/claude-mod-token-usage)，程式在本 repo 重寫。

- **5h／7d 額度：** 已用百分比、長條上的直線表示這個時段已經過了多少時間、距離重置的倒數。75% 以上變黃、90% 以上變紅。
- **Token：** 本 session 的輸入（含寫入快取）、輸出、快取讀取加總。
- **花費：** 引擎依 API 牌價估算的本 session 花費（美元）。
- **畫面：**
  - Desktop 是一排有 icon 的圓角膠囊，滑過有 tooltip。
  - 終端是一行文字：`5h ━━━┃──── 42% ↻ 3h 05m │ ⇧ 12.3k ⇩ 678 ▤ 2.5M │ $1.23`。
- 第一次回應之前只顯示「等第一次回應後顯示額度…」。5h／7d 額度只有訂閱帳號才有。

## 運作方式

不呼叫模型，也不讀檔案，只聽引擎事件：

| 資料 | 來源 |
| --- | --- |
| 5h／7d 額度、花費 | `session.measure` 的 `rateLimits`（`five_hour`、`seven_day`）與 `cost.usd` |
| token 加總 | 每輪 `turn.complete` 的 `usage` 累加（含 subagent 的輪次） |
| 倒數重畫 | `session.start` 起每 5 分鐘 `$.clock.every` 觸發一次重畫 |

數值存在 session 的 `$.state`（key `snapshot`、`tick`），hot reload 後保留；新開的 session 從 0 開始。

## 檔案

```text
mods/token-usage/
  .claude-plugin/plugin.json   # mod manifest
  hooks/hooks.json             # 指向 register.tsx
  hooks/register.tsx           # 事件 → state，AbovePrompt 畫用量列
  hooks/view.tsx               # Desktop／終端的畫面分流
  hooks/strip.ts               # Desktop 的 SVG 膠囊條（icon、長條、tooltip）
  hooks/usage.ts               # 純邏輯：讀數合併、token 加總、倒數、格式化
  types/index.d.ts             # $.state 型別契約
  tests/*.test.ts              # claude plugin test 跑的測試
```

## 安裝

1. 驗證與測試：

   ```bash
   claude plugin validate <repo>/mods/token-usage
   claude plugin test <repo>/mods/token-usage
   ```

2. 在 `~/.claude/settings.json` 的 `env.CLAUDE_CODE_PLUGIN_DIRS` 加上這個資料夾，和其他 mod 用 `:` 串接：

   ```json
   "env": {
     "CLAUDE_CODE_PLUGIN_DIRS": "~/GitHub/agent-assets-kit/mods/session-board:~/GitHub/agent-assets-kit/mods/token-usage"
   }
   ```

3. 新開一個 session，輸入框上方會出現用量列。已經開著的 session 要重開才會載入。

停用：從 `CLAUDE_CODE_PLUGIN_DIRS` 移除這個路徑，重開 session。

## 注意

- 輸入框上方（`AbovePrompt`）同時只適合放一個 mod 的畫面；`session-board` 已改到右側 Pane，兩者不衝突。
- Desktop 才畫 SVG；終端的 element table 雖然也有 `Svg`，但畫不出東西，所以以 `e.surface === 'desktop'` 判斷。
- Desktop 膠囊條的寬度是依字數估算的固定寬度，視窗很窄時可能被裁掉。

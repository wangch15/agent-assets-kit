# Agent Assets Kit

[English](README.md)

Agent Assets Kit 是一套專案本地的 agent 規則、技能、指令與知識同步工具。

它會在你的 repo 初始化 `.ai/` 作為 canonical source，並把內容同步到官方 agent 入口檔，例如 `AGENTS.md`、`CLAUDE.md`，以及 `.codex/`、`.claude/`、`.agent/`、`.agents/` 等工具專用資料夾。

它也可以把個人全域 skills 放在 `skills/`，再安裝到 Codex / Claude 的全域 skill 入口。

這個專案目前不發佈到 npm registry。建議安裝流程是把下面的 setup prompt 貼給 coding agent，讓 agent 依照目標專案現況安全初始化。

## 同步機制

Agent Assets Kit 會把人工維護的 agent assets 放在單一 canonical source，再產生或連結到各個 agent runtime 期待的位置。

- `.ai/entrypoints/project-context.md` 會成為 `AGENTS.md` 與 `CLAUDE.md` 裡的專案脈絡。
- `.ai/rules/*.md` 會被渲染進 `AGENTS.md` 與 `CLAUDE.md` 的 shared rules 區塊。
- `.ai/skills/*` 會同步到 `.agent/skills`、`.agents/skills`、`.claude/skills`、`.codex/skills`。
- `.ai/commands/*` 會複製到支援 commands 的 tool-specific 目錄。
- `scripts/sync-agent-assets.mjs` 預設優先用 symlink，同步環境不支援 symlink 時會 fallback 成 copy。
- 這個 repo 根目錄的 `skills/*` 是個人全域 skills；`scripts/install-global-skills.mjs` 會把它們 link 到 `~/.agents/skills`、`~/.codex/skills`、`~/.claude/skills`。

簡單說：專案本地知識放 `.ai/`；個人全域 skills 放這個 repo 的 `skills/`；產生出來的 entrypoints 與 tool folders 只是安裝目標。

## Skills 能力

| Skill | 位置 | 能力 |
| --- | --- | --- |
| `create-rule-folder` | `templates/default/.ai/skills/create-rule-folder` | 協助 agent 建立靠近實作的規則文件，補上短版 `.ai/rules/*-reference.md` 觸發入口，讓長期專案知識容易被找到，但不把大量內容塞進 `AGENTS.md` / `CLAUDE.md`。 |
| `delegate-low-risk-tasks` | `skills/delegate-low-risk-tasks` | 協助 agent 檢查 plan 或 spec，把高風險工作保留給主要思考模型，挑出可交給低成本 agent 的低風險工作，並產出受限的交接 prompt 與 review checklist。 |

## 快速開始

在 coding agent 裡開啟目標專案，然後貼上這段 prompt：

```text
請在這個 repository 設定 Agent Assets Kit。

請使用這個 GitHub package，不要使用 npm registry：

pnpm dlx github:wangch15/agent-assets-kit setup

請用安全流程處理初始化：

1. 確認 repository root，並執行 `git status --short`。
2. 修改任何檔案前，先檢查既有 agent files：
   - AGENTS.md
   - CLAUDE.md
   - .ai/
   - .codex/
   - .claude/
   - .agent/
   - .agents/
3. 閱讀足夠的專案資訊，用來撰寫有用的 project context：
   - README files
   - package.json 或等效專案 metadata
   - 主要 app/package folders
   - 常用 test、lint、build、dev commands
4. 先執行 dry run：

   pnpm dlx github:wangch15/agent-assets-kit setup --dry-run

5. 如果既有 AGENTS.md 或 CLAUDE.md 內有人工維護的 guidance，不要直接覆蓋。請先把相關內容搬到 `.ai/entrypoints/project-context.md` 或 `.ai/rules/*.md`，或先詢問我再繼續。
6. 執行 setup，但先不要同步 entrypoints：

   pnpm dlx github:wangch15/agent-assets-kit setup --no-sync

7. 編輯 `.ai/entrypoints/project-context.md`，讓它準確描述這個專案。
8. 只有在明確對未來 agent 有幫助時，才把專案專用 shared rules 加到 `.ai/rules/`。
9. 執行本地同步指令：

   pnpm sync:agent-assets

   如果這個專案沒有 package.json 或沒有 pnpm script，改執行：

   node scripts/sync-agent-assets.mjs

10. 執行：

   pnpm dlx github:wangch15/agent-assets-kit doctor

11. 回報 changed files、初始化後的 agent workflow 摘要，以及是否有遷移任何既有 guidance。
```

如果是 fork 或其他 GitHub owner，替換 GitHub package：

```bash
pnpm dlx github:<owner>/agent-assets-kit setup
```

## Agent Setup Prompt

這段 setup prompt 是主要安裝方式。讓 AI agent 初始化會比盲目執行 installer 更穩，因為每個專案的既有 agent files、慣例、package manager scripts、專案知識都不同。

如果要初始化其他路徑，在 prompt 裡補上這一行：

```text
目標專案路徑是：/path/to/project
```

並要求 agent 在 `setup` 與 `doctor` 指令加上 `--cwd /path/to/project`。

## 手動指令參考

如果你已經理解 setup 會做什麼，也可以自己執行：

```bash
pnpm dlx github:wangch15/agent-assets-kit setup
pnpm dlx github:wangch15/agent-assets-kit setup --dry-run
pnpm dlx github:wangch15/agent-assets-kit setup --no-sync
pnpm dlx github:wangch15/agent-assets-kit setup --force
pnpm dlx github:wangch15/agent-assets-kit sync
pnpm dlx github:wangch15/agent-assets-kit doctor
node scripts/install-global-skills.mjs --dry-run
pnpm install:global-skills
```

## Setup 會建立什麼

```text
.ai/
  README.md
  entrypoints/project-context.md
  rules/agent-asset-management-rules.md
  skills/create-rule-folder/SKILL.md
  commands/create-rule-folder.md
scripts/sync-agent-assets.mjs
AGENTS.md
CLAUDE.md
.codex/rules
.codex/skills
.claude/rules
.claude/skills
.claude/commands
.agent/rules
.agent/skills
.agents/rules
.agents/skills
```

如果目標專案有 `package.json`，setup 也會加入：

```json
{
  "scripts": {
    "sync:agent-assets": "node scripts/sync-agent-assets.mjs"
  }
}
```

setup 完成後，在目標專案內使用本地同步指令：

```bash
pnpm sync:agent-assets
```

如果該專案沒有使用 package manager：

```bash
node scripts/sync-agent-assets.mjs
```

## 全域 Skills

全域 skills 是個人跨專案共用的 skills，應該讓 Codex 與 Claude 在所有 repo 都能使用。這類內容放在本 repo 的 `skills/`，不要放進 project template；除非你確定每個新初始化的專案都應該收到一份 local copy。

目前追蹤中的全域 skill 是 `skills/delegate-low-risk-tasks`。

```text
skills/
  delegate-low-risk-tasks/
    SKILL.md
    agents/openai.yaml
scripts/install-global-skills.mjs
```

從這個 repository 安裝或更新全域 skill links：

```bash
node scripts/install-global-skills.mjs --dry-run
pnpm install:global-skills
```

installer 會把每個追蹤中的 skill symlink 到：

```text
~/.agents/skills
~/.codex/skills
~/.claude/skills
```

如果既有 skill path 要改成指向這個 repo 維護的版本，使用 `node scripts/install-global-skills.mjs --force`。

## 核心工作流

1. 所有 shared agent content 都維護在 `.ai/`。
2. 專案專用知識要放在最接近實作的位置。
3. `.ai/rules/*-reference.md` 只作為全域觸發入口，告訴未來 agent 什麼情況要讀哪些 local docs。
4. 修改 `.ai/` 後執行 sync 指令。
5. 不要手動編輯 `AGENTS.md` 或 `CLAUDE.md` 裡由 sync 產生的 shared section。

## Rule Folder Pattern

對於需要長期保存的專案知識，使用「短全域 reference + 靠近實作的 local rule index」。reference 讓 agent 找得到規則；local docs 才是 domain knowledge 的主要儲存地。

```text
<target-root>/docs/<area>-rules.md
<target-root>/docs/<area>-rules/
  open-questions.md
  <topic>.md
```

當 future agents 必須在修改相關程式前讀取這些規則時，再建立全域 agent reference：

```text
.ai/rules/<area>-rules-reference.md
```

reference 應定義觸發路徑、canonical source 與讀取順序，不應變成完整規則內容的主要儲存地。

本地 `<area>-rules.md` 應作為 local rule index，至少包含：

- 適用範圍
- 文件導覽
- 如何查找規則
- 維護原則

對於複雜區域，可額外加入導覽與歷史結構：

- `Change-Type Matrix`：依任務類型對應必讀文件。
- `cases/`：bug 背景、復現脈絡、歷史踩坑與修正決策。
- `appendix/`：長版參考、舊完整敘述、schema 範例或表格。

規則建議分類為：

- `Invariant`：不可破壞的硬規則
- `Decision`：目前採用的設計決策
- `Open Question`：尚未定義完成、agent 不應自行猜測的事項

重要 `Invariant` 與 `Decision` 應盡量附上測試或驗證步驟；若尚無自動化保護，標明 `docs-only risk`。

## 安全策略

- 建議 prompt 會要求 agent 在 sync 前先檢查既有 agent files。
- `setup --no-sync` 可以讓 agent 先客製 `.ai/entrypoints/project-context.md`，再產生 `AGENTS.md` 與 `CLAUDE.md`。
- 既有 template-managed files 預設會略過，不會覆蓋。
- 使用 `--dry-run` 預覽 setup 會寫入哪些檔案。
- 只有確定要覆蓋既有模板檔時才使用 `--force`。
- `# AGENTS.md` 或 `# CLAUDE.md` 之前的工具管理前置區塊會被保留。
- shared folders 預設優先使用 symlink；若環境不支援 symlink，sync script 會 fallback 成 copy。

## 需求

- Node.js 20+
- 使用 GitHub `dlx` 時需要 pnpm

不需要發佈到 npm registry。

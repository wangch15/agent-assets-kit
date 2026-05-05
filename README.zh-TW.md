# Agent Assets Kit

[English](README.md)

Agent Assets Kit 是一套專案本地的 agent 規則、技能、指令與知識同步工具。

它會在你的 repo 初始化 `.ai/` 作為 canonical source，並把內容同步到官方 agent 入口檔，例如 `AGENTS.md`、`CLAUDE.md`，以及 `.codex/`、`.claude/`、`.agent/`、`.agents/` 等工具專用資料夾。

這個專案目前不發佈到 npm registry。建議安裝流程是把下面的 setup prompt 貼給 coding agent，讓 agent 依照目標專案現況安全初始化。

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

## 核心工作流

1. 所有 shared agent content 都維護在 `.ai/`。
2. 專案專用知識要放在最接近實作的位置。
3. `.ai/rules/*-reference.md` 只作為全域觸發入口，告訴未來 agent 什麼情況要讀哪些 local docs。
4. 修改 `.ai/` 後執行 sync 指令。
5. 不要手動編輯 `AGENTS.md` 或 `CLAUDE.md` 裡由 sync 產生的 shared section。

## Rule Folder Pattern

對於需要長期保存的專案知識，先建立 local canonical docs：

```text
<target-root>/docs/<area>-rules.md
<target-root>/docs/<area>-rules/
  open-questions.md
  <topic>.md
```

再建立全域 agent reference：

```text
.ai/rules/<area>-rules-reference.md
```

規則建議分類為：

- `Invariant`：不可破壞的硬規則
- `Decision`：目前採用的設計決策
- `Open Question`：尚未定義完成、agent 不應自行猜測的事項

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

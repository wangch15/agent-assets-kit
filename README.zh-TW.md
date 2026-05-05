# Agent Assets Kit

[English](README.md)

Agent Assets Kit 是一套專案本地的 agent 規則、技能、指令與知識同步工具。

它會在你的 repo 初始化 `.ai/` 作為 canonical source，並把內容同步到官方 agent 入口檔，例如 `AGENTS.md`、`CLAUDE.md`，以及 `.codex/`、`.claude/`、`.agent/`、`.agents/` 等工具專用資料夾。

這個專案目前不發佈到 npm registry。請直接透過 GitHub 執行。

## 快速開始

在目標專案根目錄執行：

```bash
pnpm dlx github:wangch15/agent-assets-kit setup
```

如果是 fork 或其他 GitHub owner：

```bash
pnpm dlx github:<owner>/agent-assets-kit setup
```

初始化指定專案路徑：

```bash
pnpm dlx github:wangch15/agent-assets-kit setup --cwd /path/to/project
```

先預覽會寫入哪些檔案：

```bash
pnpm dlx github:wangch15/agent-assets-kit setup --dry-run
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

## 指令

```bash
pnpm dlx github:wangch15/agent-assets-kit setup
pnpm dlx github:wangch15/agent-assets-kit setup --dry-run
pnpm dlx github:wangch15/agent-assets-kit setup --force
pnpm dlx github:wangch15/agent-assets-kit sync
pnpm dlx github:wangch15/agent-assets-kit doctor
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

- 既有 template-managed files 預設會略過，不會覆蓋。
- 使用 `--dry-run` 預覽 setup 會寫入哪些檔案。
- 只有確定要覆蓋既有模板檔時才使用 `--force`。
- `# AGENTS.md` 或 `# CLAUDE.md` 之前的工具管理前置區塊會被保留。
- shared folders 預設優先使用 symlink；若環境不支援 symlink，sync script 會 fallback 成 copy。

## 需求

- Node.js 20+
- 使用 GitHub `dlx` 時需要 pnpm

不需要發佈到 npm registry。

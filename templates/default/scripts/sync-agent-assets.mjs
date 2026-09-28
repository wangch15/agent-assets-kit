import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultRepoRoot = path.resolve(__dirname, '..')

const RULE_TARGETS = ['.agent', '.agents', '.claude']
// Codex 的 .codex/rules/ 放的是 Starlark `.rules` 指令核准政策，不會讀 Markdown。
// 舊版把規則同步到這裡；現在只負責清掉那些副本。
const LEGACY_RULE_TARGETS = ['.codex']
const SKILL_TARGETS = ['.agent', '.agents', '.claude', '.codex']
const COMMAND_TARGETS = ['.claude']
const WORKFLOW_TARGETS = ['.agent']

// Codex 預設只讀 32 KiB 的 project instructions（config.toml 的 project_doc_max_bytes）。
const CODEX_PROJECT_DOC_MAX_BYTES = 32 * 1024

const FRONTMATTER_PATTERN = /^---\r?\n(?:([\s\S]*?)\r?\n)?---(?:\r?\n|$)/

const RULE_LOADING_NOTES = {
  claude: [
    'Claude Code loads these rules from `.claude/rules/`. Rules without `paths` frontmatter load at session start; path-scoped rules load when you read a file that matches their `paths`.',
    'Before editing files covered by a rule you have not loaded yet (for example, files you only saw in search output), read that rule file first.',
  ],
  inline: [
    "Always-on rules are included in full below. Path-scoped rules are not inlined: before reading or editing files that match a rule's paths, read that rule file.",
  ],
}

function resolveRepoPath(repoRoot, ...segments) {
  return path.join(repoRoot, ...segments)
}

function exists(targetPath, ops = fs) {
  try {
    ops.lstatSync(targetPath)
    return true
  } catch {
    return false
  }
}

function ensureDir(dirPath, ops = fs) {
  ops.mkdirSync(dirPath, { recursive: true })
}

function removePathIfExists(targetPath, ops = fs) {
  try {
    ops.lstatSync(targetPath)
    ops.rmSync(targetPath, { recursive: true, force: true })
  } catch {}
}

function syncDirectoryContents({ sourcePath, targetPath, ops = fs }) {
  ensureDir(targetPath, ops)

  const sourceEntries = new Set(ops.readdirSync(sourcePath))
  const targetEntries = new Set(ops.readdirSync(targetPath))

  for (const entry of targetEntries) {
    if (sourceEntries.has(entry)) continue
    ops.rmSync(path.join(targetPath, entry), { recursive: true, force: true })
  }

  for (const entry of sourceEntries) {
    const sourceEntryPath = path.join(sourcePath, entry)
    const targetEntryPath = path.join(targetPath, entry)
    ops.rmSync(targetEntryPath, { recursive: true, force: true })
    ops.cpSync(sourceEntryPath, targetEntryPath, {
      recursive: true,
      force: true,
      dereference: true,
    })
  }
}

function syncSharedDirectoryTarget({
  linkPath,
  sourcePath,
  targetRelativePath,
  ops = fs,
  preferCopy = false,
}) {
  if (!exists(sourcePath, ops)) return 'missing-source'
  ensureDir(path.dirname(linkPath), ops)

  try {
    const stat = ops.lstatSync(linkPath)
    if (!preferCopy && stat.isSymbolicLink()) {
      const currentTarget = ops.readlinkSync(linkPath)
      if (currentTarget === targetRelativePath) return 'symlink'
    }
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      syncDirectoryContents({ sourcePath, targetPath: linkPath, ops })
      return 'copy'
    }
    ops.rmSync(linkPath, { recursive: true, force: true })
  } catch {}

  if (!preferCopy) {
    try {
      ops.symlinkSync(targetRelativePath, linkPath, 'dir')
      return 'symlink'
    } catch {
      removePathIfExists(linkPath, ops)
    }
  }

  ops.cpSync(sourcePath, linkPath, {
    recursive: true,
    force: true,
    dereference: true,
  })
  return 'copy'
}

// 只移除同步產生的東西：指向 .ai/rules 的 symlink，或目錄內的 Markdown 檔。
// Codex 自己的 `.rules` 檔與其他內容一律保留。
function pruneLegacyRuleTarget({ targetPath, targetRelativePath, ops = fs }) {
  let stat
  try {
    stat = ops.lstatSync(targetPath)
  } catch {
    return 'absent'
  }

  if (stat.isSymbolicLink()) {
    if (ops.readlinkSync(targetPath) !== targetRelativePath) return 'kept'
    ops.unlinkSync(targetPath)
    return 'removed'
  }
  if (!stat.isDirectory()) return 'kept'

  for (const entry of ops.readdirSync(targetPath)) {
    const entryPath = path.join(targetPath, entry)
    if (!entry.endsWith('.md') || ops.lstatSync(entryPath).isDirectory()) continue
    ops.rmSync(entryPath, { force: true })
  }

  if (ops.readdirSync(targetPath).length > 0) return 'pruned'
  ops.rmdirSync(targetPath)
  return 'removed'
}

function unquote(value) {
  const trimmed = value.trim()
  const quoted = trimmed.match(/^(['"])(.*)\1$/)
  return quoted ? quoted[2] : trimmed
}

// 只在引號與 `{}` 之外的逗號切開：`*.{ts,tsx}` 這類 brace expansion 是同一個 pattern。
function splitInlineList(value) {
  const inner = unquote(value).replace(/^\[(.*)\]$/, '$1')
  const items = []
  let current = ''
  let braceDepth = 0
  let quote = null

  for (const char of inner) {
    if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '{') {
      braceDepth += 1
    } else if (char === '}') {
      braceDepth -= 1
    } else if (char === ',' && braceDepth === 0) {
      items.push(current)
      current = ''
      continue
    }
    current += char
  }

  return [...items, current].map(unquote).filter(Boolean)
}

// 只解析 `paths`：Claude Code 只讀這個欄位，其他欄位（例如 Antigravity 的 trigger）原樣保留在檔案裡。
function parseRuleFrontmatter(markdown) {
  const match = markdown.match(FRONTMATTER_PATTERN)
  if (!match) return { paths: [], body: markdown.trim() }

  const paths = []
  let isReadingPathsList = false
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const listItem = line.match(/^\s*-\s+(.+)$/)
    if (isReadingPathsList && listItem) {
      paths.push(unquote(listItem[1]))
      continue
    }

    const pathsField = line.match(/^paths:\s*(.*)$/)
    isReadingPathsList = Boolean(pathsField) && pathsField[1].trim() === ''
    if (pathsField && !isReadingPathsList) paths.push(...splitInlineList(pathsField[1]))
  }

  return { paths: paths.filter(Boolean), body: markdown.slice(match[0].length).trim() }
}

function extractPreservedPreamble(document, title) {
  const marker = `# ${title}`
  const markerIndex = document.indexOf(marker)
  if (markerIndex <= 0) return ''

  const preamble = document.slice(0, markerIndex).trimEnd()
  return preamble ? `${preamble}\n\n` : ''
}

function formatSectionTitle(fileName) {
  const base = path.basename(fileName, '.md')
  return base
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function collectMarkdownFiles(dirPath, ops = fs) {
  if (!exists(dirPath, ops)) return []
  return ops.readdirSync(dirPath)
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .sort((a, b) => a.localeCompare(b))
    .map((file) => path.join(dirPath, file))
}

function collectSkillDirs({ repoRoot = defaultRepoRoot, ops = fs } = {}) {
  const skillsDir = resolveRepoPath(repoRoot, '.ai', 'skills')
  if (!exists(skillsDir, ops)) return []
  return ops.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

function readRuleTitle(body, filePath) {
  const heading = body.split(/\r?\n/, 1)[0].match(/^#\s+(.+)$/)
  return heading ? heading[1].trim() : formatSectionTitle(filePath)
}

function readRules({ repoRoot = defaultRepoRoot, ops = fs } = {}) {
  const rulesDir = resolveRepoPath(repoRoot, '.ai', 'rules')
  return collectMarkdownFiles(rulesDir, ops).map((filePath) => {
    const { paths, body } = parseRuleFrontmatter(ops.readFileSync(filePath, 'utf8'))
    return {
      fileName: path.basename(filePath),
      sectionTitle: formatSectionTitle(filePath),
      title: readRuleTitle(body, filePath),
      paths,
      body,
    }
  })
}

function renderRuleIndexLine(rule, alwaysOnLabel) {
  const scope = rule.paths.length > 0
    ? rule.paths.map((pattern) => `\`${pattern}\``).join(', ')
    : alwaysOnLabel
  return `- \`.ai/rules/${rule.fileName}\` — ${rule.title}: ${scope}`
}

// 索引放在內嵌規則之前：Codex 超過 project_doc_max_bytes 就不再往下讀，
// 被截掉的應該是內文，而不是告訴 agent 該去讀哪份規則的索引。
function renderSharedRulesSection({
  repoRoot = defaultRepoRoot,
  ops = fs,
  inlineAlwaysOnRules = true,
} = {}) {
  const rules = readRules({ repoRoot, ops })
  const notes = inlineAlwaysOnRules ? RULE_LOADING_NOTES.inline : RULE_LOADING_NOTES.claude
  const alwaysOnLabel = inlineAlwaysOnRules ? 'always on (included below)' : 'always on'
  const inlinedSections = inlineAlwaysOnRules
    ? rules
      .filter((rule) => rule.paths.length === 0)
      .map((rule) => `## ${rule.sectionTitle}\n\n${rule.body}`)
    : []

  return [
    '## Shared Rules',
    '',
    'This section is generated from `.ai/rules/`. Do not edit it directly.',
    '',
    ...notes.flatMap((note) => [note, '']),
    '### Rule Index',
    '',
    ...rules.map((rule) => renderRuleIndexLine(rule, alwaysOnLabel)),
    ...inlinedSections.flatMap((section) => ['', section]),
  ].join('\n')
}

function renderEntryDocument({
  title,
  introLine,
  existingDocument = '',
  repoRoot = defaultRepoRoot,
  ops = fs,
  inlineAlwaysOnRules = true,
}) {
  const contextPath = resolveRepoPath(repoRoot, '.ai', 'entrypoints', 'project-context.md')
  const projectContext = exists(contextPath, ops)
    ? ops.readFileSync(contextPath, 'utf8').trim()
    : '## Project Overview\n\nAdd project context in `.ai/entrypoints/project-context.md`.'
  const sharedRules = renderSharedRulesSection({ repoRoot, ops, inlineAlwaysOnRules })
  const preservedPreamble = extractPreservedPreamble(existingDocument, title)

  return [
    preservedPreamble.trimEnd(),
    preservedPreamble ? '' : '',
    `# ${title}`,
    '',
    '> AUTO-GENERATED by `scripts/sync-agent-assets.mjs`.',
    '> Edit `.ai/entrypoints/project-context.md` and `.ai/rules/*.md`, then run `pnpm sync:agent-assets` or `node scripts/sync-agent-assets.mjs`.',
    '',
    introLine,
    '',
    projectContext,
    '',
    sharedRules,
    '',
  ].filter((line, index) => !(index === 0 && line === '')).join('\n')
}

function checkAgentsDocBudget(document) {
  const bytes = Buffer.byteLength(document, 'utf8')
  if (bytes <= CODEX_PROJECT_DOC_MAX_BYTES) return null
  return `AGENTS.md is ${bytes} bytes, over Codex's default project_doc_max_bytes (${CODEX_PROJECT_DOC_MAX_BYTES}); Codex will not read past that limit. Add \`paths\` frontmatter to large always-on rules or shorten .ai/entrypoints/project-context.md.`
}

function writeEntryDocuments({ repoRoot = defaultRepoRoot, ops = fs, ruleTargets = RULE_TARGETS } = {}) {
  const claudePath = resolveRepoPath(repoRoot, 'CLAUDE.md')
  const agentsPath = resolveRepoPath(repoRoot, 'AGENTS.md')
  const existingClaudeDoc = exists(claudePath, ops) ? ops.readFileSync(claudePath, 'utf8') : ''
  const existingAgentsDoc = exists(agentsPath, ops) ? ops.readFileSync(agentsPath, 'utf8') : ''

  // Claude Code 會自己從 .claude/rules/ 載入規則；有同步到那裡時，CLAUDE.md 只放索引，避免同一份規則載入兩次。
  const claudeDoc = renderEntryDocument({
    title: 'CLAUDE.md',
    introLine: 'This file provides shared project guidance to Claude Code when working in this repository.',
    existingDocument: existingClaudeDoc,
    repoRoot,
    ops,
    inlineAlwaysOnRules: !ruleTargets.includes('.claude'),
  })

  const agentsDoc = renderEntryDocument({
    title: 'AGENTS.md',
    introLine: 'This file provides shared project guidance to coding agents when working in this repository.',
    existingDocument: existingAgentsDoc,
    repoRoot,
    ops,
  })

  ops.writeFileSync(claudePath, claudeDoc, 'utf8')
  ops.writeFileSync(agentsPath, agentsDoc, 'utf8')

  return [checkAgentsDocBudget(agentsDoc)].filter(Boolean)
}

function syncRules({
  repoRoot = defaultRepoRoot,
  ruleTargets = RULE_TARGETS,
  legacyRuleTargets = LEGACY_RULE_TARGETS,
  ops = fs,
  preferCopy = false,
} = {}) {
  const sourcePath = resolveRepoPath(repoRoot, '.ai', 'rules')
  for (const root of ruleTargets) {
    syncSharedDirectoryTarget({
      linkPath: resolveRepoPath(repoRoot, root, 'rules'),
      sourcePath,
      targetRelativePath: '../.ai/rules',
      ops,
      preferCopy,
    })
  }

  for (const root of legacyRuleTargets) {
    if (ruleTargets.includes(root)) continue
    pruneLegacyRuleTarget({
      targetPath: resolveRepoPath(repoRoot, root, 'rules'),
      targetRelativePath: '../.ai/rules',
      ops,
    })
  }
}

function syncSkills({
  repoRoot = defaultRepoRoot,
  skillTargets = SKILL_TARGETS,
  sharedSkills = collectSkillDirs({ repoRoot }),
  ops = fs,
  preferCopy = false,
} = {}) {
  for (const root of skillTargets) {
    const skillsRootPath = resolveRepoPath(repoRoot, root, 'skills')
    ensureDir(skillsRootPath, ops)
    let preferCopyForSkills = preferCopy

    try {
      const stat = ops.lstatSync(skillsRootPath)
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        preferCopyForSkills = true
      }
    } catch {}

    for (const skill of sharedSkills) {
      syncSharedDirectoryTarget({
        linkPath: resolveRepoPath(repoRoot, root, 'skills', skill),
        sourcePath: resolveRepoPath(repoRoot, '.ai', 'skills', skill),
        targetRelativePath: `../../.ai/skills/${skill}`,
        ops,
        preferCopy: preferCopyForSkills,
      })
    }
  }
}

function syncCommands({ repoRoot = defaultRepoRoot, commandTargets = COMMAND_TARGETS, ops = fs } = {}) {
  const sourceDir = resolveRepoPath(repoRoot, '.ai', 'commands')
  const commandFiles = collectMarkdownFiles(sourceDir, ops).map((filePath) => path.basename(filePath))

  for (const root of commandTargets) {
    const targetDir = resolveRepoPath(repoRoot, root, 'commands')
    ensureDir(targetDir, ops)

    for (const file of commandFiles) {
      ops.copyFileSync(
        resolveRepoPath(repoRoot, '.ai', 'commands', file),
        resolveRepoPath(repoRoot, root, 'commands', file),
      )
    }
  }
}

function syncWorkflows({ repoRoot = defaultRepoRoot, workflowTargets = WORKFLOW_TARGETS, ops = fs, preferCopy = false } = {}) {
  const sourcePath = resolveRepoPath(repoRoot, '.ai', 'workflows')
  if (!exists(sourcePath, ops)) return

  for (const root of workflowTargets) {
    syncSharedDirectoryTarget({
      linkPath: resolveRepoPath(repoRoot, root, 'workflows'),
      sourcePath,
      targetRelativePath: '../.ai/workflows',
      ops,
      preferCopy,
    })
  }
}

function syncAgentAssets({
  repoRoot = defaultRepoRoot,
  ruleTargets = RULE_TARGETS,
  ops = fs,
  preferCopy = false,
} = {}) {
  const warnings = writeEntryDocuments({ repoRoot, ops, ruleTargets })
  syncRules({ repoRoot, ruleTargets, ops, preferCopy })
  syncSkills({ repoRoot, ops, preferCopy })
  syncCommands({ repoRoot, ops })
  syncWorkflows({ repoRoot, ops, preferCopy })
  return { warnings }
}

function main() {
  const { warnings } = syncAgentAssets()
  for (const warning of warnings) console.warn(`Warning: ${warning}`)
  console.log('Synced agent assets from .ai/')
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isDirectExecution) {
  main()
}

export {
  CODEX_PROJECT_DOC_MAX_BYTES,
  parseRuleFrontmatter,
  renderEntryDocument,
  renderSharedRulesSection,
  syncAgentAssets,
}

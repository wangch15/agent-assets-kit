import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import * as sync from '../templates/default/scripts/sync-agent-assets.mjs'

const ALWAYS_RULE = '# Reply Rules\n\nAlways reply politely.'
const SCOPED_RULE = [
  '---',
  'trigger: always_on',
  'paths:',
  '  - "apps/api/**"',
  "  - 'db/*.sql'",
  '---',
  '',
  '# API Rules',
  '',
  'Validate every API input.',
].join('\n')

function write(root, relativePath, content) {
  const filePath = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
}

const read = (root, relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

function hasEntry(root, relativePath) {
  try {
    fs.lstatSync(path.join(root, relativePath))
    return true
  } catch {
    return false
  }
}

function makeRepo(rules) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aak-sync-'))
  write(dir, '.ai/entrypoints/project-context.md', '## Project Overview\n\nContext')
  for (const [name, content] of Object.entries(rules)) write(dir, `.ai/rules/${name}`, content)
  return dir
}

test('parseRuleFrontmatter reads paths as a YAML list or a comma-separated string', () => {
  assert.deepEqual(sync.parseRuleFrontmatter(SCOPED_RULE).paths, ['apps/api/**', 'db/*.sql'])
  assert.deepEqual(
    sync.parseRuleFrontmatter('---\npaths: "src/**, lib/**"\n---\nBody').paths,
    ['src/**', 'lib/**'],
  )

  const always = sync.parseRuleFrontmatter('---\r\ntrigger: always_on\r\n---\r\n\r\n# Reply\r\n')
  assert.deepEqual(always.paths, [])
  assert.equal(always.body, '# Reply')
})

test('parseRuleFrontmatter keeps brace-expansion commas inside one pattern', () => {
  assert.deepEqual(
    sync.parseRuleFrontmatter('---\npaths: "src/**/*.{ts,tsx}, lib/**"\n---\nBody').paths,
    ['src/**/*.{ts,tsx}', 'lib/**'],
  )
  assert.deepEqual(
    sync.parseRuleFrontmatter('---\npaths: ["apps/{a,b}/**", "apps/c/**"]\n---\nBody').paths,
    ['apps/{a,b}/**', 'apps/c/**'],
  )
})

test('parseRuleFrontmatter strips an empty frontmatter block', () => {
  const parsed = sync.parseRuleFrontmatter('---\n---\n\n# Title\n\nBody')
  assert.deepEqual(parsed.paths, [])
  assert.equal(parsed.body, '# Title\n\nBody')
})

test('CLAUDE.md indexes rules instead of repeating bodies that Claude Code loads from .claude/rules', () => {
  const dir = makeRepo({ 'reply-rules.md': ALWAYS_RULE, 'api-rules.md': SCOPED_RULE })

  sync.syncAgentAssets({ repoRoot: dir })

  const claude = read(dir, 'CLAUDE.md')
  assert.doesNotMatch(claude, /Always reply politely/)
  assert.doesNotMatch(claude, /Validate every API input/)
  assert.match(claude, /`\.ai\/rules\/api-rules\.md`.*`apps\/api\/\*\*`, `db\/\*\.sql`/)
  assert.match(claude, /`\.ai\/rules\/reply-rules\.md`/)
  assert.match(read(dir, '.claude/rules/api-rules.md'), /^---\ntrigger: always_on\npaths:/)
})

test('AGENTS.md inlines always-on rules and only indexes path-scoped ones', () => {
  const dir = makeRepo({ 'reply-rules.md': ALWAYS_RULE, 'api-rules.md': SCOPED_RULE })

  sync.syncAgentAssets({ repoRoot: dir })

  const agents = read(dir, 'AGENTS.md')
  assert.match(agents, /Always reply politely/)
  assert.doesNotMatch(agents, /Validate every API input/)
  assert.match(agents, /`\.ai\/rules\/api-rules\.md`.*`apps\/api\/\*\*`/)
  assert.ok(
    agents.indexOf('api-rules.md') < agents.indexOf('Always reply politely'),
    'the index comes before inlined bodies, so a size cut drops bodies before the index',
  )
})

test('CLAUDE.md inlines always-on rules when .claude/rules is not a sync target', () => {
  const dir = makeRepo({ 'reply-rules.md': ALWAYS_RULE, 'api-rules.md': SCOPED_RULE })

  sync.syncAgentAssets({ repoRoot: dir, ruleTargets: ['.agent'] })

  const claude = read(dir, 'CLAUDE.md')
  assert.match(claude, /Always reply politely/)
  assert.doesNotMatch(claude, /Validate every API input/)
})

test('syncAgentAssets warns when AGENTS.md exceeds the Codex project doc budget', () => {
  const huge = makeRepo({
    'huge-rules.md': `# Huge\n\n${'x'.repeat(sync.CODEX_PROJECT_DOC_MAX_BYTES)}`,
  })
  const { warnings } = sync.syncAgentAssets({ repoRoot: huge })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /AGENTS\.md/)

  const small = makeRepo({ 'reply-rules.md': ALWAYS_RULE })
  assert.deepEqual(sync.syncAgentAssets({ repoRoot: small }).warnings, [])
})

test('sync no longer writes Markdown rules into .codex/rules and prunes old copies but keeps Codex .rules files', () => {
  const dir = makeRepo({ 'reply-rules.md': ALWAYS_RULE })
  write(dir, '.codex/rules/reply-rules.md', 'stale copy')
  write(dir, '.codex/rules/renamed-rules.md', 'stale copy of a renamed rule')
  write(dir, '.codex/rules/default.rules', 'prefix_rule(pattern = ["git", "status"], decision = "allow")')

  sync.syncAgentAssets({ repoRoot: dir })

  assert.equal(hasEntry(dir, '.codex/rules/reply-rules.md'), false)
  assert.equal(hasEntry(dir, '.codex/rules/renamed-rules.md'), false)
  assert.match(read(dir, '.codex/rules/default.rules'), /prefix_rule/)
})

test('sync removes a legacy .codex/rules symlink without touching .ai/rules', () => {
  const dir = makeRepo({ 'reply-rules.md': ALWAYS_RULE })
  fs.mkdirSync(path.join(dir, '.codex'))
  fs.symlinkSync('../.ai/rules', path.join(dir, '.codex', 'rules'), 'dir')

  sync.syncAgentAssets({ repoRoot: dir })

  assert.equal(hasEntry(dir, '.codex/rules'), false)
  assert.equal(read(dir, '.ai/rules/reply-rules.md'), ALWAYS_RULE)
})

test('a fresh sync does not create .codex/rules', () => {
  const dir = makeRepo({ 'reply-rules.md': ALWAYS_RULE })

  sync.syncAgentAssets({ repoRoot: dir })

  assert.equal(hasEntry(dir, '.codex/rules'), false)
  assert.equal(hasEntry(dir, '.claude/rules/reply-rules.md'), true)
})

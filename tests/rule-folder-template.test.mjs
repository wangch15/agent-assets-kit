import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('create-rule-folder skill teaches the Browndust2Wiki rule-folder pattern', () => {
  const skill = read('templates/default/.ai/skills/create-rule-folder/SKILL.md')

  assert.match(skill, /global agent reference/i)
  assert.match(skill, /not the primary storage/i)
  assert.match(skill, /Change-Type Matrix/)
  assert.match(skill, /cases\/.+appendix\//s)
  assert.match(skill, /docs-only risk/)
  assert.match(skill, /do not append contradictions/i)
})

test('create-rule-folder command stays a thin trigger instead of duplicating the workflow', () => {
  const command = read('templates/default/.ai/commands/create-rule-folder.md')

  assert.match(command, /Use the `create-rule-folder` skill/)
  assert.match(command, /co-located canonical docs/i)
  assert.match(command, /global agent reference/i)
  assert.match(command, /domain-specific command only when/i)
})

test('readmes describe short references with local rule indexes and complex-area extensions', () => {
  const englishReadme = read('README.md')
  const zhReadme = read('README.zh-TW.md')

  for (const content of [englishReadme, zhReadme]) {
    assert.match(content, /\.ai\/rules\/<area>-rules-reference\.md/)
    assert.match(content, /local .*index/i)
    assert.match(content, /Change-Type Matrix/)
    assert.match(content, /cases\//)
    assert.match(content, /appendix\//)
  }
})

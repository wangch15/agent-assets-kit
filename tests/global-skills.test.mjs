import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('delegate-low-risk-tasks is tracked as a global skill source', () => {
  const skill = read('skills/delegate-low-risk-tasks/SKILL.md')
  const openaiYaml = read('skills/delegate-low-risk-tasks/agents/openai.yaml')

  assert.match(skill, /^name: delegate-low-risk-tasks$/m)
  assert.match(skill, /Recommended Owner Split/)
  assert.match(skill, /Prompt For Delegate/)
  assert.match(skill, /Hard Stops/)
  assert.match(openaiYaml, /Delegate Low-Risk Tasks/)
})

test('global skill installer links tracked skills into agent skill homes', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-assets-kit-home-'))
  const script = path.join(repoRoot, 'scripts/install-global-skills.mjs')

  const result = spawnSync(process.execPath, [script, '--home', tmpHome], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)

  for (const root of ['.agents', '.codex', '.claude']) {
    const linkPath = path.join(tmpHome, root, 'skills', 'delegate-low-risk-tasks')
    assert.equal(fs.lstatSync(linkPath).isSymbolicLink(), true)
    assert.equal(
      fs.realpathSync(linkPath),
      path.join(repoRoot, 'skills/delegate-low-risk-tasks'),
    )
  }
})

test('readmes document global skill storage and installation', () => {
  const englishReadme = read('README.md')
  const zhReadme = read('README.zh-TW.md')

  for (const content of [englishReadme, zhReadme]) {
    assert.match(content, /skills\/delegate-low-risk-tasks/)
    assert.match(content, /install-global-skills\.mjs/)
    assert.match(content, /~\/\.agents\/skills/)
    assert.match(content, /~\/\.codex\/skills/)
    assert.match(content, /~\/\.claude\/skills/)
  }
})

test('readmes explain sync mechanism and skill capabilities', () => {
  const englishReadme = read('README.md')
  const zhReadme = read('README.zh-TW.md')

  for (const content of [englishReadme, zhReadme]) {
    assert.match(content, /\.ai\/entrypoints\/project-context\.md/)
    assert.match(content, /\.ai\/rules/)
    assert.match(content, /\.ai\/skills/)
    assert.match(content, /AGENTS\.md/)
    assert.match(content, /CLAUDE\.md/)
    assert.match(content, /create-rule-folder/)
    assert.match(content, /delegate-low-risk-tasks/)
  }

  assert.match(englishReadme, /Sync Mechanism/)
  assert.match(englishReadme, /Skill Capabilities/)
  assert.match(englishReadme, /handoff prompt/)
  assert.match(englishReadme, /co-located rule docs/)

  assert.match(zhReadme, /同步機制/)
  assert.match(zhReadme, /Skills 能力/)
  assert.match(zhReadme, /交接 prompt/)
  assert.match(zhReadme, /靠近實作的規則文件/)
})

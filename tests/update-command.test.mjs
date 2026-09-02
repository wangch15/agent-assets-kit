import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cli = path.join(repoRoot, 'bin', 'agent-assets-kit.mjs')
const templateRoot = path.join(repoRoot, 'templates', 'default')
const SKILL = '.ai/skills/create-rule-folder/SKILL.md'
const README = '.ai/README.md'

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  return `${result.stdout}${result.stderr}`
}

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aak-'))
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"t","version":"1.0.0"}\n')
  run(['setup', '--cwd', dir, '--no-sync'])
  return dir
}

const statusOf = (output, file) =>
  output.split('\n').find((line) => line.trim().endsWith(file))?.trim().split(/\s+/)[0]

test('setup records an install manifest so later updates can tell edited files apart', () => {
  const dir = makeProject()
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.ai', '.agent-assets-kit.json'), 'utf8'))

  assert.equal(manifest.kit, 'agent-assets-kit')
  assert.ok(manifest.files[SKILL], 'skill hash is tracked')
  assert.match(statusOf(run(['update', '--cwd', dir]), SKILL), /current/)
})

test('update refreshes untouched files but never overwrites locally modified ones', () => {
  const dir = makeProject()
  const templateSkill = path.join(templateRoot, SKILL)
  const original = fs.readFileSync(templateSkill, 'utf8')

  try {
    fs.appendFileSync(templateSkill, '\n<!-- newer kit revision -->\n')
    fs.appendFileSync(path.join(dir, README), '\nProject-owned section.\n')

    const preview = run(['update', '--cwd', dir])
    assert.equal(statusOf(preview, SKILL), 'safe')
    assert.equal(statusOf(preview, README), 'conflict')
    assert.match(preview, /Preview only/)
    assert.ok(!fs.readFileSync(path.join(dir, SKILL), 'utf8').includes('newer kit revision'),
      'preview must not write')

    run(['update', '--cwd', dir, '--apply', '--no-sync'])
    assert.ok(fs.readFileSync(path.join(dir, SKILL), 'utf8').includes('newer kit revision'),
      'safe file is refreshed')
    assert.ok(fs.readFileSync(path.join(dir, README), 'utf8').includes('Project-owned section.'),
      'locally modified file is preserved')

    run(['update', '--cwd', dir, '--apply', '--force', '--no-sync'])
    assert.ok(!fs.readFileSync(path.join(dir, README), 'utf8').includes('Project-owned section.'),
      '--force overwrites the conflict')
  } finally {
    fs.writeFileSync(templateSkill, original)
  }
})

test('update without a manifest treats every difference as a conflict', () => {
  const dir = makeProject()
  fs.rmSync(path.join(dir, '.ai', '.agent-assets-kit.json'))
  fs.appendFileSync(path.join(dir, SKILL), '\nlocal edit\n')

  const output = run(['update', '--cwd', dir])
  assert.match(output, /No install manifest found/)
  assert.equal(statusOf(output, SKILL), 'conflict')
})

test('update --only limits the refresh to matching template paths', () => {
  const dir = makeProject()
  const output = run(['update', '--cwd', dir, '--only', 'create-rule-folder'])

  assert.ok(output.includes(SKILL), 'matching path is listed')
  assert.ok(!output.includes(README), 'non-matching path is excluded')
})

test('OS metadata files are never installed into a project', () => {
  const junk = path.join(templateRoot, '.DS_Store')
  try {
    fs.writeFileSync(junk, 'junk')
    const dir = makeProject()
    assert.ok(!fs.existsSync(path.join(dir, '.DS_Store')), '.DS_Store must not be copied')
    assert.ok(!run(['update', '--cwd', dir]).includes('.DS_Store'))
  } finally {
    fs.rmSync(junk, { force: true })
  }
})

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  hasCodeWrite,
  isCodeFile,
  isTempPath,
  parsePatchPaths,
  resetSessionGate,
  shouldBlockCodeWrite
} from './coding-standards-hook.mjs';

const hookScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'coding-standards-hook.mjs');

function runHook(input) {
  return spawnSync(process.execPath, [hookScript], { input: JSON.stringify(input), encoding: 'utf8', windowsHide: true });
}

function patch(...lines) {
  return { command: ['*** Begin Patch', ...lines, '*** End Patch'].join('\n') };
}

test('区分项目源码、文档、配置、数据文件和临时目录脚本', () => {
  assert.equal(isCodeFile('src/app.ts'), true);
  assert.equal(isCodeFile('Main.java'), true);
  assert.equal(isCodeFile('script.py'), true);
  assert.equal(isCodeFile('Dockerfile'), true);
  assert.equal(isCodeFile('README.md'), false);
  assert.equal(isCodeFile('package.json'), false);
  assert.equal(isCodeFile('config.yaml'), false);
  assert.equal(isCodeFile('notes.txt'), false);
  assert.equal(isCodeFile(''), false);

  assert.equal(isTempPath(path.join(os.tmpdir(), 'claude', 'probe.mjs')), true);
  assert.equal(isTempPath('C:/Users/Admin/.gemini/antigravity/brain/abc/scratch/a.py'), true);
  assert.equal(isTempPath('/tmp/check.py'), true);
  assert.equal(isTempPath('/repo/scratchpad/test.ts'), true);
  assert.equal(isCodeFile(path.join(os.tmpdir(), 'probe.ts')), false);
  assert.equal(isCodeFile('src/tmp/helper.ts'), true);
});

test('识别各平台工具和 Codex 补丁里的源码写入', () => {
  assert.equal(hasCodeWrite('Write', { file_path: 'src/a.ts' }), true);
  assert.equal(hasCodeWrite('Edit', { file_path: 'docs/guide.md' }), false);
  assert.equal(hasCodeWrite('Write', { file_path: path.join(os.tmpdir(), 'probe.ts') }), false);
  assert.equal(hasCodeWrite('write_file', { Path: 'src/a.mjs' }), true);
  assert.equal(hasCodeWrite('apply_patch', patch('*** Update File: a.ts', '@@', '+const x = 1;')), true);
  assert.equal(hasCodeWrite('apply_patch', patch('*** Add File: a.md', '+hello')), false);
  assert.equal(hasCodeWrite('apply_patch', patch('*** Update File: a.txt', '*** Move to: a.ts', '@@', '+x')), true);
  assert.deepEqual(parsePatchPaths(patch('*** Delete File: a.ts').command), []);
});

test('首次写源码和并行窗口内持续拦截，窗口过后放行，resetSessionGate 后重新生效', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-hook-'));
  try {
    assert.equal(shouldBlockCodeWrite('s1', { stateDir, now: 1000, parallelWindowMs: 3000 }), true);
    assert.equal(shouldBlockCodeWrite('s1', { stateDir, now: 2500, parallelWindowMs: 3000 }), true);
    assert.equal(shouldBlockCodeWrite('s1', { stateDir, now: 4500, parallelWindowMs: 3000 }), false);
    assert.equal(shouldBlockCodeWrite('s1', { stateDir, now: 4600, parallelWindowMs: 3000 }), false);
    assert.equal(shouldBlockCodeWrite('s2', { stateDir, now: 1000, parallelWindowMs: 3000 }), true);
    resetSessionGate('s1', stateDir);
    assert.equal(shouldBlockCodeWrite('s1', { stateDir, now: 5000, parallelWindowMs: 3000 }), true);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('Claude Code 拦截首次与并行源码写入，非源码和临时脚本不拦，SessionStart 后重置门禁', () => {
  const sessionId = `cs-claude-${process.pid}-${Date.now()}`;
  const md = runHook({ hook_event_name: 'PreToolUse', session_id: sessionId, tool_name: 'Write', tool_input: { file_path: 'README.md' } });
  assert.equal(md.status, 0);
  assert.equal(md.stderr, '');

  const tmpScript = runHook({
    hook_event_name: 'PreToolUse',
    session_id: sessionId,
    tool_name: 'Write',
    tool_input: { file_path: path.join(os.tmpdir(), 'scratch.ts') }
  });
  assert.equal(tmpScript.status, 0);

  const codeInput = { hook_event_name: 'PreToolUse', session_id: sessionId, tool_name: 'Edit', tool_input: { file_path: 'src/a.ts' } };
  const first = runHook(codeInput);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /用 Skill 工具调用 coding-standards 技能/);

  // 紧接着的并行写入仍在 PARALLEL_WINDOW_MS 内，继续拦截。
  const parallel = runHook(codeInput);
  assert.equal(parallel.status, 2);

  const compact = runHook({ hook_event_name: 'SessionStart', source: 'compact', session_id: sessionId });
  assert.equal(compact.status, 0);
  assert.equal(compact.stdout, '');

  const afterCompact = runHook(codeInput);
  assert.equal(afterCompact.status, 2);
  assert.match(afterCompact.stderr, /上下文刚压缩过/);
});

test('Codex 压缩后仍要求完整读取技能', () => {
  const sessionId = `cs-codex-${process.pid}-${Date.now()}`;
  runHook({ hook_event_name: 'SessionStart', source: 'compact', session_id: sessionId });
  const result = runHook({
    hook_event_name: 'PreToolUse',
    session_id: sessionId,
    tool_name: 'apply_patch',
    tool_input: patch('*** Update File: src/a.ts', '@@', '+const x = 1;')
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /必须先完整读取 coding-standards 技能/);
  assert.doesNotMatch(result.stderr, /Skill 工具/);
});

test('Antigravity 排除文档和临时脚本，拦截首次与并行源码写入，SessionStart 后重置门禁', () => {
  const conversationId = `cs-agy-${process.pid}-${Date.now()}`;
  const docEdit = runHook({ conversationId, toolCall: { name: 'edit_file', args: { Path: 'README.md' } } });
  assert.equal(docEdit.status, 0);
  assert.deepEqual(JSON.parse(docEdit.stdout), { decision: 'allow' });

  const tmpEdit = runHook({
    conversationId,
    toolCall: { name: 'write_file', args: { Path: path.join(os.tmpdir(), 'analyze.py') } }
  });
  assert.deepEqual(JSON.parse(tmpEdit.stdout), { decision: 'allow' });

  const codeInput = { conversationId, toolCall: { name: 'edit_file', args: { Path: 'src/a.ts' } } };
  const first = runHook(codeInput);
  assert.equal(first.status, 0);
  const firstOut = JSON.parse(first.stdout);
  assert.equal(firstOut.decision, 'deny');
  assert.match(firstOut.reason, /编码与注释规范门禁/);
  assert.doesNotMatch(firstOut.reason, /Skill 工具/);

  // 紧接着的并行写入仍在 PARALLEL_WINDOW_MS 内，继续拦截。
  assert.equal(JSON.parse(runHook(codeInput).stdout).decision, 'deny');

  const reset = runHook({ conversationId, workspacePaths: ['.'] });
  assert.equal(reset.status, 0);
  assert.deepEqual(JSON.parse(reset.stdout), {});
});

test('输入不是 JSON 时报错但不拦截', () => {
  const result = spawnSync(process.execPath, [hookScript], { input: 'not json', encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /coding-standards hook:/);
});

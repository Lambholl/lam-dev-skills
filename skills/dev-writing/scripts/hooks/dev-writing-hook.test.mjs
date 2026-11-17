import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { pickReminder } from './dev-writing-hook.mjs';

const hookScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dev-writing-hook.mjs');

function patch(...lines) {
  return { command: ['*** Begin Patch', ...lines, '*** End Patch'].join('\n') };
}

test('写入任何语言的 Markdown 都提醒', () => {
  assert.match(pickReminder('Write', { file_path: 'docs/a.md', content: '结论：可以发布' }), /文档自查/);
  assert.match(pickReminder('Edit', { file_path: 'README.md', new_string: 'Install with npm' }), /文档自查/);
  assert.match(pickReminder('MultiEdit', { file_path: 'a.mdx', edits: [{ new_string: '' }, { new_string: 'x' }] }), /文档自查/);
});

test('非 Markdown 文件和空内容不提醒', () => {
  assert.equal(pickReminder('Write', { file_path: 'a.ts', content: '// 注释' }), null);
  assert.equal(pickReminder('Edit', { file_path: 'a.md', new_string: '' }), null);
});

test('Codex 补丁按 Markdown 文件的新增行判断', () => {
  assert.match(pickReminder('apply_patch', patch('*** Update File: docs/a.md', '@@', '-old', '+new')), /文档自查/);
  assert.match(pickReminder('apply_patch', patch('*** Update File: a.txt', '*** Move to: a.md', '@@', '+x')), /文档自查/);
  assert.equal(pickReminder('apply_patch', patch('*** Add File: a.ts', '+// x')), null);
  assert.equal(pickReminder('apply_patch', patch('*** Update File: a.md', '@@', ' context', '-removed')), null);
  assert.equal(pickReminder('apply_patch', patch('*** Delete File: a.md')), null);
});

test('脚本输出 PostToolUse 的 additionalContext', () => {
  const result = spawnSync(process.execPath, [hookScript], {
    input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: 'a.md', content: 'x' } }),
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(output.hookSpecificOutput.additionalContext, /dev-writing/);
});

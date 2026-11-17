import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { hasComment, pickReminder } from './coding-standards-hook.mjs';

const hookScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'coding-standards-hook.mjs');

test('认出各语言、各种自然语言的注释', () => {
  assert.ok(hasComment('a.ts', 'const x = 1; // 缓存结果'));
  assert.ok(hasComment('a.ts', '/**\n * Returns the cached value.\n */'));
  assert.ok(hasComment('a.java', '  * @return 默认配置'));
  assert.ok(hasComment('a.py', 'x = 1  # retry once'));
  assert.ok(hasComment('a.py', '    """Read the config file."""'));
  assert.ok(hasComment('run.sh', '# 清理临时文件'));
  assert.ok(hasComment('q.sql', 'select 1 -- 只取第一行'));
  assert.ok(hasComment('a.vue', '<!-- 列表为空时显示 -->'));
  assert.ok(hasComment('a.bat', 'REM set up paths'));
  assert.ok(hasComment('Dockerfile', '# build stage'));
  assert.ok(hasComment('a.unknown', '// note'));
});

test('不是注释的写法不算', () => {
  assert.equal(hasComment('a.c', '#include <stdio.h>'), false);
  assert.equal(hasComment('a.py', 'color = "#fff"'), false);
  assert.equal(hasComment('run.sh', '#!/usr/bin/env bash'), false);
  assert.equal(hasComment('a.ts', 'const url = "https://example.com";'), false);
  assert.equal(hasComment('a.ts', '// ------------'), false);
  assert.equal(hasComment('a.ts', 'const ratio = a / b * c;'), false);
  assert.equal(hasComment('a.md', '// 中文'), false);
  assert.equal(hasComment('a.json', '{"a": "# b"}'), false);
});

test('按工具输入判断，Codex 补丁只看新增行', () => {
  assert.match(pickReminder('Edit', { file_path: 'a.ts', new_string: '// why' }), /注释自查/);
  assert.match(pickReminder('MultiEdit', { file_path: 'a.py', edits: [{ new_string: 'x = 1' }, { new_string: '# why' }] }), /注释自查/);
  assert.equal(pickReminder('Write', { file_path: 'a.ts', content: 'export const x = 1;' }), null);
  const patch = (...lines) => ({ command: ['*** Begin Patch', ...lines, '*** End Patch'].join('\n') });
  assert.match(pickReminder('apply_patch', patch('*** Update File: a.ts', '@@', '+// why')), /注释自查/);
  assert.equal(pickReminder('apply_patch', patch('*** Update File: a.ts', '@@', ' // old', '-// removed')), null);
  assert.equal(pickReminder('apply_patch', patch('*** Add File: a.md', '+// x')), null);
});

test('脚本输出 PostToolUse 的 additionalContext', () => {
  const result = spawnSync(process.execPath, [hookScript], {
    input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: 'a.ts', new_string: '// why' } }),
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(result.status, 0);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /coding-standards/);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  evaluateWriteGate,
  inspectDocReads,
  inspectPromptInvocation,
  isCodeFile,
  isStaleHookConfig,
  isTempPath,
  parsePatchPaths,
  recordReadOutcome,
  requiredDocsForFile,
  requiredDocsForWrite,
  resetSessionGate
} from './coding-standards-hook.mjs';

const hookScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'coding-standards-hook.mjs');

function toPosixPath(value) {
  return value.replaceAll('\\', '/');
}

function runHook(input, env = {}) {
  return spawnSync(process.execPath, [hookScript], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, ...env }
  });
}

function patch(...lines) {
  return { command: ['*** Begin Patch', ...lines, '*** End Patch'].join('\n') };
}

test('只匹配明确的编程语言源码并排除临时目录脚本', () => {
  assert.equal(isCodeFile('src/app.ts'), true);
  assert.equal(isCodeFile('Main.java'), true);
  assert.equal(isCodeFile('script.py'), true);
  assert.equal(isCodeFile('main.go'), true);
  assert.equal(isCodeFile('App.kt'), true);

  assert.equal(isCodeFile('README.md'), false);
  assert.equal(isCodeFile('package.json'), false);
  assert.equal(isCodeFile('config.yaml'), false);
  assert.equal(isCodeFile('AndroidManifest.xml'), false);
  assert.equal(isCodeFile('build.gradle'), false);
  assert.equal(isCodeFile('build.gradle.kts'), false);
  assert.equal(isCodeFile('schema.sql'), false);
  assert.equal(isCodeFile('styles.css'), false);
  assert.equal(isCodeFile('Dockerfile'), false);
  assert.equal(isCodeFile('.editorconfig'), false);
  assert.equal(isCodeFile(''), false);

  assert.equal(isTempPath(path.join(os.tmpdir(), 'claude', 'probe.mjs')), true);
  assert.equal(isTempPath('C:/Users/Admin/.gemini/antigravity/brain/abc/scratch/a.py'), true);
  assert.equal(isTempPath('/tmp/check.py'), true);
  assert.equal(isTempPath('/repo/scratchpad/test.ts'), true);
  assert.equal(isCodeFile(path.join(os.tmpdir(), 'probe.ts')), false);
  assert.equal(isCodeFile('src/tmp/helper.ts'), true);
});

test('按语言、框架和项目 coding.md 映射必读规范，Codex 补丁忽略删除行', () => {
  assert.deepEqual(requiredDocsForFile('src/a.ts'), [['SKILL.md'], ['languages/typescript.md']]);
  assert.deepEqual(requiredDocsForFile('src/App.tsx'), [['SKILL.md'], ['languages/typescript.md'], ['frameworks/react.md']]);
  assert.deepEqual(requiredDocsForFile('src/App.vue'), [['SKILL.md'], ['frameworks/vue.md']]);
  assert.deepEqual(requiredDocsForFile('include/a.h'), [['SKILL.md'], ['languages/c.md', 'languages/cpp.md']]);
  assert.deepEqual(requiredDocsForFile('cmd/main.go'), [['SKILL.md']]);
  assert.deepEqual(requiredDocsForFile('AndroidManifest.xml'), []);

  assert.deepEqual(
    requiredDocsForWrite('apply_patch', patch('*** Update File: a.txt', '*** Move to: a.ts', '@@', '+x')),
    [['SKILL.md'], ['languages/typescript.md']]
  );
  assert.deepEqual(requiredDocsForWrite('apply_patch', patch('*** Add File: a.md', '+hello')), []);
  assert.deepEqual(parsePatchPaths(patch('*** Delete File: a.ts').command), []);

  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-proj-'));
  try {
    fs.mkdirSync(path.join(repo, '.project-memory', 'standards'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.project-memory', 'standards', 'coding.md'), '# coding');
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    assert.deepEqual(
      requiredDocsForWrite('Write', { file_path: 'src/a.ts' }, { cwd: path.join(repo, 'src') }),
      [['SKILL.md'], ['languages/typescript.md'], ['standards/coding.md']]
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('识别三端完整读取、截断读取、失败读取和 Claude 斜杠命令', () => {
  assert.deepEqual(inspectDocReads('Skill', { skill: 'coding-standards' }), {
    unlocked: ['SKILL.md'],
    truncated: [],
    usedSkillTool: true
  });
  assert.deepEqual(inspectDocReads('Read', { file_path: 'C:/Users/x/.claude/skills/coding-standards/SKILL.md' }), {
    unlocked: ['SKILL.md'],
    truncated: [],
    usedSkillTool: false
  });
  assert.deepEqual(
    inspectDocReads('Read', { file_path: '/repo/.project-memory/standards/coding.md' }),
    { unlocked: ['standards/coding.md'], truncated: [], usedSkillTool: false }
  );
  assert.deepEqual(
    inspectDocReads('Read', { file_path: 'C:/Users/x/.claude/skills/coding-standards/SKILL.md', limit: 20 }),
    { unlocked: [], truncated: ['SKILL.md'], usedSkillTool: false }
  );
  assert.deepEqual(
    inspectDocReads('read_file', { Path: 'C:/repo/.project-memory/standards/coding.md' }),
    { unlocked: ['standards/coding.md'], truncated: [], usedSkillTool: false }
  );
  assert.deepEqual(
    inspectDocReads('read_file', { Path: 'C:/skills/coding-standards/references/languages/typescript.md', StartLine: 1, EndLine: 50 }),
    { unlocked: [], truncated: ['languages/typescript.md'], usedSkillTool: false }
  );
  assert.deepEqual(
    inspectDocReads('read_file', { Path: 'C:/skills/coding-standards/SKILL.md' }, { toolError: 'ENOENT' }),
    { unlocked: [], truncated: [], usedSkillTool: false }
  );
  assert.deepEqual(
    inspectDocReads('Bash', {
      command:
        'cd /c/Users/x/.codex/skills/coding-standards/references && cat languages/java.md languages/typescript.md frameworks/react.md'
    }),
    { unlocked: ['languages/java.md', 'languages/typescript.md', 'frameworks/react.md'], truncated: [], usedSkillTool: false }
  );
  assert.deepEqual(
    inspectDocReads('Bash', {
      command:
        'cat ~/.codex/skills/coding-standards/SKILL.md | head -5; cat ~/.codex/skills/coding-standards/references/languages/typescript.md'
    }),
    { unlocked: ['languages/typescript.md'], truncated: ['SKILL.md'], usedSkillTool: false }
  );
  assert.deepEqual(
    inspectDocReads(
      'Bash',
      { command: 'cat ~/.codex/skills/coding-standards/SKILL.md' },
      { toolResponse: { exit_code: 1, output: 'cat: No such file or directory' } }
    ),
    { unlocked: [], truncated: [], usedSkillTool: false }
  );

  assert.deepEqual(inspectPromptInvocation('/coding-standards 请改代码'), ['SKILL.md']);
  assert.deepEqual(inspectPromptInvocation('/lam-dev-skills:coding-standards'), ['SKILL.md']);
  assert.deepEqual(inspectPromptInvocation('$coding-standards'), []);
  assert.deepEqual(inspectPromptInvocation('请按 coding-standards 改代码'), []);
});

test('Claude Code 的 Shell 读取按输出核对：换行宽容，截断、筛选或超限不解锁', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-shell-'));
  try {
    const skillDir = path.join(root, 'coding-standards');
    fs.mkdirSync(path.join(skillDir, 'references', 'languages'), { recursive: true });
    const skillText = '# 编码规范\r\n\r\n- 第一条\r\n- 第二条\r\n';
    const tsText = '# TypeScript\n\n- 用 strict\n';
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillText);
    fs.writeFileSync(path.join(skillDir, 'references', 'languages', 'typescript.md'), tsText);
    const skillPath = toPosixPath(path.join(skillDir, 'SKILL.md'));
    const lf = (text) => text.replace(/\r\n/g, '\n');
    const inspect = (command, stdout, options = {}) =>
      inspectDocReads('Bash', { command }, { toolResponse: { stdout, stderr: '' }, cwd: root, ...options });

    // CRLF 文件经 LF 输出、cd 后的相对路径都能解锁。
    assert.deepEqual(inspect(`cat "${skillPath}"`, lf(skillText)).unlocked, ['SKILL.md']);
    assert.deepEqual(
      inspect('cd coding-standards && cat SKILL.md references/languages/typescript.md', lf(skillText) + tsText).unlocked,
      ['SKILL.md', 'languages/typescript.md']
    );
    // 筛选后的输出、截断命令和超出输出上限都记为截断。
    assert.deepEqual(inspect(`cat "${skillPath}" | grep 第一条`, '- 第一条\n'), {
      unlocked: [],
      truncated: ['SKILL.md'],
      usedSkillTool: false
    });
    assert.deepEqual(inspect(`head -n 2 "${skillPath}"`, '# 编码规范\n\n').truncated, ['SKILL.md']);
    const overLimit = lf(skillText);
    assert.deepEqual(inspect(`cat "${skillPath}"`, overLimit, { outputLimit: overLimit.length - 1 }).truncated, ['SKILL.md']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Claude 与 Antigravity 严格验读放行，Codex 截断不兜底、跨两轮且超时才兜底，压缩保留 Skill 工具状态', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-hook-'));
  try {
    const tsDocs = requiredDocsForFile('src/a.ts');
    const javaDocs = requiredDocsForFile('src/A.java');

    // Claude / Antigravity：超时重试也不放行，必须补齐读取。
    assert.equal(evaluateWriteGate('c1', tsDocs, { platform: 'claude', stateDir, now: 1000 }).shouldBlock, true);
    assert.equal(evaluateWriteGate('c1', tsDocs, { platform: 'claude', stateDir, now: 60000 }).shouldBlock, true);
    recordReadOutcome('c1', { unlocked: ['SKILL.md'], usedSkillTool: true }, stateDir);
    const missingTs = evaluateWriteGate('c1', tsDocs, { platform: 'claude', stateDir, now: 60000 });
    assert.equal(missingTs.shouldBlock, true);
    assert.deepEqual(missingTs.missingGroups, [['languages/typescript.md']]);

    recordReadOutcome('c1', { unlocked: ['languages/typescript.md'] }, stateDir);
    assert.equal(evaluateWriteGate('c1', tsDocs, { platform: 'claude', stateDir }).shouldBlock, false);

    // 切去改 Java 只要求补读 java.md。
    assert.deepEqual(evaluateWriteGate('c1', javaDocs, { platform: 'claude', stateDir }).missingGroups, [
      ['languages/java.md']
    ]);

    // Claude Code 压缩后保留经 Skill 工具加载的 SKILL.md，清掉语言规则。
    resetSessionGate('c1', stateDir, { wasCompacted: true });
    assert.deepEqual(evaluateWriteGate('c1', tsDocs, { platform: 'claude', stateDir }).missingGroups, [
      ['languages/typescript.md']
    ]);

    // 未经 Skill 工具加载（如仅用 Read）压缩后需全部重读。
    recordReadOutcome('c2', { unlocked: ['SKILL.md', 'languages/typescript.md'], usedSkillTool: false }, stateDir);
    resetSessionGate('c2', stateDir, { wasCompacted: true });
    assert.deepEqual(evaluateWriteGate('c2', tsDocs, { platform: 'claude', stateDir }).missingGroups, [
      ['SKILL.md'],
      ['languages/typescript.md']
    ]);

    // Codex：检测到截断读取时永不自动放行。
    recordReadOutcome('x1', { truncated: ['SKILL.md'] }, stateDir, 1000);
    assert.equal(evaluateWriteGate('x1', tsDocs, { platform: 'codex', stateDir, now: 1000 }).shouldBlock, true);
    assert.equal(evaluateWriteGate('x1', tsDocs, { platform: 'codex', stateDir, now: 20000 }).shouldBlock, true);
    assert.equal(evaluateWriteGate('x1', tsDocs, { platform: 'codex', stateDir, now: 40000 }).shouldBlock, true);

    // Codex 无截断时，必须至少拦下 2 次且间隔 >= 10s 才兜底放行。
    assert.equal(evaluateWriteGate('x2', tsDocs, { platform: 'codex', stateDir, now: 1000 }).shouldBlock, true);
    assert.equal(evaluateWriteGate('x2', tsDocs, { platform: 'codex', stateDir, now: 4000 }).shouldBlock, true);
    assert.equal(evaluateWriteGate('x2', tsDocs, { platform: 'codex', stateDir, now: 12000 }).shouldBlock, false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('检测本机旧版 Hook 配置（已配 PreToolUse 但缺少 PostToolUse）', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-stale-'));
  try {
    assert.equal(isStaleHookConfig('claude', home), false);
    assert.equal(isStaleHookConfig('agy', home), false);

    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.claude', 'settings.json'),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ command: 'node "x/coding-standards-hook.mjs"' }] }] } })
    );
    assert.equal(isStaleHookConfig('claude', home), true);

    fs.writeFileSync(
      path.join(home, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: 'Edit', hooks: [{ command: 'node "x/coding-standards-hook.mjs"' }] }],
          PostToolUse: [{ matcher: 'Read', hooks: [{ command: 'node "x/coding-standards-hook.mjs"' }] }]
        }
      })
    );
    assert.equal(isStaleHookConfig('claude', home), false);

    fs.mkdirSync(path.join(home, '.gemini', 'config'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.gemini', 'config', 'hooks.json'),
      JSON.stringify({
        'lam-dev-skills': { PreToolUse: [{ matcher: 'edit_file', hooks: [{ command: 'node "x/coding-standards-hook.mjs"' }] }] }
      })
    );
    assert.equal(isStaleHookConfig('agy', home), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('Claude Code 端到端：提前读齐首次即放行，斜杠命令解锁 SKILL.md，截断不解锁，压缩保留 Skill 正文', () => {
  const sessionId = `cs-claude-${process.pid}-${Date.now()}`;
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-e2e-claude-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-e2e-home-'));
  const env = { HOME: home, USERPROFILE: home };
  try {
    fs.mkdirSync(path.join(repo, '.project-memory', 'standards'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.project-memory', 'standards', 'coding.md'), '# coding');

    const md = runHook({
      hook_event_name: 'PreToolUse',
      session_id: sessionId,
      cwd: repo,
      tool_name: 'Write',
      tool_input: { file_path: 'README.md' }
    }, env);
    assert.equal(md.status, 0);

    // 开工前先通过 Skill + Read 读齐全部规范（包括项目 coding.md），首次写入直接放行。
    runHook({ hook_event_name: 'PostToolUse', session_id: sessionId, tool_name: 'Skill', tool_input: { skill: 'coding-standards' } }, env);
    runHook({
      hook_event_name: 'PostToolUse',
      session_id: sessionId,
      tool_name: 'Read',
      tool_input: { file_path: 'C:/Users/x/.claude/skills/coding-standards/references/languages/typescript.md' }
    }, env);
    runHook({
      hook_event_name: 'PostToolUse',
      session_id: sessionId,
      tool_name: 'Read',
      tool_input: { file_path: path.join(repo, '.project-memory', 'standards', 'coding.md') }
    }, env);

    const tsWrite = {
      hook_event_name: 'PreToolUse',
      session_id: sessionId,
      cwd: repo,
      tool_name: 'Edit',
      tool_input: { file_path: 'src/a.ts' }
    };
    assert.equal(runHook(tsWrite, env).status, 0);

    // 压缩后保留 Skill 加载的 SKILL.md，只拦 typescript.md 和项目 coding.md。
    assert.equal(runHook({ hook_event_name: 'SessionStart', source: 'compact', session_id: sessionId }, env).status, 0);
    const afterCompact = runHook(tsWrite, env);
    assert.equal(afterCompact.status, 2);
    assert.match(afterCompact.stderr, /上下文刚压缩过/);
    assert.match(afterCompact.stderr, /references\/languages\/typescript\.md/);
    assert.match(afterCompact.stderr, /\.project-memory\/standards\/coding\.md/);

    // 新会话通过 /coding-standards 解锁 SKILL.md，但截断 Read 不解锁 typescript.md。
    const slashSession = `${sessionId}-slash`;
    runHook({ hook_event_name: 'UserPromptSubmit', session_id: slashSession, prompt: '/coding-standards 改下 a.go' }, env);
    assert.equal(
      runHook({
        hook_event_name: 'PreToolUse',
        session_id: slashSession,
        tool_name: 'Edit',
        tool_input: { file_path: 'main.go' }
      }, env).status,
      0
    );
    const truncated = runHook({
      hook_event_name: 'PostToolUse',
      session_id: slashSession,
      tool_name: 'Read',
      tool_input: { file_path: 'C:/skills/coding-standards/references/languages/typescript.md', limit: 10 }
    }, env);
    assert.match(JSON.parse(truncated.stdout).hookSpecificOutput.additionalContext, /截断读取/);
    assert.equal(
      runHook({
        hook_event_name: 'PreToolUse',
        session_id: slashSession,
        tool_name: 'Edit',
        tool_input: { file_path: 'src/a.ts' }
      }, env).status,
      2
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('Codex 端到端：$coding-standards 不解锁，Bash 完整读取解锁，压缩后全部重读', () => {
  const sessionId = `cs-codex-${process.pid}-${Date.now()}`;
  const writeTs = {
    hook_event_name: 'PreToolUse',
    session_id: sessionId,
    tool_name: 'apply_patch',
    tool_input: patch('*** Update File: src/a.ts', '@@', '+const x = 1;')
  };
  assert.equal(runHook(writeTs).status, 2);

  runHook({
    hook_event_name: 'PostToolUse',
    session_id: sessionId,
    tool_name: 'Bash',
    tool_input: { command: 'cat ~/.codex/skills/coding-standards/SKILL.md ~/.codex/skills/coding-standards/references/languages/typescript.md' }
  });
  assert.equal(runHook(writeTs).status, 0);

  runHook({ hook_event_name: 'SessionStart', source: 'compact', session_id: sessionId });
  const afterCompact = runHook(writeTs);
  assert.equal(afterCompact.status, 2);
  assert.match(afterCompact.stderr, /coding-standards\/SKILL\.md/);
  assert.match(afterCompact.stderr, /references\/languages\/typescript\.md/);
  assert.doesNotMatch(afterCompact.stderr, /Skill 工具/);
});

test('Antigravity 端到端：排除非源码和临时脚本，PostToolUse(read_file) 完整读取后放行，SessionStart 重置', () => {
  const conversationId = `cs-agy-${process.pid}-${Date.now()}`;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-e2e-agy-'));
  const env = { HOME: home, USERPROFILE: home };
  try {
    const xmlEdit = runHook({ conversationId, toolCall: { name: 'edit_file', args: { Path: 'AndroidManifest.xml' } } }, env);
    assert.deepEqual(JSON.parse(xmlEdit.stdout), { decision: 'allow' });

    const tmpEdit = runHook({
      conversationId,
      toolCall: { name: 'write_file', args: { Path: path.join(os.tmpdir(), 'analyze.py') } }
    }, env);
    assert.deepEqual(JSON.parse(tmpEdit.stdout), { decision: 'allow' });

    const codeInput = { conversationId, toolCall: { name: 'edit_file', args: { Path: 'src/a.ts' } } };
    const first = JSON.parse(runHook(codeInput, env).stdout);
    assert.equal(first.decision, 'deny');
    assert.match(first.reason, /coding-standards\/SKILL\.md/);
    assert.match(first.reason, /references\/languages\/typescript\.md/);
    assert.doesNotMatch(first.reason, /Skill 工具/);

    // 截断或失败的 read_file 不解锁。
    assert.deepEqual(
      JSON.parse(
        runHook({
          conversationId,
          hookEventName: 'PostToolUse',
          toolCall: { name: 'read_file', args: { Path: 'C:/skills/coding-standards/SKILL.md', StartLine: 1, EndLine: 50 } }
        }, env).stdout
      ),
      {}
    );
    assert.deepEqual(
      JSON.parse(
        runHook({
          conversationId,
          hookEventName: 'PostToolUse',
          toolCall: { name: 'read_file', args: { Path: 'C:/skills/coding-standards/references/languages/typescript.md' } },
          error: 'ENOENT'
        }, env).stdout
      ),
      {}
    );
    assert.equal(JSON.parse(runHook(codeInput, env).stdout).decision, 'deny');

    // 完整读取后放行。
    runHook({
      conversationId,
      hookEventName: 'PostToolUse',
      toolCall: { name: 'read_file', args: { Path: 'C:/skills/coding-standards/SKILL.md' } }
    }, env);
    runHook({
      conversationId,
      hookEventName: 'PostToolUse',
      toolCall: { name: 'read_file', args: { Path: 'C:/skills/coding-standards/references/languages/typescript.md' } }
    }, env);
    assert.deepEqual(JSON.parse(runHook(codeInput, env).stdout), { decision: 'allow' });

    // SessionStart 重置门禁。
    assert.deepEqual(JSON.parse(runHook({ conversationId, workspacePaths: ['.'] }, env).stdout), {});
    assert.equal(JSON.parse(runHook(codeInput, env).stdout).decision, 'deny');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('输入不是 JSON 时报错但不拦截', () => {
  const result = spawnSync(process.execPath, [hookScript], { input: 'not json', encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /coding-standards hook:/);
});

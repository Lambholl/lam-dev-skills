#!/usr/bin/env node
// project-memory 技能的 Hook：项目有 .project-memory/ 时，在会话开始注入记忆协议，在每次提问时注入短提醒。
// 只计算 INDEX.md 的路径，不读记忆正文。

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** 从 startDir 往上找 .project-memory 目录，返回它的绝对路径；找不到时返回 null。 */
export function findMemoryRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, '.project-memory');
    if (fs.statSync(candidate, { throwIfNoEntry: false })?.isDirectory()) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function sessionProtocol(memoryRoot) {
  return [
    '# 项目记忆',
    '',
    `- 入口：${path.join(memoryRoot, 'INDEX.md')}。先读 INDEX，再按任务和文档的 \`## 目录\` 选读正文；任务范围变了重新查看。`,
    '- 讨论、评审、诊断、解释只读，不登记当前工作，结束时在对话里报告。',
    '- 写任务开工前在 INDEX“当前工作”登记，检查点和阻塞时更新；做完并验证后同步记忆，标为 `in-review`；请求者明确满意、要求提交或开 PR、转去无关任务时才删行（若仅剩待请求者确认或验收的缺口，请求者要求提交即视为通过）。登记新工作前先处理已有的 `in-review` 行。',
    '- 编写或修改代码前，必须先读 coding-standards 技能、对应语言/框架规则和 `standards/coding.md`（上下文压缩后继续改代码时重读）；写文档、提交前分别按 dev-writing、git-workflow 技能，项目差异在 `standards/`。',
    '- Git 操作，以及文档里流程上的确认、验收和待决定，都要请求者在当前对话明确同意；Agent 不自己确认。',
    '- 完整规则见 project-memory 技能。'
  ].join('\n');
}

export function promptReminder(memoryRoot) {
  return [
    `项目记忆入口：${path.join(memoryRoot, 'INDEX.md')}；任务范围变了重新查看。`,
    '- 写任务开工前登记当前工作；做完并验证后同步记忆，标为 `in-review`。只读任务不登记。',
    '- Git 操作和文档里流程上的确认，都要请求者在当前对话明确同意。'
  ].join('\n');
}

async function readStdin() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

async function main() {
  const input = JSON.parse(await readStdin());
  // Antigravity 的输入没有事件名和 cwd，用 conversationId 认出它，用 workspacePaths 找项目，靠有没有 invocationNum 区分 PreInvocation 和 SessionStart。
  const isAntigravity = input.conversationId !== undefined;
  const memoryRoot = findMemoryRoot(input.cwd ?? input.workspacePaths?.[0] ?? process.cwd());
  if (isAntigravity) {
    // invocationNum 从 0 数，只在一轮的第一次模型调用前提醒，对应 UserPromptSubmit。
    const context = !memoryRoot ? null
      : input.invocationNum === undefined ? sessionProtocol(memoryRoot)
      : input.invocationNum === 0 ? promptReminder(memoryRoot)
      : null;
    process.stdout.write(JSON.stringify(context ? { injectSteps: [{ systemMessage: { systemMessage: context } }] } : {}));
    return;
  }
  if (!memoryRoot) return;
  const eventName = input.hook_event_name;
  const context = eventName === 'SessionStart' ? sessionProtocol(memoryRoot)
    : eventName === 'UserPromptSubmit' ? promptReminder(memoryRoot)
    : null;
  if (context) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext: context } }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    // 退出码 1 不拦截会话，错误显示给使用者。
    process.stderr.write(`project-memory hook: ${error.message}\n`);
    process.exitCode = 1;
  });
}

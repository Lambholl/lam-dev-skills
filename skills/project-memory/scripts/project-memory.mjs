#!/usr/bin/env node
// 项目记忆命令行：init、read、index、validate。

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { initMemory, readMemoryFile, rebuildIndex, resolveMemoryRoot, staleIndexFiles, validateMemory } from './lib/memory.mjs';

const templatesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'templates');
const templateRoot = path.join(templatesDir, '.project-memory');
const agentsTemplate = path.join(templatesDir, 'AGENTS.md');

const USAGE = `用法：
  project-memory.mjs init [--project <路径>]
  project-memory.mjs read --file <记忆目录内的路径> [--section <标题> | --toc] [--project <路径>]
  project-memory.mjs index [--write] [--project <路径>]
  project-memory.mjs validate [--format json] [--project <路径>]

--project 可以是项目根目录，也可以是 .project-memory 目录；默认当前目录。`;

function existingMemoryRoot(project) {
  const memoryRoot = resolveMemoryRoot(project);
  if (!fs.existsSync(memoryRoot)) throw new Error(`没有找到记忆目录：${memoryRoot}`);
  return memoryRoot;
}

function run(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      project: { type: 'string' },
      file: { type: 'string' },
      section: { type: 'string' },
      toc: { type: 'boolean' },
      full: { type: 'boolean' },
      write: { type: 'boolean' },
      format: { type: 'string' },
      help: { type: 'boolean', short: 'h' }
    }
  });
  const command = positionals[0];
  if (values.help || !command) {
    console.log(USAGE);
    return 0;
  }

  if (command === 'init') {
    const memoryRoot = resolveMemoryRoot(values.project);
    const result = initMemory(memoryRoot, templateRoot, undefined, agentsTemplate);
    console.log(`已创建：${memoryRoot}`);
    if (result.agentsStatus === 'created') console.log(`已创建：${result.agentsTarget}`);
    else if (result.agentsStatus === 'exists') console.log(`已存在，未改动：${result.agentsTarget}（请按需合并前置技能说明）`);
    return 0;
  }

  if (command === 'read') {
    if (!values.file) throw new Error('read 需要 --file。');
    process.stdout.write(readMemoryFile(existingMemoryRoot(values.project), values.file, values));
    return 0;
  }

  if (command === 'index') {
    const memoryRoot = existingMemoryRoot(values.project);
    const files = values.write ? rebuildIndex(memoryRoot) : staleIndexFiles(memoryRoot);
    if (!files.length) console.log('目录都是最新的。');
    else console.log(`${values.write ? '已重建' : '目录过期，运行 index --write 重建'}：\n${files.map((file) => `- ${file}`).join('\n')}`);
    return 0;
  }

  if (command === 'validate') {
    const result = validateMemory(existingMemoryRoot(values.project));
    if (values.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const issue of result.issues) console.log(`问题：${issue}`);
      for (const item of result.advice) console.log(`建议：${item}`);
      if (result.valid && !result.advice.length) console.log('没有发现问题。');
    }
    return result.valid ? 0 : 1;
  }

  throw new Error(`未知命令：${command}\n\n${USAGE}`);
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

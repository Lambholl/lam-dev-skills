import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { headings, splitFrontmatter } from '../skills/project-memory/scripts/lib/markdown.mjs';
import { REPO_ROOT } from './install.mjs';

// README、技能和 docs/ 里的相对链接都要能打开；docs/ 不进仓库，没有时跳过。模板里的链接由 project-memory 的 validate 检查。
function markdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'templates' || entry.name === 'node_modules' ? [] : markdownFiles(child);
    return entry.name.endsWith('.md') ? [child] : [];
  });
}

function links(body) {
  const withoutCode = body.replace(/^(`{3,}|~{3,})[\s\S]*?^\1/gm, '').replace(/`+[^`\n]*`+/g, '');
  return [...withoutCode.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)\)/g)].map((match) => decodeURIComponent(match[1]));
}

test('README、技能和文档里的相对链接都指向存在的文件和章节', () => {
  const broken = [];
  const files = [path.join(REPO_ROOT, 'README.md'), ...markdownFiles(path.join(REPO_ROOT, 'skills')), ...markdownFiles(path.join(REPO_ROOT, 'docs'))];
  for (const file of files) {
    for (const target of links(splitFrontmatter(fs.readFileSync(file, 'utf8')).body)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const [filePart, anchor] = target.split('#');
      const resolved = filePart ? path.resolve(path.dirname(file), filePart) : file;
      const where = `${path.relative(REPO_ROOT, file)} -> ${target}`;
      if (!fs.existsSync(resolved)) broken.push(`${where}（文件不存在）`);
      else if (anchor && resolved.endsWith('.md')) {
        const anchors = headings(splitFrontmatter(fs.readFileSync(resolved, 'utf8')).body).map((item) => item.anchor);
        if (!anchors.includes(anchor.toLowerCase())) broken.push(`${where}（章节不存在）`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

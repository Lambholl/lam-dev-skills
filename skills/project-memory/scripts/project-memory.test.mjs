import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { headings, parseFrontmatter, sectionText, upsertToc } from './lib/markdown.mjs';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), 'project-memory.mjs');

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true });
}

function withProject(fn) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-cli-'));
  try {
    fn(project, path.join(project, '.project-memory'));
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
}

test('front matter 和标题锚点', () => {
  assert.deepEqual(parseFrontmatter('---\nstatus: active\ntags: [需求, 范围]\nid_high_water: 3\n---\n# x\n'), {
    status: 'active',
    tags: ['需求', '范围'],
    id_high_water: '3'
  });
  const body = '# 标题\n\n## 1. 同步（双向）\n\n```md\n## 代码块里的不算\n```\n\n## Read Me\n\n## Read Me\n';
  assert.deepEqual(headings(body).map((item) => item.anchor), ['标题', '1-同步双向', 'read-me', 'read-me-1']);
});

test('章节范围到下一个同级或更高级标题为止', () => {
  const body = '# T\n\n## A\n\na\n\n### A1\n\na1\n\n## B\n\nb\n';
  assert.equal(sectionText(body, 'A'), '## A\n\na\n\n### A1\n\na1\n\n');
  assert.throws(() => sectionText(body, 'C'), /章节不存在/);
});

test('目录放在第一个二级标题前，已是最新时内容不变，章节少于两个时删掉', () => {
  const doc = '---\nstatus: active\n---\n\n# 标题\n\n说明。\n\n## 甲\n\n### 甲一\n\n## 乙\n';
  const withToc = upsertToc(doc);
  assert.equal(withToc, '---\nstatus: active\n---\n\n# 标题\n\n说明。\n\n## 目录\n\n- [甲](#甲)\n  - [甲一](#甲一)\n- [乙](#乙)\n\n## 甲\n\n### 甲一\n\n## 乙\n');
  assert.equal(upsertToc(withToc), withToc);
  assert.equal(upsertToc('# 标题\n\n## 目录\n\n- [甲](#甲)\n\n## 甲\n\n内容\n'), '# 标题\n\n## 甲\n\n内容\n');
  const tocFirst = '# 标题\n\n## 目录\n\n- [甲](#甲)\n\n说明。\n\n## 甲\n\n## 乙\n';
  assert.equal(upsertToc(tocFirst), '# 标题\n\n## 目录\n\n- [甲](#甲)\n- [乙](#乙)\n\n说明。\n\n## 甲\n\n## 乙\n');
});

test('init 建出的记忆目录和 AGENTS.md 通过校验，已有文件不覆盖', () => {
  withProject((project, memory) => {
    const created = run('init', '--project', project);
    assert.equal(created.status, 0);
    const index = fs.readFileSync(path.join(memory, 'INDEX.md'), 'utf8');
    assert.match(index, /\| `requirements\/product.md` \| 产品需求 \| draft \| 需求 \|/);
    assert.match(index, /\| `development\/work-packages.md` \| 工作包登记 \| active \| 工作包 \|/);
    assert.doesNotMatch(index, /ADR-0001-template/);
    assert.doesNotMatch(fs.readFileSync(path.join(memory, 'project', 'charter.md'), 'utf8'), /\{\{TODAY\}\}/);
    const agents = fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8');
    assert.match(agents, /coding-standards/);
    assert.match(agents, /project-memory/);
    const validate = run('validate', '--project', project);
    assert.equal(validate.status, 0, validate.stdout);
    assert.match(validate.stdout, /没有发现问题/);
    assert.equal(run('index', '--project', memory).stdout.trim(), '目录都是最新的。');

    fs.writeFileSync(path.join(memory, 'INDEX.md'), 'changed');
    const again = run('init', '--project', project);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /已存在/);
    assert.equal(fs.readFileSync(path.join(memory, 'INDEX.md'), 'utf8'), 'changed');
  });

  withProject((project) => {
    const agentsPath = path.join(project, 'AGENTS.md');
    fs.writeFileSync(agentsPath, '# Custom\n');
    const res = run('init', '--project', project);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /已存在，未改动/);
    assert.equal(fs.readFileSync(agentsPath, 'utf8'), '# Custom\n');
  });
});

test('read 按章节、目录和全文读，不读记忆目录外的文件', () => {
  withProject((project, memory) => {
    run('init', '--project', project);
    const section = run('read', '--project', project, '--file', 'INDEX.md', '--section', '按任务查找');
    assert.equal(section.status, 0);
    assert.match(section.stdout, /^## 按任务查找\n/);
    assert.doesNotMatch(section.stdout, /## 文档目录/);
    assert.match(run('read', '--project', project, '--file', 'INDEX.md', '--toc').stdout, /- \[当前工作\]/);
    assert.match(run('read', '--project', project, '--file', 'INDEX.md').stdout, /^---\n/);
    fs.writeFileSync(path.join(project, 'outside.md'), 'x');
    const outside = run('read', '--project', project, '--file', '../outside.md');
    assert.equal(outside.status, 1);
    assert.match(outside.stderr, /不在记忆目录内/);
    assert.match(run('read', '--project', project, '--file', 'INDEX.md', '--section', '没有').stderr, /章节不存在/);
  });
});

test('index --write 补上新文档的目录和文档目录行', () => {
  withProject((project, memory) => {
    run('init', '--project', project);
    fs.writeFileSync(path.join(memory, 'development', 'sync.md'), '---\nstatus: active\ntags: [同步]\n---\n\n# 同步流程\n\n## 上传\n\n## 下载\n');
    const check = run('index', '--project', project).stdout;
    assert.match(check, /^- development\/sync.md$/m);
    assert.match(check, /^- INDEX.md$/m);
    assert.match(run('validate', '--project', project).stdout, /建议：development\/sync.md: 目录过期/);
    assert.equal(run('index', '--write', '--project', project).status, 0);
    assert.match(fs.readFileSync(path.join(memory, 'development', 'sync.md'), 'utf8'), /## 目录\n\n- \[上传\]\(#上传\)/);
    assert.match(fs.readFileSync(path.join(memory, 'INDEX.md'), 'utf8'), /\| `development\/sync.md` \| 同步流程 \| active \| 同步 \|/);
    assert.equal(run('index', '--project', project).stdout.trim(), '目录都是最新的。');
  });
});

test('validate 报出断链、重复编号、编号水位过低和 ADR 撞号；锚点失效只给建议', () => {
  withProject((project, memory) => {
    run('init', '--project', project);
    const product = path.join(memory, 'requirements', 'product.md');
    fs.writeFileSync(product, fs.readFileSync(product, 'utf8')
      .replace('id_high_water: 0', 'id_high_water: 1')
      .concat('\n| 编号 | 需求 |\n| --- | --- |\n| REQ-001 | a |\n| REQ-002 | b |\n| REQ-002 | c |\n\n| 编号 | 历史 |\n| --- | --- |\n| REQ-001 | 另一张表 |\n'));
    fs.writeFileSync(path.join(memory, 'project', 'links.md'), '# 链接\n\n[缺文件](../missing.md)\n[缺锚点](charter.md#没有这节)\n[项目文件](/src/app.ts)\n[外链](https://example.com)\n`[代码](nope.md)`\n');
    fs.mkdirSync(path.join(project, 'src'));
    fs.writeFileSync(path.join(project, 'src', 'app.ts'), '');
    fs.writeFileSync(path.join(memory, 'decisions', 'ADR-0002-a.md'), '# ADR-0002 a\n');
    fs.writeFileSync(path.join(memory, 'decisions', 'ADR-0002-b.md'), '# ADR-0002 b\n');

    const result = run('validate', '--format', 'json', '--project', project);
    assert.equal(result.status, 1);
    const { valid, issues, advice } = JSON.parse(result.stdout);
    assert.equal(valid, false);
    assert.deepEqual(issues, [
      'project/links.md: 链接目标不存在：../missing.md',
      'requirements/product.md: 同一张表里编号重复：REQ-002',
      'requirements/product.md: id_high_water 1 小于已用的最大编号 2',
      'decisions/: ADR-0002 被多个文件使用：ADR-0002-a.md, ADR-0002-b.md'
    ]);
    assert.ok(advice.includes('project/links.md: 链接锚点不存在：charter.md#没有这节'));
  });
});

test('没有记忆目录时报错', () => {
  withProject((project) => {
    const result = run('validate', '--project', project);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /没有找到记忆目录/);
  });
});

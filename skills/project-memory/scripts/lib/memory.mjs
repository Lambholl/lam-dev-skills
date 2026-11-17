// 项目记忆目录的读取、目录重建和校验。

import fs from 'node:fs';
import path from 'node:path';

import { headings, parseFrontmatter, sectionText, splitFrontmatter, tocText, upsertCatalog, upsertToc } from './markdown.mjs';

const TEMPLATE_FILE = /template/i;

function toPosix(value) {
  return value.replaceAll('\\', '/');
}

/** 列出目录下所有 Markdown 文件的绝对路径，按路径排序，跳过符号链接。 */
export function listMarkdownFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(child);
    }
  };
  walk(root);
  return files.sort();
}

/** 把 `--project` 解析成记忆目录：可以给项目根目录，也可以直接给 `.project-memory`。 */
export function resolveMemoryRoot(project = process.cwd()) {
  const base = path.resolve(project);
  return path.basename(base) === '.project-memory' ? base : path.join(base, '.project-memory');
}

/** 按本地日期返回 `YYYY-MM-DD`。 */
export function today(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 从模板创建记忆目录，把 `{{TODAY}}` 换成 date，再生成 INDEX 的文档目录。
 *
 * @throws {Error} 记忆目录已经存在时，不改动任何文件。
 */
export function initMemory(memoryRoot, templateRoot, date = today()) {
  if (fs.existsSync(memoryRoot)) throw new Error(`记忆目录已存在，没有改动：${memoryRoot}`);
  fs.cpSync(templateRoot, memoryRoot, { recursive: true });
  for (const file of listMarkdownFiles(memoryRoot)) {
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('{{TODAY}}', date));
  }
  rebuildIndex(memoryRoot);
}

/**
 * 读记忆目录里的一个 Markdown 文件：默认全文，section 给定时只读该章节，toc 为真时只读 `## 目录`。
 *
 * @throws {Error} 路径不在记忆目录内、不是 Markdown、文件或章节不存在时。
 */
export function readMemoryFile(memoryRoot, file, { section, toc } = {}) {
  if (section && toc) throw new Error('--section 和 --toc 只能选一个。');
  const target = path.resolve(memoryRoot, file);
  const relative = path.relative(memoryRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`路径不在记忆目录内：${file}`);
  if (!target.toLowerCase().endsWith('.md')) throw new Error(`只能读 Markdown 文件：${file}`);
  if (!fs.existsSync(target)) throw new Error(`文件不存在：${toPosix(relative)}`);
  const text = fs.readFileSync(target, 'utf8');
  if (!section && !toc) return text;
  const { body } = splitFrontmatter(text);
  return toc ? tocText(body) : sectionText(body, section);
}

/** INDEX 文档目录里列出的文档：除 INDEX 和模板文件外的全部记忆文档。 */
export function catalogDocuments(memoryRoot) {
  return listMarkdownFiles(memoryRoot)
    .map((file) => toPosix(path.relative(memoryRoot, file)))
    .filter((relative) => relative !== 'INDEX.md' && !TEMPLATE_FILE.test(path.basename(relative)))
    .map((relative) => {
      const text = fs.readFileSync(path.join(memoryRoot, relative), 'utf8');
      const meta = parseFrontmatter(text);
      const title = headings(splitFrontmatter(text).body).find((item) => item.level === 1)?.title;
      return {
        path: relative,
        title: title ?? path.basename(relative, '.md'),
        status: typeof meta.status === 'string' ? meta.status : '',
        tags: Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : []
      };
    });
}

// 计算每个文件重建目录后的内容，只返回会变的文件。
function pendingIndexChanges(memoryRoot) {
  const changes = [];
  for (const file of listMarkdownFiles(memoryRoot)) {
    const relative = toPosix(path.relative(memoryRoot, file));
    if (TEMPLATE_FILE.test(path.basename(relative))) continue;
    const current = fs.readFileSync(file, 'utf8');
    const next = relative === 'INDEX.md' ? upsertToc(upsertCatalog(current, catalogDocuments(memoryRoot))) : upsertToc(current);
    if (next !== current) changes.push({ file, relative, next });
  }
  return changes;
}

/** 返回需要重建目录的文件（相对记忆目录的路径）；INDEX.md 在列表里表示文档目录或它自己的目录过期。 */
export function staleIndexFiles(memoryRoot) {
  return pendingIndexChanges(memoryRoot).map((change) => change.relative);
}

/** 重建各文档的 `## 目录` 和 INDEX 的文档目录，返回改动过的文件。 */
export function rebuildIndex(memoryRoot) {
  const changes = pendingIndexChanges(memoryRoot);
  for (const change of changes) fs.writeFileSync(change.file, change.next);
  return changes.map((change) => change.relative);
}

// 取出正文里的链接目标，跳过代码块、行内代码和图片。
function linkTargets(body) {
  const targets = [];
  let fence = null;
  for (const line of body.split(/\r?\n/)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    for (const match of line.replace(/`+[^`]*`+/g, '').matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = match[1].trim();
      target = target.startsWith('<') ? target.slice(1, target.indexOf('>')) : target.split(/\s+["']/)[0];
      try {
        targets.push(decodeURIComponent(target));
      } catch {
        targets.push(target);
      }
    }
  }
  return targets;
}

// 检查链接：目标文件不存在是问题，Markdown 目标里找不到锚点是建议。
// 以 `/` 开头的链接按项目根目录解析，其余按链接所在文件的目录解析。
function inspectLinks(memoryRoot, issues, advice) {
  const projectRoot = path.dirname(memoryRoot);
  for (const source of listMarkdownFiles(memoryRoot)) {
    const relative = toPosix(path.relative(memoryRoot, source));
    for (const target of linkTargets(splitFrontmatter(fs.readFileSync(source, 'utf8')).body)) {
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) continue;
      const hash = target.indexOf('#');
      const filePart = hash < 0 ? target : target.slice(0, hash);
      const anchor = hash < 0 ? '' : target.slice(hash + 1).toLowerCase();
      const file = !filePart ? source
        : filePart.startsWith('/') ? path.join(projectRoot, filePart)
          : path.resolve(path.dirname(source), filePart);
      if (!fs.existsSync(file)) {
        issues.push(`${relative}: 链接目标不存在：${target}`);
        continue;
      }
      if (!anchor || !file.toLowerCase().endsWith('.md') || !fs.statSync(file).isFile()) continue;
      const anchors = new Set(headings(splitFrontmatter(fs.readFileSync(file, 'utf8')).body).map((item) => item.anchor));
      if (!anchors.has(anchor)) advice.push(`${relative}: 链接锚点不存在：${target}`);
    }
  }
}

// 检查 front matter 带 id_prefix 的登记表：同一张表里编号不能重复，id_high_water 不能小于已用的最大编号。
function inspectRegistries(memoryRoot, issues) {
  for (const file of listMarkdownFiles(memoryRoot)) {
    const relative = toPosix(path.relative(memoryRoot, file));
    if (TEMPLATE_FILE.test(path.basename(relative))) continue;
    const text = fs.readFileSync(file, 'utf8');
    const meta = parseFrontmatter(text);
    if (!meta.id_prefix) continue;
    if (!/^\d+$/.test(meta.id_high_water ?? '')) {
      issues.push(`${relative}: id_high_water 应是非负整数，当前为 ${meta.id_high_water ?? '空'}`);
      continue;
    }
    const prefix = meta.id_prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idCell = new RegExp(`^\\|\\s*${prefix}-(\\d+)\\s*\\|`);
    let seen = new Set();
    const duplicates = new Set();
    let max = 0;
    for (const line of splitFrontmatter(text).body.split(/\r?\n/)) {
      if (!line.startsWith('|')) {
        seen = new Set();
        continue;
      }
      const match = line.match(idCell);
      if (!match) continue;
      const id = `${meta.id_prefix}-${match[1]}`;
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
      max = Math.max(max, Number(match[1]));
    }
    if (duplicates.size) issues.push(`${relative}: 同一张表里编号重复：${[...duplicates].join(', ')}`);
    if (Number(meta.id_high_water) < max) issues.push(`${relative}: id_high_water ${meta.id_high_water} 小于已用的最大编号 ${max}`);
  }
}

// 检查 decisions/ 下 ADR 编号是否被多个文件占用。
function inspectAdrIds(memoryRoot, issues) {
  const directory = path.join(memoryRoot, 'decisions');
  if (!fs.existsSync(directory)) return;
  const byId = new Map();
  for (const name of fs.readdirSync(directory)) {
    const match = name.match(/^(ADR-\d+)(?:-.*)?\.md$/i);
    if (!match || TEMPLATE_FILE.test(name)) continue;
    const id = match[1].toUpperCase();
    byId.set(id, [...(byId.get(id) ?? []), name]);
  }
  for (const [id, names] of byId) {
    if (names.length > 1) issues.push(`decisions/: ${id} 被多个文件使用：${names.join(', ')}`);
  }
}

/**
 * 校验记忆目录。
 *
 * @returns {{valid: boolean, issues: string[], advice: string[]}} issues 是要修的问题，有问题时 valid 为假；advice 只提示，不影响 valid。
 */
export function validateMemory(memoryRoot) {
  const issues = [];
  const advice = [];
  inspectLinks(memoryRoot, issues, advice);
  inspectRegistries(memoryRoot, issues);
  inspectAdrIds(memoryRoot, issues);
  for (const relative of staleIndexFiles(memoryRoot)) advice.push(`${relative}: 目录过期，运行 index --write 重建`);
  return { valid: issues.length === 0, issues, advice };
}

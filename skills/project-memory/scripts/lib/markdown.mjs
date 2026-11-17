// 记忆文档的 Markdown 解析：front matter、标题、章节、文档内目录和 INDEX 的文档目录。

const TOC_HEADING = '目录';
const CATALOG_HEADING = '文档目录';

/** 把文档拆成 front matter（含两条 `---` 分隔线）和正文；没有 front matter 时 prefix 为空。 */
export function splitFrontmatter(text) {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const match = clean.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? { prefix: match[0], body: clean.slice(match[0].length) } : { prefix: '', body: clean };
}

/** 读取 front matter 的键值。`[a, b]` 形式的值解析成数组，其余是字符串。 */
export function parseFrontmatter(text) {
  const { prefix } = splitFrontmatter(text);
  const data = {};
  for (const line of prefix.split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):[ \t]*(.*?)[ \t]*$/);
    if (!pair) continue;
    const value = pair[2];
    data[pair[1]] = value.startsWith('[') && value.endsWith(']')
      ? value.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean)
      : value;
  }
  return data;
}

/** GitHub 风格的标题锚点：转小写，去掉字母、数字、空格、`_`、`-` 以外的字符，空格换成 `-`。 */
export function slugHeading(heading) {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

/**
 * 列出正文里的标题，跳过代码块。
 *
 * @returns {{level: number, title: string, anchor: string, start: number}[]} start 是标题行在正文里的字符位置；同名标题的锚点按出现顺序加 `-1`、`-2`。
 */
export function headings(body) {
  const result = [];
  const seen = new Map();
  let fence = null;
  for (const line of body.matchAll(/^.*$/gm)) {
    const text = line[0].replace(/\r$/, '');
    const marker = text.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const match = text.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const base = slugHeading(match[2]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    result.push({ level: match[1].length, title: match[2].trim(), anchor: count ? `${base}-${count}` : base, start: line.index });
  }
  return result;
}

/** 返回标题为 title 的章节原文，范围到下一个同级或更高级标题为止。找不到时抛错。 */
export function sectionText(body, title) {
  const all = headings(body);
  const target = all.find((item) => item.title === title);
  if (!target) throw new Error(`章节不存在：${title}`);
  const next = all.find((item) => item.start > target.start && item.level <= target.level);
  return body.slice(target.start, next?.start ?? body.length);
}

// 删掉一个二级章节（含标题），只整理它两侧的空行。
function removeSection(body, title) {
  const target = headings(body).find((item) => item.level === 2 && item.title === title);
  if (!target) return body.trimEnd();
  const next = headings(body).find((item) => item.start > target.start && item.level <= 2);
  const before = body.slice(0, target.start).trimEnd();
  const after = body.slice(next?.start ?? body.length).trimStart();
  return (before && after ? `${before}\n\n${after}` : before || after).trimEnd();
}

// 文档内目录的范围：`## 目录` 标题加紧跟的列表。列表后面的说明文字不算目录。
function tocRange(body) {
  const heading = headings(body).find((item) => item.level === 2 && item.title === TOC_HEADING);
  if (!heading) return null;
  const listLine = /^(?:[ \t]*[-*+][ \t].*|[ \t]*)$/;
  let end = body.indexOf('\n', heading.start);
  while (end >= 0 && end < body.length) {
    const nextEnd = body.indexOf('\n', end + 1);
    const line = body.slice(end + 1, nextEnd < 0 ? body.length : nextEnd).replace(/\r$/, '');
    if (!listLine.test(line)) break;
    end = nextEnd;
  }
  return { start: heading.start, end: end < 0 ? body.length : end };
}

/** 返回文档内目录（`## 目录` 标题和它的列表）。没有目录时抛错。 */
export function tocText(body) {
  const range = tocRange(body);
  if (!range) throw new Error('文档没有目录');
  return `${body.slice(range.start, range.end).trimEnd()}\n`;
}

function removeToc(body) {
  const range = tocRange(body);
  if (!range) return body.trimEnd();
  const before = body.slice(0, range.start).trimEnd();
  const after = body.slice(range.end).trim();
  return (before && after ? `${before}\n\n${after}` : before || after).trimEnd();
}

/** 生成文档内目录。二级及以下的章节少于两个时不需要目录，返回空字符串。 */
export function renderToc(body) {
  const entries = headings(removeToc(body)).filter((item) => item.level >= 2);
  if (entries.length < 2) return '';
  const lines = entries.map((item) => `${'  '.repeat(item.level - 2)}- [${item.title.replace(/[[\]]/g, '\\$&')}](#${item.anchor})`);
  return [`## ${TOC_HEADING}`, '', ...lines].join('\n');
}

/** 重写文档内目录。已有目录原地替换；没有时插在第一个二级标题前；不需要目录时删掉已有的目录。 */
export function upsertToc(text) {
  const { prefix, body } = splitFrontmatter(text);
  const toc = renderToc(body);
  const existing = tocRange(body);
  if (existing) {
    const before = body.slice(0, existing.start).trimEnd();
    const after = body.slice(existing.end).trim();
    return `${prefix}${[before, toc, after].filter(Boolean).join('\n\n')}\n`;
  }
  const withoutToc = body.trimEnd();
  if (!toc) return `${prefix}${withoutToc}\n`;
  const firstSection = headings(withoutToc).find((item) => item.level >= 2);
  const before = withoutToc.slice(0, firstSection.start).trimEnd();
  const after = withoutToc.slice(firstSection.start);
  return `${prefix}${before ? `${before}\n\n` : ''}${toc}\n\n${after}`.trimEnd() + '\n';
}

function cell(value) {
  return String(value).replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
}

/** 生成 INDEX 的文档目录章节。documents 的每项含 path、title、status、tags。 */
export function renderCatalog(documents) {
  const rows = documents.map((doc) => `| \`${doc.path}\` | ${cell(doc.title)} | ${cell(doc.status)} | ${cell(doc.tags.join(', '))} |`);
  return [`## ${CATALOG_HEADING}`, '', '| 文档 | 标题 | 状态 | 标签 |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

/** 把 INDEX 的文档目录换成 documents 生成的版本，放在文末。 */
export function upsertCatalog(text, documents) {
  const { prefix, body } = splitFrontmatter(text);
  return `${prefix}${removeSection(body, CATALOG_HEADING)}\n\n${renderCatalog(documents)}\n`;
}

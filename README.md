# Lambholl's Development Skills

给 Claude Code、Codex 和 Antigravity 用的四个开发技能：写文档、写提交信息、写代码和维护项目记忆。每个技能带一个 Hook，在 Agent 写文档、写注释、提交和开新会话时提醒它按技能自查。

## 技能

| 技能 | 什么时候用 | 做什么 | Hook |
| --- | --- | --- | --- |
| `dev-writing` | 写或改项目文档、发布说明、界面文案 | 按读者组织内容，写清状态，去掉套话和多余免责 | 写入 Markdown 后提醒自查 |
| `git-workflow` | 写提交信息/PR，或执行 commit、push、merge、rebase | Conventional Commits 格式，写清正文，确认身份和授权 | 首次 commit/PR 时拦下给自查清单 |
| `coding-standards` | 写、改、评审代码和测试，配置 lint/CI | 命名、错误处理、注释等规则，以及测试取舍 | 新增注释时提醒自查 |
| `project-memory` | 项目有 `.project-memory/`，或要建立项目记忆 | 保存项目的事实、需求、决定和当前工作 | 会话开始注入记忆入口 |


前三个技能可以单独用。用 `project-memory` 的项目要把四个都装上。

## 安装

需要 Node.js 22 或更高版本。

```bash
git clone https://github.com/Lambholl/lam-dev-skills.git lam-dev-skills
cd lam-dev-skills
node scripts/install.mjs install
```

`install` 把每个技能链接到对应平台的用户级技能目录，再把 Hook 合并进用户级配置。配置里已有的其他 Hook 和设置不动，改之前先备份成 `<文件>.bak-<时间>`。

| 平台参数 | 工具 | 技能目录 | Hook 配置与支持范围 |
| --- | --- | --- | --- |
| `claude` | Claude Code | `~/.claude/skills/` | `~/.claude/settings.json`（全部 4 个技能） |
| `codex` | Codex | `~/.codex/skills/` | `~/.codex/hooks.json`（全部 4 个技能） |
| `agy` | Antigravity | `~/.gemini/config/skills/` | `~/.gemini/config/hooks.json`（`git-workflow`、`project-memory`；Antigravity 不支持 `PostToolUse` 注入上下文） |

技能是链接，`git pull` 后直接生效。Hook 命令写的是仓库的绝对路径，要移动仓库时先 `uninstall`，移好后再 `install`。

Codex 对新加或改过的 Hook 要先信任才执行。安装后在 Codex 里运行 `/hooks` 审阅并信任。

### 安装命令

```bash
# 先看会改什么，不写文件
node scripts/install.mjs install --dry-run

# 只装到某个平台；默认 all，即 home 目录下已有对应配置目录的平台
node scripts/install.mjs install --platform claude
node scripts/install.mjs install --platform codex
node scripts/install.mjs install --platform agy

# 查看每个技能的链接和 Hook 状态
node scripts/install.mjs status

# 删除本仓库的链接和 Hook，其他内容不动
node scripts/install.mjs uninstall
```

技能目录里已有同名目录、又不是本仓库的链接时，`install` 报冲突，不动它，以退出码 1 结束。确认不再需要那个目录后删掉它，再运行一次 `install`。

## 项目记忆命令

`project-memory` 自带一个命令行工具。`--project` 可以给项目根目录或 `.project-memory` 目录，默认当前目录。

```bash
# 从模板创建 .project-memory/，已存在时不覆盖
node skills/project-memory/scripts/project-memory.mjs init --project .

# 读全文、只读目录、只读一个章节
node skills/project-memory/scripts/project-memory.mjs read --file INDEX.md
node skills/project-memory/scripts/project-memory.mjs read --file requirements/product.md --toc
node skills/project-memory/scripts/project-memory.mjs read --file requirements/product.md --section "需求"

# 列出目录过期的文件；加 --write 重建各文档的目录和 INDEX 的文档目录
node skills/project-memory/scripts/project-memory.mjs index
node skills/project-memory/scripts/project-memory.mjs index --write

# 校验链接、登记表编号和 ADR 编号；有问题时退出码为 1
node skills/project-memory/scripts/project-memory.mjs validate
node skills/project-memory/scripts/project-memory.mjs validate --format json
```

## 测试

```bash
npm test
```

## 许可

[MIT LICENSE](LICENSE)：自由使用，商业或个人均可。

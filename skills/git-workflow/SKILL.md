---
name: git-workflow
description: 写提交信息或 PR 描述，以及执行 git add、commit、push、merge、rebase、cherry-pick、打 tag 等改变仓库历史或远端的操作前使用。给出 Conventional Commits 格式、正文写什么、身份和隐私要求，以及每种 Git 操作需要的授权。
---

# Git 提交

提交信息写给以后对照 diff 查历史的人。他们看得到改了哪些行，看不到为什么改、行为变成什么样、哪些情况还没测。

## 项目差异

先读项目对提交的约定：有 `.project-memory/` 时读 `.project-memory/standards/commit.md`，没有时看 `AGENTS.md`、`CLAUDE.md` 里的相应内容。

优先级从高到低：请求者本轮的要求、项目的提交工具配置（commitlint、commitizen 等）、项目约定、本技能、仓库最近的提交风格。

## 提交前

- 用 `git status` 和 `git diff --stat` 确认暂存的只有本次工作的文件。
- 一个提交对应一个完整的阶段成果：一项功能、一次修复、一次重构、一次文档更新。
- 跑和本次改动相关的最小验证，结果写进正文。

## 语言

提交信息用项目约定的语言。项目没有约定时跟随最近的提交；仓库还没有提交时，用请求者在对话里用的语言。

## 标题

```text
<type>(<scope>): <描述>
```

- `type` 固定用英文：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`。
- `scope` 写受影响的模块，用提交信息的语言，可以省略。
- 描述写这次改了什么，具体到不看正文也知道改动对象。中文用动宾短语；英文用祈使句、首字母小写。两种都不加句号。
- 不兼容的变更在 `type` 或 `scope` 后加 `!`，并在页脚写 `BREAKING CHANGE:`，说明怎么迁移。

### 合并提交

合并提交的标题保留 Git 和代码托管平台生成的默认格式，不改成 `<type>(<scope>): <描述>`，也不翻译：

| 来源 | 标题 |
| --- | --- |
| GitHub 合并 PR | `Merge pull request #<PR 编号> from <源分支名>` |
| `git merge` 合并到默认分支 | `Merge branch '<源分支名>'` |
| `git merge` 合并到其他分支 | `Merge branch '<源分支名>' into <目标分支名>` |

正文按普通提交的正文规则写。

## 正文

错别字、格式调整、单行配置这类改动可以只写标题，其余都写正文。

正文写 diff 里看不出的内容：

- 改之前有什么问题，为什么改；
- 行为变化和关键取舍；
- 风险；
- 验证结论和没测的场景。

默认格式：标题下第一段用一两句写背景和原因，不加段落名；后面接三个带段落名的段落。没有内容的段落直接省略，不写“无”。

| 中文段落名 | 英文段落名 | 内容 |
| --- | --- | --- |
| 技术方案： | Changes: | 每条一个要点，写行为和取舍 |
| 影响范围： | Scope: | 一行列出受影响的模块或接口 |
| 测试确认： | Testing: | 跑过的检查、手动验证的条件、没测的场景 |

正文一般不超过 10 行。这些内容 diff 或项目文档里已经有，不写进正文：

- 实现步骤；
- 函数、常量、字段的逐项说明；
- 逐个文件的清单；
- 文档或项目记忆的同步清单，以及记忆维护命令；
- 项目记忆里的编号，如工作包、变更请求的 ID。条目闭环后会从记忆里删除，留在提交历史里的编号就查不到了。

## 身份和隐私

提交信息以项目开发者的身份写：

- “用户”只指应用的使用者。
- 不写对话来历：谁在哪次对话里提的要求、谁确认过。只写由此产生的事实和决定。
- 以后仍要人放行的事写明“维护者”，如“发布前由维护者确认签名证书”。

隐私：

- 测试确认写复现需要的条件，如“同时有物理网卡和虚拟网卡的 Windows 电脑”。不写维护者的设备和环境标识：主机名、IP、MAC、序列号、带用户名的本机路径、所装软件和服务的产品名、测试数据来自哪台机器。结论确实依赖某个产品时才写产品名。
- 不写密钥、令牌、账号、客户隐私和未脱敏的日志。拿不准是否敏感就不写。

## PR 描述

PR 描述用和提交信息相同的语言和取舍：概括变更，写验证结果、风险和没做完的事。PR 标题不要求符合提交标题格式，项目另有约定时按项目。

## 授权

Git 操作要请求者在当前对话里明确同意。计划、项目文档和之前任务里写的提交安排，都要在当前对话重新确认。批准计划、实现完成、收尾，都不等于同意提交。

| 操作 | 一次同意覆盖的范围 |
| --- | --- |
| `git add`、`commit` | 当前工作的一次提交。范围变了、要 `--amend` 时重新确认 |
| `push` | 普通 push 到说定的远端和分支。tag 和 force-push 另行确认 |
| `merge`、`rebase`、`cherry-pick` | 开始、继续、中止分别确认 |
| 解决冲突 | 可以编辑冲突内容，只暂存本次解决的冲突路径；`--continue`、`commit`、`--abort` 另行确认 |
| worktree | 可以准备隔离的工作区；提交 `.gitignore`、安装依赖、清理旧工作区分别确认 |
| 删除分支、清理工作区 | 每次单独确认 |

派子 Agent 时写明它可以做哪些操作。提交和推送由主 Agent 在得到同意后执行。

收尾时分开说“实现已验证”和“已提交、已推送或已发布”。

分支命名跟随项目规则；没有规则时用简短的英文 kebab-case，写任务范围，如 `fix/token-refresh`。

## 示例

```text
fix(登录): 令牌过期后回到原页面

令牌过期后接口返回 401，页面停在空白状态，只能手动刷新。

技术方案：
- 收到 401 时清除本地会话并跳转登录页
- 跳转前记下当前路由，重新登录后返回

影响范围：登录页、请求拦截

测试确认：单元测试通过；手动让令牌过期后能回到原页面。多标签页同时过期的情况没测
```

```text
perf(search): cache tokenized queries per session

Repeated searches re-tokenized the same query on every keystroke,
which made typing lag on long documents.

Changes:
- Keep the last 50 tokenized queries in an LRU cache per session
- Clear the cache when the document language changes

Testing: benchmark on a 2 MB document drops from 120 ms to 15 ms per
keystroke. Right-to-left languages not tested.
```

## Hook

`git commit`、`gh pr create`、`gh pr edit` 第一次执行时，Hook 拦下命令并给出自查清单。查过没问题就原样重新执行：同一会话里提交信息不变时放行，改了信息会再提醒一次。

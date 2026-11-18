---
name: git-workflow
description: 写提交信息或 PR 描述，以及执行 git add、commit、push、merge、rebase、cherry-pick、打 tag 等改变仓库历史或远端的操作前使用。给出 Conventional Commits 格式、正文写什么、身份和隐私要求，以及每种 Git 操作需要的授权。
---

# Git 提交

提交信息写给以后对照 diff 查历史的人。他们看得到改了哪些行，看不到为什么改、行为变成什么样。标题够用就只写标题。

## 项目差异

先读项目对提交的约定：有 `.project-memory/` 时读 `.project-memory/standards/commit.md`，没有时看 `AGENTS.md`、`CLAUDE.md` 里的相应内容。

优先级从高到低：请求者本轮的要求、项目的提交工具配置（commitlint、commitizen 等）、项目约定、本技能、仓库最近的提交风格。

## 提交前

- 用 `git status` 和 `git diff --stat` 确认暂存的只有本次工作的文件。
- 一个提交对应一个完整的阶段成果：一项功能、一次修复、一次重构、一次文档更新。
- 跑和本次改动相关的最小验证。

## 语言

提交信息用项目约定的语言。项目没有约定时跟随最近的提交；仓库还没有提交时，用请求者在对话里用的语言。

## 格式

```text
<type>(<scope>): <描述>

[正文，可选]

[页脚，可选]
```

## 标题

- `type` 固定用英文：

| Type | Description |
| --- | --- |
| feat | A new feature for the user |
| fix | A bug fix for the user |
| docs | Documentation only changes |
| style | Code style (formatting, semicolons) |
| refactor | Code change (no bug fix, no feature) |
| perf | Performance improvement |
| test | Adding or correcting tests |
| build | Build system or dependencies |
| ci | CI configuration and scripts |
| chore | Routine tasks (no src/test change) |
| revert | Reverts a previous commit |

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

正文可选。标题加上 diff 已经能让人看懂这次改动时，不写正文，如改错别字、调格式、升级依赖、改单行配置，以及原因一看就懂的小修复。

标题和 diff 说明不了的内容才写进正文：

- 改之前有什么问题，为什么要改；
- 行为变成什么样，做了什么取舍；
- 会影响使用者或后续开发的风险，如兼容性变化、已知没处理的情况。

写法：

- 第一句写为什么改：改之前的问题，优先写用户看到的现象，一两句。
- 一段只讲一件事。还有别的变化、取舍或例外时分点，每点一句，结论在前，原因放在冒号后。
- 不复述标题。
- 不加“技术方案”“影响范围”“测试确认”这类段落名。
- 不写测试结果和验证过程，如“测试通过”“手动验证过”。验证情况写在 PR 描述里。
- 正文超过 10 行时，先看能不能拆成几个提交，或者把细节移到 PR 描述和项目文档。
- 如果是中文提交，一段话写在一行中，不因一行过长而拆行。

这些内容 diff 或项目文档里已经有，不写进正文：

- 实现步骤；
- 函数、常量、字段的逐项说明；
- 逐个文件的清单；
- 文档或项目记忆的同步清单，以及记忆维护命令；
- 项目记忆里的编号，如工作包、变更请求的 ID。条目闭环后会从记忆里删除，留在提交历史里的编号就查不到了。

## 页脚

页脚可选，只放固定格式的条目：

- `BREAKING CHANGE: <变化和迁移方法>`，写使用者会遇到什么、要做什么。只是版本号升了时不逐个列出版本号；要手动迁移的文件或字段要写出来；
- 关联的 issue，如 `Closes #123`，格式跟随托管平台和项目习惯；
- 工具或平台生成的 `Co-authored-by:` 等行，原样保留。

## 身份和隐私

提交信息以项目开发者的身份写：

- “用户”只指应用的使用者。
- 不写对话过程：谁在哪次对话里提的要求、谁确认过。只写由此产生的事实和决定。
- 以后仍要人放行的事写明“维护者”，如“发布前由维护者确认签名证书”。

隐私：

- PR 描述里的验证情况写复现需要的条件，如“同时有物理网卡和虚拟网卡的 Windows 电脑”。不写维护者的设备和环境标识：主机名、IP、MAC、序列号、带用户名的本机路径、所装软件和服务的产品名、测试数据来自哪台机器。结论确实依赖某个产品时才写产品名。
- 不写密钥、令牌、账号、客户隐私和未脱敏的日志。拿不准是否敏感就不写。

## PR 描述

PR 描述用和提交信息相同的语言，概括变更，写验证方式和结果、风险和没做完的事，不复述 diff。PR 标题不要求符合提交标题格式，项目另有约定时按项目。

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

只写标题：

```text
docs(readme): 修正安装命令里的包名
```

```text
fix(compiler-sfc): keep generic type arguments in scope
```

一段话正文，只写原因，改了什么看标题：

```text
fix(发布): 发布检查改为 tag 在 origin/master 上

远程默认分支已是 master，没有 main，发布工作流核对 tag 时找不到 origin/main，在构建前失败。
```

```text
perf(search): cache tokenized queries per session

Repeated searches re-tokenized the same query on every keystroke, which
made typing lag on long documents. Keep the last 50 tokenized queries in
an LRU cache and clear it when the document language changes.
```

一句写问题，再分点写行为变化：

```text
fix(同步): 一端取消时两端都记为取消

取消的一端停下后会关掉内容连接，另一端只看到连接断开，界面显示“传输失败：网络连接中断”。

- 手机上取消时，先请电脑取消再停下本机，电脑没有回应时最多等 5 秒。
- 电脑请手机取消时，手机直接停下，不再回请电脑。
```

分点写取舍，原因放在冒号后：

```text
feat(设备页): Android 扫码连接另一台设备

扫码比手动输入 IP 方便；二维码带全部候选地址，推荐地址选错时也能连上。

- 解码用 ZXing，不用 ML Kit：ML Kit 会上传设备和使用数据，没有关闭开关，应用只走局域网。
- CameraX 停在 1.5：1.6 带入完整 Guava，和固定的 listenablefuture 类重复，APK 构建失败。
- 设备 ID 不一致时不保存；相机权限被拒时可去系统设置或手动输入。
```

不兼容的变更：

```text
feat(config)!: 配置文件从 JSON 改为 TOML

BREAKING CHANGE: 不再读取 config.json。运行 `app migrate-config` 把旧配置转成 config.toml。
```

## Hook

`git commit`、`gh pr create`、`gh pr edit` 第一次执行时，Hook 拦下命令并给出自查清单。查过没问题就原样重新执行：同一会话里提交信息不变时放行，改了信息会再提醒一次。

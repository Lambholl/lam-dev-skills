# 记忆模型

## 目录分工

| 位置 | 内容 |
| --- | --- |
| `INDEX.md` | 当前工作、按任务的路由、文档目录 |
| `project/` | 目标、成功标准、路线图、术语表 |
| `requirements/` | 产品需求、范围、约束、开放问题、变更请求 |
| `architecture/` | 架构、模块关系、数据流、接口、外部依赖 |
| `decisions/` | 仍然有效的长期技术和产品决定（ADR） |
| `development/` | 代码地图、模块状态、实现要点、已知问题、风险 |
| `testing/` | 测试用例、验收标准、覆盖缺口、回归状态 |
| `standards/` | 项目对写作、提交、编码、测试规范的差异 |

模板给出固定路径，按需要读写。用不上的文档可以删掉，INDEX 可以按项目需要加章节。

## 容易混淆的位置

- 为什么选这个方案写进 `decisions/`；系统现在怎么设计写进 `architecture/`。
- 已经发生的缺陷和阻碍写进 `development/known-issues.md`，解决后删除；还没发生的写进 `development/risks.md`，风险消失后删除。
- 测试规则写进 `standards/testing.md`；具体用例、验收标准和覆盖缺口写进 `testing/`。
- 已完成的需求只保留仍然有效的产品行为。

## 信息状态

| 信息 | 写到哪里 |
| --- | --- |
| 请求者确认的目标、范围或规则 | 对应的文档，直接写结论，状态 `active` 或 `accepted` |
| 代码、配置、测试或运行结果证明的现状 | 对应的文档，写明证据 |
| 为推进工作暂时采用的假设 | `requirements/open-questions.md`，状态 `unverified`；证实后写进对应文档 |
| 还没决定，或需要外部验证的问题 | `requirements/open-questions.md` |
| 明确不采用的方案 | 相关 ADR 的“替代方案”，或 `requirements/change-requests.md` |
| 需要原型、测量或实地验证的事 | `development/` 或 `testing/` |
| Agent 提出的建议 | 请求者接受后，按上面各行写入 |

请求者确认前的内容用 `draft` 或 `proposed`，确认后改为 `active` 或 `accepted`。

## 写法

写法规则见 `dev-writing`。记忆另外按这些要求写：

- 写事实、结论、约束、影响、证据和能接着做的检查点。问答原文、命令输出、执行日志、临时补丁和子 Agent 的对话不写进记忆。
- 详细规格和执行计划放进专门的文档，记忆里写摘要和链接。
- 测试记录写未解决的回归、验收场景和复验方法。用例数量、单次运行的输出和逐条断言记在 Git 和测试输出里。
- 还没有事实的位置写 `待补充`。
- 不同来源说法冲突时，先把两边都作为证据列出来，有了结论后更新正文、删掉失效的说法。

## front matter

```yaml
---
doc_type: architecture
status: active
updated: 2026-06-09
tags: [认证, 接口]
---
```

- `updated` 用 Asia/Shanghai 的 `YYYY-MM-DD`，改正文时更新。
- `tags` 显示在 INDEX 的文档目录里。
- 带编号的登记表另加 `id_prefix` 和 `id_high_water`。
- 状态可以按领域增加，含义写在项目的 `standards/writing.md` 里。

# Rust

只在请求者明确要求或维护已有 Rust 代码时使用，见 `SKILL.md`“语言选择”。

依据：[Rust API Guidelines](https://rust-lang.github.io/api-guidelines/naming.html)、[Clippy](https://doc.rust-lang.org/clippy/)。

## 命名

| 对象 | 规则 | 例子 |
| --- | --- | --- |
| crate、模块、文件 | `snake_case`；发布的包名可以用连字符 | `frame_parser.rs` |
| 类型、trait、枚举、枚举变体 | `PascalCase` | `DeviceState::Running` |
| 函数、方法、变量、字段、宏 | `snake_case` | `parse_frame`、`ensure_ready!` |
| 常量、static | `SCREAMING_SNAKE_CASE` | `DEFAULT_TIMEOUT_MS` |
| 泛型参数 | 简单时用 `T`、`E`；有具体含义时用完整的词 | `Result<Value, Error>` |
| feature | `snake_case`，写能力而不是平台 | `tls_native` |

## 代码

- 库代码返回 `Result`，不 `unwrap`、`expect`，不退出进程；测试、示例和能证明不会失败的地方除外，并写明为什么不会失败。
- 错误类型带上下文，能看出是否可恢复。
- `unsafe` 块尽量小，每个都用 `// SAFETY:` 注释写明成立的不变量。
- FFI 模块写明内存所有权、释放责任、线程安全，以及 panic 是否会跨过边界。
- 异步代码不阻塞 executor；CPU 密集或阻塞 I/O 交给阻塞任务或专用线程。

## 文档注释

- 公共的 crate、模块、trait、类型、函数、方法和宏写 rustdoc。
- 第一段是摘要；需要时加 `# Errors`、`# Panics`、`# Safety`、`# Examples`。
- `unsafe fn`、unsafe trait 和 FFI 边界必须写 `# Safety`，说明调用方要满足的条件。
- 会阻塞或依赖特定异步运行时的，写明这一点。

```rust
/// 解析一个遥测帧。
///
/// # Errors
///
/// 帧头、长度或校验和无效时返回 `FrameError`。
pub fn parse_frame(buffer: &[u8]) -> Result<Frame, FrameError>
```

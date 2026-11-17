# Python

依据：[PEP 8](https://peps.python.org/pep-0008/)、[PEP 257](https://peps.python.org/pep-0257/)、[Ruff](https://docs.astral.sh/ruff/)。

## 命名

| 对象 | 规则 | 例子 |
| --- | --- | --- |
| 包、模块、文件 | 简短的 `lower_snake_case`，不和标准库重名 | `frame_parser.py` |
| 类 | `PascalCase`；异常类以 `Error` 结尾 | `DeviceTimeoutError` |
| 函数、方法、变量、参数 | `lower_snake_case`，函数以动词开头 | `load_config` |
| 常量 | `UPPER_SNAKE_CASE` | `DEFAULT_TIMEOUT_MS` |
| 模块或类内部使用的成员 | 单下划线前缀 | `_parse_header` |
| 测试函数 | `test_` 加行为和结果 | `test_parse_rejects_bad_crc` |

## 代码

- 新代码写类型注解；公共函数和跨模块的返回值必须标注。
- 不用裸 `except`；不用可变对象做默认参数。
- 脚本入口用 `if __name__ == "__main__":`，逻辑放在函数里。
- 导入按标准库、第三方、项目内分组；模块导入时不做重型 I/O，不建立外部连接。
- 生成器、上下文管理器和异步函数写清资源什么时候释放。

## 文档注释

- 公共模块、类、函数，以及复杂的上下文管理器、生成器和异步函数写 docstring。
- 跟随项目的 docstring 风格；没有约定时用 Google 风格。`Args`、`Returns`、`Raises` 只在有类型注解表达不了的内容时写。
- 生成器写明产出什么、什么时候结束；上下文管理器写明进入和退出时资源的状态；异步函数写明取消和超时的行为。

```python
def iter_frames(stream: BinaryIO) -> Iterator[Frame]:
    """逐个读出流中的帧，读到流末尾时结束。

    Raises:
        FrameError: 遇到长度字段超出剩余字节数的帧。
    """
```

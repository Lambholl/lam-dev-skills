# C

依据：C17（ISO/IEC 9899:2018）、[SEI CERT C](https://cmu-sei.github.io/secure-coding-standards/sei-cert-c-coding-standard/)、[MISRA C:2025](https://misra.org.uk/)；命名和排版参考 [Linux Kernel Style](https://www.kernel.org/doc/html/latest/process/coding-style.html)。C 和 C++ 的标准版本一起调整，调整前确认 MISRA 和 CERT 覆盖目标版本。

## 语言标准

- 按 C17 编写，编译配置显式声明：GCC/Clang `-std=c17`，MSVC `/std:c17`，CMake `C_STANDARD 17`、`C_STANDARD_REQUIRED ON`、`C_EXTENSIONS OFF`。GCC 15 起默认 `gnu23`，不声明就会按 C23 编译。
- 用到编译器扩展或平台内建函数时，在项目约定里写明原因和适用范围。
- 编译期约束用 `_Static_assert`；不返回的函数标 `_Noreturn`。
- 线程间共享的变量用 `<stdatomic.h>` 或锁同步；`volatile` 只用于硬件寄存器和信号处理。使用 `<stdatomic.h>`、`<threads.h>` 前检查 `__STDC_NO_ATOMICS__`、`__STDC_NO_THREADS__`。
- 不用变长数组和 `gets`；Annex K 的 `*_s` 函数用前检查 `__STDC_LIB_EXT1__`。

## 命名

| 对象 | 规则 | 例子 |
| --- | --- | --- |
| 文件、目录 | `lower_snake_case` | `device_frame.c` |
| 函数、变量、参数 | `lower_snake_case`；导出函数加模块前缀；变量名带上单位 | `frame_parse`、`timeout_ms` |
| 宏、枚举值 | `UPPER_SNAKE_CASE`，加模块前缀 | `DEVICE_MAX_FRAME_SIZE` |
| 结构体、枚举、联合体 | 保留标签名，再 typedef 成 `name_t` | `typedef struct device device_t;` |
| 函数指针 typedef | `name_fn` 或 `name_cb` | `device_event_cb` |

不 typedef 匿名结构体。不透明类型在头文件里写 `typedef struct device device_t;`，在实现文件里定义 `struct device`。

## 代码

- 头文件能单独包含，用 include guard 或 `#pragma once`。
- 缓冲区操作都带长度；不用无界的字符串和内存函数。
- 对象都初始化。
- 错误路径释放已获得的资源，复杂的释放可以用 `goto cleanup`。
- 整数转换、长度计算和乘法分配前检查溢出。
- 全局可变状态写明线程安全要求和初始化、销毁顺序。

## 文档注释

- 公开函数、跨模块接口和回调 typedef 在头文件声明处写 Doxygen 注释，实现处不重复。
- `@param` 标 `[in]`、`[out]`、`[in,out]`；指针参数写明能否为 `NULL`、长度单位和所有权。
- 返回状态码时写明成功和失败的值，具体错误码用 `@retval` 分项写。
- 涉及共享状态、回调、中断或线程时，写明线程安全、能在什么上下文调用（如中断上下文）、锁要求和回调触发时机。

```c
/**
 * @brief 从字节缓冲区解析一个设备帧。
 *
 * @param[in] buffer 输入字节，不得为 NULL。
 * @param[in] buffer_len buffer 的长度，单位为字节。
 * @param[out] frame 解析结果，不得为 NULL，存储空间归调用方。
 *
 * @retval 0 成功。
 * @retval -EINVAL 帧格式错误。
 * @retval -EMSGSIZE buffer 不含完整的帧。
 */
int frame_parse(const uint8_t *buffer, size_t buffer_len, frame_t *frame);
```

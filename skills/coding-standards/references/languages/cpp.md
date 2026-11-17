# C++

依据：C++17（ISO/IEC 14882:2017）、[C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines)、[SEI CERT C++](https://cmu-sei.github.io/secure-coding-standards/sei-cert-cpp-coding-standard/)、[MISRA C++:2023](https://misra.org.uk/)；命名参考 [Google C++ Style](https://google.github.io/styleguide/cppguide.html)。C 和 C++ 的标准版本一起调整。

## 语言标准

- 按 C++17 编写，编译配置显式声明：GCC/Clang `-std=c++17`，MSVC `/std:c++17`，CMake `CXX_STANDARD 17`、`CXX_STANDARD_REQUIRED ON`、`CXX_EXTENSIONS OFF`。
- 不用 C++20 及以后的特性（concepts、ranges、coroutines、modules）；项目需要时写进项目约定。
- 用到编译器扩展时，在项目约定里写明原因和适用范围。

## 命名

| 对象 | 规则 | 例子 |
| --- | --- | --- |
| 文件 | `lower_snake_case.cc` / `.cpp` / `.h` | `device_connection.cc` |
| 命名空间 | `lower_snake_case` | `app::device_runtime` |
| 类、结构体、类型别名、枚举 | `PascalCase` | `FrameParser` |
| 函数、方法 | `PascalCase`；项目沿用标准库风格时写进项目约定 | `ParseFrame` |
| 变量、参数 | `lower_snake_case` | `frame_size` |
| 类数据成员 | `lower_snake_case_` | `socket_` |
| 常量、枚举值 | `kPascalCase` | `kDefaultTimeoutMs` |
| 宏 | `UPPER_SNAKE_CASE`，加模块前缀；能不用就不用 | `DEVICE_ENABLE_TRACE` |

## 代码

- 用 RAII 管理资源；业务代码里不出现裸 `new`、`delete`。
- 所有权用值、引用、`std::unique_ptr`、`std::shared_ptr` 表达，裸指针不表示所有权。
- 返回值不能忽略的函数标 `[[nodiscard]]`；可能没有值的返回用 `std::optional`；只读字符串参数用 `std::string_view`，函数返回后不保存它。
- 析构函数不抛异常。项目统一一种错误策略：用异常就保证异常安全，不用异常就用状态码或结果类型。
- 头文件只放接口，实现放在 `.cc` / `.cpp` 或内部命名空间。
- ABI、FFI 和插件接口写明谁分配、谁释放内存，以及线程安全。

## 文档注释

- 公共头文件里的类、函数、模板、回调和 ABI 接口在声明处写 Doxygen 注释，实现处不重复。
- 另外按需写明：指针和引用能否为空、调用顺序要求、异常安全保证。
- 模板和回调写明类型参数的约束、回调在哪个线程执行、能否重入。

```cpp
/**
 * @brief Opens a device connection.
 *
 * @param config Read only during the call.
 * @return An open connection that owns the underlying handle.
 * @throws DeviceError If the device rejects the handshake.
 */
DeviceConnection OpenDevice(const DeviceConfig& config);
```

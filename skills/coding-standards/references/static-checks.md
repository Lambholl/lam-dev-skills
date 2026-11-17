# 静态检查

配置 CI、lint、formatter、类型检查或分析器时读。

## CI

- 新增和修改的代码要通过对应语言的格式、编译或语法、类型和 lint 检查，以及文件编码检查。C、C++、C#、Java、Rust 另外开分析器级别的静态分析。
- 安全扫描查密钥泄漏、危险调用、注入风险和依赖漏洞。
- 第三方代码、生成代码和历史代码可以建 baseline，只拦新增问题。
- 规则抑制写在最小范围内并写明原因，不整体关掉规则。
- 检查配置提交进仓库：`.editorconfig`、`.gitattributes`、`eslint.config.*`、`pyproject.toml`、`checkstyle.xml`、`.clang-format`、`.clang-tidy`、`PSScriptAnalyzerSettings.psd1` 等。

## 文件编码检查

默认要求见 `SKILL.md`“文件编码和换行”。CI 遇到这些情况时失败：GBK、Big5、Latin-1 编码，混合换行，意外的 BOM，替换字符 `�`，以及 `锛`、`鐩`、`Â` 这类典型乱码。

| 文件 | 例外 |
| --- | --- |
| 旧式 `.csproj` | 可以带 BOM |
| 要兼容 Windows PowerShell 5.1 且含非 ASCII 字符的 PowerShell 文件 | 可以带 BOM；Windows 专用脚本可以用 CRLF |
| Shell 和其他带 shebang 的脚本 | shebang 在文件第一个字节，不带 BOM |
| Python | 不加 PEP 263 编码声明 |

## 各语言工具

| 语言 | 必需 | 按需 |
| --- | --- | --- |
| TypeScript | `tsc --noEmit`、ESLint + typescript-eslint、Prettier 或项目 formatter | 依赖安全扫描 |
| JavaScript | ESLint、Prettier 或项目 formatter、目标运行时的语法检查 | 依赖安全扫描 |
| Python | Ruff（lint 和格式）、mypy 或 pyright | Bandit 或同类安全规则 |
| Java | Gradle 或 Maven 编译、Checkstyle（Google 规则）、google-java-format 或项目 formatter | `-Xlint:all`、Error Prone；Android 项目加 Android lint |
| C# | `dotnet build`、.NET analyzers、nullable 检查、`dotnet format` | 在 `.editorconfig` 里提升关键 CA/IDE 规则的级别 |
| C | 见下节 | 见下节 |
| C++ | 见下节 | 见下节 |
| Rust | `cargo fmt --check`、`cargo check`、`cargo clippy -- -D warnings` | `cargo audit` |
| Shell | ShellCheck、`shfmt -d`、`bash -n` | |
| PowerShell | PSScriptAnalyzer、`Invoke-Formatter`、语法解析 | |

formatter 和 lint 规则冲突时，用 formatter 管排版，关掉 lint 里冲突的规则（如 `eslint-config-prettier`）。

## C 和 C++ 补充

| 检查 | 要求 | 工具 |
| --- | --- | --- |
| 语言标准 | 显式声明，见 `languages/c.md`、`languages/cpp.md` | 编译参数或 CMake |
| 编译器告警 | 新代码不引入新告警；新项目把核心告警当错误 | GCC/Clang 见下文；MSVC `/W4` |
| 格式 | CI 检查 | `clang-format --dry-run --Werror` |
| lint | 可读性、危险 API、可疑分支 | `clang-tidy` |
| 静态分析 | 空指针、越界、未初始化、资源泄漏 | Clang Static Analyzer 或 Cppcheck |
| 头文件自包含 | 每个公共头文件能单独编译 | 为每个头文件生成一个只包含它的编译单元 |

GCC/Clang 告警：`-Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wsign-conversion -Wformat=2 -Wundef -Wvla`；C 另加 `-Wstrict-prototypes -Wmissing-prototypes -Wold-style-definition -Werror=implicit-function-declaration`。

按项目风险另外启用：CERT 或 MISRA 子集（嵌入式、车载、工控项目）、include-what-you-use、ABI 检查。内存风险高的项目在测试里跑 AddressSanitizer、UndefinedBehaviorSanitizer、ThreadSanitizer 或模糊测试；静态检查和这些动态检查互不替代。

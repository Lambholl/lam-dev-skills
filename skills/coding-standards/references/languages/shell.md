# Shell

依据：[Google Shell Style](https://google.github.io/styleguide/shellguide.html)、[ShellCheck](https://www.shellcheck.net/)。

## 命名

| 对象 | 规则 | 例子 |
| --- | --- | --- |
| 可执行脚本 | `kebab-case.sh` | `deploy-service.sh` |
| 被 source 的库文件 | `lower_snake_case.sh` | `log_helpers.sh` |
| 函数、局部变量 | `lower_snake_case`；函数以动词开头，函数内变量用 `local` | `load_config` |
| 只读常量、环境变量 | `UPPER_SNAKE_CASE`；常量用 `readonly`，对外的环境变量加项目前缀 | `APP_CONFIG_DIR` |

## 代码

- 默认用 Bash，第一行写 `#!/usr/bin/env bash`。要求 POSIX sh 时在文件头和项目约定里写明。
- 独立脚本开 `set -euo pipefail`；被 source 的库文件不改调用方的 shell 选项。
- 变量展开都加双引号；参数列表用数组，不拼接字符串。
- 不解析 `ls` 的输出，遍历文件用 glob 或 `find -print0`。
- 不用 `eval`。
- 临时文件用 `mktemp` 创建，用 `trap` 清理。
- 复杂脚本用 `main "$@"` 做入口，提供 `--help`。删除、覆盖、部署类的脚本提供 dry-run。

## 文档注释

Shell 的文档注释是函数头和脚本头注释。

- 被 source 的库函数、复杂脚本的入口，以及部署、迁移、清理脚本要写。
- 第一句写用途；按需写参数、读取的环境变量、stdout 和 stderr 的输出、返回码、副作用。
- 通过全局变量或环境变量传入的参数必须写明。

```bash
# 把 key=value 格式的配置文件读进 shell 变量。
#
# Args:
#   $1: 配置文件路径。
# Returns:
#   0 成功；2 文件不存在；3 有无法解析的行。
load_config() {
```

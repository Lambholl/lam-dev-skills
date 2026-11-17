# PowerShell

只用于操作注册表、只有 PowerShell cmdlet 能完成的 Windows 系统管理，以及维护已有的 PowerShell 脚本，见 `SKILL.md`“语言选择”。

依据：[Approved Verbs](https://learn.microsoft.com/en-us/powershell/scripting/developer/cmdlet/approved-verbs-for-windows-powershell-commands)、[Development Guidelines](https://learn.microsoft.com/en-us/powershell/scripting/developer/cmdlet/strongly-encouraged-development-guidelines)、[PSScriptAnalyzer](https://learn.microsoft.com/en-us/powershell/utility-modules/psscriptanalyzer/overview)。

## 命名

| 对象 | 规则 | 例子 |
| --- | --- | --- |
| 脚本文件 | `Verb-Noun.ps1` 或 `kebab-case.ps1`；模块 `.psm1` | `Invoke-Build.ps1` |
| 函数 | 批准动词加单数名词，`PascalCase` | `Get-DeviceConfig` |
| 参数 | `PascalCase`、单数；开关参数用名词或形容词 | `-ProjectPath`、`-Force` |
| 局部变量 | `$camelCase` | `$retryCount` |
| 错误 ID | 稳定、可搜索的 `PascalCase`，加模块前缀 | `DeviceConfigMissing` |

## 代码

- 可复用的脚本和函数用 `[CmdletBinding()]`，参数写类型和验证属性。
- 修改系统、文件或远程资源的函数支持 `SupportsShouldProcess`。
- 可复用代码里不用别名和位置参数。
- 要中断流程时用 `throw` 或 `-ErrorAction Stop`。
- 输出对象，不输出格式化好的字符串；诊断信息用 `Write-Verbose`、`Write-Warning`、`Write-Error`，不用 `Write-Host`。
- 跨平台脚本写明 PowerShell 版本要求和平台依赖。

## 编码

- PowerShell 7 及以上的脚本用 UTF-8（无 BOM）。
- 要兼容 Windows PowerShell 5.1 且含非 ASCII 字符的 `.ps1`、`.psm1`、`.psd1` 用 UTF-8 with BOM，原因写进项目约定。
- 在 Windows PowerShell 5.1 里读 UTF-8 文本时显式写 `-Encoding UTF8`。
- 带 shebang 的脚本不带 BOM。

## 文档注释

PowerShell 的文档注释是 comment-based help。

- 模块导出的函数、可复用的高级函数和独立脚本要写。
- 必须有 `.SYNOPSIS`；模块导出的命令写 `.EXAMPLE`。参数和输出有类型表达不了的含义时写 `.PARAMETER`、`.OUTPUTS`。
- 修改外部状态的命令写明 `-WhatIf` 的行为和失败后的状态。

```powershell
<#
.SYNOPSIS
读取设备配置。

.PARAMETER Path
配置文件路径。文件不存在时报 DeviceConfigMissing 错误。

.EXAMPLE
Get-DeviceConfig -Path .\device.json
#>
function Get-DeviceConfig {
```

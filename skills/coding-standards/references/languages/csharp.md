# C#

依据：[.NET Coding Conventions](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/coding-style/coding-conventions)、[Naming Guidelines](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/naming-guidelines)。

## 命名

| 对象 | 规则 | 例子 |
| --- | --- | --- |
| 命名空间、程序集 | `PascalCase` | `App.Device.Runtime` |
| 类、结构体、记录、枚举 | `PascalCase` | `TelemetryFrame` |
| 接口 | `I` 加 `PascalCase` | `IDeviceRepository` |
| 方法、属性、事件 | `PascalCase`；异步方法以 `Async` 结尾 | `LoadAsync` |
| 私有字段 | 实例字段 `_camelCase`，静态字段 `s_camelCase` | `_retryCount` |
| 局部变量、参数 | `camelCase` | `deviceId` |
| 异常类、特性类 | 分别以 `Exception`、`Attribute` 结尾 | `AuditAttribute` |

## 代码

- 开启 nullable 引用类型。
- `CancellationToken` 沿调用链传到可取消的 I/O、等待和长任务。
- 资源类型实现 `IDisposable` 或 `IAsyncDisposable`，调用方用 `using` 或 `await using`。
- 可预期的业务失败用结果类型或错误码；异常留给异常情况。
- 库代码是否用 `ConfigureAwait(false)` 按项目约定统一。
- 日志用结构化模板。

## 文档注释

- 公共类型、公共成员、接口、DTO 和配置项写 XML documentation。
- 必须有 `<summary>`；参数、返回值、异常有类型表达不了的含义时才写 `<param>`、`<returns>`、`<exception>`。
- 异步方法写明完成条件、异常怎样传出、取消的行为。

```csharp
/// <summary>按设备标识读取配置。</summary>
/// <returns>设备从未保存过配置时返回默认配置。</returns>
/// <exception cref="DeviceNotFoundException"><paramref name="deviceId"/> 未登记时抛出。</exception>
public Task<DeviceConfig> LoadAsync(string deviceId, CancellationToken cancellationToken);
```

# TypeScript

依据：[Google TypeScript Style](https://google.github.io/styleguide/tsguide.html)、[typescript-eslint](https://typescript-eslint.io/)。

## 命名

| 对象 | 规则 | 例子 |
| --- | --- | --- |
| 文件 | `kebab-case.ts`；React 组件文件 `PascalCase.tsx`；测试 `.test.ts` | `user-service.ts`、`UserCard.tsx` |
| 类、接口、类型别名、枚举 | `PascalCase`；接口不加 `I` 前缀 | `DeviceConfig` |
| 函数、变量、参数、属性 | `lowerCamelCase`，函数以动词开头 | `loadProfile`、`retryCount` |
| 模块级常量配置 | `UPPER_SNAKE_CASE` | `DEFAULT_TIMEOUT_MS` |
| 泛型参数 | 一个时用 `T`；多个时用 `TValue`、`TError` | `Result<TValue, TError>` |
| 私有成员 | `private` 或 `#name`，不用下划线前缀 | `#token` |

## 代码

- 开 `strict`，并开 `noUncheckedIndexedAccess`。
- 不用裸 `any`；绕过类型系统时用 `unknown` 加类型守卫。
- 用命名导出；框架要求默认导出时按框架。
- 导出的函数、跨模块边界和持久化数据结构写显式类型。
- 简单的枚举用字面量联合类型。
- 每个 Promise 都要被 `await`、返回或处理错误。
- 只抛 `Error` 对象。

## 文档注释

- 导出的函数、类、公共方法、公共类型和跨模块接口写 TSDoc。
- `@param`、`@returns` 不写类型，只写类型表达不了的含义；没有可写的就省掉这个标签。
- 会 reject 的 Promise 写明条件；事件、回调和订阅写明触发时机和取消订阅的方式。

```ts
/**
 * 从存储读取设备配置。
 *
 * @returns 设备从未保存过配置时返回默认配置。
 * @throws DeviceNotFoundError deviceId 未登记时抛出。
 */
export async function loadProfile(deviceId: string): Promise<DeviceProfile>
```

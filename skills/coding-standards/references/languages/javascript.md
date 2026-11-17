# JavaScript

依据：[Google JavaScript Style](https://google.github.io/styleguide/jsguide.html)、[ESLint](https://eslint.org/docs/latest/)。

新的复杂逻辑用 TypeScript 写；JavaScript 用于轻量脚本、构建配置和已有的 JavaScript 模块。

## 命名

| 对象 | 规则 | 例子 |
| --- | --- | --- |
| 文件、目录 | `kebab-case`；测试 `.test.js` | `auth-client.js` |
| 类 | `PascalCase` | `RetryPolicy` |
| 函数、变量、参数、属性 | `lowerCamelCase`，函数以动词开头 | `parseMessage` |
| 模块级常量配置 | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| 私有成员 | `#name` 或模块作用域，不用下划线前缀 | `#connection` |

## 代码

- 用 ES Module；已有的 CommonJS 项目跟随现有配置。
- 用 `const`，需要重新赋值时用 `let`；不用 `var`、`with`。
- 不用 `eval`、`new Function` 和拼接出来的代码。
- 每个 Promise 都要被 `await`、返回或处理错误。
- 事件监听和定时器在不再需要时移除。
- 只抛 `Error` 对象。

## 文档注释

- 导出的函数、类、公共方法、回调和跨模块接口写 JSDoc。
- 没有静态类型，`@param {Type}` 和 `@returns {Type}` 写出类型；含义只在类型表达不了时写。
- 稳定的数据结构和回调签名用 `@typedef`、`@callback` 描述。对象参数写明必填字段、默认值和单位。

```js
/**
 * Parse one telemetry message.
 *
 * @param {Buffer} buffer - Bytes of exactly one message.
 * @returns {TelemetryMessage}
 * @throws {ProtocolError} When the checksum does not match.
 */
export function parseTelemetry(buffer) {}
```

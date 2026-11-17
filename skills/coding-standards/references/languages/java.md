# Java

依据：[Google Java Style](https://google.github.io/styleguide/javaguide.html)、[Checkstyle](https://checkstyle.org/)、[Error Prone](https://errorprone.info/)。

## 命名

| 对象 | 规则 | 例子 |
| --- | --- | --- |
| 包 | 全小写，单词直接相连 | `com.example.devicesync` |
| 类、接口、枚举、记录、注解 | `UpperCamelCase`；接口不加 `I`；测试类以 `Test` 结尾 | `DeviceConnectionTest` |
| 方法 | `lowerCamelCase`，以动词开头；JUnit 测试方法可以用下划线分隔场景 | `load_whenMissing_throws` |
| 常量 | 深度不可变的 `static final` 用 `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| 字段、变量、参数 | `lowerCamelCase`，不加 `m`、`s`、`_` 前后缀 | `retryCount` |
| 缩写 | 当普通单词，只大写首字母 | `loadHttpUrl` |

## 代码

- 一个源文件一个顶层类；不用通配符导入。
- `if`、`else`、`for`、`do`、`while` 的语句体都加大括号。
- 重写的方法都写 `@Override`。
- 捕获 `InterruptedException` 后恢复中断状态或继续抛出。
- `AutoCloseable` 资源用 try-with-resources；不用 `finalize`。
- 返回集合时返回空集合，不返回 `null`；公共接口写明参数和返回值能否为 `null`。
- 共享的可变状态写明由哪个锁或哪个线程保护；持锁时不做阻塞 I/O，不调外部回调。

## 文档注释

- 公共类型、公共方法和跨模块接口写 Javadoc；名字说清楚的简单 getter 和重写的方法可以不写。
- 第一句是摘要。
- 参数、返回值、异常有类型表达不了的含义时才写 `@param`、`@return`、`@throws`。
- 涉及线程、锁、回调和资源时，写明在哪个线程执行、资源由谁持有和释放、怎样取消。

```java
/**
 * 按设备标识读取配置。
 *
 * @return 设备从未保存过配置时返回默认配置。
 * @throws DeviceNotFoundException deviceId 未登记时抛出。
 */
public DeviceConfig load(String deviceId) throws DeviceNotFoundException
```

# React

依据：[React 文档](https://react.dev/)、[eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react)、[eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks)。

适用于 React 19。本文件只写 React 部分，语言规则见 [typescript.md](../languages/typescript.md) 或 [javascript.md](../languages/javascript.md)。

## 命名

| 对象 | 规则 | 例子 |
| --- | --- | --- |
| 组件文件 | `PascalCase.tsx`，一个文件导出一个组件 | `UserCard.tsx` |
| 组件 | `PascalCase` | `UserCard` |
| Hook | `use` 开头的 `lowerCamelCase`；文件 `kebab-case` | `useUserProfile`、`use-user-profile.ts` |
| props 类型 | 组件名加 `Props` | `UserCardProps` |
| 事件 props | `on` 加事件名 | `onSelect` |
| 事件处理函数 | `handle` 加事件名 | `handleSelect` |
| `useState` | `[value, setValue]` | `[isOpen, setIsOpen]` |

组件的布尔 props 和 DOM 属性同名时沿用 DOM 的名字，不加 `is`、`has` 前缀，如 `disabled`、`checked`、`open`、`required`。

## lint 规则

eslint-plugin-react 用 `flat.recommended` 和 `flat['jsx-runtime']` 两套配置，`settings.react.version` 设为 `'detect'`；eslint-plugin-react-hooks 用 recommended 配置。在此之上打开：

| 要求 | 规则 |
| --- | --- |
| 没有子元素的组件和 HTML 标签写成自闭合：`<Spinner />`、`<div />` | `react/self-closing-comp: ['error', { component: true, html: true }]` |
| Fragment 写 `<>`，要传 `key` 时写 `<Fragment key={id}>`；不写多余的 Fragment | `react/jsx-fragments: ['error', 'syntax']`、`react/jsx-no-useless-fragment` |
| 字符串属性和子元素不加花括号：`title="Save"` | `react/jsx-curly-brace-presence: ['error', { props: 'never', children: 'never' }]` |
| 布尔属性为 true 时用简写：`<Input disabled />` | `react/jsx-boolean-value: ['error', 'never']` |
| 列表元素带稳定的 `key`，不用数组下标 | `react/jsx-key`、`react/no-array-index-key` |
| 不在组件内部定义组件：每次渲染都会生成新组件，子树的状态随之丢失 | `react/no-unstable-nested-components` |
| `&&` 左侧是布尔值：`{count > 0 && <Badge />}`，否则 `count` 为 0 时会渲染出 `0` | `react/jsx-no-leaked-render` |
| 事件 props 和处理函数按上面的命名 | `react/jsx-handler-names` |
| `useState` 按 `[value, setValue]` 命名 | `react/hook-use-state` |
| Hooks 只在组件和 Hook 的顶层调用，依赖数组写全 | `react-hooks/rules-of-hooks`、`react-hooks/exhaustive-deps`，都设为 `'error'` |
| 不用 `dangerouslySetInnerHTML`；确实要用时只传清洗过的 HTML，在使用处抑制规则并写明来源 | `react/no-danger` |

`exhaustive-deps` 只在单行抑制，写明漏掉的依赖为什么不会导致读到旧值。

## 代码

以下规则 lint 查不出来，靠评审：

- 只写函数组件；Error Boundary 例外。
- props 类型标在参数上：`function UserCard({ user }: UserCardProps)`，不用 `React.FC`。
- `ref` 当普通 prop 传，不用 `forwardRef`。
- 能从 props 或 state 算出来的值在渲染时计算，不存进 state，也不用 `useEffect` 同步；计算开销大时用 `useMemo`。
- `useEffect` 只用来和外部系统同步：订阅、定时器、DOM 操作、网络请求，清理函数撤销这些副作用。用户操作引起的逻辑写在事件处理函数里。
- state 放在用到它的组件里；多个组件共用时提到最近的共同父组件。
- 组件用命名导出；框架要求默认导出时（如 Next.js 的 `page.tsx`）按框架。

## 文档注释

- 导出的组件写 TSDoc，摘要写组件显示什么。
- props 类型的字段写类型表达不了的内容：单位、默认值、回调什么时候触发。

```tsx
export interface UserCardProps {
  user: User;
  /** 头像边长，单位 px。默认 40。 */
  avatarSize?: number;
  /** 点击卡片时触发；`disabled` 为 true 时不触发。 */
  onSelect?: (userId: string) => void;
  disabled?: boolean;
}

/** 显示用户头像、名字和在线状态。 */
export function UserCard({ user, avatarSize = 40, onSelect, disabled }: UserCardProps) {}
```

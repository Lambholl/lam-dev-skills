# Vue

依据：[Vue 风格指南](https://vuejs.org/style-guide/)、[eslint-plugin-vue](https://eslint.vuejs.org/)。

适用于 Vue 3.5 及以上版本的单文件组件（SFC）。本文件只写 Vue 部分，语言规则见 [typescript.md](../languages/typescript.md)。

## 命名

| 对象 | 规则 | 例子 |
| --- | --- | --- |
| 组件文件 | `PascalCase.vue` | `UserCard.vue` |
| 组件名 | 多个单词的 `PascalCase` | `UserCard` |
| 模板里的组件标签 | `PascalCase` | `<UserCard />` |
| 组合式函数 | `use` 开头的 `lowerCamelCase`；文件 `kebab-case` | `useUserProfile`、`use-user-profile.ts` |
| props | 声明处 `lowerCamelCase`，模板里 `kebab-case` | `pageSize` → `:page-size` |
| 事件 | 声明处 `lowerCamelCase`，模板里 `kebab-case` | `updateFilter` → `@update-filter` |

组件的布尔 props 和 DOM 属性同名时沿用 DOM 的名字，不加 `is`、`has` 前缀，如 `disabled`、`checked`、`open`、`required`。

## lint 规则

eslint-plugin-vue 用 `flat/recommended`，`.vue` 里的 TypeScript 由 vue-eslint-parser 交给 typescript-eslint 解析。在此之上打开：

| 要求 | 规则 |
| --- | --- |
| 没有子元素的标签写成自闭合：`<UserCard />`、`<div />` | `vue/html-self-closing`，配置见下节 |
| 新组件用 `<script setup lang="ts">` | `vue/component-api-style: ['error', ['script-setup']]` |
| 块的顺序是 script、template、style | `vue/block-order: ['error', { order: ['script', 'template', 'style'] }]` |
| props 和 emits 用类型声明，emits 必须声明 | `vue/define-props-declaration: ['error', 'type-based']`、`vue/define-emits-declaration: ['error', 'type-based']`、`vue/require-explicit-emits` |
| 编译宏按固定顺序写 | `vue/define-macros-order: ['error', { order: ['defineOptions', 'defineModel', 'defineProps', 'defineEmits', 'defineSlots'] }]` |
| 模板里的组件标签用 `PascalCase`，属性和事件用 `kebab-case` | `vue/component-name-in-template-casing: ['error', 'PascalCase', { registeredComponentsOnly: false }]`、`vue/attribute-hyphenation: ['error', 'always']`、`vue/v-on-event-hyphenation: ['error', 'always', { autofix: true }]` |
| 指令用简写 `:`、`@`、`#`；属性名和变量名相同时写 `:id` | `vue/v-bind-style: ['error', 'shorthand', { sameNameShorthand: 'always' }]`、`vue/v-on-style: ['error', 'shorthand']`、`vue/v-slot-style: ['error', 'shorthand']` |
| 字符串属性不写 `v-bind`：`title="Save"`，不写 `:title="'Save'"` | `vue/no-useless-v-bind` |
| 布尔属性为 true 时用简写：`<BaseInput disabled />` | `vue/prefer-true-attribute-shorthand` |
| `v-if` 和 `v-for` 不放在同一个元素上；`v-for` 带稳定的 `:key` | `vue/no-use-v-if-with-v-for`、`vue/require-v-for-key`（recommended 已含） |
| 不修改 props | `vue/no-mutating-props`（recommended 已含） |
| 不用 `v-html`；确实要用时只传清洗过的 HTML，在使用处抑制规则并写明来源 | `vue/no-v-html` |
| 模板 ref 用 `useTemplateRef`，不留未使用的 ref | `vue/prefer-use-template-ref`、`vue/no-unused-refs` |

### 自闭合

```js
'vue/html-self-closing': ['error', {
  html: { void: 'always', normal: 'always', component: 'always' },
  svg: 'always',
  math: 'always',
}],
```

- 项目用 Prettier 时，eslint-config-prettier 会关掉这条规则。在 flat config 里把它放在 eslint-config-prettier 之后重新打开，并把 `html.void` 改成 `'any'`，`<img>`、`<br>` 这类 void 元素交给 Prettier 排版。
- 自闭合的组件标签只在 SFC 和字符串模板里有效。写在 HTML 文件里、由浏览器解析的模板不支持自定义元素自闭合，也不区分大小写，组件标签要写成 `<user-card></user-card>`。

## 代码

以下规则 lint 查不出来，靠评审：

- 响应式状态默认用 `ref`；一组总是一起读写的字段才用 `reactive`。不解构 `reactive` 对象。
- props 默认值用解构写：`const { size = 'md' } = defineProps<Props>()`。把解构出的 prop 传给 `watch` 或组合式函数时包成 getter：`watch(() => size, …)`。
- 双向绑定用 `defineModel`，不手写 `modelValue` 加 `update:modelValue`。
- 能从 props 或 state 算出来的值用 `computed`，不用 `watch` 同步到另一个 ref。
- 模板里只写简单表达式；有分支或多步计算时移进 `computed` 或函数。
- SFC 本身是默认导出；`.ts` 文件里的组合式函数和工具函数用命名导出。

## 文档注释

- 公共组件的 props 类型字段写 TSDoc：单位、默认值、取值范围。
- 事件写在 `defineEmits` 的类型上，说明什么时候触发、参数是什么。

```vue
<script setup lang="ts">
interface Props {
  user: User;
  /** 头像边长，单位 px。默认 40。 */
  avatarSize?: number;
  disabled?: boolean;
}

const { user, avatarSize = 40, disabled = false } = defineProps<Props>();

const emit = defineEmits<{
  /** 点击卡片时触发；`disabled` 为 true 时不触发。 */
  select: [userId: string];
}>();
</script>
```

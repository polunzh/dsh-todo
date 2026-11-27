# 子任务就地编辑（inline subtask edit）设计

## 背景

详情抽屉的「子任务」区目前只能新增、勾选、删除。标题写错一个字，或想把 `快速转身 X 2` 改成 `X 3`，只能删掉重加：已经勾选的完成状态跟着丢，行序也会变。列表里点已展开的子任务标题会打开该子任务自己的详情抽屉，这条路能改标题，但把用户从父任务的上下文里带走，也看不出它属于哪个任务。

诉求：在父任务的子任务列表里直接改标题。

## 目标行为

- 抽屉子任务行：点标题就地变成输入框，改完 Enter 或点别处提交，Esc 取消。
- 提交走现有 `tasks/update`（`title` 已支持），和勾选 / 删除 / 新增一样立即保存；不进入抽屉顶部「保存」脏值队列，不产生「有未保存修改」。
- 标题为空或纯空白：恢复原标题退出，不发请求。
- 标题没变：直接退出，不发请求。
- 保存失败：保留编辑态与已输入内容，store 照常弹真实错误文案（如「网络请求失败」），可再 Enter 重试或 Esc 放弃。
- 同一时刻只编辑一行；点另一行标题先提交当前行。

## 非目标

- 不给子任务加截止时间 / 优先级 / 标签 / 备注的编辑入口。真需要时仍走列表 → 点子任务标题 → 它自己的详情抽屉。
- 不改任务列表里已展开的子任务行（点标题仍然打开子任务详情）。
- 不加铅笔图标或第二个编辑按钮：标题本身就是唯一入口。

## 交互状态

| 状态 | 表现 | 进入 / 退出 |
| --- | --- | --- |
| 默认 | 勾选框 + 标题（12.5px，secondary，单行省略）+ 悬停才明显的 × | — |
| 悬停 | 整行浅底（`--dsw-alias-interactive-bg-hover`）、6px 圆角；标题光标为文本光标；tooltip「点击标题即可修改」 | 指针进入/离开（`@media (hover: hover)`） |
| 编辑中 | 标题替换为输入框：高 24px、字号 12.5px、accent 聚焦边框、光标在末尾；勾选框与 × 保持不动；行内不再有删除线 | 点击标题 / Tab 聚焦后 Enter |
| 提交 | Enter 或失焦。成功即回到默认态、标题更新 | — |
| 取消 | Esc，文字恢复原标题，回到默认态 | — |

- 进入编辑时光标落在末尾，不做整段选中：多数修改是追加或改数字（`X 2` → `X 3`）。
- 已完成（勾选）的子任务同样可编辑；编辑中该行按未划线显示，提交后恢复删除线。
- 中文输入法组词时按 Enter 只确认候选，不提交改名（`isComposing` 守卫）。
- 触屏没有悬停态，点标题即进入编辑；输入框仍是 24px 高的一行，不额外包裹弹层。
- 输入框 24px 高，编辑中的那一行只增高 2px（22 → 24），下方行几乎不动。

## UI / 样式

- `.todo-drawer-subtask`：加 `border-radius: 6px`；`@media (hover: hover)` 下 hover 用 `--dsw-alias-interactive-bg-hover`（与列表 `.todo-subitem:hover` 同一套），与现有样式一致。
- `.todo-drawer-subtask-title`：由 `span` 改为 `button`（透明、零内边距、左对齐、flex:1），保留省略号与完成态样式。
- `.todo-drawer-subtask-input`：`height: 24px`、`font-size: 12.5px`、`padding: 0 6px`，沿用 `.todo-input` 的边框与聚焦色。
- 不新增颜色 token，不新增图标。

## 文案 / i18n

新增三个键（中英对照，`test/client-i18n.test.js` 校验一致性）：

- `detail.subtaskEdit`：`编辑子任务：{title}` / `Edit subtask: {title}` — 标题按钮的 `aria-label`
- `detail.subtaskEditHint`：`点击标题即可修改` / `Click the title to rename` — 悬停 tooltip
- `detail.subtaskTitle`：`子任务标题` / `Subtask title` — 编辑输入框的 `aria-label`

## 测试与验证

- `npm test`：`test/client-i18n.test.js` 校验新键中英一致、源码引用的键都有翻译、样式仍全部走宿主 token。
- preview 手动回归：新增后改名、连续编辑两行、Esc 取消、清空后失焦、离线/失败重试、已完成行、390px 窄屏。
- 截图：`scripts/screenshot.mjs` 增 `subtask-edit` / `subtask-edit-en` 两张（打开带子任务的抽屉并点开一行子任务标题）。

## 发版

- 版本 0.2.22 → 0.2.23（feature 级 minor bump）。
- README 中英各补一句「子任务可直接点标题改名」，并更新抽屉截图。

## 设计稿

- `docs/design-mockups/subtask-inline-edit.html`
- `docs/design-mockups/subtask-inline-edit.png`（1440×900 @2x：默认与悬停、编辑中、保存失败三种状态，抽屉切片按真实 400px 尺寸绘制）
- `docs/design-mockups/subtask-inline-edit-mobile.png`（390×844 @2x：抽屉全宽，编辑中的子任务行）

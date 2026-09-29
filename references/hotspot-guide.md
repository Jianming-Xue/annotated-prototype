# 热区配置与控件样式编写规则

## 一、热区配置（__HOTSPOTS__）

> ⚠️ **本节不再是你手写的东西。** 热区配置由 `spec.controls` 派生（规则见 `references/spec-manifest.md`），
> 生成器负责填 `__HOTSPOTS__`。读本节是为了理解派生出来的结构、以及排查「标注为什么长这样」。
> 要改标注，改 spec；手写热区会被生成器拒绝（`buildPrototype()` 不再接受 `hotspots` 参数）。

每个需要标注的控件一条配置。字段如下：

- id：唯一标识，英文短横线命名，如 submit-btn
- selector：必须命中 __STAGE_CONTENT__ 中的真实元素
- title：标注框标题
- items：标注条目数组，每项含 type 和 text

items 中每项的 type 取值：

- front：前端交互描述
- back：后端接口描述

### selector 写法

- 优先用 id，如 `#submitBtn`
- 没有 id 时用 class，如 `.order-card .action-btn`
- 避免用标签选择器（如 `button`），容易命中多个元素

### items 编写规则

（派生结果永远满足：前端条目 ≥1、后端条目 ≥1；纯前端控件自动生成「不调接口（纯前端行为）」。）


前端条目（type 为 front）描述界面行为：

- 点击、输入、悬停触发的界面变化
- 校验规则（必填、格式、长度）
- 状态变化（loading、置灰、展开、跳转）

后端条目（type 为 back）描述接口约定：

- 调什么接口，如 POST /api/order
- 成功怎么走，如 成功跳详情页
- 失败怎么提示，如 失败 Toast 提示错误信息
- 接口路径用 /api/xxx 占位，不写真实域名
- **设计里没给出接口时，不要臆造**：在 back 条目里写清「此处设计未给出接口」+ 建议路径标注「待确认」，并把缺口反馈给用户；纯前端控件（行选择、Tab 切换、本地导出）也照此在 back 条目里说明"不调接口，数据来源 = XXX"

### 排序建议

前端条目放前面，后端条目放后面；同类内按触发顺序排列。

## 二、控件样式（__STAGE_STYLES__）

### 允许

- 写功能控件自身的样式（输入框、按钮、卡片、表格等）
- 复用框架已有的 CSS 变量：
  - --ink：主文字色
  - --muted：次要文字色
  - --line：边框色
  - --front / --back：前端/后端标注色
- **为布局钩子 `--stage-max` 赋值** —— 内容区默认最大 760px，宽表格（≥6 列）、多列表单放不下时必须放宽：
  `:root{--stage-max:1180px;}`。不赋值则沿用默认 760px，既有页面视觉不变。
- 用 flex / grid 做布局

### 禁止

- 覆盖 .stage / .hotspot / .anno / #lines / #toggle
- 修改框架的**视觉**变量（--accent / --ink / --muted / --line / --front / --back / --bg / --note-*）—— 布局钩子 `--stage-max` 例外，见上
- 引入外部 CSS/JS（如 CDN 字体、图标库）

## 三、控件 HTML（__STAGE_CONTENT__）

- 用语义化标签：button / input / label / form
- 每个需要标注的控件加唯一 id
- 保持结构简洁，不要过度嵌套
- 不写真实业务逻辑（提交表单等只需占位）

## 四、常见错误

| 错误 | 后果 | 正确做法 |
|---|---|---|
| selector 拼错 | 热区不出现 | 生成后逐一核对 |
| 用标签选择器 | 多个控件同时高亮 | 改用 id 或 class |
| 覆盖框架 .anno 样式 | 标注框变形 | 只写控件样式 |
| 写真实接口域名 | 泄露内部信息 | 用 /api/xxx |
| 开关默认打开 | 页面不干净 | 保持默认关闭 |
| 后端条目写成前端行为 | 标注分类错误 | 按是否调接口区分 |
| **校验提示用 `display` 切换显隐** | 失焦校验时字段高度变化，把下方按钮顶走 → `mousedown` 与 `mouseup` 落在不同元素上 → **`click` 不派发，按钮点不动**（实测踩过） | 提示**常驻占位**，只用 `visibility` 切换：`min-height:16px;visibility:hidden` / `.invalid .err{visibility:visible}` |
| 宽表格 / 多列表单挤在默认 760px | 列被挤压换行、不可读 | `:root{--stage-max:1180px;}` 放宽内容区（布局钩子，见 §二） |
| 弹层写在 `.stage` 之外 | 内容脱离原型容器 | 弹窗 / 抽屉 / 遮罩都写进 `__STAGE_CONTENT__`，用 `position:fixed` 脱离文档流即可 |
| 只有一个控件的按钮组、或纯展示元素也加热区 | 标注噪音、淹没重点 | 只标注有交互或接口约定的控件 |

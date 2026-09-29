---
name: annotated-prototype
description: 把单个功能的设计文件（截图、文字描述或组件清单）转换成带引线标注的可交互 HTML 原型。适用于向开发/业务方交付原型，并标注每个控件的前端交互与后端接口约定。当用户提到「标注原型」「引线标注」「原型交付」「把设计稿做成可交互原型」「annotated prototype」时使用本 skill。
---

# Annotated Prototype Builder

把功能设计转成单个自包含的 HTML 原型。原型平时是干净页面，点右上角开关后，鼠标移到控件上会：

- 用红色粗线框选整个控件区域
- 在控件旁浮出文档黄色底的标注框
- 用红色折线引线连接控件与标注框
- 鼠标移出即隐藏

## 何时使用

- 用户提供某个功能的设计文件，希望产出可交互原型
- 用户需要标注每个控件的前端操控逻辑和后端交互约定
- 用户提到「标注原型」「引线标注」「原型交付」

## 工作流程

### 1. 解析设计文件

从用户提供的内容中识别：

- 页面标题
- 包含哪些控件、层级与布局
- 每个控件的操作意图（点击、输入、校验、跳转等）
- 涉及的后端接口（调什么、成功怎么走、失败怎么提示）

如果设计文件信息不足（比如缺少后端交互描述），主动向用户确认，不要臆造接口行为。

### 2. 读取框架模板

读取 `assets/prototype-frame.html`，**只替换下面 4 个占位符，不要改动框架自身的任何东西**。

框架是这个 skill 的产品本体：页面上必须**零框架相关代码** —— 标注的定位、跟随、弹层层级、各结构下的命中判定，全部由框架负责。**凡是需要写进页面的补丁，都应视为框架的设计缺陷**，去改框架，而不是让每个页面各自打补丁。

### 3. 写规格清单 + 业务内容，交给生成器

**先写规格清单（spec）**，再用生成器产出页面。清单是唯一事实源，人类标注由它派生。

```js
import { buildPrototype, writePrototype } from '<skill>/tests/lib/build.mjs';

const spec = {
  schema: 'annotated-prototype/spec@1',
  title: 'Rule 信息列表',
  summary: '上中下三层：查询条件 / 列表 / 操作',
  regions: [{ id: 'search', label: '查询条件', role: 'search' }],
  apis: [{ id: 'rulePage', method: 'GET', path: '/api/v1/log/rule_info/page', desc: '列表（分页）' }],
  controls: [{
    selector: '#envSelect', kind: 'select', label: '环境名', required: true,
    options: ['prod'], param: 'env', apis: ['envList'],
    rules: ['必填：未选择时点搜索会标红并阻止提交'],
  }],
  table: { selector: '#ruleTable', dataApi: 'rulePage', columns: [/* key/label/align/format */] },
  mock: ['列表数据为本地模拟'],
  openQuestions: [],
};

const html = buildPrototype({ title: spec.title, styles: STYLES, content: CONTENT, spec });
writePrototype('xxx-annotated-prototype.html', html);
```

生成器一次填完 4 个占位符，并额外内嵌机器可读清单：

| 占位符 | 由谁提供 |
|---|---|
| `__PAGE_TITLE__` | `spec.title` |
| `__STAGE_STYLES__` | 你写的业务控件 CSS |
| `__STAGE_CONTENT__` | 你写的业务控件 HTML（生成器会追加内嵌规格清单） |
| `__HOTSPOTS__` | **由 `spec.controls` 自动派生，不要手写** |

完整字段说明与省略规则见 `references/spec-manifest.md`；控件 HTML/CSS 的写法规则见 `references/hotspot-guide.md`。

### 4. 输出

- 单个自包含 HTML 文件，文件名格式：`{功能名}-annotated-prototype.html`
- 无外部 CSS/JS 依赖
- 双击即可在浏览器打开

### 5. 自检

生成后逐项确认（前 6 项可一条命令跑完）：

```bash
node tests/run.mjs --page <产物路径>
```

- [ ] 4 个占位符全部替换完毕，产物与「框架 + 占位符替换」逐字节一致
- [ ] 每个 `selector` 都能唯一命中真实元素（运行时注入的元素由浏览器断言负责）
- [ ] 页面默认是干净原型，点右上角开关才启用标注
- [ ] 鼠标移到控件上出现红框 + 黄底标注框 + 红色引线；**红框的 computed opacity 为 `1`**（只比 rect 会假通过）
- [ ] 鼠标移出立即隐藏，引线同时清空
- [ ] 接口路径使用 `/api/xxx` 占位，不含真实域名
- [ ] 规格清单通过 schema 校验，且与人类标注双向一致（无孤儿控件）
- [ ] 表格列定义与页面表头逐一对齐；`mock` / `openQuestions` 如实反映原型里的假数据与未定项
- [ ] 人肉看一眼：把鼠标移到每个控件上，确认标注内容与设计描述一致

## 交付：让 AI / 开发者照着实现真实页面

原型不只是给人看的，更是**实现依据**。页面里内嵌了一份机器可读的规格清单（`<script type="application/json" id="prototype-spec">`），实现方读它，不要靠读 HTML 反推业务规则：

```bash
node <skill>/tests/read-spec.mjs 原型页.html          # Markdown 规格：分区 / 接口 / 表格 / 每个控件的类型与规则
node <skill>/tests/read-spec.mjs 原型页.html --json   # 原始 JSON
```

产出里 `## 原型里是假的` 与 `## 待确认` 两节必须一起读：前者是实现时要替换掉的模拟，后者是原型没定下来的接口与字段范围——**这两节空着，才说明规格是完整的**。

清单与人类标注由同一份 spec 派生，因此「悬停看到的」与「读到的」不可能漂移；回归门禁会断言两侧双向一致。

## 改动框架本身

框架处于建设期时**可以完全改**，但要守两条：

1. **对外生成契约与视觉不可变** —— 4 个占位符的字面形态、CSS 变量、`.hotspot` / `.anno` / `#lines` / `#toggle` 的类名与视觉（配色、尺寸、动画、避让档位）。既有页面与生成流程都依赖这套契约，框架升级应当是纯内部机制升级，不该外溢成"所有页面要跟着改"。
2. **改完必跑回归**：

   ```bash
   node tests/run.mjs
   ```

   它会用生成器构出 15 类结构的探针页（页面级滚动 / 内部滚动容器 / 表格 / 卡片与嵌套标注 / 延迟注入 / `innerHTML` 重渲染 / 禁用态 / 父层 `pointer-events:none` / 抽屉 / 弹窗 / 折叠面板 / `position:fixed` 元素 …），在真实 Chrome 里逐项断言「命中正确的热区 + 几何贴合 + 红框真的可见 + 引线已绘制」，再叠加静态契约与全局行为断言。全绿才算改完。

   细节、判据与已知边界见 `tests/README.md`。

## 关键约束

1. 生成页面时只替换 4 个占位符；页面上不得出现任何框架相关代码（补丁、覆盖样式、挂钩子都算）
2. selector 必须命中：热区配置里的 `selector` 一定要对应 `__STAGE_CONTENT__` 中真实存在的元素，否则热区不会出现（运行时注入的元素也可以，框架会随 DOM 变化重新解析）
3. 前后端分离标注：`items` 里用 `type: 'front'` 表示前端交互，`type: 'back'` 表示后端接口约定
4. 不调真实后端：原型只做界面演示，数据用模拟
5. 默认关闭：开关默认关闭，保证打开时是干净原型
6. 改框架本身必须先跑 `node tests/run.mjs` 全绿，且不得改动对外契约与视觉
7. 规格清单是唯一事实源：控件事实写进 spec，不要手写热区配置、也不要把接口路径写进散文而不声明
8. 设计里没给的接口必须声明为 `status: "proposed"` 并写进 `openQuestions`，不得编造一个看起来已定的路径

## 示例

输入：

> 这是一个订单确认页：收货地址输入框、备注输入框、提交订单按钮、取消按钮。地址失焦要调接口校验，提交订单调创建订单接口，失败要 Toast 提示。

输出：`订单确认页-annotated-prototype.html`

对应的 `__HOTSPOTS__` 内容（节选）：

- addr：selector 为 `#addr`，标题「收货地址输入框」，前端条目含「输入实时校验长度 ≤ 100」「失焦时校验格式是否完整」，后端条目含「失焦调 GET /api/address/validate」「校验失败红字提示在下方」
- submit：selector 为 `#submitBtn`，标题「提交订单按钮」，前端条目含「点击校验地址非空」「提交中按钮置灰并显示 loading」，后端条目含「调 POST /api/order」「成功跳订单详情页」「失败 Toast 提示错误信息」

## 资源

- `assets/prototype-frame.html`：框架模板，含 4 个占位符
- `references/hotspot-guide.md`：控件 HTML/CSS 与标注条目的详细编写规则
- `references/spec-manifest.md`：**规格清单字段定义与省略规则**（实现方读规格时的权威说明）
- `tests/`：框架回归套件（生成器 + 静态契约 + 15 类结构探针）。**每次改框架后必跑 `node tests/run.mjs`**，用法与判据见 `tests/README.md`

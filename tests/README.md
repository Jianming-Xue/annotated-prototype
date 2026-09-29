# tests —— annotated-prototype 框架回归套件

**每次改动 `../assets/prototype-frame.html` 之后，都必须跑一次。**
框架是这个 skill 的产品本体（页面上应当零框架相关代码），所以框架的改动不能靠"看起来没坏"来判断。

## 怎么跑

```bash
cd ~/.config/mimocode/skills/annotated-prototype

node tests/run.mjs                # 全量：生成探针 → 静态契约 → 浏览器 15 类 + 全局断言
node tests/run.mjs --static-only  # 只跑静态契约（不需要浏览器，秒级）
node tests/run.mjs --page /path/to/xxx-annotated-prototype.html   # 顺带校验任意交付页（静态 + 浏览器冒烟）
```

退出码 0 = 全绿，1 = 有失败（失败项会在末尾列出）。

### 依赖

- **node**（本机已装）。
- **playwright 本体**（用于驱动浏览器）。解析顺序：`PROTO_PLAYWRIGHT` 环境变量 → `import('playwright')` → npx 缓存 `~/.npm/_npx/*/node_modules/`。
  本机实测：直接 `import('playwright')` 取不到命名导出（它 `index.js` 是 CommonJS，对象挂在 `default` 上），已做兼容；找不到时请先跑一次 `npx -y playwright@1.63.0 --version`。
- **Chrome 系浏览器**。按 `chrome → msedge → chromium → 默认` 依次尝试，**不下载 playwright 自带浏览器**（省 ~150MB）。
- 不需要网络。

## 三层断言

### 1. 静态契约（对产物，63 项）

- **强不变量**：产物**逐字节等于**「当前框架 + 4 个占位符替换」。这比"抽段比对"稳 —— 抽段依赖框架注释锚点，框架一改注释就失效。
- 框架关键片段仍在：CSS 变量、`.hotspot` / `.anno` / `#lines` 均为 `position:fixed`、四个层级值（2147483000/1/2/3）、`pointer-events:none`。
- 每个热区：`selector` 可唯一命中、`front` 与 `back` 条目都有、`back` 用 `/api/xxx` 占位且无真实域名。
- 热区之间 selector 不重复；无外部 CSS/JS/字体依赖。

> ⚠️ 两条易错点（都已固化成实现）：
> ① 数 `id="x"` 必须**先抹掉 `<script>`/`<style>`/注释**，否则业务 JS 里的 `innerHTML = '<button id="x">'` 会被算成第二个元素。
> ② 元素若由业务 JS **运行时注入**，静态判定不了 ⇒ 判"运行时注入：静态不可判，由浏览器断言负责"，由第 2 层兜底。

### 2. 结构探针（真实 Chrome，15 类结构）

探针夹具：`fixtures/structure-probe.mjs`。**单一事实来源** —— 同一份 `PROBE` 数组同时派生「热区配置」和「断言用例」，两边不会漂移。

每类断言四件事：**命中正确的热区**（按标注标题判定）、**几何贴合**（红框 = 目标外扩 4px，dx/dy/w/h 全 < 0.6px）、**红框真的可见**（`computed opacity === '1'`）、**引线已绘制**（`#lines path === 1`）。

| case | 逼出的情形 |
|---|---|
| `flow` | 普通文档流（基础对照） |
| `scroll` | 页面级滚动（悬停时 scrollY = 1039） |
| `inner` | `overflow-y:auto` 容器内滚动 |
| `table` | 表格单元格内 + 40 行 + sticky 表头 + 外层纵向滚动 |
| `card` / `card-btn` / `card-input` | 卡片 + 嵌套标注（悬停内层必须命中最内层，不能命中外层） |
| `late-btn` | load 后 600ms 才注入 DOM |
| `rerender-btn` | `innerHTML` 整体重写、旧引用 `isConnected=false` |
| `disabled-btn` | 禁用态按钮（loading 置灰场景） |
| `pe-btn` | 父层 `pointer-events:none`（事件目标会落在祖先上） |
| `drawer-input` | 抽屉：`transform` 滑入 + `visibility`，z-index 9999 |
| `modal-btn` | 弹窗：`display:none` 切换（0 尺寸目标），z-index 10000 |
| `collapse-btn` | 折叠面板：`display:none` 切换（0 尺寸目标） |
| `fab` | `position:fixed` 业务元素 |

**这两类曾经真的挂过，是框架硬化前实测出来的**：`late-btn` / `rerender-btn`（一次性 `querySelector` 永久缓存 ⇒ 热区永久死亡）、`pe-btn`（依赖 DOM 事件目标）、`modal-btn` / `collapse-btn`（行内 `opacity:0` 写了不回清）。它们是最容易被后续重构重新引入的坑，别删。

### 3. 全局行为断言

- 默认是干净原型：开关关闭时悬停不出标注、不画引线。
- 标注层压过业务弹层：`drawer`(9999) / `modal`(10000) 用例上，anno 与 hotspot 的 z-index 必须都大于业务层级。
- 任意时刻只有一个热区处于激活态。
- 指针移出即隐藏且引线清空；关闭开关立即清空。
- 控制台零报错、零告警（含框架的「热区 selector 未命中」——它跑满约 2 秒才告警，所以延迟注入的元素不会误报）。
- `--page` 模式额外断言：热区元素挂载数 == 配置数；开启后悬停首个热区能出标注并绘制引线。

## 判据的两条硬规矩

1. **必须同时断言 rect 与 computed opacity。** `opacity:0` 的元素 rect 依然完全正确 —— 只比 rect 的断言对 opacity 免疫，会把"红框根本看不见"判成通过。本套件早期就这么假通过过一次。
2. **`hover(force: true)` 有坐标竞态。** 它会"读一次元素盒子就移动鼠标"，抽屉滑入动画/滚动过程中可能读到中途坐标、把鼠标落在控件外。真人鼠标持续移动、框架每帧重判，会自动收敛 ⇒ 这是**测试脚本**的弱点，不是框架缺陷。套件因此内置「失败时按指针实时中心补一次确定化移动」的复测，并在输出里标注 `[已按指针中心复测]`。看到这个标注说明发生过竞态，值得留意但不算失败。

## 已知边界（不是缺陷）

- `body` 上的 `transform` / `filter` / `contain` 会把叠加层的包含块从视口换成 `body`，标注可能错位；框架对此**一次性 `console.warn`**，不静默。页面不要给 `body` 加这些属性（框架自身 `body{margin:0}` 且未定位）。
- 未被标注的元素若在视觉上被弹层遮住，正确地**不会**命中（遮挡语义靠 `elementFromPoint` + 祖先关系校验保住）。
- **标注框会盖住密度高的页面**：标注框固定 250px 宽、条目多时可达 400px+ 高。目标左右都没空间时（宽表格是典型）框架回退到下方，再按视口夹紧，于是必然压住部分内容。这是「标注框完整可见」与「不遮挡页面」之间的取舍，当前取前者。要改属于 `positionAnno()` 的定位策略调整，改完必须确认 15 类几何断言仍全绿。
- **内容区默认 760px**，宽表格 / 多列表单需要页面自己设 `:root{--stage-max:1180px;}`，框架不猜业务需要多宽。探针把该钩子设成 1100px 并断言其生效，防止它被后续重构掉。

## 目录

```
tests/
  run.mjs                      入口：生成 → 静态 → 浏览器 → 汇总
  lib/build.mjs                生成器：框架 + 4 占位符替换；assertProductMatchesFrame 强不变量
  lib/check.mjs                静态契约断言（对任意产物可用）
  lib/playwright.mjs           playwright / 浏览器解析
  fixtures/structure-probe.mjs 15 类结构探针（PROBE 单一事实来源）
  out/                         生成的夹具产物（可随时重生成）
```

## 加一个 case

只改 `fixtures/structure-probe.mjs` 的 `PROBE` 数组一处：加一条 `{ id, sel, caseName, front, back, setup?, settle?, pos? }`。
热区配置与断言用例会自动同步；静态契约里的「selector 唯一命中 / front+back / /api/ 占位」也会自动覆盖到它。

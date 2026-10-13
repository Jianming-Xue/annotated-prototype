# 规格清单（spec manifest）—— 让原型成为机器可读的实现依据

## 为什么是这份清单，而不是"热区里的中文散文"

人类标注（悬停看到的红框 + 黄底标注框）是**散文**，适合评审；实现页面需要的是**结构**：控件类型、必填、校验、事件、接口、参数、列定义、分页、状态依赖。

如果两者各写一份，早晚漂移。所以本 skill 的规矩是：

> **规格清单是唯一事实源。人类标注由它派生。**

于是「悬停看到的」与「AI 读到的」在构造上不可能不一致——连"某控件只在标注里出现、清单里没有"这种孤儿都不可能产生（有回归门禁断言）。

## 清单长在哪

产物页面里有且只有一份，惰性不执行、可直接 `JSON.parse`：

```html
<script type="application/json" id="prototype-spec">
{ "schema": "annotated-prototype/spec@1", ... }
</script>
```

## 怎么读

```bash
node <skill>/tests/read-spec.mjs 原型页.html          # 输出 Markdown 规格（给 AI / 开发者）
node <skill>/tests/read-spec.mjs 原型页.html --json   # 输出原始 JSON（给程序消费）
```

实现真实页面的推荐流程：**先读这份 Markdown 规格，再动手**；页面 HTML/CSS 只用来对齐视觉细节，不要靠读 HTML 反推业务规则。

## 结构定义

```jsonc
{
  "schema": "annotated-prototype/spec@1",   // 必填，固定值
  "title": "Rule 信息列表",                  // 必填，也是页面标题
  "summary": "一句话说明这页是干什么的、分几层",

  // 页面分区：让实现者知道层级与职责划分
  "regions": [
    { "id": "search", "label": "查询条件", "role": "search", "desc": "…" }
    // role 自定：search / table / actions / detail / form / chart …
  ],

  // 页面级接口清单。实现者从这里拿到全部后端依赖
  "apis": [
    { "id": "rulePage", "method": "GET", "path": "/api/v1/log/rule_info/page", "desc": "Rule 信息列表（分页）" },
    { "id": "ruleExport", "method": "GET", "path": "/api/v1/log/rule_info/export",
      "desc": "全文导出", "status": "proposed" }   // status: confirmed（默认）| proposed
  ],

  "controls": [
    {
      "selector": "#envSelect",   // 必填。必须 #id 或 .class；须在页面里唯一命中
      "kind": "select",           // 必填。见下方 kind 白名单
      "label": "环境名",           // 必填。控件名
      "title": "环境名｜下拉框",    // 选填。覆盖悬停标注的标题（默认由 label｜kind 生成）
      "id": "envSelect",          // 选填。热区内部 id（默认从 selector 派生，须唯一）
      "region": "查询条件",        // 选填。所属分区 label
      "required": true,           // 选填。必填会在标注里成为一条「必填」事实
      "placeholder": "请选择环境",  // 选填
      "options": ["prod", "pre"], // 选填。枚举型控件的候选值
      "format": "YYYY-MM-DD HH:mm:ss",  // 选填。输入格式约束
      "param": "env",             // 选填。本控件的值作为哪个查询参数提交（实现时最省事的一条）

      "rules":    ["必填：未选择时点搜索会在本字段下方红字提示并阻止提交"],
      "on":       { "load": ["加载环境名选项"], "change": ["清空列表已选中的行"] },
      "apis":     ["envList"],           // 引用 apis[].id；纯前端控件给 []，会自动生成「不调接口」条目
      "apiNotes": ["失败时 Toast 提示错误信息并保留空选项"],
      "notes":    ["非必填，不参与搜索前的必填校验"],
      "dependsOn":["列表已选中一行"]        // 前置条件（如"必须选中一行"）
    }
  ],

  // 表格：结构化的列定义 / 分页 / 行选择
  "table": {
    "selector": "#ruleTable",
    "annotatedBy": ["#p-table-btn"],  // 表格本身没有标注框、而由内部控件代表时用它指定
    "dataApi": "rulePage",
    "columns": [
      { "key": "ruleName", "label": "Rule Name", "align": "left", "format": "text" },
      { "key": "totalCost", "label": "Total Cost", "align": "right", "format": "duration-ms" },
      { "key": "serverHang", "label": "Server Hang", "align": "left", "format": "tag", "enum": ["Hang", "—"] }
    ],
    "pagination": { "api": "rulePage", "pageParam": "page", "pageSize": 5,
                    "pageSizeFixed": true, "serverSide": true, "totalField": "total" },
    "rowSelection": { "mode": "single", "requiredBy": ["#btnDetail", "#btnDownload"],
                      "clearedOn": ["搜索", "翻页"] }
  },

  "mock": ["列表数据为本地模拟…", "网络延迟用 setTimeout 模拟…"],   // 哪些是假的，实现时替换
  "openQuestions": ["下载接口设计未给出…"]                        // 原型没定下来的地方，不藏着
}
```

### kind 白名单

`select` `input` `textarea` `button` `radio` `checkbox` `table` `pager` `modal` `drawer` `toggle` `link` `other`

> `kind` 决定实现侧该用什么组件，**不能省**。不确定就写 `other`，但别瞎填。

### 字段省略规则（重要）

清单要"够实现"，不是"够长"：

- 与实现无关的视觉细节（间距、颜色、圆角）**不要**写进清单——那是页面样式的职责。
- `rules` / `notes` / `apiNotes` 是散文，只放**结构化字段表达不了的**约定（文案、失败提示策略、跨控件联动）。凡是能用 `required`/`options`/`format`/`param`/`on` 表达的，就用结构化字段。
- 设计里没给的接口：**声明成 `status: "proposed"`** 并写进 `openQuestions`，不要在散文里编一个看起来已定的路径。清单校验会拦住"散文里出现未声明的 `/api/` 路径"。

## 由清单派生人类标注的规则

| 清单字段 | 悬停标注里出现为 |
|---|---|
| `required` | 前端条目：`必填（占位「…」）` |
| `rules[]` | 前端条目：原文 |
| `on{event:[行为]}` | 前端条目：`点击：…` / `选项变化：…` / `失焦：…` |
| `notes[]` | 前端条目：原文 |
| `dependsOn[]` | 前端条目：`前置条件：…` |
| `apis[]` | 后端条目：`METHOD path —— 说明`（`proposed` 追加「（设计未给出，待确认）」） |
| `param` | 后端条目：`值作为查询参数 \`x\` 随请求提交` |
| `apiNotes[]` | 后端条目：原文 |
| （无任何后端事实） | 后端条目：`不调接口（纯前端行为）` |

前后端条目**至少各一条**由框架保证，不会出现"只有前端标注"的控件。

## 回归门禁（`node tests/run.mjs` 自动查）

- 清单存在、是合法 JSON、`schema` 版本正确
- schema 校验全过：`kind` 白名单、`apis[].path` 必须 `/api/` 或 `/<服务名>/api/` 开头（如 `/log-viewer/api/v1/…`）且无真实域名、引用完整性（`apis[]` / `table.dataApi` / `table.pagination.api` / `table.annotatedBy` 指向的 id 都必须存在）
- **清单 ↔ 人类标注双向一致**：没有任何控件只出现在一边
- 每个热区都有**非空且唯一的 id**（框架以它为映射表键；缺了会静默累积 active 类）
- **表格列定义与页面真实表头逐一对齐**（顺序 + 文案）
- 表格区域必须有可标注控件；有行选择语义时必须声明 `requiredBy`
- 散文里出现的每个 `/api/` 路径都必须在 `apis` 里声明过（防散文与结构漂移）
- 声明了却没人引用的接口会被判失败（防规格噪音）
- 没有 `status: proposed` 接口与 `openQuestions` 时才记为"规格无缺口"

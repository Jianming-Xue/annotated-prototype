/**
 * 结构探针夹具：同一份数组同时派生「热区配置」与「浏览器断言用例」，
 * 保证两边永不漂移。
 *
 * 覆盖 15 类结构：普通文档流 / 页面滚动 / 内部滚动容器 / 表格单元格 /
 * 卡片与嵌套标注 / 延迟注入 / innerHTML 重渲染 / 禁用态 /
 * 父层 pointer-events:none / 抽屉(transform+visibility) /
 * 弹窗(display:none) / 折叠面板(display:none) / position:fixed 浮动按钮。
 */

import { SPEC_SCHEMA } from '../lib/spec.mjs';

export const STYLES = `
  /* 探针刻意把内容区放宽到 1100px：用来验证 --stage-max 布局钩子真的生效，
     而不是只验证它的默认值。断言在 run.mjs 里。 */
  :root{--stage-max:1100px;}
  h1{font-size:22px;margin:0 0 6px;}
  .lead{margin:0 0 24px;font-size:13px;color:var(--muted);}
  section{margin:0 0 56px;}
  .c{margin:0 0 10px;font-size:11.5px;font-weight:700;letter-spacing:.06em;
    text-transform:uppercase;color:var(--muted);}
  .spacer{height:1100px;}
  .btn{appearance:none;font:inherit;font-size:13px;font-weight:600;padding:12px 18px;border-radius:9px;
    border:1px solid var(--ink);background:var(--ink);color:#fff;cursor:pointer;}
  .btn.ghost{background:#fff;color:var(--ink);border-color:var(--line);}
  .btn.tiny{padding:6px 10px;font-size:11.5px;border-radius:6px;}
  .btn:disabled{opacity:.45;cursor:not-allowed;}
  .text-input{font:inherit;font-size:13px;padding:11px 13px;border:1px solid var(--line);
    border-radius:9px;outline:none;width:100%;}
  .field{display:flex;flex-direction:column;gap:7px;margin:14px 0;}
  .field label{font-size:12px;font-weight:600;color:var(--muted);}
  .scroller{height:220px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;padding:0 14px 14px;}
  .scroller .row{height:60px;display:flex;align-items:center;font-size:12px;color:var(--muted);
    border-bottom:1px dashed var(--line);}
  .tablewrap{max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:10px;}
  table.grid{border-collapse:collapse;width:100%;font-size:12.5px;}
  table.grid th{position:sticky;top:0;background:#f7f8fa;text-align:left;font-size:11.5px;
    color:var(--muted);padding:9px 12px;border-bottom:1px solid var(--line);}
  table.grid td{padding:7px 12px;border-bottom:1px solid #f0f1f4;}
  .card{border:1px solid var(--line);border-radius:12px;padding:18px;background:#fff;}
  .card h3{margin:0 0 8px;font-size:15px;}
  .card p{margin:0;font-size:12.5px;color:var(--muted);}
  .pe-none{pointer-events:none;opacity:.6;display:inline-block;}
  .drawer{position:fixed;top:0;right:0;z-index:9999;width:340px;height:100vh;background:#fff;
    border-left:1px solid var(--line);padding:18px;transform:translateX(103%);visibility:hidden;
    transition:transform .28s,visibility .28s;}
  .drawer.open{transform:translateX(0);visibility:visible;}
  .modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10000;width:360px;
    background:#fff;border-radius:14px;padding:20px;display:none;box-shadow:0 24px 70px -20px rgba(16,24,40,.5);}
  .modal.open{display:block;}
  .mask{position:fixed;inset:0;z-index:9998;background:rgba(17,20,24,.42);display:none;}
  .mask.open{display:block;}
  .collapse{border:1px solid var(--line);border-radius:10px;overflow:hidden;}
  .collapse-head{display:block;width:100%;text-align:left;font:inherit;font-size:13px;font-weight:600;
    padding:14px;background:#fff;border:0;cursor:pointer;}
  .collapse-panel{display:none;padding:16px;border-top:1px solid var(--line);background:#fbfbfc;}
  .collapse.open .collapse-panel{display:block;}
  .fab{position:fixed;right:28px;bottom:28px;z-index:9000;}
`;

export const CONTENT = `
  <h1>框架结构探针页</h1>
  <p class="lead">每个热区的标注标题就是它的 case 名，探针按标题判定命中了哪一个。此页由 tests/ 自动生成，请勿手改。</p>

  <section>
    <p class="c">case:flow — 普通文档流按钮</p>
    <button class="btn" id="p-flow">普通文档流按钮</button>
  </section>

  <div class="spacer"></div>

  <section>
    <p class="c">case:scroll — 页面滚到此处再悬停（scrollY &gt; 0）</p>
    <button class="btn" id="p-scroll">页面中部按钮</button>
  </section>

  <section>
    <p class="c">case:inner — 内部滚动容器</p>
    <div class="scroller" id="p-scroller">
      <div class="row">row 01</div>
      <div class="row">row 02</div>
      <div class="row"><button class="btn" id="p-inner">容器内按钮</button></div>
      <div class="row">row 03</div>
      <div class="row">row 04</div>
      <div class="row">row 05</div>
    </div>
  </section>

  <section>
    <p class="c">case:table — 表格单元格内的按钮（40 行 + 纵向滚动 + sticky 表头）</p>
    <div class="tablewrap">
      <table class="grid" id="p-table">
        <thead><tr><th>#</th><th>名称</th><th>操作</th></tr></thead>
        <tbody id="p-tbody">
          <tr><td>1</td><td>标注目标行</td><td><button class="btn tiny" id="p-table-btn">行内按钮</button></td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <p class="c">case:card / card-btn / card-input — 卡片与嵌套标注</p>
    <div class="card" id="p-card">
      <h3>卡片标题</h3>
      <p>悬停卡片空白处应命中外层卡片；悬停卡片内按钮应命中内层按钮（嵌套取最内层）。</p>
      <div class="field">
        <label for="p-card-input">卡片内输入框</label>
        <input class="text-input" id="p-card-input" type="text" placeholder="卡片内输入框">
      </div>
      <button class="btn" id="p-card-btn">卡片内按钮</button>
    </div>
  </section>

  <section>
    <p class="c">case:late — load 后 600ms 才注入的按钮</p>
    <div id="p-late-host"><span class="c">（注入前：空白）</span></div>
  </section>

  <section>
    <p class="c">case:rerender — innerHTML 重写后元素被替换</p>
    <div id="p-rerender-host">
      <button class="btn" id="p-rerender-btn">重渲染前按钮</button>
    </div>
    <p style="margin:12px 0 0"><button class="btn ghost" id="p-do-rerender">模拟重渲染</button></p>
  </section>

  <section>
    <p class="c">case:disabled — 禁用态按钮 / case:pe-none — 父层 pointer-events:none</p>
    <button class="btn" id="p-disabled-btn" disabled>禁用中的按钮</button>
    <button class="btn ghost" id="p-toggle-disable">切换禁用态</button>
    <p style="margin:16px 0 0"><span class="pe-none"><button class="btn" id="p-pe-btn">父层 pointer-events:none</button></span></p>
  </section>

  <section>
    <p class="c">case:drawer — 抽屉（transform 滑入 + visibility，z-index 9999）</p>
    <button class="btn" id="p-open-drawer">打开抽屉</button>
  </section>

  <section>
    <p class="c">case:modal — 弹窗（display:none 切换，z-index 10000）</p>
    <button class="btn" id="p-open-modal">打开弹窗</button>
  </section>

  <section>
    <p class="c">case:collapse — 折叠面板（display:none 切换）</p>
    <div class="collapse" id="p-collapse">
      <button class="collapse-head" id="p-collapse-head">展开 / 收起面板</button>
      <div class="collapse-panel"><button class="btn" id="p-collapse-btn">面板内按钮</button></div>
    </div>
  </section>

  <section>
    <p class="c">case:fab — position:fixed 浮动按钮（右下角）</p>
  </section>

  <button class="btn fab" id="p-fab">FAB</button>

  <aside class="drawer" id="p-drawer">
    <h3 style="margin:0 0 12px;font-size:15px">抽屉</h3>
    <div class="field">
      <label for="p-drawer-input">抽屉内输入框</label>
      <input class="text-input" id="p-drawer-input" type="text" placeholder="抽屉内输入框">
    </div>
    <button class="btn ghost" id="p-close-drawer">关闭</button>
  </aside>

  <div class="mask" id="p-mask"></div>
  <div class="modal" id="p-modal">
    <h3 style="margin:0 0 12px;font-size:15px">弹窗</h3>
    <p style="margin:0 0 14px;font-size:12.5px;color:var(--muted)">display:none 切换的弹窗。</p>
    <button class="btn" id="p-modal-btn">弹窗内按钮</button>
  </div>

  <script>
  /* 探针的业务行为：刻意只用原生 JS + 最常见的几种结构切换方式，
     用来逼出框架在真实生成页面里会遇到的情形。 */
  (function () {
    var $ = function (id) { return document.getElementById(id); };
    $('p-open-drawer').addEventListener('click', function () { $('p-drawer').classList.add('open'); });
    $('p-close-drawer').addEventListener('click', function () { $('p-drawer').classList.remove('open'); });
    $('p-open-modal').addEventListener('click', function () { $('p-modal').classList.add('open'); $('p-mask').classList.add('open'); });
    $('p-mask').addEventListener('click', function () { $('p-modal').classList.remove('open'); $('p-mask').classList.remove('open'); });
    $('p-collapse-head').addEventListener('click', function () { $('p-collapse').classList.toggle('open'); });
    $('p-toggle-disable').addEventListener('click', function () { var b = $('p-disabled-btn'); b.disabled = !b.disabled; });
    $('p-do-rerender').addEventListener('click', function () {
      $('p-rerender-host').innerHTML = '<button class="btn" id="p-rerender-btn">重渲染后按钮（新元素）</button>';
    });
    var tb = $('p-tbody');
    for (var i = 2; i <= 40; i++) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + i + '</td><td>数据行 ' + i + '</td><td><button class="btn tiny">操作</button></td>';
      tb.appendChild(tr);
    }
    setTimeout(function () {
      $('p-late-host').innerHTML = '<button class="btn" id="p-late-btn">延迟注入的按钮</button>';
    }, 600);
  })();
  </script>
`;

/* ---- 单一事实来源：热区配置 + 断言用例 ---- */

export const PROBE = [
  { id: 'flow', sel: '#p-flow', caseName: 'case:flow',
    front: '普通文档流中的按钮，作为最基础的对照基准',
    back: 'GET /api/probe/flow 读取按钮初始状态' },

  { id: 'scroll', sel: '#p-scroll', caseName: 'case:scroll',
    front: '位于页面中部（上方有 1100px 占位），悬停时 scrollY > 0',
    back: 'GET /api/probe/scroll 读取当前滚动上下文',
    setup: async (page) => page.evaluate(() => document.getElementById('p-scroll').scrollIntoView({ block: 'center' })) },

  { id: 'inner', sel: '#p-inner', caseName: 'case:inner',
    front: '位于 height:220px、overflow-y:auto 的容器内，只产生容器内位移',
    back: 'POST /api/probe/inner 上报容器滚动位置',
    setup: async (page) => page.evaluate(() => {
      const w = document.getElementById('p-scroller');
      window.scrollBy(0, w.getBoundingClientRect().top - 300);
    }) },

  { id: 'table', sel: '#p-table-btn', caseName: 'case:table',
    front: '位于 40 行表格的单元格内，表头 sticky，外层容器可纵向滚动',
    back: 'GET /log-viewer/api/v1/probe/table 读取行内操作权限',
    setup: async (page) => page.evaluate(() => document.getElementById('p-table-btn').scrollIntoView({ block: 'center' })) },

  { id: 'card', sel: '#p-card', caseName: 'case:card-outer',
    front: '卡片整体作为热区，悬停卡片空白处应命中本热区',
    back: 'GET /api/probe/card 读取卡片数据',
    pos: { x: 8, y: 8 } },
  { id: 'card-btn', sel: '#p-card-btn', caseName: 'case:card-inner',
    front: '嵌套在卡片热区内部，悬停按钮应命中最内层热区',
    back: 'POST /api/probe/card/action 提交卡片内操作' },
  { id: 'card-input', sel: '#p-card-input', caseName: 'case:card-input',
    front: '卡片内输入框，聚焦时边框高亮',
    back: 'POST /api/probe/card/validate 失焦校验输入内容' },

  { id: 'late-btn', sel: '#p-late-btn', caseName: 'case:late',
    front: 'load 后 600ms 才注入 DOM，框架必须重新解析 selector',
    back: 'GET /api/probe/late 读取延迟加载的数据',
    settle: 1100 },

  { id: 'rerender-btn', sel: '#p-rerender-btn', caseName: 'case:rerender',
    front: '被 innerHTML 整体替换成新元素，旧引用已 isConnected=false',
    back: 'POST /api/probe/rerender 触发重新渲染',
    setup: async (page) => { await page.click('#p-do-rerender'); await page.waitForTimeout(200); } },

  { id: 'disabled-btn', sel: '#p-disabled-btn', caseName: 'case:disabled',
    front: '禁用态按钮（loading 置灰场景），仍必须能标注',
    back: 'POST /api/probe/disabled 提交被禁用态保护的动作' },

  { id: 'pe-btn', sel: '#p-pe-btn', caseName: 'case:pe-none',
    front: '父层 pointer-events:none，事件目标会落在祖先上，仍需能标注',
    back: 'GET /api/probe/pe 读取只读区域数据' },

  { id: 'drawer-input', sel: '#p-drawer-input', caseName: 'case:drawer',
    front: '抽屉用 transform 滑入 + visibility 切换，固定定位 z-index 9999',
    back: 'POST /api/probe/drawer/validate 失焦校验抽屉内输入',
    setup: async (page) => { await page.click('#p-open-drawer'); await page.waitForTimeout(500); } },

  { id: 'modal-btn', sel: '#p-modal-btn', caseName: 'case:modal',
    front: '弹窗用 display:none 切换（0 尺寸目标），z-index 10000',
    back: 'POST /api/probe/modal/confirm 提交弹窗确认',
    setup: async (page) => { await page.click('#p-open-modal'); await page.waitForTimeout(400); } },

  { id: 'collapse-btn', sel: '#p-collapse-btn', caseName: 'case:collapse',
    front: '折叠面板用 display:none 切换：收起时盒子尺寸为 0，展开后才可见',
    back: 'POST /api/probe/collapse/refresh 刷新面板内容',
    setup: async (page) => { await page.click('#p-collapse-head'); await page.waitForTimeout(300); } },

  { id: 'fab', sel: '#p-fab', caseName: 'case:fab',
    front: 'position:fixed 的浮动按钮，滚动时视口位置不变',
    back: 'GET /api/probe/fab 读取浮动入口数据' },
];

/* 控件类型显式声明（不靠猜）：新增 case 时这里必须同步，否则下面会断言失败 */
const KIND = {
  flow: 'button', scroll: 'button', inner: 'button', table: 'button',
  card: 'other', 'card-btn': 'button', 'card-input': 'input',
  'late-btn': 'button', 'rerender-btn': 'button', 'disabled-btn': 'button',
  'pe-btn': 'button', 'drawer-input': 'input', 'modal-btn': 'button',
  'collapse-btn': 'button', fab: 'button',
};
const missingKind = PROBE.filter(p => !KIND[p.id]).map(p => p.id);
if (missingKind.length) throw new Error('探针新 case 未声明 kind：' + missingKind.join('、'));

const apiId = (p) => 'probe-' + p.id;
const TABLE_API_ID = 'probe-table-rows';

/** 从 back 文案解析接口，作为 apis 声明的唯一来源（避免两处手抄） */
function parseApi(text, id) {
  const m = text.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/(?:[a-z][a-z0-9-]*\/)?api\/[^\s]+)(?:\s+(.*))?$/);
  if (!m) throw new Error(`探针 ${id} 的 back 文案不符合「METHOD /api/path 说明」：${text}`);
  return { id: apiId({ id }), method: m[1], path: m[2], desc: (m[3] || '').trim() };
}

/**
 * 探针的规格清单。刻意保持「每个控件 = 一个接口」的极简形态：
 * 探针只验证标注能力，不验证业务规格表达力。
 */
export const spec = {
  schema: SPEC_SCHEMA,
  title: '框架结构探针页',
  summary: 'annotated-prototype 框架回归探针：15 类样式结构各一个可标注控件，' +
    '用于验证热区命中、几何跟随、弹层层级与 DOM 变化下的重解析。',
  regions: [
    { id: 'probe', label: '结构探针', role: 'mixed', desc: '每个控件的标注标题即它的 case 名' },
  ],
  apis: [
    ...PROBE.map(p => parseApi(p.back, p.id)),
    { id: TABLE_API_ID, method: 'GET', path: '/log-viewer/api/v1/probe/table/rows', desc: '表格行数据' },
  ],
  controls: PROBE.map(p => ({
    selector: p.sel,
    kind: KIND[p.id],
    label: p.caseName,
    title: p.caseName,          // 断言按标题判定命中了哪个热区，故精确覆盖
    required: false,
    notes: [p.front],
    apis: [apiId(p)],
  })),
  table: {
    selector: '#p-table',
    columns: [
      { key: 'idx', label: '#', align: 'left', format: 'text' },
      { key: 'name', label: '名称', align: 'left', format: 'text' },
      { key: 'action', label: '操作', align: 'left', format: 'text' },
    ],
    annotatedBy: ['#p-table-btn'],   // 探针标注的是行内按钮，不是表格本身
    dataApi: TABLE_API_ID,
    pagination: { api: TABLE_API_ID, pageParam: 'page', serverSide: true },
    rowSelection: { mode: 'none', requiredBy: [], clearedOn: [] },
  },
  mock: ['全部数据与交互均为模拟；探针只验证标注能力，不代表任何业务'],
  openQuestions: [],
};

export const cases = PROBE.map(p => ({
  name: p.id,
  sel: p.sel,
  expect: p.caseName,
  setup: p.setup || null,
  settle: p.settle || 0,
  pos: p.pos || null,
}));

export const TITLE = '框架结构探针页';

/** 覆盖高 z-index 业务弹层的用例：断言标注层必须压过它们。
 *  键 = 热区 id（与 cases[].name 同一套命名，别写 caseName）。 */
export const OVERLAY_CASES = [
  { case: 'drawer-input', businessZ: 9999 },
  { case: 'modal-btn', businessZ: 10000 },
];

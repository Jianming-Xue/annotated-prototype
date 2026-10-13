/**
 * 原型规格清单（spec manifest）—— 让「交付页」变成机器可读的规格源。
 *
 * 为什么需要：人类标注是散文，散落在热区里；结构（必填 / 校验 / 事件 / 接口 / 参数 /
 * 列定义）藏在业务 HTML 与业务 JS 里。AI 要照着实现只能靠猜。
 * 这里把事实收进一份结构化清单，并**由它派生人类标注** ⇒ 两种视图不可能漂移。
 *
 * 清单位于页面内 `<script type="application/json" id="prototype-spec">`：
 * 惰性、不执行、可直接 grep / JSON.parse，AI 无需执行 JS 就能读到全量规格。
 */

export const SPEC_SCHEMA = 'annotated-prototype/spec@1';

/**
 * 接口路径占位规范：`/api/…` 或 `/<服务名>/api/…`（服务名小写字母开头、可含数字与连字符，
 * 如 `/log-viewer/api/v1/…`、`/security-management/api/v1/…` —— nginx 按路径首段分发）。
 */
export const API_PATH_RE = /^\/(?:api\/|[a-z][a-z0-9-]*\/api\/)/;

/** 控件类型白名单。kind 决定实现侧该用什么组件。 */
export const CONTROL_KINDS = [
  'select', 'input', 'textarea', 'button', 'radio', 'checkbox',
  'table', 'pager', 'modal', 'drawer', 'toggle', 'link', 'other',
];

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/* ───────────────────────── 校验 ───────────────────────── */

const fail = (msgs) => { throw new Error('spec 清单不合法：\n  - ' + msgs.join('\n  - ')); };

export function validateSpec(spec) {
  const errs = [];
  if (!spec || typeof spec !== 'object') fail(['spec 必须是对象']);
  if (spec.schema !== SPEC_SCHEMA) errs.push(`schema 必须是 "${SPEC_SCHEMA}"，当前 ${JSON.stringify(spec.schema)}`);
  if (!spec.title) errs.push('缺少 title');

  const apis = spec.apis || [];
  if (!Array.isArray(apis)) errs.push('apis 必须是数组');
  const apiIds = new Set();
  for (const a of apis) {
    if (!a.id) errs.push('apis[] 缺少 id');
    else if (apiIds.has(a.id)) errs.push(`apis[].id 重复：${a.id}`);
    else apiIds.add(a.id);
    if (!HTTP_METHODS.includes(a.method)) errs.push(`api ${a.id} 的 method 非法：${a.method}`);
    if (a.status !== undefined && !['confirmed', 'proposed'].includes(a.status)) {
      errs.push(`api ${a.id} 的 status 非法：${a.status}（可选 confirmed | proposed）`);
    }
    if (typeof a.path !== 'string' || !API_PATH_RE.test(a.path)) {
      errs.push(`api ${a.id} 的 path 必须以 /api/ 或 /<服务名>/api/ 开头（占位规范，如 /log-viewer/api/v1/…），当前 ${JSON.stringify(a.path)}`);
    }
    if (/^https?:/i.test(a.path || '')) errs.push(`api ${a.id} 的 path 含真实域名`);
  }

  const controls = spec.controls || [];
  if (!controls.length) errs.push('controls 不能为空');
  const seenSel = new Set();
  for (const c of controls) {
    const tag = c.selector || c.label || '(无名)';
    if (!c.selector) errs.push(`控件 ${tag} 缺少 selector`);
    else if (seenSel.has(c.selector)) errs.push(`selector 重复：${c.selector}`);
    else seenSel.add(c.selector);
    if (c.selector && !/^[#.]/.test(c.selector)) errs.push(`控件 ${tag} 的 selector 必须用 #id 或 .class（避免标签选择器）`);
    if (!c.label) errs.push(`控件 ${tag} 缺少 label`);
    if (c.title !== undefined && typeof c.title !== 'string') errs.push(`控件 ${tag} 的 title 必须是字符串`);
    if (c.param !== undefined && typeof c.param !== 'string') errs.push(`控件 ${tag} 的 param 必须是字符串`);
    if (!CONTROL_KINDS.includes(c.kind)) errs.push(`控件 ${tag} 的 kind 非法：${c.kind}（可选 ${CONTROL_KINDS.join('|')}）`);
    for (const id of (c.apis || [])) {
      if (!apiIds.has(id)) errs.push(`控件 ${tag} 引用了未声明的 api：${id}`);
    }
    if (!Array.isArray(c.notes) && c.notes !== undefined) errs.push(`控件 ${tag} 的 notes 必须是数组`);
    if (!Array.isArray(c.apiNotes) && c.apiNotes !== undefined) errs.push(`控件 ${tag} 的 apiNotes 必须是数组`);
    if (c.dependsOn !== undefined && !Array.isArray(c.dependsOn)) errs.push(`控件 ${tag} 的 dependsOn 必须是数组`);
    // 前后端条目必须都有来源：结构化字段 + notes/apiNotes，二者皆空则标注会缺一半
    const front = (c.rules || []).length + Object.keys(c.on || {}).length + (c.notes || []).length + (c.required ? 1 : 0);
    const back = (c.apis || []).length + (c.apiNotes || []).length + 1; // +1 = 无接口时的「不调接口」兜底
    if (front === 0) errs.push(`控件 ${tag} 没有任何前端事实（rules / on / notes / required 全空）`);
    if (back === 0) errs.push(`控件 ${tag} 没有任何后端事实（apis / apiNotes 全空）`);
  }

  const idSeen = new Map();
  for (const c of controls) {
    const cid = deriveControlId(c);
    if (!cid) errs.push(`控件 ${c.selector || c.label} 派生出的 id 为空，请显式给 id`);
    else if (idSeen.has(cid)) errs.push(`控件 id 冲突：${cid}（${idSeen.get(cid)} 与 ${c.selector}）—— 请显式指定 id`);
    else idSeen.set(cid, c.selector);
  }

  const t = spec.table;
  if (t) {
    if (!t.selector) errs.push('table 缺少 selector');
    if (!Array.isArray(t.columns) || !t.columns.length) errs.push('table.columns 不能为空');
    for (const col of (t.columns || [])) {
      if (!col.key || !col.label) errs.push(`table.columns[] 缺少 key 或 label：${JSON.stringify(col)}`);
    }
    if (t.dataApi && !apiIds.has(t.dataApi)) errs.push(`table.dataApi 引用了未声明的 api：${t.dataApi}`);
    if (t.pagination && t.pagination.api && !apiIds.has(t.pagination.api)) {
      errs.push(`table.pagination.api 引用了未声明的 api：${t.pagination.api}`);
    }
    if (t.annotatedBy !== undefined) {
      if (!Array.isArray(t.annotatedBy)) errs.push('table.annotatedBy 必须是数组');
      else for (const s2 of t.annotatedBy) {
        if (!seenSel.has(s2)) errs.push(`table.annotatedBy 引用了不存在的控件：${s2}`);
      }
    }
    const tableCovered = seenSel.has(t.selector) || (t.annotatedBy || []).some(s2 => seenSel.has(s2));
    if (!tableCovered) errs.push(`表格区域没有可标注控件：请在 controls 里加上 ${t.selector}，或用 table.annotatedBy 指定代表它的控件`);
  }

  // 散文里出现的接口路径必须在 apis 里声明过（防止散文与结构漂移）
  const declared = new Set(apis.map(a => a.path));
  const referenced = new Set();
  for (const c of controls) {
    for (const text of [...(c.notes || []), ...(c.apiNotes || []), ...(c.rules || []), ...Object.values(c.on || {}).flat()]) {
      for (const m of String(text).matchAll(/(?:^|[^:\w])(\/[A-Za-z0-9_][\w\-./{}]*)/g)) {
        if (!API_PATH_RE.test(m[1])) errs.push(`控件 ${c.selector} 的文案里出现非占位路径（须 /api/ 或 /<服务名>/api/ 开头）：${m[1]}`);
        else referenced.add(m[1]);
      }
    }
  }
  for (const p of referenced) {
    if (!declared.has(p)) errs.push(`文案引用了未在 apis 里声明的路径：${p}`);
  }
  // 声明了却没人用的接口 = 规格噪音
  const used = new Set(referenced);
  for (const c of controls) for (const id of (c.apis || [])) {
    const a = apis.find(x => x.id === id); if (a) used.add(a.path);
  }
  if (t) { const a = apis.find(x => x.id === t.dataApi); if (a) used.add(a.path); }
  for (const p of declared) if (!used.has(p)) errs.push(`接口声明了但没有任何控件或表格引用：${p}`);

  if (errs.length) fail(errs);
  return spec;
}

/* ───────────────────────── 派生人类标注 ───────────────────────── */

/** 从 selector 派生稳定 id（框架以 h.id 为键存热区元素，缺失会静默出错）。 */
export function deriveControlId(c) {
  if (c.id) return c.id;
  return String(c.selector).replace(/^[#.]/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .toLowerCase();
}

const KIND_LABEL = {
  select: '下拉框', input: '输入框', textarea: '多行输入框', button: '按钮',
  radio: '单选框', checkbox: '复选框', table: '表格', pager: '分页控件',
  modal: '弹窗', drawer: '抽屉', toggle: '开关', link: '链接', other: '控件',
};

/**
 * 清单 → 热区配置（人类悬停看到的标注）。
 * 结构化事实在前、手写补充在后；前端条目与后端条目都必保至少一条。
 */
export function renderAnnotations(spec) {
  validateSpec(spec);
  const apiById = new Map((spec.apis || []).map(a => [a.id, a]));

  return spec.controls.map(c => {
    const front = [];
    if (c.required) front.push(`必填${c.placeholder ? `（占位「${c.placeholder}」）` : ''}`);
    for (const r of (c.rules || [])) front.push(r);
    for (const [ev, acts] of Object.entries(c.on || {})) {
      for (const a of acts) front.push(`${EVENT_LABEL[ev] || ev}：${a}`);
    }
    for (const n of (c.notes || [])) front.push(n);
    if (c.dependsOn?.length) front.push(`前置条件：${c.dependsOn.join('；')}`);

    const back = [];
    for (const id of (c.apis || [])) {
      const a = apiById.get(id);
      back.push(`${a.method} ${a.path}${a.desc ? ` —— ${a.desc}` : ''}` +
        (a.status === 'proposed' ? '（设计未给出，待确认）' : ''));
    }
    if (c.param) back.push(`值作为查询参数 \`${c.param}\` 随请求提交`);
    for (const n of (c.apiNotes || [])) back.push(n);
    if (!back.length) back.push('不调接口（纯前端行为）');

    return {
      id: deriveControlId(c),
      selector: c.selector,
      title: c.title || `${c.label}｜${KIND_LABEL[c.kind] || c.kind}`,
      items: [
        ...front.map(text => ({ type: 'front', text })),
        ...back.map(text => ({ type: 'back', text })),
      ],
    };
  });
}

const EVENT_LABEL = {
  click: '点击', change: '选项变化', input: '输入', blur: '失焦',
  focus: '聚焦', enter: '回车', esc: 'Esc', load: '进入页面', hover: '悬停',
};

/* ───────────────────────── 机器可读导出 ───────────────────────── */

export function specToMarkdown(spec) {
  validateSpec(spec);
  const L = [];
  const apiById = new Map((spec.apis || []).map(a => [a.id, a]));

  L.push(`# ${spec.title}`, '');
  if (spec.summary) L.push(`> ${spec.summary}`, '');
  if (spec.regions?.length) {
    L.push('## 页面分区', '');
    for (const r of spec.regions) L.push(`- **${r.label}**（\`${r.id}\`，${r.role}）${r.desc ? '：' + r.desc : ''}`);
    L.push('');
  }

  L.push('## 接口（路径均以 /api 占位，不含真实域名）', '');
  L.push('| 接口 id | 方法 | 路径 | 说明 |', '|---|---|---|---|');
  for (const a of (spec.apis || [])) {
    const flag = a.status === 'proposed' ? ' ⚠️ 待确认' : '';
    L.push(`| \`${a.id}\` | ${a.method} | \`${a.path}\` | ${(a.desc || '') + flag} |`);
  }
  L.push('');

  if (spec.table) {
    const t = spec.table;
    L.push('## 表格', '');
    L.push(`- 目标：\`${t.selector}\``);
    if (t.dataApi) L.push(`- 数据接口：\`${t.dataApi}\` → \`${apiById.get(t.dataApi)?.path}\``);
    if (t.pagination) {
      const p = t.pagination;
      L.push(`- 分页：接口 \`${p.api || t.dataApi}\`，页码参数 \`${p.pageParam || 'page'}\`` +
        (p.pageSize ? `，每页 ${p.pageSize}` : '') + (p.serverSide === false ? '，前端分页' : '，服务端分页'));
    }
    if (t.rowSelection) {
      const s = t.rowSelection;
      L.push(`- 行选择：${s.mode === 'single' ? '单选' : '多选'}；` +
        `依赖它的控件 ${(s.requiredBy || []).map(x => '`' + x + '`').join('、') || '无'}；` +
        `在 ${(s.clearedOn || []).join('、') || '（未声明）'} 时清空`);
    }
    L.push('', '| # | 列 key | 列名 | 对齐 | 格式 |', '|---|---|---|---|---|');
    t.columns.forEach((c, i) => L.push(`| ${i + 1} | \`${c.key}\` | ${c.label} | ${c.align || 'left'} | ${c.format || 'text'} |`));
    L.push('');
  }

  L.push('## 控件', '');
  for (const c of spec.controls) {
    L.push(`### ${c.label}　\`${c.selector}\``, '');
    L.push(`- 类型：\`${c.kind}\`${c.region ? `　分区：${c.region}` : ''}${c.required ? '　**必填**' : ''}`);
    if (c.placeholder) L.push(`- 占位：${c.placeholder}`);
    if (c.format) L.push(`- 格式：${c.format}`);
    if (c.options?.length) L.push(`- 选项：${c.options.join(' / ')}`);
    if (c.param) L.push(`- 提交参数：\`${c.param}\``);
    for (const r of (c.rules || [])) L.push(`- 校验：${r}`);
    for (const [ev, acts] of Object.entries(c.on || {})) L.push(`- ${EVENT_LABEL[ev] || ev}：${acts.join('；')}`);
    for (const id of (c.apis || [])) {
      const a = apiById.get(id);
      L.push(`- 接口：\`${a.method} ${a.path}\`${a.desc ? ' —— ' + a.desc : ''}`);
    }
    for (const n of (c.apiNotes || [])) L.push(`- 后端约定：${n}`);
    for (const n of (c.notes || [])) L.push(`- 说明：${n}`);
    if (c.dependsOn?.length) L.push(`- 前置条件：${c.dependsOn.join('；')}`);
    L.push('');
  }

  if (spec.mock?.length) {
    L.push('## 原型里是假的（实现时替换）', '');
    for (const m of spec.mock) L.push(`- ${m}`);
    L.push('');
  }
  if (spec.openQuestions?.length) {
    L.push('## 待确认（原型未定）', '');
    for (const q of spec.openQuestions) L.push(`- ⚠️ ${q}`);
    L.push('');
  }
  return L.join('\n');
}

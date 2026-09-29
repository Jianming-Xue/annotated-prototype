/**
 * 静态契约断言：对任意生成出来的原型生效（不只是测试夹具）。
 *
 * 用法：
 *   node tests/run.mjs --page /path/to/xxx-annotated-prototype.html
 * 或在代码里 import { checkPrototype } from './lib/check.mjs'
 */
import fs from 'node:fs';
import { FRAME_PATH, TOKENS, readFrame, assertProductMatchesFrame, SPEC_ELEMENT_ID } from './build.mjs';
import { validateSpec, SPEC_SCHEMA, CONTROL_KINDS } from './spec.mjs';

/** 从页面里读出内嵌规格清单（AI / 开发者读的就是这一份）。 */
export function readSpec(html) {
  const re = new RegExp(`<script[^>]+id=["']${SPEC_ELEMENT_ID}["'][^>]*>([\\s\\S]*?)</script>`);
  const m = html.match(re);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return { __parseError: e.message }; }
}

/** 把字符串字面量内容抹成等长空格，便于安全地做括号配对（保留下标）。 */
function maskStrings(src) {
  return src.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, m =>
    m.length < 2 ? m : m[0] + ' '.repeat(m.length - 2) + m[m.length - 1]);
}

/**
 * 只保留真实标记：抹掉 <script> / <style> / HTML 注释（等长空格，保留下标）。
 * 必要性：业务 JS 里常写 `innerHTML = '<button id="x">'` 这类字符串，
 * 在全文中直接数 `id="x"` 会把字符串误算成元素（本轮真的踩到）。
 */
function maskNonMarkup(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, m => ' '.repeat(m.length))
    .replace(/<style[\s\S]*?<\/style>/gi, m => ' '.repeat(m.length))
    .replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
}

const TOKEN_ORDER = [TOKENS.title, TOKENS.styles, TOKENS.content, TOKENS.hotspots];

/** 把框架按 4 个占位符切成 5 段固定文本（不含被替换的内容）。 */
function frameworkSegments(frame) {
  const segs = [];
  let rest = frame;
  for (const token of TOKEN_ORDER) {
    const i = rest.indexOf(token);
    segs.push(rest.slice(0, i));
    rest = rest.slice(i + token.length);
  }
  segs.push(rest);
  return segs;
}

/**
 * 对**任意产物**证明「就是框架 + 4 处占位符替换」，不需要知道替换内容：
 * 框架被占位符切出的 5 段固定文本，必须按序出现在产物里（首段为前缀、末段为后缀）。
 * 作用：交付页被人手改过框架区（改 CSS/JS、动类名、加覆盖）时能被抓出来。
 */
export function checkFrameworkSegments(html, framePath = FRAME_PATH) {
  const segs = frameworkSegments(readFrame(framePath));
  let at = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (i === 0) {
      if (!html.startsWith(seg)) {
        return { pass: false, detail: `开头与框架不一致（第 1 段 ${seg.length} 字符）` };
      }
      at = seg.length;
      continue;
    }
    const found = html.indexOf(seg, at);
    if (found < 0) {
      const head = seg.slice(0, 60).replace(/\n/g, '⏎');
      return { pass: false, detail: `第 ${i + 1} 段框架文本未按序找到：…${head}…` };
    }
    at = found + seg.length;
  }
  if (!html.endsWith(segs[segs.length - 1])) {
    return { pass: false, detail: '结尾与框架不一致（框架尾部被改动）' };
  }
  return { pass: true, detail: `框架 5 段固定文本按序完整保留（${segs.reduce((n, s) => n + s.length, 0)} 字符）` };
}


/** 从 `const hotspots = [ … ]` 里逐个取出顶层对象原文。 */
export function extractHotspots(html) {
  const decl = html.indexOf('const hotspots');
  if (decl < 0) return { found: false, objects: [] };
  const bracket = html.indexOf('[', decl);
  if (bracket < 0) return { found: false, objects: [] };

  const masked = maskStrings(html);
  const objects = [];
  let depth = 0, objStart = -1;
  for (let i = bracket; i < masked.length; i++) {
    const c = masked[i];
    if (c === '[' || c === '{') {
      depth++;
      if (c === '{' && depth === 2) objStart = i;
    } else if (c === ']' || c === '}') {
      if (c === '}' && depth === 2 && objStart >= 0) {
        objects.push(html.slice(objStart, i + 1));
        objStart = -1;
      }
      depth--;
      if (depth === 0) break;
    }
  }
  return { found: true, objects };
}

function strField(objText, field) {
  const m = objText.match(new RegExp(field + '\\s*:\\s*(["\'])([\\s\\S]*?)\\1'));
  return m ? m[2] : null;
}

export function checkPrototype(html, { expectProduct = null, framePath = FRAME_PATH } = {}) {
  const rows = [];
  const add = (name, pass, detail = '') => rows.push({ name, pass: !!pass, detail });

  // --- 框架契约：占位符与关键片段 ---
  // 用「裸名字」判定残留，比查完整注释 token 更严：能抓出半替换（只换了一半、注释壳还在）。
  // 前提是框架散文里不得出现占位符名字，否则会误判 —— 框架已按此约束收口。
  const bare = ['__PAGE_TITLE__', '__STAGE_STYLES__', '__STAGE_CONTENT__', '__HOTSPOTS__'];
  const leftovers = bare.filter(t => html.includes(t));
  add('4 个占位符全部替换、无残留（含裸名字）', leftovers.length === 0,
    leftovers.length ? '残留：' + leftovers.join('、') : '无残留');

  const frame = readFrame(framePath);
  const contract = [
    ['框架 CSS 变量保留', '--accent:#e5484d'],
    ['内容区宽度钩子默认值保留', '--stage-max:760px'],
    ['.stage 读取宽度钩子', 'max-width:var(--stage-max)'],
    ['框架变量 --note-bg 保留', '--note-bg:#fdf6d8'],
    ['.hotspot 用视口坐标系', '.hotspot{\n    position:fixed;'],
    ['.anno 用视口坐标系', '.anno{\n    position:fixed;'],
    ['#lines 用视口坐标系', '#lines{\n    position:fixed; inset:0;'],
    ['#toggle 层级最高', 'z-index:2147483003'],
    ['热区层压过业务弹窗', 'z-index:2147483000'],
    ['引线层在热区层之上', 'z-index:2147483001'],
    ['标注框层在引线层之上', 'z-index:2147483002'],
    ['热区不吞鼠标事件', 'pointer-events:none'],
  ];
  for (const [name, frag] of contract) add(name, html.includes(frag), html.includes(frag) ? '' : `缺少片段 ${JSON.stringify(frag)}`);
  add('框架文件未被裁剪（行数与框架一致量级）', html.split('\n').length >= frame.split('\n').length,
    `产物 ${html.split('\n').length} 行 / 框架 ${frame.split('\n').length} 行`);

  // --- 强不变量：产物 == 框架 + 4 处替换 ---
  // (a) 已知输入时：逐字节比对（最严）
  if (expectProduct) {
    try {
      assertProductMatchesFrame(html, expectProduct);
      add('产物 == 框架 + 4 处占位符替换（逐字节）', true, '逐字节一致');
    } catch (e) {
      add('产物 == 框架 + 4 处占位符替换（逐字节）', false, e.message);
    }
  }
  // (b) 不知道输入时（任意交付页）：分段证明，框架 5 段固定文本必须按序完整保留
  const seg = checkFrameworkSegments(html, framePath);
  add('框架区未被改动（5 段固定文本按序完整）', seg.pass, seg.detail);

  // --- 机器可读规格清单（AI / 开发者读的就是这一份）---
  const spec = readSpec(html);
  if (!spec) {
    add('内嵌规格清单存在（AI 可读的实现依据）', false,
      `缺少 <script type="application/json" id="${SPEC_ELEMENT_ID}">；旧版产物请重新生成`);
  } else if (spec.__parseError) {
    add('内嵌规格清单是合法 JSON', false, spec.__parseError);
  } else {
    add('内嵌规格清单是合法 JSON', true, `${JSON.stringify(spec).length} 字符`);
    try {
      validateSpec(spec);
      add('规格清单通过 schema 校验', true,
        `${spec.controls.length} 个控件 / ${(spec.apis || []).length} 个接口 / schema=${spec.schema}`);
    } catch (e) {
      add('规格清单通过 schema 校验', false, e.message.replace(/\n/g, ' '));
    }
    add('规格清单 schema 版本正确', spec.schema === SPEC_SCHEMA, String(spec.schema));
    const badKind = (spec.controls || []).filter(c => !CONTROL_KINDS.includes(c.kind)).map(c => c.selector);
    add('所有控件 kind 在允许集合内', badKind.length === 0, badKind.join('、') || `已用：${[...new Set((spec.controls || []).map(c => c.kind))].join('/')}`);

    // 三方一致：spec.controls ↔ 热区（人类标注）↔ DOM
    const hsObjs = extractHotspots(html).objects;
    const ids = hsObjs.map(o => strField(o, 'id'));
    const emptyId = ids.filter(v => !v).length;
    const dupId = [...new Set(ids.filter((v, i) => v && ids.indexOf(v) !== i))];
    add('每个热区都有非空且唯一的 id（框架以它为映射表键）',
      emptyId === 0 && dupId.length === 0,
      [emptyId ? `${emptyId} 个热区缺 id` : '', dupId.length ? `重复 id：${dupId.join('、')}` : '']
        .filter(Boolean).join('；') || `${ids.length} 个 id 齐全且唯一`);
    const hsSel = new Set(hsObjs.map(o => strField(o, 'selector')).filter(Boolean));
    const specSel = new Set((spec.controls || []).map(c => c.selector));
    const onlySpec = [...specSel].filter(s => !hsSel.has(s));
    const onlyHs = [...hsSel].filter(s => !specSel.has(s));
    add('规格清单与人类标注双向一致（无孤儿控件）', onlySpec.length === 0 && onlyHs.length === 0,
      [onlySpec.length ? `只在清单里：${onlySpec.join('、')}` : '',
       onlyHs.length ? `只在标注里：${onlyHs.join('、')}` : ''].filter(Boolean).join('；')
      || `${specSel.size} 个控件两侧齐全`);

    // 表格列定义必须与页面上真实表头逐一对齐（顺序 + 文案）
    if (spec.table) {
      const ths = [...maskNonMarkup(html).matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
        .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        .filter(t => t !== '');
      const labels = spec.table.columns.map(c => c.label);
      add('表格列定义与页面表头逐一对齐（顺序 + 文案）',
        ths.length === labels.length && ths.every((t, i) => t === labels[i]),
        `表头=[${ths.join(' | ')}] 清单=[${labels.join(' | ')}]`);
      add('表格声明了数据接口', !!spec.table.dataApi, spec.table.dataApi || '未声明 table.dataApi');
      const tCovered = (spec.controls || []).some(c => c.selector === spec.table.selector)
        || (spec.table.annotatedBy || []).some(s2 => (spec.controls || []).some(c => c.selector === s2));
      add('表格区域有可标注控件（否则表格没有标注框）', tCovered,
        tCovered ? `代表控件=${(spec.table.annotatedBy || [spec.table.selector]).join('、')}`
                 : `table.selector=${spec.table.selector} 且未声明 annotatedBy`);
      if (spec.table.rowSelection && spec.table.rowSelection.mode !== 'none') {
        const rs = spec.table.rowSelection;
        add('行选择声明了依赖它的控件（"必须选中一行"落实处）',
          (rs.requiredBy || []).length > 0, (rs.requiredBy || []).join('、') || '未声明 requiredBy');
      } else {
        add('行选择声明了依赖它的控件（"必须选中一行"落实处）', true, '本页表格无行选择语义');
      }
    } else {
      add('表格声明了数据接口', true, '本页无表格');
    }

    // 实现侧最关心的两件事必须被显式声明，不能靠读散文猜
    add('声明了页面级接口清单', Array.isArray(spec.apis) && spec.apis.length > 0,
      (spec.apis || []).map(a => `${a.method} ${a.path}`).join('、') || '无');
    if (spec.openQuestions?.length) {
      add('未定项已显式列出（不藏在不存在的接口里）', true, spec.openQuestions.join('；'));
    }
  }

  // --- 业务内容（只看真实标记，避免把 JS 字符串里的 id 误算成元素）---
  const markup = maskNonMarkup(html);
  const stageStart = markup.indexOf('<div class="stage" id="stage">');
  const stageEnd = markup.indexOf('<svg id="lines">');
  add('存在 .stage 内容容器', stageStart >= 0 && stageEnd > stageStart, `stage 区间 ${stageStart}..${stageEnd}`);
  const stage = (stageStart >= 0 && stageEnd > stageStart) ? markup.slice(stageStart, stageEnd) : '';

  const { found, objects } = extractHotspots(html);
  add('存在 hotspots 配置数组', found, found ? `${objects.length} 个热区` : '未找到 `const hotspots`');

  const seen = new Map();
  for (const obj of objects) {
    const sel = strField(obj, 'selector');
    const title = strField(obj, 'title');
    const id = strField(obj, 'id');
    const label = id || title || sel || '(无名热区)';

    if (!sel || !title) { add(`热区 ${label} 字段完整`, false, `selector=${sel} title=${title}`); continue; }

    // selector 命中唯一元素
    if (!sel.startsWith('#') && !sel.startsWith('.')) {
      add(`热区 ${label} 未使用标签选择器`, false, `selector=${sel}`);
    }
    if (sel.startsWith('#')) {
      const idAttr = `id="${sel.slice(1)}"`;
      const hitsMarkup = markup.split(idAttr).length - 1;
      const hitsTotal = html.split(idAttr).length - 1;
      const inStage = stage.includes(idAttr);
      let ok, detail;
      if (hitsMarkup === 1) {
        ok = inStage;
        detail = inStage ? '在 .stage 内' : '不在 .stage 内（热区目标应写进 __STAGE_CONTENT__）';
      } else if (hitsMarkup === 0 && hitsTotal >= 1) {
        // 元素由业务 JS 在运行时注入（innerHTML / appendChild）——静态判定不了，
        // 唯一权威判据是浏览器断言（tests/run.mjs 的 15 类探针）
        ok = true;
        detail = '运行时注入：静态不可判，由浏览器断言负责';
      } else if (hitsTotal === 0) {
        ok = false;
        detail = '全页（含脚本字符串）都找不到该 id，疑似拼错';
      } else {
        ok = false;
        detail = `静态标记里命中 ${hitsMarkup} 次，querySelector 只会取第一个`;
      }
      add(`热区 ${label} selector 可唯一命中 ${sel}`, ok, detail);
      if (hitsMarkup === 1) seen.set(sel, (seen.get(sel) || 0) + 1);
    } else if (sel.startsWith('.')) {
      add(`热区 ${label} 命中元素 ${sel}`, stage.includes(`class="${sel.slice(1)}"`) || stage.includes(sel.slice(1)),
        'class 选择器，按子串判定');
    }

    // front / back 都要有
    const nf = (obj.match(/type\s*:\s*["']front["']/g) || []).length;
    const nb = (obj.match(/type\s*:\s*["']back["']/g) || []).length;
    add(`热区 ${label} 含前端条目与后端条目`, nf >= 1 && nb >= 1, `front=${nf} back=${nb}`);

    // 后端条目：不得含真实域名；出现的接口路径一律要是 /api/ 占位。
    // 注意「不调接口」的纯前端控件（如行选择）没有路径是合法的 —— 所以不强制本热区必须有 /api/。
    if (nb >= 1) {
      const backTexts = [...obj.matchAll(/type\s*:\s*["']back["']\s*,\s*text\s*:\s*(["'])([\s\S]*?)\1/g)].map(m => m[2]);
      const withDomain = backTexts.filter(t => /https?:\/\//.test(t));
      const offApi = [...new Set(
        backTexts.flatMap(t => [...t.matchAll(/(?:^|[^:\w])(\/[A-Za-z0-9_][\w\-./{}]*)/g)].map(m => m[1]))
          .filter(p => !p.startsWith('/api/'))
      )];
      add(`热区 ${label} 接口路径均用 /api/xxx 占位、无真实域名`,
        withDomain.length === 0 && offApi.length === 0,
        [
          withDomain.length ? `含真实域名：${withDomain.join(' | ')}` : '',
          offApi.length ? `非 /api/ 路径：${offApi.join(' ')}` : '',
          (!withDomain.length && !offApi.length && !backTexts.some(t => t.includes('/api/'))) ? '纯前端控件，不调接口' : '',
        ].filter(Boolean).join('；') || '');
    }
  }

  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  add('热区之间 selector 不重复', dupes.length === 0, dupes.map(([s, n]) => `${s}×${n}`).join('、') || '无重复');

  // --- 无外部依赖 ---
  const noNs = html.replace('http://www.w3.org/2000/svg', '');
  const urls = [...noNs.matchAll(/https?:\/\/[^\s"'`)<]+/g)].map(m => m[0]);
  add('无外部 CSS/JS/字体依赖', urls.length === 0, urls.join(' | ') || '无');

  return rows;
}

export function checkFile(filePath, opts = {}) {
  return checkPrototype(fs.readFileSync(filePath, 'utf8'), opts);
}

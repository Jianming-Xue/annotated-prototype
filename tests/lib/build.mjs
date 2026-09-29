/**
 * 生成器：把「业务内容 + 规格清单」填进框架，产出单文件自包含原型。
 *
 * 硬约束（框架契约）：只替换 4 个占位符，其余一律不动。
 * 设计要点：**规格清单（spec）是唯一输入** —— 人类标注由它派生、机器规格由它内嵌，
 * 所以「悬停看到的」与「AI 读到的」不可能漂移。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAnnotations, validateSpec } from './spec.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = path.resolve(HERE, '..', '..');
export const FRAME_PATH = path.join(SKILL_ROOT, 'assets', 'prototype-frame.html');

export const TOKENS = {
  title: '__PAGE_TITLE__',
  styles: '/* __STAGE_STYLES__ */',
  content: '<!-- __STAGE_CONTENT__ -->',
  hotspots: '/* __HOTSPOTS__ */',
};

export const SPEC_ELEMENT_ID = 'prototype-spec';

/** 规格清单 → 内嵌 JSON 块。用 \u003c 转义 "<"，防止文案里的 </script> 提前闭合标签。 */
export function manifestBlock(spec) {
  const json = JSON.stringify(spec, null, 2).replace(/</g, '\\u003c');
  return [
    '',
    '  <!-- 机器可读规格清单：AI / 开发者照此实现真实页面；人类标注由它派生，二者不会漂移 -->',
    `  <script type="application/json" id="${SPEC_ELEMENT_ID}">`,
    json,
    '  </script>',
    '',
  ].join('\n');
}

/** 热区配置 → JS 字面量。用 JSON.stringify 保证任意文案（含引号/换行）都能安全落地。 */
export function serializeHotspots(hotspots) {
  const seen = new Set();
  for (const h of hotspots) {
    if (!h.id) throw new Error(`热区缺少 id（框架用它做映射表键）：${h.selector || h.title}`);
    if (seen.has(h.id)) throw new Error(`热区 id 重复：${h.id}`);
    seen.add(h.id);
  }
  return hotspots.map(h => {
    const items = (h.items || [])
      .map(it => `      { type: ${JSON.stringify(it.type)}, text: ${JSON.stringify(it.text)} }`)
      .join(',\n');
    return [
      '  {',
      `    id: ${JSON.stringify(h.id)},`,
      `    selector: ${JSON.stringify(h.selector)},`,
      `    title: ${JSON.stringify(h.title)},`,
      '    items: [',
      items,
      '    ],',
      '  },',
    ].join('\n');
  }).join('\n');
}

/** 读框架并校验 4 个占位符都唯一存在。 */
export function readFrame(framePath = FRAME_PATH) {
  const frame = fs.readFileSync(framePath, 'utf8');
  const wrong = Object.entries(TOKENS)
    .map(([key, token]) => [key, token, frame.split(token).length - 1])
    .filter(([, , n]) => n !== 1);
  if (wrong.length) {
    throw new Error('框架占位符异常（应各出现 1 次）：' +
      wrong.map(([key, token, n]) => `${key} 出现 ${n} 次 (${token})`).join('；'));
  }
  return frame;
}

export function buildPrototype({ title, styles = '', content = '', spec, hotspots, framePath = FRAME_PATH }) {
  if (hotspots) {
    throw new Error('buildPrototype() 不再接受 hotspots：热区已由 spec.controls 派生。' +
      '请把控件写进 spec（selector / kind / label / rules / on / apis / notes），标注会自动生成。');
  }
  validateSpec(spec);

  const frame = readFrame(framePath);
  const html = frame
    .replace(TOKENS.title, title)
    .replace(TOKENS.styles, String(styles).trim())
    .replace(TOKENS.content, String(content).trim() + manifestBlock(spec))
    .replace(TOKENS.hotspots, serializeHotspots(renderAnnotations(spec)));

  const leftovers = Object.values(TOKENS).filter(t => html.includes(t));
  if (leftovers.length) throw new Error('产物仍残留占位符：' + leftovers.join('、'));
  if (!html.includes(`id="${SPEC_ELEMENT_ID}"`)) throw new Error('产物缺少内嵌规格清单');
  return html;
}

/**
 * 强不变量：产物必须**逐字节等于**「框架 + 4 处替换」。
 * 这条比「抽段比对」稳 —— 抽段依赖框架注释锚点，框架一改注释就失效。
 */
export function assertProductMatchesFrame(html, { title, styles = '', content = '', spec, framePath = FRAME_PATH }) {
  const expected = buildPrototype({ title, styles, content, spec, framePath });
  if (expected !== html) {
    let i = 0;
    while (i < expected.length && i < html.length && expected[i] === html[i]) i++;
    const at = html.slice(Math.max(0, i - 60), i + 60).replace(/\n/g, '⏎');
    throw new Error(`产物与「框架 + 占位符替换」不一致，首个差异在第 ${i} 字节附近：…${at}…`);
  }
  return true;
}

export function writePrototype(outPath, html) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
  return outPath;
}

export function fileUrl(p) {
  return 'file://' + path.resolve(p);
}

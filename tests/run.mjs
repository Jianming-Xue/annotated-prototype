#!/usr/bin/env node
/**
 * annotated-prototype 框架回归套件。
 *
 *   node tests/run.mjs                          # 全量：生成探针 → 静态契约 → 浏览器 15 类 + 全局断言
 *   node tests/run.mjs --static-only             # 只跑静态契约（不需要浏览器）
 *   node tests/run.mjs --page path/to/xxx.html   # 顺带校验任意一个交付页（静态 + 浏览器冒烟）
 *   node tests/run.mjs --keep                    # 保留 out/ 里的产物（默认就保留）
 *
 * 每次改动 assets/prototype-frame.html 之后都应跑一次。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPrototype, writePrototype, FRAME_PATH, fileUrl } from './lib/build.mjs';
import { checkPrototype, checkFile } from './lib/check.mjs';
import { loadPlaywright, launchBrowser } from './lib/playwright.mjs';
import * as fixture from './fixtures/structure-probe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, 'out');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };

const STATIC_ONLY = flag('--static-only');
const EXTRA_PAGE = opt('--page');

let passed = 0, failed = 0;
const failures = [];
const rec = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? '  :: ' + detail : ''}`); }
  else { failed++; failures.push(`${name}  ::  ${detail}`); console.log(`  FAIL  ${name}${detail ? '  :: ' + detail : ''}`); }
};
const head = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 74 - t.length))}`);

/* ───────────────────────── 1. 生成探针 ───────────────────────── */
head('1. 用生成器构出结构探针夹具');
const product = {
  title: fixture.spec.title,
  styles: fixture.STYLES,
  content: fixture.CONTENT,
  spec: fixture.spec,
};
const probeHtml = buildPrototype(product);
const probePath = writePrototype(path.join(OUT_DIR, 'structure-probe.html'), probeHtml);
console.log(`  框架: ${FRAME_PATH}`);
console.log(`  产物: ${probePath}（${probeHtml.length} 字节，${probeHtml.split('\n').length} 行，` +
  `${fixture.spec.controls.length} 个控件 / ${fixture.spec.apis.length} 个接口）`);
rec('生成器产出成功且无残留占位符', true, '');

/* ───────────────────────── 2. 静态契约 ───────────────────────── */
head('2. 静态契约（对产物）');
for (const r of checkPrototype(probeHtml, { expectProduct: product })) rec(r.name, r.pass, r.detail);

head('2b. 规格缺口（原型自己声明的未定项）');
const proposed = fixture.spec.apis.filter(a => a.status === 'proposed');
const oq = fixture.spec.openQuestions || [];
rec('探针没有未确认的接口（骨架夹具应完全确定）', proposed.length === 0,
  proposed.map(a => `${a.method} ${a.path}`).join('、') || '无');
rec('探针没有未定项', oq.length === 0, oq.join('；') || '无');

/* ───────────────────────── 3. 浏览器断言 ───────────────────────── */
if (STATIC_ONLY) {
  console.log('\n(--static-only：跳过浏览器断言)');
} else {
  head('3. 浏览器断言（真实 Chrome）');
  const pw = await loadPlaywright();
  const { browser, label } = await launchBrowser(pw);
  console.log(`  浏览器: ${label}`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));

  await page.goto(fileUrl(probePath));
  await page.waitForTimeout(1200);   // 等延迟注入的 600ms 元素

  const snap = () => page.evaluate(() => {
    const act = [...document.querySelectorAll('.hotspot')].filter(h => h.classList.contains('active'));
    const anno = document.getElementById('annoBox');
    return {
      activeCount: act.length,
      annoShown: anno.classList.contains('show'),
      title: (anno.querySelector('h4') || {}).textContent || '',
      paths: document.querySelectorAll('#lines path').length,
      annoZ: getComputedStyle(anno).zIndex,
      hotspotZ: act[0] ? getComputedStyle(act[0]).zIndex : null,
      hsOpacity: act[0] ? getComputedStyle(act[0]).opacity : null,
    };
  });

  const measure = async (sel) => page.evaluate((s) => {
    const t = document.querySelector(s);
    const act = [...document.querySelectorAll('.hotspot')].filter(h => h.classList.contains('active'));
    const o = {};
    if (t && act.length === 1) {
      const hr = act[0].getBoundingClientRect(), tr = t.getBoundingClientRect();
      o.dx = +(hr.left - (tr.left - 4)).toFixed(1);
      o.dy = +(hr.top - (tr.top - 4)).toFixed(1);
      o.w = +(hr.width - (tr.width + 8)).toFixed(1);
      o.h = +(hr.height - (tr.height + 8)).toFixed(1);
      o.scrollY = Math.round(window.scrollY);
    }
    return o;
  }, sel);

  const centerOf = (sel) => page.evaluate((s) => {
    const t = document.querySelector(s);
    if (!t) return null;
    const r = t.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  }, sel);

  const reset = async () => {
    await page.evaluate(() => {
      document.getElementById('p-drawer').classList.remove('open');
      document.getElementById('p-modal').classList.remove('open');
      document.getElementById('p-mask').classList.remove('open');
      document.getElementById('p-collapse').classList.remove('open');
      document.getElementById('p-scroller').scrollTop = 0;
      window.scrollTo(0, 0);
    });
    await page.mouse.move(3, 3);
    await page.waitForTimeout(180);
  };

  // 3.1 布局钩子：--stage-max 必须真的放宽内容区（探针把它设成 1100px）
  const stage = await page.evaluate(() => {
    const s = document.getElementById('stage');
    return { maxWidth: getComputedStyle(s).maxWidth, width: Math.round(s.getBoundingClientRect().width) };
  });
  rec('布局钩子 --stage-max 生效（内容区放宽超过默认 760px）',
    stage.maxWidth === '1100px' && stage.width > 760,
    `computed max-width=${stage.maxWidth} 实际宽=${stage.width}px（默认 760px）`);

  // 3.2 默认干净：开关关闭时不算标注
  await reset();
  await page.hover('#p-flow', { force: true });
  await page.waitForTimeout(260);
  const offState = await snap();
  rec('默认是干净原型：开关关闭时悬停不出现标注',
    !offState.annoShown && offState.activeCount === 0 && offState.paths === 0,
    JSON.stringify({ annoShown: offState.annoShown, active: offState.activeCount, paths: offState.paths }));

  await page.click('#toggle');
  await page.waitForTimeout(120);

  // 3.3 逐类结构
  const results = new Map();
  for (const c of fixture.cases) {
    await reset();
    if (c.setup) { await c.setup(page); await page.waitForTimeout(200); }
    if (c.settle) await page.waitForTimeout(c.settle);

    let hoverErr = null;
    try {
      await page.hover(c.sel, { force: true, timeout: 4000, ...(c.pos ? { position: c.pos } : {}) });
    } catch (e) { hoverErr = String(e.message).split('\n')[0]; }
    await page.waitForTimeout(380);

    let s = await snap();
    let g = await measure(c.sel);

    // 确定化复测：force:hover 会「读一次盒子就移动鼠标」，动画/滚动中可能落在控件外。
    // 按指针实时中心补一次 → 排除测试脚本自身的坐标竞态。
    let retried = false;
    const okNow = () => s.annoShown && s.title === c.expect && s.activeCount === 1 && s.hsOpacity === '1'
      && g.dx !== undefined && Math.abs(g.dx) < 0.6 && Math.abs(g.dy) < 0.6;
    if (!okNow()) {
      const ctr = await centerOf(c.sel);
      if (ctr) {
        await page.mouse.move(ctr.x, ctr.y);
        await page.waitForTimeout(400);
        s = await snap();
        g = await measure(c.sel);
        retried = true;
      }
    }
    const hit = s.annoShown && s.title === c.expect && s.activeCount === 1;
    const geo = g.dx !== undefined && Math.abs(g.dx) < 0.6 && Math.abs(g.dy) < 0.6
      && Math.abs(g.w) < 0.6 && Math.abs(g.h) < 0.6;
    const vis = s.hsOpacity === '1';
    const line = s.paths === 1;
    results.set(c.name, { ...s, ...g, hit, geo, vis, line, retried, hoverErr, expect: c.expect });

    const ok = hit && geo && vis && line;
    rec(`[${c.name}] 命中 ${c.expect}`,
      ok,
      `命中=${hit} 几何=${geo} 可见=${vis} 引线=${line}`
      + `  title=${s.title || '(无)'} Δ${g.dx}/${g.dy} opacity=${s.hsOpacity} active=${s.activeCount}`
      + (g.scrollY ? ` scrollY=${g.scrollY}` : '')
      + (retried ? ' [已按指针中心复测]' : '')
      + (hoverErr ? ` hoverErr=${hoverErr}` : ''));
  }

  // 3.3 标注层级必须压过业务弹层
  for (const o of fixture.OVERLAY_CASES) {
    const r = results.get(o.case) || [...results.values()].find(v => v.expect === o.case);
    rec(`[${o.case}] 标注层压过业务弹层 z-index ${o.businessZ}`,
      !!r && Number(r.annoZ) > o.businessZ && Number(r.hotspotZ) > o.businessZ,
      r ? `anno=${r.annoZ} hotspot=${r.hotspotZ}` : `结果表里找不到 ${o.case}（键应为热区 id 或 case 名）`);
  }

  // 3.4 同时只有一个热区激活（逐类已断言，这里再给汇总）
  const multi = [...results.entries()].filter(([, r]) => r.activeCount !== 1).map(([k]) => k);
  rec('任意时刻只有一个热区处于激活态', multi.length === 0, multi.join('、') || '全部为 1');

  // 3.5 指针移出即隐藏
  await page.mouse.move(4, 4);
  await page.waitForTimeout(300);
  const outState = await snap();
  rec('指针移出后标注隐藏且引线清空',
    !outState.annoShown && outState.activeCount === 0 && outState.paths === 0,
    JSON.stringify({ annoShown: outState.annoShown, active: outState.activeCount, paths: outState.paths }));

  // 3.6 关闭开关立即清空
  await page.hover('#p-flow', { force: true });
  await page.waitForTimeout(300);
  await page.click('#toggle');
  await page.waitForTimeout(300);
  const toggleOff = await snap();
  rec('关闭开关后立即清空标注',
    !toggleOff.annoShown && toggleOff.activeCount === 0 && toggleOff.paths === 0,
    JSON.stringify({ annoShown: toggleOff.annoShown, active: toggleOff.activeCount, paths: toggleOff.paths }));

  // 3.7 无控制台告警（含「热区 selector 未命中」）
  const warn = logs.filter(w => !/favicon/i.test(w));
  rec('控制台无报错、无「selector 未命中」告警', warn.length === 0, warn.join(' | ') || '无');

  await browser.close();
}

/* ───────────────────── 4. 顺带校验任意交付页 ───────────────────── */
if (EXTRA_PAGE) {
  head(`4. 交付页校验: ${EXTRA_PAGE}`);
  if (!fs.existsSync(EXTRA_PAGE)) {
    rec('交付页存在', false, '文件不存在');
  } else {
    const rows = checkFile(EXTRA_PAGE);
    for (const r of rows) rec(r.name, r.pass, r.detail);
    if (!STATIC_ONLY) {
      const pw = await loadPlaywright();
      const { browser, label } = await launchBrowser(pw);
      const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
      const logs = [];
      page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
      page.on('pageerror', e => logs.push('pageerror: ' + e.message));
      await page.goto(fileUrl(EXTRA_PAGE));
      await page.waitForTimeout(600);
      const html = fs.readFileSync(EXTRA_PAGE, 'utf8');
      const declared = (html.split('const hotspots').length > 1)
        ? (html.slice(html.indexOf('const hotspots')).match(/selector\s*:/g) || []).length : 0;
      const mounted = await page.evaluate(() => document.querySelectorAll('.hotspot').length);
      rec('热区元素挂载数与配置数一致', mounted === declared, `配置 ${declared} / 挂载 ${mounted}（${label}）`);

      // 用第一个声明的 selector 做冒烟：开关打开后悬停应出标注
      const firstSel = (html.slice(html.indexOf('const hotspots')).match(/selector\s*:\s*["']([^"']+)["']/) || [])[1];
      if (firstSel) {
        await page.click('#toggle');
        await page.waitForTimeout(120);
        await page.evaluate(() => window.scrollTo(0, 0));
        const ctr = await page.evaluate((s) => {
          const t = document.querySelector(s);
          if (!t) return null;
          t.scrollIntoView({ block: 'center' });
          const r = t.getBoundingClientRect();
          return r.width && r.height ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
        }, firstSel);
        if (ctr) {
          await page.mouse.move(ctr.x, ctr.y);
          await page.waitForTimeout(400);
          const st = await page.evaluate(() => {
            const act = [...document.querySelectorAll('.hotspot')].filter(h => h.classList.contains('active'));
            return { active: act.length, shown: document.getElementById('annoBox').classList.contains('show'),
                     opacity: act[0] ? getComputedStyle(act[0]).opacity : null,
                     paths: document.querySelectorAll('#lines path').length };
          });
          rec(`冒烟：开启后悬停首个热区 ${firstSel} 能出标注并绘制引线`,
            st.active === 1 && st.shown && st.opacity === '1' && st.paths === 1, JSON.stringify(st));
        } else {
          rec(`冒烟：首个热区 ${firstSel} 可见`, false, '元素不可见或尺寸为 0');
        }
      }
      const warn = logs.filter(w => !/favicon/i.test(w));
      rec('交付页控制台无报错、无告警', warn.length === 0, warn.join(' | ') || '无');
      await browser.close();
    }
  }
}

/* ───────────────────────── 汇总 ───────────────────────── */
console.log('\n' + '='.repeat(80));
console.log(`总计 ${passed + failed} 项，通过 ${passed}，失败 ${failed}`);
if (failures.length) {
  console.log('失败项：');
  for (const f of failures) console.log('  - ' + f);
}
process.exit(failed === 0 ? 0 : 1);

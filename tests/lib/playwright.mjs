/**
 * 解析 playwright 并起一个可用的浏览器。
 *
 * 本套件**只用系统已装的 Chrome 系浏览器**（channel），不下载 playwright 自带浏览器：
 * 骨架断言需要真实 Chrome，且省掉 ~150MB 下载。
 * 查找顺序：环境变量 PROTO_PLAYWRIGHT → 常规 resolve → npx 缓存。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CANDIDATES = [
  process.env.PROTO_PLAYWRIGHT,
  'playwright',
  'playwright-core',
].filter(Boolean);

async function tryImport(spec) {
  try { return await import(spec); } catch (e) { return { __err: String(e.message).split('\n')[0] }; }
}

/**
 * playwright 的 index.js 是 CommonJS；从 ESM import 时命名导出可能取不到，
 * 真正的对象挂在 default 上。两种形态都要接住（本机实测就踩到这个）。
 */
function normalize(mod) {
  if (!mod || mod.__err) return null;
  if (mod.chromium) return mod;
  if (mod.default && mod.default.chromium) return mod.default;
  return null;
}

function npxCacheCandidates() {
  const out = [];
  const cache = path.join(os.homedir(), '.npm', '_npx');
  if (!fs.existsSync(cache)) return out;
  const dirs = fs.readdirSync(cache)
    .map(d => ({ d, mtime: fs.statSync(path.join(cache, d)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);          // 新的优先
  for (const { d } of dirs) {
    for (const pkg of ['playwright', 'playwright-core']) {
      const entry = path.join(cache, d, 'node_modules', pkg, 'index.js');
      if (fs.existsSync(entry)) out.push(pathToFileURL(entry).href);
    }
  }
  return out;
}

export async function loadPlaywright() {
  const tried = [];
  for (const spec of CANDIDATES) {
    const mod = await tryImport(spec);
    const pw = normalize(mod);
    if (pw) return pw;
    tried.push(`${spec}${mod && mod.__err ? ' → ' + mod.__err : ' → 未导出 chromium'}`);
  }
  for (const url of npxCacheCandidates()) {
    const mod = await tryImport(url);
    const pw = normalize(mod);
    if (pw) return pw;
    tried.push(`${decodeURIComponent(url)}${mod && mod.__err ? ' → ' + mod.__err : ' → 未导出 chromium'}`);
  }
  throw new Error([
    '未找到可用的 playwright。本套件不下载浏览器，但需要 playwright 本体，任选其一：',
    '  npm i -g playwright',
    '  npx -y playwright@1.63.0 --version    # 跑一次即可，之后会自动命中 npx 缓存',
    '或指定已装路径：PROTO_PLAYWRIGHT=/abs/path/to/playwright/index.js',
    '',
    '已尝试：',
    ...tried.map(t => '  - ' + t),
  ].join('\n'));
}

/** 依次尝试本机 Chrome 系浏览器；都用不了才报错。 */
export async function launchBrowser(pw) {
  const tries = [
    { channel: 'chrome', label: 'Google Chrome' },
    { channel: 'msedge', label: 'Microsoft Edge' },
    { channel: 'chromium', label: 'Chromium (playwright 自带)' },
    { label: 'playwright 默认浏览器' },
  ];
  const errs = [];
  for (const t of tries) {
    const { label, ...opts } = t;
    try {
      const browser = await pw.chromium.launch({ headless: true, ...opts });
      return { browser, label };
    } catch (e) {
      errs.push(`${label}: ${String(e.message).split('\n')[0]}`);
    }
  }
  throw new Error('没有可用的浏览器：\n  ' + errs.join('\n  '));
}

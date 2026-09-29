#!/usr/bin/env node
/**
 * 规格读取器：从原型页里读出机器可读的规格清单。
 *
 *   node tests/read-spec.mjs <原型页.html>            # 输出 Markdown 规格（给 AI / 开发者看）
 *   node tests/read-spec.mjs <原型页.html> --json     # 输出原始 JSON（给程序消费）
 *
 * 上游：把原型 HTML 读成实现依据。
 * 只读不写 —— 原型是唯一事实源，改原型用 tests/lib/build.mjs 的生成器。
 */
import fs from 'node:fs';
import { SPEC_ELEMENT_ID } from './lib/build.mjs';
import { validateSpec, specToMarkdown } from './lib/spec.mjs';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const file = argv.find(a => !a.startsWith('--'));

if (!file) {
  console.error('用法：node tests/read-spec.mjs <原型页.html> [--json]');
  process.exit(2);
}
if (!fs.existsSync(file)) {
  console.error(`文件不存在：${file}`);
  process.exit(2);
}

const html = fs.readFileSync(file, 'utf8');
const re = new RegExp(`<script[^>]+id=["']${SPEC_ELEMENT_ID}["'][^>]*>([\\s\\S]*?)</script>`);
const m = html.match(re);

if (!m) {
  console.error(`页面里没有找到内嵌规格清单（<script type="application/json" id="${SPEC_ELEMENT_ID}">）。`);
  console.error('该原型是旧版产物：请用新版生成器重新生成，或手工补上 spec 清单。');
  process.exit(1);
}

let spec;
try {
  spec = JSON.parse(m[1]);
} catch (e) {
  console.error('规格清单不是合法 JSON：' + e.message);
  process.exit(1);
}

try {
  validateSpec(spec);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

process.stdout.write(asJson ? JSON.stringify(spec, null, 2) + '\n' : specToMarkdown(spec) + '\n');

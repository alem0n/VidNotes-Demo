// tests/probe/check-cascade.js — 样式表级联序机器门（run-all 第六组，第 39 次新建）。
//
// 第 39 次把 style.css 按单一职责切成五个文件（base/style/modal/stack/responsive），
// 级联序由源页 <link> 的文档序承担（同源同层 stylesheet 的级联序 = 文档序，
// 与拆分前的单文件源序同构）。切片是构造级等价（5 文件拼接 == 拆分前母本逐字节），
// 但「等价」是脆弱财产：一次手滑的文件改动就可能把它变成**论证级**事故——
//   - 媒体块被挪位 → 级联序变（第 31 次吞括号事故的姊妹类：那次把 219 档嵌进 319 块，
//     吞掉其闭括号，使整段后半 stylesheet 落进未闭合作用域，6 个确定性键当场转假）；
//   - 括号不配平 → 后半规则落进未匹配作用域（同上，沉默且难定位）；
//   - 单文件超 500 行 → 原则 2 越线（第 39 次正是因为母本 627 行越线而拆分）；
//   - dist 内联的 <style> 与 link 序拼接不一致 → 打包器与文档漂移成两个事实来源。
// 本门把四类漂移全部机器化（任一即非零退出）：
//   1. 媒体查询出现序 == 记录序（7 项（第 63 次 8 项）：319/239/219/980/640/360 + 第 43 次
//      追加的 prefers-reduced-motion；遮罩注释后提取，注释里的假 @media 不计数）；
//   2. 注释/字符串遮罩后花括号配平（终值 0、全程非负）；
//   3. 每个 css 文件 ≤ 500 行（分件行数口径）；
//   4. dist/app.css 的内容 == link 序拼接串，且每个 dist 页只带一个
//      rel="stylesheet"（app.css）、零 <style>、零 type="module"
//      （端到端证明「束序 == link 级联序」，单一事实来源 = 源页 link 块）。
// 前置条件：已跑三步构建（dist/ 4 页 + 共享束存在）。本门只读不写。
//
// 单跑：node tests/probe/check-cascade.js

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// 记录的媒体查询出现序 = 拆分前母本 style.css 的源序：弹层链 319→239→219 物理位置在
// stack/responsive 之前，全局链 980→640→360 在尾部；两链选择器集零重叠。
// 第 43 次追加第 7 项：reduced-motion 收口块在 responsive.css 末尾（= 拼接序最末），
// 媒体查询首次引入（WCAG 2.3.3 prefers-reduced-motion；与门同步登记，清第 42 次挂账①）。
// 第 63 次追加第 8 项：#view-source 的 900px 塌列块，插在 reduced-motion 块之前
// （保持「reduced-motion = 拼接序最末」的自述不变；与门同步登记）。
// 第 77 次：原片面整体退场，该 900px 块随删——媒体查询出现序回到 7 项。
// 刻意重排或新增档位须更新此基线（并同步 docs/Explore_<N>.md 与 README）。
const RECORDED_MEDIA = [
  "(max-width: 319px)", "(max-width: 239px)", "(max-width: 219px)",
  "(max-width: 980px)", "(max-width: 640px)", "(max-width: 360px)",
  "(prefers-reduced-motion: reduce)",
];
const MAX_CSS_LINES = 500; // 原则 2 的产品文件上限（第 39 次拆分的动因）

// 与 build-inlined.js 第 0 步同一形状：78 期后每页 link 块收敛为单 link
// （src/styles/main.css），并断言四个源页的 link 块逐字节一致（级联序的单点真源）。
// 77 期：source.html 退场后 SOURCE_PAGES = 4 页。
// 78 期：convert.html → index.html（首页 = 提交转换地址的页）。
const SOURCE_PAGES = ["index.html", "run.html", "library.html", "history.html"];

// mirror of build-inlined.js 的 resolveCssImports（**有意独立重实现**：本门是审计
// 端的 oracle——解析器两份实现必须对同一源产出同一拼接，否则本门当场失败；
// 70–77 期拼接逻辑同样是「构建器一份、本门一份」的双写模式）。
function maskCssComments(src) {
  let out = "", i = 0;
  const n = src.length;
  const blanks = (c) => (c === "\n" ? "\n" : " ");
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "*") { out += "  "; i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += blanks(src[i]); i++; } if (i < n) { out += "  "; i += 2; } continue; }
    if (c === '"' || c === "'") { const q = c; out += c; i++; while (i < n) { if (src[i] === "\\") { out += "  "; i += 2; continue; } if (src[i] === q) { out += src[i]; i++; break; } out += blanks(src[i]); i++; } continue; }
    out += c; i++;
  }
  return out;
}
const RE_IMPORT_MASK = () => new RegExp("^[ \\t]*@import\\s+(?:url\\(\\s*)?[\"'][^\"']+[\"']\\s*\\)?\\s*;[ \\t]*$", "gm"); // 每次新建实例（/g 共享 lastIndex）
const RE_IMPORT_PARSE = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;/;
function resolveCssImports(file, stack = []) {
  if (stack.includes(file)) throw new Error(`circular CSS @import chain: ${[...stack, file].join(" -> ")}`);
  const path = resolve(ROOT, file);
  const src = readFileSync(path, "utf8");
  const masked = maskCssComments(src);
  let out = "", pos = 0, m;
  const importRe = RE_IMPORT_MASK();
  while ((m = importRe.exec(masked)) !== null) {
    out += src.slice(pos, m.index);
    const stmt = src.slice(m.index, m.index + m[0].length);
    const pm = RE_IMPORT_PARSE.exec(stmt);
    if (!pm) throw new Error(`${file}: unsupported @import syntax: ${stmt.trim()}`);
    const spec = pm[1];
    if (!/^[./]/.test(spec)) throw new Error(`${file}: only relative @import specifiers allowed (./ or ../), got "${spec}"`);
    const target = relative(ROOT, resolve(dirname(path), spec));
    if (!target.endsWith(".css")) throw new Error(`${file}: @import must reference a .css file, got "${spec}"`);
    out += resolveCssImports(target, [...stack, file]);
    pos = m.index + m[0].length;
  }
  out += src.slice(pos);
  return out.replace(/\s+$/, "");
}

function readCssInLinkOrder() {
  const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
  const block = html.match(/(?:[ \t]*<link rel="stylesheet" href="([^"]+\.css)">\n)+/);
  if (!block) throw new Error("index.html has no contiguous <link rel=stylesheet> block — no css to check");
  // 四页一序列：任何一页的 link 块与基准不同 ⇒ 页间级联口径分裂
  for (const p of SOURCE_PAGES) {
    if (p === "index.html") continue;
    const other = readFileSync(resolve(ROOT, p), "utf8").match(/(?:[ \t]*<link rel="stylesheet" href="([^"]+\.css)">\n)+/);
    if (!other || other[0] !== block[0])
      throw new Error(`${p}'s stylesheet link block differs from index.html's — the four pages must share ONE cascade`);
  }
  const links = [...block[0].matchAll(/<link rel="stylesheet" href="([^"]+\.css)">/g)].map((m) => m[1]);
  if (links.length !== 1) throw new Error(`index.html's link block has ${links.length} stylesheet links — expected exactly one (78 期 single main.css entry)`);
  const entry = links[0];
  if (!existsSync(resolve(ROOT, entry))) throw new Error(`stylesheet linked from index.html not found: ${entry}`);
  return { links, css: resolveCssImports(entry), entry };
}
// 遮罩 css 注释体与字符串体（保留引号/换行，长度不变）——结构扫描不受文本干扰：
// 注释里的 @media 或花括号绝不被数进去（第 31 次事故的类此误判预防）。
function maskCss(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  const blanks = (c) => (c === "\n" ? "\n" : " ");
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "*") {
      out += "  "; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += blanks(src[i]); i++; }
      if (i < n) { out += "  "; i += 2; }
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      out += c; i++;
      while (i < n) {
        if (src[i] === "\\") { out += "  "; i += 2; continue; }
        if (src[i] === q) { out += src[i]; i++; break; }
        out += blanks(src[i]); i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

function main() {
  const failures = [];
  const { links, css, entry } = readCssInLinkOrder();
  const masked = maskCss(css);

  // 1. 媒体查询出现序
  const found = [...masked.matchAll(/@media\s*([^{]*?)\s*\{/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim());
  const want = RECORDED_MEDIA;
  if (found.length !== want.length || found.some((c, i) => c !== want[i])) {
    failures.push(`media order: found [${found.join(", ")}], recorded [${want.join(", ")}]`);
  }

  // 2. 括号配平（终值 0、全程非负——负值即某块被吞了闭括号）
  let depth = 0, minDepth = 0;
  for (const c of masked) {
    if (c === "{") depth++;
    else if (c === "}") { depth--; minDepth = Math.min(minDepth, depth); }
  }
  if (depth !== 0) failures.push(`brace balance: final depth ${depth} (unbalanced {} in the concatenated css)`);
  if (minDepth < 0) failures.push(`brace balance: depth went negative (${minDepth}) — a closing brace was swallowed by an unclosed block`);

  // 3. src/styles 下每个 css 文件 ≤ 500 行（78 期目录化后按递归文件清单；
  //    分件行数口径——解析后的拼接串不再对应单文件行数）
  const cssFiles = [];
  const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory()) walk(resolve(dir, e.name)); else if (e.name.endsWith(".css")) cssFiles.push(relative(ROOT, resolve(dir, e.name)).replace(/\\/g, "/")); } };
  walk(resolve(ROOT, "src/styles"));
  if (!cssFiles.length) failures.push("src/styles has no .css files — directory structure drifted?");
  for (const f of cssFiles) {
    const src = readFileSync(resolve(ROOT, f), "utf8");
    const lines = src.split("\n").length - (src.endsWith("\n") ? 1 : 0);
    if (lines > MAX_CSS_LINES) failures.push(`${f}: ${lines} lines exceeds the ${MAX_CSS_LINES}-line product-file limit (principle 2)`);
  }

  // 4. dist 端到端（多页拆分 70 后的新口径）：dist/app.css 的内容 == link 序拼接串
  //    （端到级证明「束序 == link 级联序」，单一事实来源 = 源页 link 块本身）；且每个
  //    dist 页只带一个 rel="stylesheet"（app.css）、零 <style> 块、零 type="module"
  //    （file:// 口径：经典束 + CSS 链接；此处是产物侧复核，构建期同门在 build-inlined.js）。
  const distDir = resolve(ROOT, "dist");
  for (const p of SOURCE_PAGES) {
    const distPage = resolve(distDir, p);
    if (!existsSync(distPage)) throw new Error("dist/" + p + " is missing — run the two build steps first (node pipeline/build.js && node pipeline/build-inlined.js)");
    const distHtml = readFileSync(distPage, "utf8");
    if (distHtml.includes('type="module"')) failures.push(`dist/${p}: carries a type="module" script — the file:// product has no module semantics`);
    if ((distHtml.match(/<style[\s>]/g) || []).length !== 0) failures.push(`dist/${p}: carries a <style> block, expected none (css lives in the shared app.css)`);
    const linkCount = (distHtml.match(/<link rel="stylesheet" href="[^"]+">/g) || []).length;
    if (linkCount !== 1) failures.push(`dist/${p}: carries ${linkCount} stylesheet links, expected exactly 1 (app.css)`);
    if (!distHtml.includes('<link rel="stylesheet" href="app.css">')) failures.push(`dist/${p}: its single stylesheet link is not the shared app.css`);
  }
  const distCss = resolve(distDir, "app.css");
  if (!existsSync(distCss)) throw new Error("dist/app.css missing — run pipeline/build-inlined.js first");
  if (readFileSync(distCss, "utf8") !== css + "\n") failures.push("dist/app.css content != the link-order concatenation — the bundled css is not the concatenated stylesheets (bundle order != link/cascade order, or a file drifted after the build)");

  process.stdout.write(`[cascade] resolved ${entry} + ${cssFiles.length} css files under src/styles (${css.length} chars)\n`);
  process.stdout.write(`[cascade] media order: [${found.join(", ")}]  braces: depth ${depth} (min ${minDepth})\n`);
  if (failures.length) {
    process.stdout.write(`\n[cascade] FAIL — the stylesheet split drifted from the recorded cascade contract:\n  - ${failures.join("\n  - ")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`\n[cascade] OK — media order, brace balance, per-file line limits and the dist/app.css content all match the @import-resolved concatenation (4 page shells share one cascade).\n`);
  }
}

main();

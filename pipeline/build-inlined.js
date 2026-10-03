// build-inlined.js — produce dist/ as a FOLDER-LEVEL multi-page product (file:// safe).
//
// iteration 70（多页拆分 I 期）：产物从自包含单文件 dist/index.html 变为
//   dist/<page>.html × 4（convert/run/library/history，页壳极薄）+ 共享
//   经典脚本束 dist/app.js + 共享样式表 dist/app.css + 数据脚本 dist/data.js
//   + dist/assets/（随产物自携，含 52.5MB 原片视频——77 期原片页退场后视频本体
//   保留：转换视图 s2 抽帧探头仍在引用，且素材按运营方指令保留）。
// file:// 硬约束（此口径存在理由）：ES 模块（<script type="module">）与 fetch()
// 在 file:// 下被 CORS 阻止（origin 为 null），而**经典脚本与 CSS 链接可加载**——
// 故 dist 页只引用经典束与 CSS 链接（页壳内零模块、零 fetch），入口 = convert.html。
//
// 本步骤把分体源（4 个源页 + ES 模块图）烘烤为该形态：
//   ①  CSS：读源页连续 <link> 块（以 convert.html 为基准，并断言 4 页的 link 块
//       逐字节一致——级联序的单点真源），按文档序拼接 → dist/app.css（拼接串即
//       级联序，等价性由 check-cascade.js 复核）；
//   ②  JS：解析模块图（resolve imports、拓扑序、import/export 名交叉校验、剥离
//       声明、拼接为单一经典脚本束）→ dist/app.js。剥离后的拼接体在**非模块**语法
//       域内合法（vm.Script 编译门证明：file:// 下经典脚本无模块作用域概念）；
//   ③  数据：build/product-data.json 原文包成 window.__PRODUCT_DATA__ → dist/data.js
//       （data.js 必须在 app.js 之前：state.js 的 loadData 先读内联对象再回落 fetch）；
//   ④  页壳：每个源页的连续 link 块 → 单个 <link rel="stylesheet" href="app.css">，
//       src/scripts/main.js 模块入口 → <script src="data.js"> + <script src="app.js">。
// 两遍构建逐字节可复现：本步骤零随机性、输出路径与顺序确定（见 Explore_70 §3 复核）。
// 第 77 次：source.html 页壳随原片功能退场从 PAGES 移除（rmSync 整目录重建时旧产物一并清出）。
// 第 78 次：目录结构重构 I 期——convert.html → index.html（首页 = 提交转换地址的页）；
//   assets/ → public/（原样拷到 dist 根：favicon/media，不经构建）；CSS/JS 源码进 src/
//   （src/styles = 7-1 精简版 + main.css @import 入口；src/scripts = 原生 ES Modules；
//   页面停在根目录。页身份 data-page 与视图 token 不受文件名影响）。
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, statSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, ".."); // 79 期：构建脚本搬入 pipeline/，根相对路径统一锚 ROOT
const ENTRY = "src/scripts/main.js";
// 4 个页壳：源页与 dist 页同名（相对路径自洽）；index.html = 落地入口（78 期由
// convert.html 改名：首页 = 提交转换地址的页）
const PAGES = ["index.html", "run.html", "library.html", "history.html"];
const CANON_PAGE = "index.html"; // CSS link 块的基准页（单 link 断言的读取对象）

const data = readFileSync(resolve(ROOT, "build/product-data.json"), "utf8");
const pageSrc = new Map(PAGES.map((p) => [p, readFileSync(resolve(ROOT, p), "utf8")]));

/* ---- 0. the stylesheets: the page's <link> to src/styles/main.css, @import resolved ----
 * 级联序 = 文档序（同源同层 stylesheet，CSS Cascade L6 §6.1：独立 link 与 @import 的
 * 声明均按 appearance order 拼接处理）。78 期前 = 页内连续 7 link 块按文档序拼接；
 * 78 期收敛为单 link（src/styles/main.css）+ @import 清单——import 序即级联序，
 * 单点真源不变：断言 4 页的 link 块与基准逐字节一致，且块内恰一个样式表 link。
 *
 * resolveCssImports：递归内联 @import（CSS 语法要求 @import 先于其他规则，故入口
 * 文件只放注释 + import 清单）。specifier 约定 = 与 JS 模块同一的相对口径（必须以 ./ 或 ../ 开头——
 * 机器可判的「相对 only」规则；CSS 语法上裸相对名也合法，但禁止之以免混入绝对/远程 URL）。导入语句被**就地替换**为被导入文件的解析结果——
 * import 之间的其他文本（注释/规则）按原位保留。与 70–77 期同一拼接口径：每个
 * 文件 trim 尾白后按顺序拼接（旧口径是 7 个叶子文件 trim 后 join("\n")）。
 * 响亮失败：仅限相对 specifier 与 .css 目标、循环 import、目标缺失。
 */
function maskCssComments(src) {
  // 空白化注释体与字符串体（保留长度与换行），使 @import 扫描永不命中散文注释
  let out = "", i = 0;
  const n = src.length;
  const blanks = (c) => (c === "\n" ? "\n" : " ");
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "*") { out += "  "; i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += blanks(src[i]); i++; } if (i < n) { out += "  "; i += 2; } continue; }
    if (c === '"' || c === "'") { const q = c; out += src[i++]; while (i < n) { if (src[i] === "\\") { out += "  "; i += 2; continue; } if (src[i] === q) { out += src[i++]; break; } out += blanks(src[i]); i++; } continue; }
    out += c; i++;
  }
  return out;
}
const RE_CSS_IMPORT_MASK = () => new RegExp("^[ \\t]*@import\\s+(?:url\\(\\s*)?[\"'][^\"']+[\"']\\s*\\)?\\s*;[ \\t]*$", "gm");
// 注意：mask 正则**必须**每次调用新建实例（/g 的 lastIndex 是共享状态——递归
// 内层 exec 会污染外层循环的游标，制造幽灵重复匹配与字符串膨胀）
const RE_CSS_IMPORT_PARSE = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;/;
function resolveCssImports(file, stack = []) {
  if (stack.includes(file)) throw new Error(`circular CSS @import chain: ${[...stack, file].join(" -> ")}`);
  const path = resolve(ROOT, file);
  const src = readFileSync(path, "utf8");
  const masked = maskCssComments(src);
  if (masked.length !== src.length) throw new Error(`${file}: css mask length mismatch (internal)`);
  let out = "", pos = 0, m;
  const importRe = RE_CSS_IMPORT_MASK();
  while ((m = importRe.exec(masked)) !== null) {
    out += src.slice(pos, m.index);
    // 定位在遮罩上（散文注释永不命中），解析取真实文本（字符串体在遮罩里被空白化）
    const stmt = src.slice(m.index, m.index + m[0].length);
    const pm = RE_CSS_IMPORT_PARSE.exec(stmt);
    if (!pm) throw new Error(`${file}: unsupported @import syntax: ${stmt.trim()}`);
    const spec = pm[1];
    if (!/^[./]/.test(spec)) throw new Error(`${file}: only relative @import specifiers allowed, got "${spec}"`);
    const target = relative(ROOT, resolve(dirname(path), spec));
    if (!target.endsWith(".css")) throw new Error(`${file}: @import must reference a .css file, got "${spec}"`);
    out += resolveCssImports(target, [...stack, file]); // import 就地替换（import 行之间的换行由 slice 段提供——与 70–77 期 join("\n") 逐字节同口径）
    pos = m.index + m[0].length;
  }
  out += src.slice(pos);
  if (!stack.length && out.trim()) console.log(`css: resolved @imports of ${file}`);
  return out.replace(/\s+$/, ""); // 每个解析文件尾白 trim——与 70–77 期叶子文件同口径
}
const LINK_BLOCK_RE = /(?:[ \t]*<link rel="stylesheet" href="([^"]+\.css)">\n)+/;
const ENTRY_CSS = (() => {
  const block = pageSrc.get(CANON_PAGE).match(LINK_BLOCK_RE);
  if (!block) throw new Error(`${CANON_PAGE} has no contiguous <link rel=stylesheet> block — no css to inline`);
  const links = [...block[0].matchAll(/<link rel="stylesheet" href="([^"]+\.css)">/g)].map((m) => m[1]);
  if (links.length !== 1) throw new Error(`${CANON_PAGE}'s stylesheet link block has ${links.length} links — exactly one stylesheet link per page (78 期：单 main.css 入口)`);
  for (const p of PAGES) {
    if (p === CANON_PAGE) continue;
    const other = pageSrc.get(p).match(LINK_BLOCK_RE);
    if (!other || other[0] !== block[0])
      throw new Error(`${p}'s stylesheet link block differs from ${CANON_PAGE}'s — the four pages must share ONE cascade (same link, same file)`);
  }
  return links[0];
})();
const css = resolveCssImports(ENTRY_CSS);

/* ---- 1. mask comments/strings/template interpolations ------------------------
 * Produces a copy with EXACTLY the same length/offsets, where every comment body,
 * string body and template body is blanked (quotes/newlines kept) — so the
 * import/export scan in step 2 can never match keywords that live inside text.
 */
function maskSource(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  const blanks = (c) => (c === "\n" ? "\n" : " ");

  function skipString(quote) {
    out += src[i++];
    while (i < n) {
      const c = src[i];
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === quote) { out += c; i++; return; }
      out += blanks(c); i++;
    }
  }
  function skipTemplate() {
    out += src[i++];
    while (i < n) {
      const c = src[i];
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === "`") { out += c; i++; return; }
      if (c === "$" && src[i + 1] === "{") { out += "${"; i += 2; scanCode("}"); continue; }
      out += blanks(c); i++;
    }
  }
  function scanCode(term) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (term && c === "{") { depth++; out += c; i++; continue; }
      if (term && c === "}") { if (depth === 0) { out += c; i++; return; } depth--; out += c; i++; continue; }
      if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") { out += " "; i++; } continue; }
      if (c === "/" && src[i + 1] === "*") { out += "  "; i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += blanks(src[i]); i++; } if (i < n) { out += "  "; i += 2; } continue; }
      if (c === '"' || c === "'") { skipString(c); continue; }
      if (c === "`") { skipTemplate(); continue; }
      out += c; i++;
    }
    if (term) throw new Error("maskSource: unterminated interpolation");
  }
  scanCode(null);
  return out;
}

/* ---- 2. module grammar (strict subset: named imports, declaration exports) ----
 * Import statements are whole-line regions (single- or multi-line) located on the
 * masked source; their real text is sliced from the source at the same offsets.
 * Exports must be declarations: "export [async] const|let|var|function|class NAME".
 * A const/let/var declaration may declare SEVERAL bindings ("export const A = 1, B = 2;")
 * and EVERY binding is registered (multi-name aware since 第 36 次 — before that only the
 * first name was registered, which forced source-level "put the imported name first"
 * workarounds; see docs/Explore_36.md). Any other import/export occurrence (dynamic
 * import(), export default, re-export, destructuring export, keyword inside a string)
 * fails the build.
 */
const RE_IMPORT_REGION = /^[ \t]*import\s*\{[^}]*\}\s*from\s*"[^"]*"\s*;[ \t]*$/gm;
const RE_IMPORT_PARSE = /import\s*\{([^}]*)\}\s*from\s*"([^"]+)"\s*;/;
// captures the declaration kind and the FIRST binding name; const/let/var declarations
// may declare more bindings after top-level commas — those are enumerated by
// declaratorNames() below (function/class exports have exactly one binding)
const RE_EXPORT = /^export\s+(?:async\s+)?(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/;
const RE_NAME = /^[A-Za-z_$][\w$]*$/;

/* Enumerate EVERY binding name of a variable export (const/let/var). Scans the MASKED
 * source from the first declarator to the first ";" at bracket depth 0 (the statement
 * end — declarations may span lines, e.g. "export const PACER = { ... };") then splits
 * at top-level commas: commas inside (), [], {} belong to initializers and never
 * introduce a binding. Each segment must be "NAME [= init]"; a segment starting with
 * { or [ is a destructuring export (rejected: grammar restriction). maskSource does
 * not blank regex literals, so a regex carrying a top-level "," or ";" inside an
 * exported initializer would fail this scan loudly (none exist in this codebase).
 */
function declaratorNames(masked, from, file) {
  let depth = 0, semi = -1;
  for (let i = from; i < masked.length; i++) {
    const c = masked[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (c === ";" && depth === 0) { semi = i; break; }
  }
  if (semi < 0) throw new Error(`${file}: variable export has no terminating ; at bracket depth 0`);
  const names = [];
  let seg = from;
  depth = 0;
  for (let i = from; i < semi; i++) {
    const c = masked[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (c === "," && depth === 0) { pushDeclarator(masked.slice(seg, i), file, names); seg = i + 1; }
  }
  pushDeclarator(masked.slice(seg, semi), file, names);
  if (!names.length) throw new Error(`${file}: variable export declares no binding`);
  return names;
}
function pushDeclarator(seg, file, names) {
  const m = /^\s*([A-Za-z_$][\w$]*)\s*(?:[,=;]|$)/.exec(seg);
  if (!m) {
    if (/^\s*[{[]/.test(seg)) throw new Error(`${file}: destructuring export is not supported — declare each binding: ${seg.trim()}`);
    throw new Error(`${file}: cannot read export binding name from: ${seg.trim()}`);
  }
  names.push(m[1]);
}

function parseModule(file) {
  const src = readFileSync(resolve(ROOT, file), "utf8");
  const masked = maskSource(src);
  if (masked.length !== src.length) throw new Error(`${file}: mask length mismatch (internal)`);
  const srcLines = src.split("\n");
  const maskLines = masked.split("\n");
  if (maskLines.length !== srcLines.length) throw new Error(`${file}: mask line-count mismatch (internal)`);

  const imports = [];
  const removed = []; // [start, end) char ranges of dropped import statements
  let mm;
  while ((mm = RE_IMPORT_REGION.exec(masked)) !== null) {
    const stmt = src.slice(mm.index, mm.index + mm[0].length);
    const p = RE_IMPORT_PARSE.exec(stmt);
    if (!p) throw new Error(`${file}: unsupported import syntax — only 'import { a, b } from "./x.js";' (multi-line ok): ${stmt.trim()}`);
    const names = p[1].split(",").map((s) => s.trim()).filter(Boolean);
    for (const name of names) if (!RE_NAME.test(name)) throw new Error(`${file}: bad imported name "${name}"`);
    if (!(p[2].startsWith("./") || p[2].startsWith("../"))) throw new Error(`${file}: only relative specifiers allowed, got "${p[2]}"`);
    imports.push({ names, from: p[2] });
    removed.push([mm.index, mm.index + mm[0].length]);
    if (p[0] === "") break; // safety: zero-length match guard (never happens with /gm)
  }

  const exports = [];
  let exportStmts = 0; // one per stripped export STATEMENT (multi-name = 1 statement, n names)
  const body = [];
  let pos = 0; // char offset of the current line start in src
  for (let ln = 0; ln < srcLines.length; ln++) {
    const line = srcLines[ln];
    const lineEnd = pos + line.length;
    const dropped = removed.some(([a, b]) => pos >= a && lineEnd <= b);
    if (!dropped) {
      const m = maskLines[ln].trim();  // structure scan: keywords inside text are blanked
      const orig = line.trim();        // grammar extraction: real string literals live here
      if (m.startsWith("export")) {
        const em = RE_EXPORT.exec(m); // structure scan: the declaration shape lives in the masked text
        if (!em) throw new Error(`${file}: unsupported export syntax — only 'export [async] const|let|var|function|class NAME[, NAME2 = ...]' is allowed: ${orig}`);
        if (em[1] === "const" || em[1] === "let" || em[1] === "var") {
          const lead = maskLines[ln].length - maskLines[ln].replace(/^\s+/, "").length;
          const decl = pos + lead + em[0].length - em[2].length; // offset just past the declaration keyword
          exports.push(...declaratorNames(masked, decl, file)); // register EVERY binding name
        } else {
          exports.push(em[2]); // function/class export: exactly one binding (its name)
        }
        exportStmts += 1;
        body.push(line.replace(/^\s*export\s+/, "")); // strip the keyword, keep the declaration
      } else {
        for (const kw of ["import", "export"]) {
          if (new RegExp("\\b" + kw + "\\b").test(m)) {
            throw new Error(`${file}: stray '${kw}' outside a module declaration on line ${ln + 1}: ${m}`);
          }
        }
        body.push(line);
      }
    }
    pos = lineEnd + 1; // +1 for "\n"
  }
  return { file, imports, exports, exportStmts, code: body.join("\n") };
}

/* ---- 3. resolve the module graph: post-order DFS, cycles fail, imported names verified ---- */
const modules = new Map();
const order = [];
const loading = new Set();
const stackPath = [];

function load(file) {
  if (modules.has(file)) return modules.get(file);
  if (loading.has(file)) throw new Error(`circular import chain: ${[...stackPath, file].join(" -> ")}`);
  loading.add(file);
  stackPath.push(file);
  const mod = parseModule(file);
  modules.set(file, mod);
  for (const imp of mod.imports) {
    const depKey = relative(ROOT, resolve(dirname(resolve(ROOT, file)), imp.from)).replace(/\\/g, "/");
    const dep = load(depKey);
    for (const name of imp.names) {
      if (!dep.exports.includes(name)) throw new Error(`${file} imports "${name}" but ${dep.file} does not export it`);
    }
  }
  loading.delete(file);
  stackPath.pop();
  order.push(mod);
  return mod;
}

/* ---- 4. concatenate in dependency order, syntax-check, symbol-check ---- */
load(ENTRY);
const bundle = order.map((m) => `// ── module: ${m.file} ──\n${m.code}`).join("\n");
new Script(bundle); // compile-only syntax gate (throws on any syntax error) — 该门同时
// 证明拼接体在**非模块**（经典脚本）语法域内可解析：file:// 下 dist 页以经典脚本加载
/* symbol completeness gate (compile-time, 第 36 次): every registered export name must
 * occur in the bundle as a word — a NECESSARY condition that the registration face and
 * the emitted bundle cannot drift apart on the "registered but undefined" side (which
 * the file:// bundle's single scope masks). The SUFFICIENT oracle for module-boundary
 * correctness stays the http:// path of tests/probe/run-main.js: real ES modules fail
 * at link time on any missing cross-module import. */
for (const mod of order) {
  for (const name of mod.exports) {
    if (!new RegExp(`\\b${name}\\b`).test(bundle))
      throw new Error(`${mod.file}: exported name "${name}" is registered but missing from the bundle`);
  }
}

/* ---- 5. emit the folder-level multi-page product --------------------------- */
// 经典束前置守卫：file:// 下页面以经典脚本加载，任何残留模块语义都意味着页面不可用
for (const [p, html] of pageSrc) {
  if (html.includes('type="module"') && !html.includes(`<script src="${ENTRY}" type="module"></script>`))
    throw new Error(`${p}: carries a type="module" script tag other than the single entry — the file:// product has no module semantics`);
}

const dist = resolve(ROOT, "dist");
rmSync(dist, { recursive: true, force: true }); // 前一轮产物（含旧的单文件 index.html 口径）一并清出：folder-level 口径只含本步产物
mkdirSync(dist, { recursive: true });
cpSync(resolve(ROOT, "public"), resolve(ROOT, "dist"), { recursive: true }); // public/ 原样拷到 dist 根（78 期：assets/ + favicon/robots/llms —— 原生物，不经构建）

// 共享束：CSS / 数据 / 经典脚本（三文件被 5 页共用——页壳只承担结构与文档语义）
writeFileSync(resolve(dist, "app.css"), css + "\n");
writeFileSync(resolve(dist, "data.js"), `window.__PRODUCT_DATA__ = ${data};\n`);
writeFileSync(resolve(dist, "app.js"), `// VidNotes shared classic bundle (build-inlined.js; 70 期多页拆分 / 78 期目录结构重构).\n// ${order.length} modules in dependency order; import/export declarations stripped.\n${bundle}\n`);

// 5 个页壳：连续 link 块 → 单个 app.css 链接；main.js 模块入口 → data.js + app.js
// 经典脚本对（次序即依赖：data.js 先于 app.js——state.js loadData 先读内联对象）
const PAGE_SCRIPTS = `<script src="data.js"></script>\n<script src="app.js"></script>`;
const entryTag = `<script src="${ENTRY}" type="module"></script>`;
for (const p of PAGES) {
  let html = pageSrc.get(p);
  html = html.replace(LINK_BLOCK_RE, () => `<link rel="stylesheet" href="app.css">\n`);
  if (html.includes('rel="stylesheet"') && !html.includes('<link rel="stylesheet" href="app.css">'))
    throw new Error(`${p}: a rel="stylesheet" link survived replacement other than the single app.css link — the source page's stylesheet links are not one contiguous block`);
  if (!html.includes(entryTag)) throw new Error(`${p}: entry tag not found: ${entryTag}`);
  html = html.replace(entryTag, PAGE_SCRIPTS);
  if (html.includes('type="module"')) throw new Error(`${p}: a type="module" script survived inlining — the file:// product has no module semantics`);
  writeFileSync(resolve(dist, p), html);
}

const totalBundle = PAGES.reduce((s, p) => s + statSync(resolve(dist, p)).size, 0)
  + statSync(resolve(dist, "app.css")).size
  + statSync(resolve(dist, "data.js")).size
  + statSync(resolve(dist, "app.js")).size;

console.log("bundled", order.length, "modules in order:", order.map((m) => m.file).join(" → "));
console.log("bundle", bundle.length, "chars; stripped",
  order.reduce((s, m) => s + m.imports.length, 0), "import statements and",
  order.reduce((s, m) => s + m.exportStmts, 0), "export declarations",
  `(${order.reduce((s, m) => s + m.exports.length, 0)} exported names: every binding of a multi-name declaration)`);
console.log(`resolved @imports of ${ENTRY_CSS} → ${css.length} chars`);
console.log(`emitted dist/ — ${PAGES.length} page shells + app.css (${statSync(resolve(dist, "app.css")).size} B) + data.js (${statSync(resolve(dist, "data.js")).size} B) + app.js (${statSync(resolve(dist, "app.js")).size} B) + assets/; page shells total ${totalBundle - statSync(resolve(dist, "app.css")).size - statSync(resolve(dist, "data.js")).size - statSync(resolve(dist, "app.js")).size} B; product body (shells + shared bundles) ${totalBundle} B; entry = dist/index.html (file:// zero-module, zero-fetch); public/ copied verbatim to dist root`);

// tests/probe/probe-html.js — generate the page-scoped dual-path probe pages.
//
// Methodology（iteration 71，多页拆分 II 期重锚）：II 期把探针体系从「单文档
// 长会话」（inject-main.1..9.js，619 键，视图跳转就在同文档翻转）重锚为
// **页级双路契约**。每页一份契约（inject-<page>[.<n>].js），共享原语在
// inject-base.js。两路派生（与 70 次 §3.7-II-1 交付原文一致）：
//   - file 路：dist 页壳（`dist/probe-<page>[-<variant>]-file.html`），其
//     data.js/app.css/app.js 引用原样有效——file:// 零模块零 fetch 的硬约束面
//     由**页壳自身**承载（注入是内联 module：无外部 import ⇒ 无 fetch ⇒
//     不被 CORS 阻止——第 7 次以来的注入载体结论，70 次 §1.0 第 2 行）
//   - http 路：源页（仓库根 `probe-<page>[-<variant>]-http.html`），保留
//     `<script src="main.js" type="module">` 外部入口 ⇒ 真实 ES 模块图 +
//     fetch("build/product-data.json")
//   - run 页两路都以 search params 携带演示输入（?url=&mode=&pace=）。file:// 路
//     由 run-main 直接在请求 URL 上带 query（location.search 正常读出，本轮实证）；
//     http 路不能走请求 URL——serve.mjs 不剥 query 段会 404（本轮实证的多页 http
//     限制），改为在 http 探针页里注入一段**经典**脚本先 replaceState 把 query 写进
//     location.search：经典脚本在解析期执行、模块脚本默认 defer，故 main.js 的
//     boot 读到的 location.search 与 file 路逐字相同（boot-run 消费双路一致）
//
// INJECT_SHA 旧 → 新：旧 a6f3ef3d… 守护单会话九片段拼接；新 sha256 守护
// 「inject-base.js + 全部页级片段（规范序）」的拼接——片段一旦漂移即失败，
// 与旧契约同一机器保证（"verbatim snapshot" 是 checked property 而非 claim）。
//
// Usage:
//   node tests/probe/probe-html.js                 write every probe page (4 页 + run 双变体 × 2 路)
//   node tests/probe/probe-html.js --print-inject  print the assembled inject (reading/debug)
//   node tests/probe/probe-html.js --only convert  limit to one page's variants
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// 演示输入（run 页两变体共用；URL 编码与 boot-run 的 URLSearchParams 消费同源）
const DEMO_URL = "https://www.youtube.com/watch?v=VNYe3Cnk5Pw"; // 82 期：新会话源视频

// 页级契约注册表：page / 变体 / 源页 / dist 页 / 注入片段（规范序，<=500 行/片）
export const CONTRACTS = [
  { page: "convert", variant: null, source: "index.html", dist: "dist/index.html",
    frags: ["inject-convert.js"] },
  { page: "library", variant: null, source: "library.html", dist: "dist/library.html",
    frags: ["inject-library.js"] },
  { page: "history", variant: null, source: "history.html", dist: "dist/history.html",
    frags: ["inject-history.1.js", "inject-history.2.js"] },
  // run 页：brisk = 深度契约（暂停/冻结/调速/隐藏/管道车间/交付卡）；instant =
  // 极速档的初始档位 + 收尾（同一 boot 路径的第二个 pace 读数——dsReset 的
  // 「per-run 档位复位」退役后的等价覆盖，见 Explore_71 §3）
  { page: "run", variant: "brisk", source: "run.html", dist: "dist/run.html",
    frags: ["inject-run.1.js", "inject-run.2.js"],
    query: { url: DEMO_URL, mode: "auto", pace: "brisk" } },
  { page: "run", variant: "instant", source: "run.html", dist: "dist/run.html",
    frags: ["inject-run-instant.js"],
    query: { url: DEMO_URL, mode: "auto", pace: "instant" } },
];

// 组装的注入契约（规范序：base 先行，页级片段按注册表序）——run 每变体各取
// 自己的片段，base 全文在每页注入里重复（页壳互不相干，无共享运行时）
export function readInject(frags) {
  let s = readFileSync(resolve(__dirname, "inject-base.js"), "utf8");
  for (const f of frags) s += readFileSync(resolve(__dirname, f), "utf8");
  if (!s.endsWith("\n")) s += "\n";
  return s;
}

// INJECT_SHA 门：**全部契约组装体的字节拼接** sha256 必须等于下述记录常量
// （不是从文件现算——现算等于自检自，漂移永不失败）。片段有意改动时先跑
//   node tests/probe/probe-html.js --print-sha
// 把新值贴进 INJECT_SHA，与片段同一提交（旧契约 tests/probe/README.md 的
// "updating the probe" 同一工作流）。
export const INJECT_SHA = "7b9b5d91ab3f583ba4a9792e91b402e24a37d76b0ec0a4b9847740b9726cfd71";
const ALL_FRAGS = [...new Set(CONTRACTS.flatMap((c) => c.frags))];

// 契约组装体的字节拼接（注册表序）——INJECT_SHA 与 --print-sha 的同一真源
export function contractConcat() {
  let all = "";
  for (const c of CONTRACTS) all += readInject(c.frags);
  return all;
}
export function verifySha() {
  const got = createHash("sha256").update(contractConcat()).digest("hex");
  if (got !== INJECT_SHA)
    throw new Error(
      `inject fragments do not assemble into the baseline inject\n  got      ${got}\n  expected ${INJECT_SHA}\n` +
      "The assertion contract has drifted from the recorded snapshot. If that is intended, run `node tests/probe/probe-html.js --print-sha` and update INJECT_SHA (and the README table) in one commit; if not, restore the fragments.");
  return got;
}

export function queryOf(c) {
  if (!c.query) return "";
  return "?" + new URLSearchParams(c.query).toString();
}

// 探针页文件名（变体代入名，供 run-boot / 调试直接引用）
export function pageName(c) {
  return c.page + (c.variant ? "-" + c.variant : "");
}

function embed(page, tag, queryPrelude) {
  const html = readFileSync(page, "utf8");
  if (!html.includes("</body>")) throw new Error(`${page} has no </body> — the page template changed`);
  return html.replace("</body>", queryPrelude + tag + "</body>");
}
// http 路的 query 预置（经典脚本先于模块 main.js 执行 ⇒ boot 读到同一 location.search）
const preludeOf = (c) => c.query && c.embedQuery !== false
  ? `<script>try{history.replaceState(null,"","${queryOf(c)}");}catch(e){}</script>\n`
  : "";

function main() {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const selected = only ? CONTRACTS.filter((c) => c.page === only) : CONTRACTS;
  if (!selected.length) throw new Error(`no contract for --only ${only} (known: ${[...new Set(CONTRACTS.map((c) => c.page))].join(", ")})`);
  if (process.argv.includes("--print-sha")) {
    process.stdout.write(createHash("sha256").update(contractConcat()).digest("hex") + "\n");
    return;
  }
  if (process.argv.includes("--print-inject")) {
    process.stdout.write(readInject(selected[0].frags));
    return;
  }
  verifySha(); // 生成页面前先过门：片段与记录常量必须一致（--print-sha/--print-inject 先行返回）
  const tagFor = (c) => `<script type="module">\n${readInject(c.frags)}\n</script>\n`;
  let n = 0;
  for (const c of selected) {
    const name = pageName(c);
    const fileOut = resolve(ROOT, `dist/probe-${name}-file.html`);
    const httpOut = resolve(ROOT, `probe-${name}-http.html`);
    for (const [src, dst, prelude] of [
      [resolve(ROOT, c.dist), fileOut, ""],
      [resolve(ROOT, c.source), httpOut, preludeOf(c)],
    ]) {
      if (!existsSync(src))
        throw new Error(`${src} is missing — build the product first:\n  node pipeline/build.js && node pipeline/build-inlined.js`);
      writeFileSync(dst, embed(src, tagFor(c), prelude));
      n++;
    }
    console.log(`wrote probe-${name}: dist/probe-${name}-file.html (file:// 经典束路) + probe-${name}-http.html (http:// 模块图路)${c.query ? "  query: " + queryOf(c) : ""}`);
  }
  console.log(`inject sha256 ${INJECT_SHA} (${n} pages; base + ${ALL_FRAGS.length} page fragments: ${ALL_FRAGS.join(", ")})`);
}

main();

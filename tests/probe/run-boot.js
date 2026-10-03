// tests/probe/run-boot.js — the boot deep-link recovery probe（iteration 71，多页拆分
// II 期重锚：第 41 次的 SPA hash 深链 7 标本按 5 页拆散）。
//
// THE GATE THIS CLOSES（第 41 次的口径逐字保留）：multi-page 形态下「页 + 深链
// 在 boot 时恢复」不能进入自动探针网（file:// iframe 无法观察跨源子页）。
// 本驱动是双路按页的 boot 契约：每个标本 = 一个携带 hash/query 的探针页
// （file 路 = dist 副本，http 路 = 源页副本 + 经典 replaceState 预置 query，见
// probe-html 的同一理由：serve.mjs 不剥 query 段）+ 只读 boot-marker，无头
// chrome 逐标本驱动（同一标志集，小预算——boot 页无演示无定时间隔，boot 后
// 即闲置）。
//
// 标本表（9 条，覆盖 70 次 I 期已交付的全部深铅形态；相对旧 7 标本的差异
// 见 §1.3 迁移表；77 期 source-view 标本随原片页退场移除）：
//   history-deep    history.html#history/<RUN_ID>/@600000  player 开、
//                   aria-valuenow = 时刻网格 idxOfRel(600000)（数据神谕实时复算）
//   history-run     history.html#history/<RUN_ID>            player 开
//   history-view    history.html#history                        player 闭
//                   （纯视图地址不强制开 player——40 次口径）
//   library-doc     library.html?doc=<RUN_ID>                 docModal 深开
//                   （run 页「查看讲义」的跨页等价落点）
//   library         library.html                                页身份即地址、
//                   零 hash 零参数（空散列就地零操作——70 次 §3.5）
//   run-handoff     run.html?url=<enc>&mode=auto&pace=instant   演示活（钮 live）
//   run-missing     run.html                                    缺 url ⇒
//                   location.replace("index.html")：**落点页**是 index
//                   （data-page + #convertForm，驱动侧断言；driven 的 DOM 是
//                   被重定向后的 convert 页——marker 随文档卸载不可存活，故
//                   此标本断言落点而非 bh* 键）
//   convert-default index.html                                  默认视图 = 入口页
//   invalid-on-history  history.html#/garbage/deep/x            非法散列 ⇒
//                   replace 到 index.html（fragment 透传；落点页断言同上）
//
// 断言面（语义等价于既有口径）：bh* 键集 + 每标本的期望表 + 跨路确定性
// （STATE_KEYS 逐字节）+ 越界/非法静默回落 + boot 零写（bhLen === bhH0）。
// DETERMINISM: 每键都是完全 boot 的确定性页的原始 DOM 读（无演示无回放无采
// 样），故双路逐字节一致；bhH0/bhLen 是环境值（初始会话历史长度），不变量
// 是同标本内 bhLen === bhH0 + 同路全体标本共享一个 bhLen（初始 URL 带散列
// 本身不增条目：WHATWG HTML §7.4——只有 load **之后**的片段导航追加一条）。
//
// PORT HYGIENE / 产物清理 / Prerequisites：同 run-main.js（自管 serve.mjs、
// 8811 端口冲突即报错、探针页与 --user-data-dir 在 finally 删除）。
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, rmSync, mkdtempSync } from "node:fs";
import { createConnection } from "node:net";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CHROME = process.env.CHROME || "google-chrome";
const PORT = 8811;
const WALL_S = 180; // wall-clock cap per chrome run (the boot page is idle)
const VIRTUAL_BUDGET = 60000; // 轮询 + 落定窗 + fetch 路都绰绰有余
// 82 期：RUN_ID 与 DEMO_URL 随数据源整体替换——RUN_ID 改由 product-data 派生
// （run-20261003 = 会话起始日，现固化于 data/product-data.json），深链标本 hash
// 串同源派生，单一真源 = build/product-data.json
const DEMO_URL = "https://www.youtube.com/watch?v=VNYe3Cnk5Pw";
const PRODUCT = JSON.parse(readFileSync(join(ROOT, "build/product-data.json"), "utf8"));
const RUN_ID = PRODUCT.runs?.[0]?.id || "run-unknown";
const MARKER = readFileSync(join(__dirname, "boot-marker.js"), "utf8");
const RECORDER = "<script>window.__BH0 = history.length;</script>\n";
// 注入锚（缺失即响亮的页模板漂移门）：
// dist 页的经典束尾（data.js/app.js 两个脚本）与源页的模块入口同一形态
const DIST_ANCHOR = '<script src="app.js"></script>';
const SPLIT_ANCHOR = '<script src="src/scripts/main.js" type="module"></script>';

// 记录契约：9 标本 × 2 路 × 13 个 bh* 读数（2 个 redirect 标本读落点页特征）
const EXPECTED_SAMPLES = 9;
const EXPECTED_KEYS = 13;
const KEY_NAMES = ["bhReady", "bhPage", "bhView", "bhPlayer", "bhModal", "bhRun", "bhAriaCur", "bhHash", "bhSearch", "bhH0", "bhLen", "bhValnow", "bhClock"];
// 跨路必须逐字节一致的键（bhH0/bhLen 是环境值——见上方确定性注记）
const STATE_KEYS = ["bhReady", "bhPage", "bhView", "bhPlayer", "bhModal", "bhRun", "bhAriaCur", "bhHash", "bhSearch", "bhValnow", "bhClock"];
const DEEP_TARGET_MS = 600000;

// 时刻格神谕的首次实算（SAMPLES 的 history-deep 期望值直接引用此常量，保持单一真源）
function gridRelAtTarget() {
  const run = PRODUCT.runs?.[0];
  if (!run?.moments?.length) throw new Error("build/product-data.json has no usable runs[0].moments");
  const t0 = Date.parse(run.startedAt);
  const rels = run.moments
    .filter((m) => m.t)
    .map((m) => Math.max(0, Date.parse(m.t) - t0))
    .sort((a, b) => a - b);
  const relsAt = rels.filter((r) => r <= DEEP_TARGET_MS);
  if (!relsAt.length) throw new Error(`no moment rel <= ${DEEP_TARGET_MS} in build/product-data.json — pick another deep specimen`);
  return relsAt[relsAt.length - 1];
}
const GRID_REL = gridRelAtTarget();

// 标本表：hash/query 如 URL 所载 + 该标本的期望落点键值
const SAMPLES = [
  { id: "history-deep", page: "history.html", hash: "#history/" + RUN_ID + "/@600000",
    expect: { bhPage: "history", bhView: "view-history", bhPlayer: "open", bhValnow: String(GRID_REL) } },
  { id: "history-run", page: "history.html", hash: "#history/" + RUN_ID,
    expect: { bhPage: "history", bhView: "view-history", bhPlayer: "open" } },
  { id: "history-view", page: "history.html", hash: "#history",
    expect: { bhPage: "history", bhView: "view-history", bhPlayer: "closed" } },
  { id: "library-doc", page: "library.html", query: "doc=" + RUN_ID,
    expect: { bhPage: "library", bhView: "view-library", bhModal: "open" } },
  { id: "library", page: "library.html",
    expect: { bhPage: "library", bhView: "view-library", bhPlayer: "absent", bhModal: "closed" } },
  { id: "run-handoff", page: "run.html", query: "url=" + encodeURIComponent(DEMO_URL) + "&mode=auto&pace=instant",
    ariaCur: "index.html", expect: { bhPage: "run", bhView: "view-convert", bhPlayer: "absent", bhRun: "live" } },
  { id: "run-missing", page: "run.html", redirect: "index.html",
    expect: { bhPage: "convert" } }, // 缺 url ⇒ replace 回入口：断言落点页
  { id: "convert-default", page: "index.html",
    expect: { bhPage: "convert", bhView: "view-convert", bhPlayer: "absent", bhModal: "absent" } },
  { id: "invalid-on-history", page: "history.html", hash: "#/garbage/deep/x", redirect: "index.html",
    expect: { bhPage: "convert" } }, // 非法散列 ⇒ 带 fragment replace 回转换页
];
// 落点断言标本（redirect）：marker 随文档卸载，驱动侧读落地页的 DOM 特征
const REDIRECT_SAMPLES = new Set(SAMPLES.filter((s) => s.redirect).map((s) => s.id));

function chromeRun(url, profileDir) {
  return new Promise((res, rej) => {
    const args = [
      "--headless=new", "--no-sandbox", "--disable-gpu",
      "--enable-logging=stderr", "--v=0",
      `--virtual-time-budget=${VIRTUAL_BUDGET}`, "--dump-dom", "--window-size=1280,900",
      `--user-data-dir=${profileDir}`, url,
    ];
    const ch = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"], cwd: ROOT });
    let dom = "", stderr = "";
    ch.stdout.on("data", (d) => (dom += d));
    ch.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => { ch.kill("SIGKILL"); rej(new Error(`chrome exceeded the ${WALL_S}s wall clock on ${url}`)); }, WALL_S * 1000);
    ch.on("error", (e) => { clearTimeout(timer); rej(new Error(`cannot start ${CHROME}: ${e.message}`)); });
    ch.on("close", () => { clearTimeout(timer); res({ dom, stderr }); });
  });
}

function parseTitle(dom) {
  const m = dom.match(/<title>([\s\S]*?)<\/title>/);
  if (!m) return null;
  // --dump-dom 按 HTML 序列化（& → &amp;、< → &lt;），先反解回原始字符串
  return m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
function parseBoot(title) {
  const at = title.indexOf("BOOTPROBE ");
  if (at < 0) return null;
  const body = title.slice(at + "BOOTPROBE ".length).trim();
  const fragments = body.split(" | ").map((e) => e.trim()).filter(Boolean);
  const kv = new Map();
  const bare = fragments.filter((e) => e.indexOf("=") < 1);
  for (const e of fragments) {
    const j = e.indexOf("=");
    if (j < 1) continue;
    if (kv.has(e.slice(0, j))) throw new Error(`duplicate key: ${e.slice(0, j)}`);
    kv.set(e.slice(0, j), e.slice(j + 1));
  }
  return { fragments: fragments.length, kv, bare };
}
function pageLevelErrors(stderr) {
  const bad = stderr.split("\n").filter((l) => /Uncaught|JSERR:|REJERR:|CONSOLE\(/.test(l));
  return { count: bad.length, sample: bad.slice(0, 5) };
}

function portFree(upToMs) {
  return new Promise((res) => {
    const t0 = Date.now();
    const attempt = () => {
      const s = createConnection({ host: "127.0.0.1", port: PORT }, () => { s.end(); retryOr(false); });
      s.on("error", () => retryOr(true));
      const retryOr = (free) => { if (free || Date.now() - t0 > upToMs) res(free); else setTimeout(attempt, 200); };
    };
    attempt();
  });
}
function waitServer(upToMs) {
  const t0 = Date.now();
  return new Promise((res, rej) => {
    const attempt = () => {
      const req = httpRequest(`http://127.0.0.1:${PORT}/`, { method: "GET", timeout: 2000 }, (r) => { r.resume(); res(); });
      req.on("error", (e) => {
        if (Date.now() - t0 > upToMs) rej(new Error(`pipeline/serve.mjs did not answer on 127.0.0.1:${PORT} within ${upToMs}ms (${e.message})`));
        else setTimeout(attempt, 100);
      });
      req.end();
    };
    attempt();
  });
}

// 生成双路 boot 探针页：dist 副本（经典束）+ 源页副本（模块图）。
// redirect 标本只跑 file 路（落点断言不依赖路）；其余标本双路。
function generatePages(specimen) {
  const markerTag = `<script type="module">\n${MARKER}\n</script>\n`;
  const q = specimen.query ? "?" + specimen.query : "";
  const prelude = specimen.query
    // 经典脚本先于模块 main.js 执行 ⇒ boot 读到同一 location.search（serve.mjs
    // 不剥 query 段，故 http 路 query 必须页内预置——与 probe-html 同一论证）
    ? `<script>try{history.replaceState(null,"","?${specimen.query}");}catch(e){}</script>\n`
    : "";
  const outs = [];
  const distPage = resolve(ROOT, "dist", specimen.page);
  const splitPage = resolve(ROOT, specimen.page);
  for (const [src, dst, anchor, extra] of [
    [distPage, resolve(ROOT, `dist/probe-boot-${specimen.id}-file.html`), DIST_ANCHOR, ""],
    [splitPage, resolve(ROOT, `probe-boot-${specimen.id}-http.html`), SPLIT_ANCHOR, prelude],
  ]) {
    if (!existsSync(src))
      throw new Error(`${src} is missing — run the two build steps first (see tests/probe/README.md)`);
    const html = readFileSync(src, "utf8");
    if (!html.includes(anchor))
      throw new Error(`${src} no longer carries the anchor ${anchor} — the page template drifted; update run-boot.js`);
    if (!html.includes("</body>"))
      throw new Error(`${src} has no </body> — the page template changed`);
    let out = html.replace(anchor, () => RECORDER + anchor);
    if (extra) out = out.replace(SPLIT_ANCHOR, (a) => extra + a); // http 路的经典预置（先于模块 main.js）
    out = out.replace("</body>", () => markerTag + "</body>");
    writeFileSync(dst, out);
    outs.push(dst);
  }
  return outs;
}

function assertRun(pathLabel, s, kv, gridRel) {
  const problems = [];
  if (kv.size > EXPECTED_KEYS)
    problems.push(`${pathLabel}/${s.id}: ${kv.size} bh* keys > ${EXPECTED_KEYS}`);
  else if (JSON.stringify([...kv.keys()].sort()) !== JSON.stringify([...KEY_NAMES].sort()))
    problems.push(`${pathLabel}/${s.id}: key set is [${[...kv.keys()].join(",")}] != [${KEY_NAMES.join(",")}]`);
  const get = (k) => (kv.has(k) ? kv.get(k) : "<MISSING>");
  if (get("bhReady") !== "true")
    problems.push(`${pathLabel}/${s.id}: bhReady=${get("bhReady")} — the page boot signal never appeared`);
  for (const [k, want] of Object.entries(s.expect)) {
    if (get(k) !== want)
      problems.push(`${pathLabel}/${s.id}: ${k}=${get(k)} != ${want}`);
  }
  // run 页的视图归属 = 转换（pages.js 的 PAGE_TO_VIEW：run → convert——演示是
  // 转换流的延续），故其顶栏 aria-current 指向 index.html（78 期 convert 页改名）而非不存在的 run tab
  const wantCur = s.ariaCur ?? (s.expect.bhPage === "convert" ? "index.html" : s.expect.bhPage + ".html");
  if (get("bhAriaCur") !== wantCur)
    problems.push(`${pathLabel}/${s.id}: bhAriaCur=${get("bhAriaCur")} != ${wantCur}`);
  if (s.expect.bhHash !== undefined && get("bhHash") !== s.expect.bhHash)
    problems.push(`${pathLabel}/${s.id}: bhHash=${JSON.stringify(get("bhHash"))} != ${JSON.stringify(s.expect.bhHash)}`);
  if (s.expect.bhSearch !== undefined && get("bhSearch") !== s.expect.bhSearch)
    problems.push(`${pathLabel}/${s.id}: bhSearch=${JSON.stringify(get("bhSearch"))} != ${JSON.stringify(s.expect.bhSearch)}`);
  const h0 = get("bhH0"), len = get("bhLen");
  if (!/^\d+$/.test(h0) || !/^\d+$/.test(len) || h0 !== len)
    problems.push(`${pathLabel}/${s.id}: history grew during boot (bhH0=${h0} bhLen=${len})`);
  if (s.id === "history-deep" && get("bhValnow") !== String(gridRel))
    problems.push(`oracle: the deep specimen's valuenow ${get("bhValnow")} != the product-data moment grid ${gridRel} (idxOfRel <= ${DEEP_TARGET_MS})`);
  return problems;
}

// redirect 标本的落点断言：被重定向后的 DOM 必须是 convert 页（data-page +
// 表单在场）。fragment 透传不可由 dump 观察（URL 不进 DOM），登记为代码路径
// 覆盖（同一 reconcile，见 §1.3 论证）
function assertRedirect(specimen, dom) {
  const problems = [];
  const page = (dom.match(/<body[^>]*data-page="([a-z]+)"/) || [])[1];
  if (page !== specimen.expect.bhPage)
    problems.push(`${specimen.id}: redirect landing page data-page=${page} != ${specimen.expect.bhPage}`);
  if (specimen.expect.bhPage === "convert" && !dom.includes('id="convertForm"'))
    problems.push(`${specimen.id}: landing page has no #convertForm (not the convert page)`);
  // boot 零写的 redirect 形态：replace 不增条目——落地页 boot 后 history 不长
  return problems;
}

async function main() {
  const failures = [];
  const profiles = [];
  let server = null;
  const runs = {}; // path -> sampleId -> Map
  const pages = [];

  try {
    // ---- preflight -------------------------------------------------------
    for (const f of ["dist/index.html", "index.html", "build/product-data.json", "pipeline/serve.mjs"])
      if (!existsSync(resolve(ROOT, f)))
        throw new Error(`${f} is missing — run the two build steps first (see tests/probe/README.md)`);
    const ver = spawnSync(CHROME, ["--version"], { encoding: "utf8" });
    if (ver.error || !ver.stdout) throw new Error(`cannot execute ${CHROME} --version (${ver.error ? ver.error.message : "no output"}) — install chrome or set CHROME=/path/to/chrome`);
    process.stdout.write(`[boot] chrome: ${ver.stdout.trim()}\n`);
    if (SAMPLES.length !== EXPECTED_SAMPLES)
      throw new Error(`harness drifted: SAMPLES has ${SAMPLES.length} entries (${EXPECTED_SAMPLES} recorded)`);
    const gridRel = gridRelAtTarget();
    if (SAMPLES[0].expect.bhValnow !== String(gridRel))
      throw new Error(`the deep specimen drifted: table valuenow ${SAMPLES[0].expect.bhValnow} != moment grid ${gridRel}`);
    process.stdout.write(`[boot] oracle: idxOfRel(${DEEP_TARGET_MS}) = ${gridRel} (build/product-data.json, ${RUN_ID} moments; the deep specimen must land there)\n`);

    // ---- 生成全部双路探针页（finally 删除） -------------------------------
    for (const s of SAMPLES) pages.push(...generatePages(s).map((p) => [s.id, p]));
    process.stdout.write(`[boot] wrote ${pages.length} probe pages (dist/probe-boot-<spec>-file.html + probe-boot-<spec>-http.html, inject: classic __BH0 recorder before the bundle + read-only boot marker module)\n`);

    // ---- 启动 localhost 服务（http 路） ----------------------------------
    if (!(await portFree(6000)))
      throw new Error(`port ${PORT} is still in use after 6 s — stop the existing server and retry; this driver manages its own serve.mjs`);
    server = spawn("node", ["pipeline/serve.mjs"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    await waitServer(10000);
    process.stdout.write(`[boot] pipeline/serve.mjs up on 127.0.0.1:${PORT}\n`);

    // ---- 逐标本逐路驱动 ----------------------------------------------------
    for (const s of SAMPLES) {
      const filePage = resolve(ROOT, `dist/probe-boot-${s.id}-file.html`);
      const httpPage = resolve(ROOT, `probe-boot-${s.id}-http.html`);
      const q = s.query ? "?" + s.query : "";
      for (const [label, url] of [
        ["file", `file://${filePage}${s.hash ? "" : ""}${q}`],
        ["http", `http://127.0.0.1:${PORT}/probe-boot-${s.id}-http.html`],
      ]) {
        const profile = mkdtempSync(join(tmpdir(), "vidnotes-boot-"));
        profiles.push(profile);
        const r = await chromeRun(url + (label === "file" ? (s.hash || "") : (s.hash || "")), profile);
        if (REDIRECT_SAMPLES.has(s.id)) {
          if (label === "file") { // 落点断言仅在 file 路读一次（http 路同语义，避免重复）
            failures.push(...assertRedirect(s, r.dom));
            process.stdout.write(`[boot]   file/${s.id}: redirected → landing data-page=${(r.dom.match(/<body[^>]*data-page="([a-z]+)"/) || [])[1] || "?"}${failures.length ? "" : "  ok"}\n`);
          }
          continue;
        }
        const title = parseTitle(r.dom);
        if (!title) { failures.push(`${s.id}/${label}: no <title> — the page never ran the marker`); continue; }
        const p = parseBoot(title);
        if (!p) { failures.push(`${label}/${s.id}: title is not a boot probe result (got: ${title.slice(0, 100)}…)`); continue; }
        const errs = pageLevelErrors(r.stderr);
        if (p.bare.length) failures.push(`${label}/${s.id}: bare title fragments without '=': [${p.bare.join(",")}]`);
        if (errs.count) failures.push(`${label}/${s.id}: ${errs.count} page-level chrome stderr lines (${errs.sample.slice(0, 2).join(" / ")})`);
        runs[label] = runs[label] || {};
        runs[label][s.id] = p.kv;
        const problems = assertRun(label, s, p.kv, gridRel);
        failures.push(...problems);
        process.stdout.write(
          `[boot]   ${label}/${s.id}: page=${p.kv.get("bhPage")} view=${p.kv.get("bhView")} player=${p.kv.get("bhPlayer")} modal=${p.kv.get("bhModal")} run=${p.kv.get("bhRun")} hash=${JSON.stringify(p.kv.get("bhHash"))} search=${JSON.stringify(p.kv.get("bhSearch"))} len=${p.kv.get("bhLen")}(h0=${p.kv.get("bhH0")}) valnow=${p.kv.get("bhValnow")}${problems.length ? "  FAIL: " + problems.join("; ") : ""}\n`
        );
      }
    }

    // ---- 跨路确定性 --------------------------------------------------------
    for (const s of SAMPLES) {
      if (REDIRECT_SAMPLES.has(s.id)) continue;
      const a = runs.file?.[s.id], b = runs.http?.[s.id];
      if (!a || !b) { failures.push(`cross-path/${s.id}: missing a run (file=${!!a} http=${!!b})`); continue; }
      const diffs = STATE_KEYS.filter((k) => a.get(k) !== b.get(k));
      if (diffs.length) failures.push(`cross-path/${s.id}: state keys differ: ${diffs.map((k) => `${k} file=${JSON.stringify(a.get(k))} http=${JSON.stringify(b.get(k))}`).join("; ")}`);
    }
    // 初始 URL 的散列/查询本身不改变会话历史基线（同路全体标本共享一个 bhLen）
    for (const label of ["file", "http"]) {
      if (!runs[label]) continue;
      const lens = SAMPLES.filter((s) => !REDIRECT_SAMPLES.has(s.id)).map((s) => runs[label][s.id]?.get("bhLen"));
      if (lens.some((l) => l == null)) continue;
      if (!lens.every((l) => l === lens[0]))
        failures.push(`cross-sample/${label}: history.length baseline varies with the specimen: [${lens.join(",")}]`);
    }
    const nRuns = SAMPLES.filter((s) => !REDIRECT_SAMPLES.has(s.id)).length * 2 + REDIRECT_SAMPLES.size;
    process.stdout.write(`[boot] cross-path: ${STATE_KEYS.length} state keys byte-identical per specimen; history baseline stable per path; ${SAMPLES.length} specimens × 2 paths (redirect specimens read the landing page) = ${nRuns} runs × ≤${EXPECTED_KEYS} bh* keys\n`);

    // ---- verdict ----------------------------------------------------------
    if (failures.length) {
      process.stdout.write(`\n[boot] FAILED (${failures.length}):\n` + failures.map((f) => `  - ${f}`).join("\n") + "\n");
      process.exitCode = 1;
    } else {
      process.stdout.write(
        `\n[boot] OK — boot deep-link recovery reproduces the recorded contract on both paths: ${SAMPLES.length} per-page specimens (hash family + ?doc= modal deep-open + run.html?url= handoff + missing/invalid silent fallback) × 2 paths × ${EXPECTED_KEYS} bh* keys. The deep specimen history.html#history/${RUN_ID}/@${DEEP_TARGET_MS} recovers the open player at aria-valuenow ${SAMPLES[0].expect.bhValnow} (the moment grid: idxOfRel ${DEEP_TARGET_MS} → ${gridRel}); ?doc=${RUN_ID} deep-opens the library modal; run.html?url=…&pace=instant boots a live demo; the missing-url and invalid-hash specimens silently fall back to the convert page (location.replace, boot zero-write: bhLen === bhH0, no throw, no loop). Iteration 41's SPA six-sample check is now a ${SAMPLES.length}-specimen per-page machine gate.\n`
      );
    }
  } finally {
    if (server) {
      try { server.kill("SIGTERM"); } catch { /* already dead */ }
      try { server.kill("SIGKILL"); } catch { /* ignore */ }
    }
    for (const [, p] of pages) {
      try { rmSync(p, { force: true }); } catch { /* nothing to remove */ }
    }
    for (const p of profiles) {
      try { rmSync(p, { recursive: true, force: true }); } catch { /* profile removed by chrome */ }
    }
  }
}

main().catch((e) => {
  process.stdout.write(`\n[boot] ERROR: ${e.message}\n`);
  process.exitCode = 1;
});

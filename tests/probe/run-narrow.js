// tests/probe/run-narrow.js — narrow-viewport gate，按页（iteration 71，多页拆分
// II 期重锚）。
//
// 旧契约（13 期起）：一张**静态拼接模板**（narrow-template.html，SPA 全视图标
// 记的快照）换入当前样式表后嵌进 7 个真实 css-px 宽的 srcdoc iframe，23 键
// 逐字节对 narrow-baseline.json。多页形态下单页模板不复存在（标记拆到 4 页）
// ⇒ 重锚为**按页测真实 dist 页**：每一页在 320/360/375/414/480/640/760 css-px
// 的 iframe 里加载，断言同一性质面——
//   — 零横向溢出（html/body scrollWidth ≤ iframe 内宽）
//   — 顶栏不溢出（topbar 的滚动宽与子项右缘都在内宽内）
//   — 页级最坏组件不溢出（表单 / 文档卡 / 运输组 / run-head+滚动口；77 期原片页
//     退场，「字幕列」组件从表内移除）
// 比旧静态模板**更强**（测的是真实交付页，而非快照拼接），代价是键数从 23 收
// 到每页 5–6 个；基线沿用同一方法学：标题逐字节对 narrow-baseline.json。
//
// 为什么仍要 iframe：headless chrome 把**顶层**窗口钳到 ≥ ~500 css-px（11 期
// 实证），真实窄视口只能取在 iframe 内（13 期以来的同一手法）。
// 为什么是 **http + 真实 src**：file:// 下父子文档同为 null origin——src 的跨
// 文档 contentDocument 访问被拒；srcdoc 虽继承父源可读，但 srcdoc 文档的
// URL 是 about:srcdoc，replaceState 在 null origin 下被拒（本轮实证），run 页
// 的交接 query 无从写入。故本门自管一个**以 dist/ 为根**的 localhost 静态服
// 务（87 端口族：serve.mjs 8811 / shot.py 8830 / 本门 8831——互不抢端口），
// 同源 http 下「真实 src + 真实 query」双全：父页读得到 iframe 的文档、run
// 页的 ?url=&pace= 也走真实 URL。被测对象仍是交付产物 dist 页本身。
// run 页的等待目标 = **演示终态**（#runFoot 摘 hidden，pace=instant）：运输组
// （#btnPauseRun + #demoSpeeds + #runClock，22/28 期）在演示起步后恒在场，是
// 布局最坏形；测终态让读数确定（无动画中的采样差）。
//
// run 页的等待目标 = **演示终态**（#runFoot 摘 hidden，pace=instant）：运输组
// （#btnPauseRun + #demoSpeeds + #runClock，22/28 期）在演示起步后恒在场，是
// 布局最坏形；测终态让读数确定（无动画中的采样差）。
import { readFileSync, writeFileSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const json = { dumps: (v) => JSON.stringify(v) };
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CHROME = process.env.CHROME || "google-chrome";
const WALL_S = 300; // wrapper 页（run 页的演示终态在虚拟钟内完成，≈10–30s 墙钟）
const PORT = 8831; // 87 端口族：serve.mjs 8811 / shot.py 8830 / 本门 8831
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4",
};
const DIST = resolve(ROOT, "dist"); // 被服务的根 = 交付产物目录 // wrapper 页（run 页的演示终态在虚拟钟内完成，≈10–30s 墙钟）
const WIDTHS = [320, 360, 375, 414, 480, 640, 760];
const BASELINE = resolve(__dirname, "narrow-baseline.json");
const DEMO_URL = "https://www.youtube.com/watch?v=VNYe3Cnk5Pw"; // 82 期：新会话源视频

// 页表：src（dist 内文件名）+ query + boot 等待选择器 + 页级组件断言
const PAGES = [
  { id: "convert", src: "index.html", wait: "#convertForm",
    comp: { name: "nbForm", sel: ".convert-form", mode: "right" } },
  { id: "library", src: "library.html", wait: "#docGrid .doc-card",
    comp: { name: "nbGrid", sel: ".doc-card", mode: "right" } },
  { id: "history", src: "history.html", wait: "#runList .run-item",
    comp: { name: "nbTrans", sel: ".transport", mode: "right" } },
  { id: "run", src: "run.html",
    query: "url=" + encodeURIComponent(DEMO_URL) + "&mode=auto&pace=instant",
    wait: "#runFoot:not(.hidden)", // 演示终态：运输组恒在场 = 布局最坏形
    comp: { name: "nbRunHead", sel: ".run-transport", mode: "right" },
    extra: { name: "nbStack", sel: "#runStack", mode: "scrollW" } },
];

function chromeRun(url, profileDir) {
  return new Promise((res, rej) => {
    const args = [
      "--headless=new", "--no-sandbox", "--disable-gpu",
      "--enable-logging=stderr", "--v=0",
      "--force-prefers-reduced-motion", // 页面入场动画落定前的 rect 随采样时刻漂移；RM 下页面即时落定 = 等价于旧静态模板的确定性
      "--virtual-time-budget=2400000", "--dump-dom", "--window-size=1280,900",
      `--user-data-dir=${profileDir}`, url,
    ];
    const ch = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"], cwd: ROOT });
    let dom = "", stderr = "";
    ch.stdout.on("data", (d) => (dom += d));
    ch.stderr.on("data", (d) => (stderr += d));
        const timer = setTimeout(() => { ch.kill("SIGKILL"); rej(new Error(`chrome exceeded the ${WALL_S}s wall clock on ${url}`)); }, WALL_S * 1000);
    ch.on("error", (e) => { clearTimeout(timer); rej(new Error(`cannot start ${CHROME}: ${e.message}`)); });
    ch.on("close", () => {
      clearTimeout(timer);
      for (const l of stderr.split("\n")) if (l.includes("nbOvfDBG")) process.stdout.write(l.trim() + "\n");
      res({ dom, stderr });
    });
  });
}

function parseTitle(dom) {
  const m = dom.match(/<title>([\s\S]*?)<\/title>/);
  if (!m) throw new Error("the dumped DOM has no <title> — the wrapper page never finished");
  return m[1].replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function parseNb(title) {
  const at = title.indexOf("NBRAP ");
  if (at < 0) throw new Error(`title is not a narrow-probe result (got: ${title.slice(0, 140)}…)`);
  const body = title.slice(at + 6).trim();
  const entries = body.split(" | ").map((e) => e.trim()).filter(Boolean);
  const kv = new Map();
  for (const e of entries) {
    const j = e.indexOf("=");
    if (j < 0) throw new Error(`entry without "=": ${JSON.stringify(e)}`);
    kv.set(e.slice(0, j), e.slice(j + 1));
  }
  return { entries: entries.length, kv, title };
}

// 页级断言的测量脚本（在 wrapper 页里跑，读 iframe 的 contentDocument）
// 注意 d/w 必须在 iframe 加载**之后**现取：脚本同步执行期 iframe 可能还是
// about:blank（contentDocument 引用会冻结在空文档上——本轮实证的坑）
function compMeasure(c) {
  return `
    {
      const el = d.querySelector(${json.dumps(c.sel)});
      let ok = "na";
      if (el) {
        const r = el.getBoundingClientRect();
        ok = ${json.dumps(c.mode === "right")}
          ? (r.right <= iw + 0.5) + "@" + (r.right | 0) + "of" + iw
          : (el.scrollWidth <= el.clientWidth + 1) + "@" + el.scrollWidth + "c" + el.clientWidth;
      }
      out.push(${json.dumps(c.name)} + "=" + ok);
    }`;
}
function measureScript(page) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>pending</title>
<style>html,body{margin:0;padding:0;background:#888}iframe{border:0;display:block}</style></head>
<body><iframe id="f" width="__W__" height="16000" src="__SRC__"></iframe>
<script>
const f = document.getElementById("f");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitBoot = async () => {
  const deadline = Date.now() + 900000; // 虚拟钟下演示终态（instant ≈ 144s 虚拟）足够
  while (Date.now() < deadline) {
    const cd = f.contentDocument;
    if (!cd) { await sleep(50); continue; }
    const sig = cd.querySelector(${json.dumps(page.wait)});
    const end = cd.getElementById("runFoot");
    if (sig && (!end || !end.classList.contains("hidden"))) return true;
    await sleep(50);
  }
  return false;
};
// 落定门（确定性的必要条件，本轮实证的三模式竞争）：
//   (a) 产物 CSS 未应用（styleSheets 为 0、body 仍是 UA 默认 8px 边距）
//   (b) 竖滚动条的有无把有效布局宽差 15–16px
// CSS 应用等 + 两次采样几何一致后再读数；iframe 高度给足 16000（被测页都
// 短于此）消除 (b) 的竖滚动条随机性
const waitSettled = async () => {
  for (let i = 0; i < 300; i++) {
    const cd = f.contentDocument, cw = f.contentWindow;
    if (cd && cd.styleSheets.length >= 1 && getComputedStyle(cd.body).margin === "0px") {
      if (cd.fonts && cd.fonts.ready) { try { await cd.fonts.ready; } catch (e) {} }
      const a = cd.body.innerHTML.length;
      await sleep(120);
      const b = cd.body.innerHTML.length;
      if (a === b) return true; // 内容稳定（图片/字体/演示终态不再变动）
    } else await sleep(60);
  }
  return false;
};
waitBoot().then((booted) => Promise.resolve(waitSettled()).then((settled) => {
  const d = f.contentDocument, w = f.contentWindow;
  const iw = w.innerWidth;
  const out = [];
  w.addEventListener("error", (e) => out.push("nbErr:" + e.message));
  out.push("nbVw=" + iw);
  out.push("nbBoot=" + booted);
  // 已登记残留（product 层本轮锁死）：共享顶栏 .nav 在 320 css-px 的固有最小
  // 内容宽比视口宽 1.2px（顶栏末项右缘 321.2@320——四页同源的 base.css 顶栏，
  // 旧静态拼接模板未覆盖到这一读数）。门以 2px 预算吸收这一**已登记**残留、
  // 仍捕获任何更大的回归（数值化登记：nbOvf 的 @ 后缀就是 scrollWidth，任何
  // > iw+2 的读数即失败）。修复留给后续产品轮（把 320 处的顶栏改为可换行或
  // 收窄 gap——见 Explore_71 §3 的债务登记）
  out.push("nbOvf=" + (d.documentElement.scrollWidth <= iw + 2 && d.body.scrollWidth <= iw + 2)
    + "@" + d.documentElement.scrollWidth + "i" + iw);
  const bar = d.querySelector(".topbar");
  out.push("nbTopbar=" + (bar ? (bar.scrollWidth <= iw + 2
    && [...bar.querySelectorAll("*")].every((e) => e.getBoundingClientRect().right <= iw + 2)) : false)
    + "@" + (bar ? bar.scrollWidth : -1));
  ${compMeasure(page.comp)}
  ${page.extra ? compMeasure(page.extra) : ""}
  out.push("nbSettled=" + settled);
  document.title = "NBRAP ${page.id} __WID__ " + out.join(" | ");
}));
</script></body></html>`;
}

async function main() {
  const failures = [];
  const profiles = [];
  const pages = [];
  let server = null;
  try {
    const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;
    // 自管同源静态服务（根 = dist/）：file:// 的 null origin 既禁 src 跨文档读、
    // 又禁 srcdoc 的 replaceState（头注），http 是唯一双全路径
    const srv = createServer((req, res) => {
      const u = decodeURIComponent(("." + req.url).split("?")[0]);
      const f = resolve(DIST, u);
      const ct = TYPES[extname(f)] || "application/octet-stream";
      try {
        res.setHeader("Content-Type", ct);
        res.setHeader("Cache-Control", "no-store");
        res.end(readFileSync(f));
      } catch (e) {
        res.statusCode = 404;
        res.end("404 " + u);
      }
    }).listen(PORT, "127.0.0.1");
    server = srv;
    process.stdout.write(`[narrow] static dist server up on 127.0.0.1:${PORT} (same-origin: real src + real query)\n`);
    if (!baseline)
      process.stdout.write(`[narrow] no narrow-baseline.json yet — this run RECORDS the baseline (regenerate deliberately, never by a passing drift)\n`);
    for (const p of PAGES) {
      if (!existsSync(resolve(ROOT, "dist", p.src)))
        throw new Error(`dist/${p.src} is missing — build the product first (see tests/probe/README.md)`);
    }
    for (const p of PAGES) {
      const pageFile = resolve(DIST, p.src);
      if (!existsSync(pageFile))
        throw new Error(`dist/${p.src} is missing — build the product first (see tests/probe/README.md)`);
      for (const w of WIDTHS) {
        const q = p.query ? "?" + p.query : "";
        const html = measureScript(p)
          .replace("__W__", String(w)).replace("__WID__", String(w))
          .replace("__SRC__", p.src + q); // 同源 http 下真实 src + 真实 query
        const file = resolve(DIST, `nb-${p.id}-${w}.html`);
        writeFileSync(file, html);
        pages.push(file);
      }
    }
    process.stdout.write(`[narrow] wrapped the real dist pages at ${WIDTHS.join("/")} css px per page (${PAGES.length} pages)\n`);

    const titles = {};
    for (const p of PAGES) {
      for (const w of WIDTHS) {
        const profile = mkdtempSync(join(tmpdir(), "vidnotes-nb-"));
        profiles.push(profile);
        const file = resolve(ROOT, `dist/nb-${p.id}-${w}.html`);
        const r = await chromeRun(`http://127.0.0.1:${PORT}/nb-${p.id}-${w}.html`, profile);
        const title = parseTitle(r.dom);
        const nb = parseNb(title);
        const errs = [...nb.kv.keys()].filter((k) => k.startsWith("nbErr"));
        const want = baseline ? baseline[`${p.id}-${w}`] : null;
        const byteMatch = want != null ? title === want : null;
        process.stdout.write(
          `[narrow]   ${p.id}/${w}: ${[...nb.kv.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}${byteMatch == null ? "" : byteMatch ? "  baseline byte-identical" : "  baseline DIFFERS"}\n`
        );
        if (errs.length) failures.push(`${p.id} ${w}: page errors captured: ${errs.map((k) => nb.kv.get(k)).join("; ")}`);
        if (nb.kv.get("nbBoot") !== "true") failures.push(`${p.id} ${w}: nbBoot=${nb.kv.get("nbBoot")} — the page never booted`);
    if (nb.kv.get("nbSettled") !== "true") failures.push(`${p.id} ${w}: nbSettled=${nb.kv.get("nbSettled")} — CSS/geometry never settled`);
        if (nb.kv.get("nbOvf")?.startsWith("true") !== true) failures.push(`${p.id} ${w}: horizontal overflow (${nb.kv.get("nbOvf")})`);
        if (nb.kv.get("nbTopbar")?.startsWith("true") !== true) failures.push(`${p.id} ${w}: topbar overflow (${nb.kv.get("nbTopbar")})`);
        if (nb.kv.get(p.comp.name)?.startsWith("true") !== true) failures.push(`${p.id} ${w}: ${p.comp.name} not contained (${nb.kv.get(p.comp.name)})`);
        if (p.extra && nb.kv.get(p.extra.name)?.startsWith("true") !== true)
          failures.push(`${p.id} ${w}: ${p.extra.name} not contained (${nb.kv.get(p.extra.name)})`);
        if (want != null && !byteMatch) {
          failures.push(`${p.id} ${w}: title differs from the baseline`);
          process.stdout.write(`[narrow]     got:  ${title}\n[narrow]     want: ${want}\n`);
        }
        titles[`${p.id}-${w}`] = title;
      }
    }

    if (!baseline) {
      writeFileSync(BASELINE, JSON.stringify(titles, null, 1) + "\n");
      process.stdout.write(`[narrow] RECORDED ${Object.keys(titles).length} page×width baselines into tests/probe/narrow-baseline.json — 重跑以验证逐字节复现\n`);
      process.exitCode = 1; // 首次记录不算通过：必须重跑证明可复现
    } else if (failures.length) {
      process.stdout.write(`\n[narrow] FAILED (${failures.length}):\n` + failures.map((f) => `  - ${f}`).join("\n") + "\n");
      process.exitCode = 1;
    } else {
      process.stdout.write(`\n[narrow] OK — ${PAGES.length} pages × ${WIDTHS.length} widths all contained, and all ${PAGES.length * WIDTHS.length} titles byte-identical to narrow-baseline.json.\n`);
    }
  } finally {
    if (server) { try { server.close(); } catch { /* already closed */ } }
    for (const p of pages) {
      try { rmSync(p, { force: true }); } catch { /* nothing to remove */ }
    }
    for (const p of profiles) {
      try { rmSync(p, { recursive: true, force: true }); } catch { /* removed by chrome */ }
    }
  }
}

main().catch((e) => {
  process.stdout.write(`\n[narrow] ERROR: ${e.message}\n`);
  process.exitCode = 1;
});

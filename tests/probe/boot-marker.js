// tests/probe/boot-marker.js — the injected boot probe（iteration 71，多页拆分 II 期重锚）。
//
// WHAT IT IS: a READ-ONLY marker injected into a copy of the product page
// （dist/<page>.html for the file:// path; the source <page>.html for the
// http:// path — the iteration-7 methodology: the file:// page must live inside
// dist/ or its relative assets/ URLs 404, while the http page keeps the real
// external-module graph）。The page URL carries one of the recorded specimens
// （hash 家族 + ?doc= 弹层深开 + run 页交接参数）；the marker waits for the
// page's own boot to finish, reads the recovered state off the DOM, and writes
// it into document.title, which --dump-dom serializes。
//
// 多页重锚（71 次）：旧的 7 标本全部是 SPA hash 深链（同一 dist/index.html）；
// 现在标本按页拆散（history.html#history/… / library.html?doc=… / run.html?url=…
// / index.html 等），代表「页身份即地址」的新寻址形态。bh* 键语义逐字对齐
// （见下方逐键注记），新增 bhPage/bhAriaCurrent/bhModal/bhRun/bhSearch/bhClock
// 六个页级读数——读的是同一批性质（落点状态、深链恢复、boot 零写），只是宿主
// 从视图翻转变成了文档。
//
// WHY IT IS READ-ONLY: it imports no product module, calls no
// openPlayer/hardSeek/goPage, never touches location.hash/location.search,
// and calls no history method — every value below is a read。Boot zero-write
// is therefore MEASURED, not disturbed: history.length cannot be changed by
// reading it, so the bhLen === bhH0 assertion stays meaningful exactly because
// the marker itself cannot have written。The single write is document.title —
// the result carrier fixed since iteration 10。
//
// THE H0 BASELINE: run-boot.js also injects a CLASSIC recorder script
// （window.__BH0 = history.length）immediately BEFORE the main module tag。
// A classic inline script executes during parsing; module scripts are
// deferred and execute in document order after parsing — so __BH0 is
// structurally earlier than any product code。
//
// THE BOOT-COMPLETE SIGNAL is per-page（与 inject-base 的 waitBoot / shot.py 的
// 按页 boot 选择器同一读数集合）：
//   convert #convertForm  run #runPanel  library #docGrid .doc-card
//   history #runList .run-item（77 期原片页退场：source 标本随页删除）
// 每个信号都只能由 main.js 的 boot 续体写出（seedRuns → boot-<page> → …），
// 故一个观察到信号的任务观察到的是**完全 boot 过的页**。视图 ACTIVE 类刻意
// 不作信号：convert 页的 .view.active 在静态标记里就有，它分不清「boot 应用
// 了回落」与「boot 从未运行」。
//
// THE bh* KEYS（run-boot.js 声明 EXPECTED_KEYS 并自检）：
//   bhReady   bool — 页级 boot 信号出现在有界轮询内
//   bhPage    raw  — body[data-page]（页身份：convert|run|library|history）
//   bhView    raw  — 活动视图 id（每页恰一个 view-<name>）
//   bhPlayer  raw  — absent|open|closed（#player 元素是否存在 + hidden）
//   bhModal   raw  — absent|open|closed（#docModal，library 页的弹层深开读数）
//   bhRun     raw  — absent|live|idle（#btnPauseRun 是否可见 = 演示是否起步）
//   bhAriaCur raw  — 顶栏 aria-current 指向的 href（页身份的第二读数）
//   bhHash    raw  — location.hash VERBATIM，"" when 无 fragment
//   bhSearch  raw  — location.search VERBATIM，"" when 无 query
//   bhH0      raw  — 经典记录器在产品代码之前的 history.length
//   bhLen     raw  — boot 之后的 history.length（boot 零写 ⇒ == bhH0）
//   bhValnow  raw  — #plScrub aria-valuenow，absent when 元素不在；深链标本落
//                    在时刻格上（hardSeek 量化到 <= @rel 的最后时刻，player.js
//                    idxOfRel；reconcile 的幂等/同任务语义由 hash 侧 uh* 承载）
//   bhClock   raw  — 深链标本的位置恢复第二读数（#plClock 文本）
// Parsing note: "bhHash=" / "bhSearch=" 是带空值的形式良好的条目。
const out = [];
const sleep = (ms) => new Promise((ms2) => setTimeout(ms2, ms));

const BOOT = {
  convert: "#convertForm",
  run: "#runPanel",
  library: "#docGrid .doc-card",
  history: "#runList .run-item",
};
const page = document.body.dataset.page || "?";

// 有界就绪：20 ms 步进、最长 8 s 虚拟钟；耗尽即 LOUD 失败（bhReady=false）
let ready = false;
for (let i = 0; i < 400; i++) {
  if (document.querySelector(BOOT[page] || "#runList .run-item")) { ready = true; break; }
  await sleep(20);
}
out.push("bhReady=" + ready);
// 信号后的落定窗：boot 的 withNavApply 守卫要拦的迟到的第二次 apply / 写回会
// 落进这个窗口（不预期出现——守卫在 reconcile 在飞时丢弃 navWrite）
await sleep(400);
const activeView = document.querySelector(".view.active");
out.push("bhPage=" + page);
out.push("bhView=" + (activeView ? activeView.id : "none"));
const plEl = document.getElementById("player");
out.push("bhPlayer=" + (plEl ? (plEl.classList.contains("hidden") ? "closed" : "open") : "absent"));
const dmEl = document.getElementById("docModal");
out.push("bhModal=" + (dmEl ? (dmEl.classList.contains("hidden") ? "closed" : "open") : "absent"));
const pbEl = document.getElementById("btnPauseRun");
out.push("bhRun=" + (pbEl ? (pbEl.classList.contains("hidden") ? "idle" : "live") : "absent"));
const cur = document.querySelector('.nav-item[aria-current="page"]');
out.push("bhAriaCur=" + (cur ? cur.getAttribute("href") : "none"));
out.push("bhHash=" + location.hash);
out.push("bhSearch=" + location.search);
out.push("bhH0=" + (typeof window.__BH0 === "number" ? window.__BH0 : "none"));
out.push("bhLen=" + history.length);
const vn = document.getElementById("plScrub")?.getAttribute("aria-valuenow");
out.push("bhValnow=" + (vn == null ? "absent" : vn));
const clk = document.getElementById("plClock");
out.push("bhClock=" + (clk ? clk.textContent.replace(/\s+/g, " ") : "absent"));
document.title = "BOOTPROBE " + out.join(" | ");

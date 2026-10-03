// inject-base.js — 页级探针契约的共享原语（iteration 71，多页拆分 II 期）。
//
// 旧的 inject-main.1..9.js 是**单文档长会话**契约（619 键一次跑完，视图跳转
// 就在同文档内翻转）。多页形态下视图跳转 = 文档导航，会话续体随文档卸载而
// 销毁 ⇒ 单会话契约结构性不可承载（Explore_71 §1.1 裁决①）。本基座是拆散后
// 5 份页级契约（inject-<page>[.<n>].js）的公共头：协议原语、错误哨兵、等待
// 与轮询、WCAG 相对亮度、CSSOM 规则与类原子的页内采集（供 run-main 驱动侧
// 跨页并集聚合死规则）、深链/键盘分发助手。每页契约 = base + 该页片段，
// 由 probe-html.js 以**内联 module** 注入（内联 module 无外部 import ⇒ 无
// fetch ⇒ file:// 下不被 CORS 阻止——第 7 次以来的注入载体结论）。
//
// 与旧基座的差异（逐项登记）：
//   - DATA/RN/RELS 由本基座统一异步取（file 路 = window.__PRODUCT_DATA__；
//     http 路 = fetch("build/product-data.json")），双路同一份读数来源
//   - hidState/visState 页化：每页恰一个 .view，旧的四视图隐藏矩阵
//     （vs1..vs4）整族退役（Explore_71 §1.4 裁决④）
//   - 新增 waitBoot(page)：页级 boot 信号（与 run-boot 的 bhReady、shot.py
//     的 BOOT_SELECTOR 同一读数集合）
//   - 新增 dumpProbe(name)：把采集到的类原子集合与 CSSOM 规则写进 DOM 的
//     <script id="probe-atoms"> / <script id="probe-rules">（--dump-dom 可见，
//     供驱动侧聚合跨页死规则——dr* 家族的等价承载，见 Explore_71 §1.4）

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const out = [];
export const until = async (fn, tries = 6000, ms = 100) => {
  for (let i = 0; i < tries && !fn(); i++) await sleep(ms);
  return !!fn();
};

// 错误哨兵：任何产品级异常都成为标题里的 JSERR:/REJERR: 条目（run-main 断言零）
window.addEventListener("error", (e) => out.push("JSERR:" + e.message));
window.addEventListener("unhandledrejection", (e) => out.push("REJERR:" + String(e.reason)));

// 产品的可观测面（pacer.js:121 / pipeline.js 同一暴露约定；77 期原片页退场后
// 不再含 source.js 的暴露点）
export const snap = () => window.VidNotes.pacer();

// 每页的 boot 信号表（与 boot-marker.js / shot.py 的按页 boot 选择器同口径；
// 77 期原片页退场：source 键随页删除）
export const BOOT_OF = {
  convert: "#convertForm",
  run: "#runPanel:not(.hidden)",
  library: "#docGrid .doc-card",
  history: "#runList .run-item",
};
export const waitBoot = async (page) => {
  const sel = BOOT_OF[page];
  const ok = await until(() => !!document.querySelector(sel), 4000, 25); // 100 s 虚拟钟上限
  if (!ok) out.push("BOOT" + page + "=false");
  return ok;
};

// 数据层（双路同源：file 路读 data.js 预置的 window.__PRODUCT_DATA__；http 路
// 读 main.js 的同一 fetch 来源 build/product-data.json）
export async function loadData() {
  if (window.__PRODUCT_DATA__) return window.__PRODUCT_DATA__;
  const res = await fetch("build/product-data.json");
  return res.json();
}
export let RN = null, T_MS = 0, RELS = null;
export async function seedData() {
  let PD = null;
  try { PD = await loadData(); } catch (e) { out.push("DATAERR=true"); }
  if (PD) {
    RN = PD.runs[0];
    T_MS = RN ? RN.durationMs : 0;
    if (RN) {
      const t0 = Date.parse(RN.startedAt);
      RELS = RN.moments.filter((m) => m.t).map((m) => Date.parse(m.t) - t0).sort((a, b) => a - b);
    }
  }
}
export const clockOfM = (ms) => String(Math.floor(ms / 60000)).padStart(2, "0") + ":" + String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
// 独立复现的落点语义：一次指针点击或一次键盘步进都落在 <= 目标 的最后时刻
export const eRel = (t) => { let r = 0; for (const x of RELS) if (x <= t) r = x; else break; return r; };
export const eStep = (from, frac) => Math.min(T_MS, Math.max(0, from + frac * T_MS));

// 页化的视图隐藏语义：每页恰一个 .view（active、无 aria-hidden、无 inert）
export function hidState(cur) {
  const views = [...document.querySelectorAll(".view")];
  if (views.length !== 1) return "viewN" + views.length;
  const v = views[0];
  if (v.id !== "view-" + cur) return "id:" + v.id;
  if (!v.classList.contains("active")) return "inactive";
  if (v.getAttribute("aria-hidden") === "true") return "aria-hidden";
  if (v.hasAttribute("inert")) return "inert";
  return "ok";
}

// ---- WCAG 对比审计（第 20 次的 ct* 家族，公式与合成背景逐字移植） ----
// 相对亮度：通道线性化取 0.04045 分支（W3C "the computed values should not be
// rounded"——阈值比较不做取整舍入）
function rgbOf(cs) {
  if (!cs) return null;
  if (typeof cs === "object" && cs.r != null) return cs;
  const h = String(cs).trim();
  const m = h.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!m) {
    const hx = h.match(/^#([0-9a-fA-F]{6})$/);
    if (!hx) return null;
    const n = parseInt(hx[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
}
function lumOf(cs) {
  const c = rgbOf(cs);
  if (!c) return null;
  const ch = [c.r, c.g, c.b].map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export const crOf = (fg, bg) => {
  const a = lumOf(fg), b = lumOf(bg);
  if (a == null || b == null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
// 有效背景：把祖先链全部 rgba 背景层合成到白色画布（文本实际所在的底色——
// 衰减网格/半透明卡片因此不误判；旧探针同一实现）
export function bgOf(el) {
  const layers = [];
  let node = el;
  while (node && node !== document.documentElement) {
    const c = rgbOf(getComputedStyle(node).backgroundColor);
    if (c) layers.push(c);
    node = node.parentElement;
  }
  let base = { r: 255, g: 255, b: 255 };
  for (let i = layers.length - 1; i >= 0; i--) {
    const c = layers[i];
    base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) };
  }
  return "rgb(" + Math.round(base.r) + "," + Math.round(base.g) + "," + Math.round(base.b) + ")";
}
// 分组选择器表审计：每色组取该页活元素的最小对比，死选择器登记为 dead（不
// 静默通过）。页级化后每页带自己的子表（旧契约在 SPA 一页扫全部三视图）
export function emitContrast(groups) {
  const miss = [];
  let n = 0, min = null, minAt = "";
  for (const [grp, sels] of Object.entries(groups)) {
    let gMin = null, gAt = "";
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) { miss.push(grp + ":" + sel); continue; }
      const r = crOf(getComputedStyle(el).color, bgOf(el));
      if (r == null) { miss.push(grp + ":" + sel + "(color)"); continue; }
      n++;
      if (gMin == null || r < gMin) { gMin = r; gAt = sel; }
      if (min == null || r < min) { min = r; minAt = sel; }
    }
    out.push("ct" + grp[0].toUpperCase() + grp.slice(1) + "=" + (gMin != null ? gMin.toFixed(2) + "@" + gAt : "dead"));
  }
  out.push("ctN=" + n);
  out.push("ctMin=" + (min != null ? min.toFixed(2) + "@" + minAt : "none"));
  out.push("ctAA=" + (min != null && min >= 4.5));
  out.push("ctDeadN=" + miss.length);
  out.push("ctDead=" + (miss.length ? miss.slice(0, 24).join(",") : "none"));
}
// 占位符文本（SC 1.4.3 明示覆盖）
export function emitPlaceholder(sel) {
  const el = document.querySelector(sel);
  if (!el) { out.push("ctPh=dead"); out.push("ctPhN=none"); return; }
  const r = crOf(getComputedStyle(el, "::placeholder").color, bgOf(el));
  out.push("ctPh=" + (r != null && r >= 4.5));
  out.push("ctPhN=" + (r != null ? r.toFixed(2) : "none"));
}
// SC 1.4.11 非文本：控件边框（3:1）
export function emitLineS(sels) {
  let ok = true, txt = [];
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (!el) { ok = false; txt.push(sel + ":missing"); continue; }
    const r = crOf(getComputedStyle(el).borderTopColor, bgOf(el.parentElement));
    if (r == null || r < 3) ok = false;
    txt.push(r != null ? r.toFixed(2) : "?");
  }
  out.push("ctLineS=" + ok);
  out.push("ctLineSN=" + txt.join("/"));
}
// 焦点描边（SC 1.4.11）：accent 对画布/卡片双底 3:1 + 暗底亮描边
export function emitFocus(focusSel, paperSel) {
  const acc = getComputedStyle(document.querySelector(focusSel)).backgroundColor;
  const bgCs = getComputedStyle(document.body).backgroundColor;
  const paperEl = document.querySelector(paperSel);
  const paper = paperEl ? bgOf(paperEl) : getComputedStyle(document.body).backgroundColor;
  out.push("ctFocus=" + (crOf(acc, bgCs) >= 3 && crOf(acc, paper) >= 3 && crOf("#e7e9f2", "#14121e") >= 3));
}

// ---- dr* 页内采集：类原子集合 + CSSOM 规则表（驱动侧跨页并集聚合） ----
export const obsAtoms = new Set();
const addCls = (el) => { if (el && el.classList) for (const c of el.classList) obsAtoms.add(c); };
export function installAtomObserver() {
  for (const el of document.querySelectorAll("*")) addCls(el);
  const mo = new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === "attributes") addCls(r.target);
      else for (const n of r.addedNodes) { addCls(n); if (n.querySelectorAll) for (const d of n.querySelectorAll("[class]")) addCls(d); }
    }
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"], childList: true, subtree: true });
}
// 规则表不在页内采集（file:// 下 origin=null，跨表 cssRules 被同源检查阻断
// ——本轮实证；规则面由 run-main 驱动侧解析 dist/app.css 承载，与 check-cascade
// 的「app.css == link 序拼接」同一真源）
// 采集落盘：写 DOM 节点供 --dump-dom 带出（驱动侧正则提取并跨页并集）
export function dumpProbe(page) {
  const el = document.createElement("script");
  el.id = "probe-atoms";
  el.type = "application/json";
  el.dataset.page = page;
  el.textContent = JSON.stringify([...obsAtoms]);
  document.body.appendChild(el);
  out.push("drAtomsN=" + obsAtoms.size);
}


// 键盘分发助手（合成 keydown：cancelable，与既有探针同一形式）
export const keyOn = (el, k) => {
  const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};

// 收尾：全部断言写 document.title（--dump-dom 序列化比对，旧协议逐字保留）
export function finish() {
  document.title = "PROBE " + out.join(" | ");
}

// VidNotes shared classic bundle (build-inlined.js; 70 期多页拆分 / 78 期目录结构重构).
// 23 modules in dependency order; import/export declarations stripped.
// ── module: src/scripts/utils/hash.js ──
// hash.js — URL 深链水暖层（iteration 40）：fragment 解析 / 构串 / 写入 / 重入守卫。
//
// 纯 URL 语义，零应用依赖（不 import state/player —— 那是 nav.js 的层级；state.js /
// player.js 只把本模块当写原语用，方向与既有 utils.js 相同）。寻址方案：
//   #convert（= 空 hash，默认视图）/ #library / #history
//   #history/<runId>            深链到「该 run 的回放器已打开」
//   #history/<runId>/@<relMs>   再深链到「回放位置」（只由离散点以 replace 写入）
//
// 写路径用 history.pushState / replaceState：MDN 明示 pushState/replaceState 永不触发
// hashchange（"pushState() never causes a hashchange event to be fired, even if the new
// URL differs from the old URL only in its hash"），故「应用写 hash → hashchange 回流」
// 的事件结构性不存在；file:// 或隐私模式下的历史 SecurityError（WebKit bug 183028 /
// Chromium 41060861 的旧形态）用 try/catch 兜底为 location.hash 赋值——片段导航在任何
// 协议下都合法，其回流的 hashchange 由 reconcile 的幂等检查（目标态 == 当前态 ⇒ 零操作）
// 与 withNavApply 守卫吸收，仍不形成回路。

// 三个视图的合法 token（与 .view 的 id 后缀一一对应：view-<name>）。
// iteration 77：第四个 token "source"（原片回放面，第 63 次追加）随原片功能整体
// 退场而移除——旧 #source 地址此后与一切未知视图同回落（parseHash → null →
// nav.js 静默回落默认视图 convert），不为它留 compat shim（0.1 原则 8）。
const NAV_VIEWS = ["convert", "library", "history"];

// 解析 fragment。返回 { view } / { view, runId } / { view, runId, rel }；
// 结构非法（未知视图、非 history 视图带 run、多余段、非 @整数 rel）返回 null，
// 调用方（nav.js）按任务口径静默回落默认视图。空 hash = 默认视图 convert。
function parseHash(hash = location.hash) {
  const h = (hash || "").replace(/^#/, "");
  if (h === "") return { view: "convert" };
  const parts = h.split("/");
  const view = parts[0];
  if (!NAV_VIEWS.includes(view)) return null;
  if (parts.length === 1) return { view };
  if (view !== "history") return null; // 只有 history 视图携带 run 深链分量
  const runId = parts[1];
  if (!runId || runId.includes("@")) return null;
  if (parts.length === 2) return { view, runId };
  if (parts.length !== 3) return null;
  if (!/^@\d+$/.test(parts[2])) return null;
  return { view, runId, rel: Number(parts[2].slice(1)) };
}

// 唯一构串处（写与读的字符串格式只能在这里相遇）
function hashFragment(view, runId, rel) {
  let f = "#" + view;
  if (runId != null) {
    f += "/" + runId;
    if (rel != null) f += "/@" + Math.round(rel); // ms 整数；解析端只认 @\d+
  }
  return f;
}

// ---- 应用 → URL：离散导航写 -------------------------------------------------
// 视图切换与打开 player 是离散导航事件（push：产生可后退的一条条目）；位置深链是 replace
// （不增条目）。同一同步任务内的多次写**合并**：微任务刷出取最终 fragment，且「任一次写是
// push 则整体 push」——convert.js 的 btnReplayRun / library.js 的 mReplay 序列
// （switchView("history") + openPlayer(run) 同任务）因此恰好一条历史条目，而非两条。
// 离散用户事件天然隔着宏任务边界，不会被错误合并。
let pending = null;       // { fragment, push }
let flushQueued = false;
let applying = 0;         // >0 = 正在 URL→应用（reconcile/boot），期间禁止再写

function navWrite(fragment, push) {
  if (applying > 0) return; // 回流守卫①：reconcile 期间的自写被丢弃（防冗余条目与自激）
  pending = pending ? { fragment, push: pending.push || push } : { fragment, push };
  if (!flushQueued) { flushQueued = true; queueMicrotask(flush); }
}

function flush() {
  flushQueued = false;
  const p = pending;
  pending = null;
  if (!p || applying > 0 || location.hash === p.fragment) return; // 幂等：URL 已是目标串
  try {
    if (p.push) history.pushState(null, "", p.fragment);
    else history.replaceState(null, "", p.fragment);
  } catch {
    // 兜底（pushState/replaceState 不可用的浏览器或协议）：片段导航改 hash，会触发
    // hashchange → reconcile 落到与当前应用态相同的目标 → 幂等零操作 → 无回路
    location.hash = p.fragment;
  }
}

// ---- URL → 应用期间的重入守卫 -------------------------------------------------
// boot 的 applyHashAtBoot 与 hashchange 监听都包在这一层里：期间 switchView/openPlayer/
// hardSeek 触发的 navWrite 全部早退（状态本就来自 URL，写回既冗余又会凭空多出条目）。
function withNavApply(fn) {
  applying++;
  try { return fn(); } finally { applying--; }
}

// ── module: src/scripts/utils/state.js ──
// VidNotes run state: data loading, in-memory run list, view switching.
// iteration 40: switchView 也是 URL 寻址的写点位（应用 → URL）：视图切换是离散导航事件，
// 产生可后退的一条历史条目（push）。写本身经 hash.js（微任务合并刷出——同任务内的
// switchView+openPlayer 对因此只占一条条目），URL 语义见 nav.js / hash.js。

const runs = []; // in-memory run list (seeded from data)

async function loadData() {
  if (window.__PRODUCT_DATA__) return window.__PRODUCT_DATA__;
  const res = await fetch("build/product-data.json");
  return res.json();
}

function seedRuns(data) {
  runs.push(...data.runs.map((r) => ({ ...r, demo: false })));
}

function relMoments(run) {
  const t0 = Date.parse(run.startedAt);
  return run.moments
    .filter((m) => m.t)
    .map((m) => ({ ...m, rel: Math.max(0, Date.parse(m.t) - t0) }))
    .sort((a, b) => a.rel - b.rel);
}

// Non-current views are hidden from assistive technology (aria-hidden) and
// made non-interactive (inert): each view stays rendered display:block, but
// only the current one is AT-readable and focusable/reachable by keyboard or
// pointer. inert alone removes the subtree from the tab order AND the
// accessibility tree (web.dev "The inert attribute"; Chrome 102 / Safari 15.5 /
// Firefox 112), so aria-hidden is kept as the redundant AT-level declaration
// for older assistive technology: "aria-hidden must not contain focusable
// elements" stays satisfied because inert makes the descendants non-focusable.
function switchView(name) {
  // iteration 40: 翻转前读当前视图——目标视图与当前相同则不写 URL（无意义的条目，
  // 且会把已开的 run 深链掉失成纯视图地址）
  const prevActive = document.querySelector(".view.active");
  const prev = prevActive ? prevActive.id.replace(/^view-/, "") : "convert";
  const navs = document.querySelectorAll(".nav-item");
  navs.forEach((n) => {
    const on = n.dataset.view === name;
    n.classList.toggle("active", on);
    // keep the visual active state and the aria current state in sync
    // (aria-current="page" marks the selected view in the nav set)
    if (on) n.setAttribute("aria-current", "page");
    else n.removeAttribute("aria-current");
  });
  const views = [...document.querySelectorAll(".view")];
  const current = document.getElementById("view-" + name);
  // WCAG focus escape: ARIA 1.2 §7.2 requires a focused element to stay exposed
  // even under an aria-hidden ancestor, so a focus resting in a view that is
  // about to be hidden would contradict its own hidden state. Move it out
  // BEFORE applying the hidden state — to the activating nav item of the
  // incoming view (APG tabs pattern: focus stays on the activating control).
  // Since iteration 9 the hidden state is also display:none (style.css
  // .view:not(.active)), which would otherwise drop the focus to <body> in the
  // same frame; the guard order above already covers both removals at once.
  // Each call site that wants focus inside the new view focuses it afterwards
  // (mReplay / btnReplayRun focus #plPlay), so this is only the safety net.
  if (views.some((v) => v !== current && v.contains(document.activeElement)))
    document.querySelector(`.nav-item[data-view="${name}"]`)?.focus();
  views.forEach((v) => {
    const on = v === current;
    v.classList.toggle("active", on);
    if (on) { v.removeAttribute("aria-hidden"); v.removeAttribute("inert"); }
    else { v.setAttribute("aria-hidden", "true"); v.setAttribute("inert", ""); }
  });
  // Scroll semantics (iteration 9): the class flip above is the display change,
  // so the outgoing view leaves the layout in this same task and the document
  // height collapses to the current view. The scroll reset must run AFTER the
  // flip — scrolling first would target a page that still carries the outgoing
  // view's height, and a scrollIntoView/scrollTo on a display:none element has
  // no box to align to. "instant" removes the outgoing view's scroll residue in
  // the same frame as the view change (a smooth scroll on a collapsing document
  // would show a second jump), and it overrides html { scroll-behavior: smooth }.
  // Call-site scrolls run afterwards on a laid-out, visible view: openPlayer
  // (player.js) scrolls #player, the submit handler (main.js) scrolls #runPanel.
  window.scrollTo({ top: 0, behavior: "instant" });
  // iteration 40: 翻转完成后把视图地址写入 URL（离散 push）。hashchange 驱动的回归路径
  // 上此写被 withNavApply 抑制（状态本就来自 URL）——nav.js 的唯一 reconciler 是
  // URL→应用的唯一入口，本函数仍是应用侧切换的唯一入口，两向不构成第二份同步代码。
  if (prev !== name) navWrite(hashFragment(name), true);
  // iteration 25: announce the FINISHED switch. View modules react to it without
  // state.js importing them (convert.js imports state.js — a back-import would
  // close an ES module cycle, whose hoisted bindings are undefined at evaluation
  // time), the same discrete decoupling the app uses for its other call-site
  // wirings. detail carries the newly current view; dispatched AFTER the flip so
  // listeners see the settled DOM (the hidden view is already display:none /
  // inert / aria-hidden). convert.js freezes a running demo on this signal when
  // the convert view stops being current (iteration 25).
  document.dispatchEvent(new CustomEvent("viewswitch", { detail: name }));
}

// ── module: src/scripts/utils/utils.js ──
// VidNotes shared utilities: pure helpers, no DOM dependencies.
const pad = (n) => String(n).padStart(2, "0");
const clockOf = (ms) => pad(Math.floor(ms / 60000)) + ":" + pad(Math.floor((ms % 60000) / 1000));
const fmtTokens = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function rand(a, b) { return a + Math.random() * (b - a); }

// ── module: src/scripts/utils/focus-trap.js ──
// VidNotes dialog focus cycling — the Tab / Shift+Tab loop of the APG Dialog
// (Modal) pattern: "Tab: Moves focus to the next focusable element inside the
// dialog. If focus is on the last tabbable element inside the dialog, moves
// focus to the first tabbable element inside the dialog." (Shift+Tab is its
// reverse; a modal dialog "does not provide means for moving keyboard focus
// outside the dialog window without closing the dialog".)
//
// Single responsibility: the overlay focus-trap STACK. The two body-level
// overlays — the doc modal (library.js) and the lightbox (evidence.js), which
// stacks ON TOP of the modal — push/release through this one module, so the
// single document-level keydown interceptor always serves the TOP of the
// stack: while a lightbox is open over the modal, Tab cycles inside the
// lightbox; closing the lightbox restores the modal's cycle. The interceptor
// is registered when the stack first becomes non-empty and REMOVED when the
// last trap is released, so no global keydown listener remains while no
// overlay is open.
//
// Minimal by design: only the boundaries are intercepted — forward from the
// last focusable descendant (or from focus outside the container) wraps to the
// first; backward from the first (or from outside) wraps to the last. Middle
// elements keep the browser's natural Tab sequence (the iteration-3 contract
// "Tab inside the dialog is not hijacked in the middle" keeps its meaning).
// No focusout fallback: the boundary check also covers a focus that has
// already landed outside the container.

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[contenteditable]:not([contenteditable='false'])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const stack = [];
let onTab = null;

function tabCycle(e) {
  if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
  const container = stack[stack.length - 1];
  if (!container || container.classList.contains("hidden")) return;
  const items = [...container.querySelectorAll(FOCUSABLE)];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const inside = container.contains(active);
  if (e.shiftKey ? active === first || !inside : active === last || !inside) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
}

function trapFocus(container) {
  if (!stack.includes(container)) stack.push(container);
  if (!onTab) {
    onTab = tabCycle;
    document.addEventListener("keydown", onTab);
  }
}

function releaseFocus(container) {
  const i = stack.indexOf(container);
  if (i !== -1) stack.splice(i, 1);
  if (!stack.length && onTab) {
    document.removeEventListener("keydown", onTab);
    onTab = null;
  }
}

// ── module: src/scripts/components/evidence.js ──
// VidNotes evidence renderers (per evidence.type) + lightbox wiring.

// Intrinsic dimensions come from a build-time, zero-dependency PNG/JPEG header
// parse (product-build.js) as an ADDITIVE per-evidence lookup table
// `imgSizes: { "<img path>": [w, h] }`. The attributes only feed the browser's
// automatic aspect-ratio computation BEFORE the image loads (CLS prevention;
// web.dev "Optimize Cumulative Layout Shift"); CSS still fixes the rendered
// size (.ev-thumb/.ev-page height, .ev-wide width), so the box is identical to
// before and after loading. Missing table or entry ⇒ empty string ⇒ the <img>
// renders exactly as before this change.
// Exported since iteration 8: the library doc modal renders its own `.m-pages`
// page template (not via evHtml) over the SAME pdf evidence object, so it shares
// this one helper — identical lookup, validation and degradation — instead of
// duplicating the logic or restructuring the modal's DOM around evHtml's card
// markup (which would change classes and visuals).
const dimAttrs = (sizes, img) => {
  const s = sizes?.[img];
  return Array.isArray(s) && Number.isInteger(s[0]) && Number.isInteger(s[1]) && s[0] > 0 && s[1] > 0
    ? ` width="${s[0]}" height="${s[1]}"`
    : "";
};

function evHtml(e) {
  switch (e?.type) {
    case "gallery":
      return `<div class="ev-block ev-gallery">
        <div class="ev-title">◈ ${esc(e.title)} · 共 ${e.items.length} 张</div>
        <div class="thumb-strip">${e.items.map((it) =>
          `<img class="ev-thumb" data-lightbox="${it.img}" data-caption="${esc(it.caption)}" src="${it.img}"${dimAttrs(e.imgSizes, it.img)} alt="${esc(it.caption)}" loading="lazy" decoding="async">`).join("")}</div>
        <div class="ev-caption">${esc(e.items[0].caption)} <span class="ev-meta">${esc(e.items[0].meta || "")}</span></div>
        ${e.items[0].quotes?.length ? `<div class="ev-quotes">${e.items[0].quotes.map((q) => `<div>“${esc(q)}”</div>`).join("")}</div>` : ""}
      </div>`;
    case "contact":
      return `<div class="ev-block ev-contact">
        <div class="ev-title">◈ ${esc(e.title)}</div>
        <img class="ev-wide" data-lightbox="${e.img}" data-caption="密集抽帧联系表" src="${e.img}"${dimAttrs(e.imgSizes, e.img)} alt="联系表" loading="lazy" decoding="async">
        <div class="ev-kv">${(e.kv || []).map(([k, v]) => `<div class="kv-pair"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join("")}</div>
        ${e.quotes?.length ? `<div class="ev-quotes ev-small">${e.quotes.map((q) => `<div>“${esc(q.text)}” <span class="ev-meta">— 文字识别 @ ${esc(q.at)}</span></div>`).join("")}</div>` : ""}
      </div>`;
    case "table":
      return `<div class="ev-block ev-tableblock">
        <div class="ev-title">◈ ${esc(e.title)} · 共 ${e.total ?? e.rows.length} 条</div>
        <table class="ev-table"><thead><tr>${e.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>${e.rows.slice(0, 3).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
      </div>`;
    case "kv":
      return `<div class="ev-block">
        <div class="ev-title">◈ ${esc(e.title)}</div>
        <div class="ev-kv">${e.pairs.map(([k, v]) => `<div class="kv-pair"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join("")}</div>
      </div>`;
    case "verify":
      return `<div class="ev-block ev-verify">
        <div class="ev-title">◈ ${esc(e.title)} · ${e.lines.filter((l) => l.startsWith("PASS")).length} 项全部通过</div>
        <div class="verify-lines">${e.lines.filter((l) => l.startsWith("PASS") || l.includes("=")).slice(0, 8).map((l) => `<div class="vline ${l.startsWith("PASS") ? "pass" : ""}">${esc(l)}</div>`).join("")}</div>
      </div>`;
    case "mixed":
      return `<div class="ev-block">${(e.blocks || []).map((b) => evHtml(b)).join("")}</div>`;
    case "pdf":
      return `<div class="ev-block ev-pdf">
        <div class="ev-title">◈ ${esc(e.title)} · ${e.pages.length} 页 / ${e.sections.length} 章</div>
        <div class="thumb-strip">${e.pages.map((p, i) =>
          `<img class="ev-page" data-lightbox="${p}" data-caption="第 ${i + 1} 页" src="${p}"${dimAttrs(e.imgSizes, p)} alt="第 ${i + 1} 页" loading="lazy" decoding="async">`).join("")}</div>
        <div class="ev-sections">${e.sections.map((s) => `<span class="sec-chip">${s.n}. ${esc(s.title)} <em>p${s.page}</em></span>`).join("")}</div>
      </div>`;
    default:
      return "";
  }
}

// deprecated: replaced by the moment stack; kept as no-op guard for old call sites
function evCompact(e) {
  return "";
}

/* ---------- lightbox ---------- */
// Accessible image zoom, following the WAI-ARIA APG Dialog (Modal) pattern:
// invokers are keyboard-activatable (tabindex + role + Enter/Space), Escape and
// the backdrop close it, focus moves into the lightbox on open and returns to
// the invoking element on close (WCAG 2.1.1 / 2.1.2 / 2.4.3 / 2.4.7).
// Iteration 30: while it is open, the same-image STRIP navigates by keyboard
// (←/→ previous/next, Home/End first/last) — the media-viewer convention
// (APG: keys other than Tab move inside a component; OS image viewers flip
// through a folder with ←/→; the carousel pattern names slides "3 of 10" and
// lets a polite region carry slide changes). Focus stays on #lbClose, the trap
// keeps cycling Tab inside the lightbox, and closing returns focus to the
// image currently shown (see fillLightbox).
let lbTrigger = null;

function activateLightbox(el) {
  openLightbox(el.dataset.lightbox, el.dataset.caption, el);
}

// root scopes the scan so a modal can wire only its own fresh nodes (re-wiring
// the whole document would stack duplicate listeners on persistent evidence).
function wireLightbox(root = document) {
  root.querySelectorAll("[data-lightbox]").forEach((el) => {
    if (el.getAttribute("tabindex") === null) el.setAttribute("tabindex", "0");
    if (el.getAttribute("role") === null) el.setAttribute("role", "button");
    if (el.getAttribute("aria-label") === null) el.setAttribute("aria-label", el.getAttribute("alt") || el.dataset.caption || "放大查看");
    el.addEventListener("click", (ev) => { ev.stopPropagation(); activateLightbox(el); });
    el.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault(); ev.stopPropagation(); activateLightbox(el);
    });
  });
}
// Iteration 30: the group the enlarged image belongs to — the trigger's own
// image STRIP (.thumb-strip wraps evidence galleries and pdf page rows,
// .m-pages the library doc modal's 16 pages), or the trigger alone when it
// sits in no strip (the contact .ev-wide, or any bare [data-lightbox]). NOT the
// whole wireLightbox scope: with the document scope that would merge every
// evidence gallery of the page and pull in the modal's rendered pages too,
// mixing scopes wireLightbox's root parameter exists to keep apart. Computed
// fresh on every key press — a re-rendered modal innerHTML leaves no dangling
// group array, and every member is live-checked against the DOM.
function lbGroup(trigger) {
  if (!trigger || !document.contains(trigger)) return [];
  const strip = trigger.closest(".thumb-strip, .m-pages");
  if (!strip) return [trigger];
  return [...strip.querySelectorAll("[data-lightbox]")].filter((el) => document.contains(el));
}

// Enlarged-view dimensions (iteration 8). The overlay <img> has no src until
// openLightbox runs, so until the file arrives it boxes at 0×0 and the caption
// below it jumps. Dimensions come from the trigger itself — its width/height
// attributes are the build-time intrinsic table rendered into the DOM
// (deterministic, independent of whether the thumbnail has finished loading);
// naturalWidth/naturalHeight only as a fallback for a trigger that has already
// loaded (they are 0 before load: whatwg/html#3510). The helper must never
// throw and must never leave a stale ratio from a previous opening, so
// openLightbox always clears both attributes first. A non-<img> trigger
// (data-lightbox may sit on any element) or unknown size ⇒ attribute-less,
// exactly the pre-8 markup.
function lbDims(trigger) {
  const t = trigger instanceof HTMLImageElement ? trigger : null;
  const w = +t?.getAttribute("width") || (t?.complete ? t.naturalWidth : 0);
  const h = +t?.getAttribute("height") || (t?.complete ? t.naturalHeight : 0);
  return w > 0 && h > 0 ? [w | 0, h | 0] : null;
}

// The overlay CSS fixes no width/height — only max-width (92vw) and max-height
// (82vh) (style.css, unchanged). Bare width/height attributes are presentational
// hints: they make BOTH dimensions determinate, and a lone max-height clamp
// then does NOT transfer through the aspect ratio. Measured on this page: 827/
// 1170 attributes rendered an 827×667 box (ratio 1.24, stretched) where the
// pre-8 browser path produced 471×667 (ratio 0.707). So attributes alone are
// not enough here; the box is pinned inline to the SAME clamp the browser
// applies to an unconstrained intrinsic size (min fit scale), which keeps the
// pre-load box, the post-load box and the pre-8 box identical. CSS-Sizing-4:
// "sizing constraints transfer through the aspect-ratio to the other side to
// preserve the aspect ratio."
const lbBox = (img, [w, h]) => {
  const cs = getComputedStyle(img);
  const mw = parseFloat(cs.maxWidth) || Infinity;
  const mh = parseFloat(cs.maxHeight) || Infinity;
  const k = Math.min(1, mw / w, mh / h);
  img.setAttribute("width", w);
  img.setAttribute("height", h);
  img.style.width = w * k + "px";
  img.style.height = h * k + "px";
};

// Fills (open) or re-fills (navigate) the enlarged view. One path for both —
// src/alt/caption/terminal-box stay single-sourced, and the box is recomputed
// from the CURRENT trigger exactly as on open (iteration 8: clear first, so a
// navigated image never keeps the previous one's ratio). Called by navigation
// with the lightbox already open and focused: the trap and focus are left
// untouched, but lbTrigger is re-pointed at the image now shown, so closing
// returns focus to the current image instead of the long-closed opener (APG
// dialog's "returns to the invoking element" extended through navigation —
// the same rule the carousel pattern states for next/previous: activating them
// "does not move focus").
function fillLightbox(src, caption, trigger, idx, count) {
  const lb = document.getElementById("lightbox");
  const img = lb.querySelector("img");
  // reserve the correct box before the enlarged file loads (MDN <img>: the
  // aspect ratio from both attributes "is used to reserve the space needed to
  // display the image")
  img.removeAttribute("width");
  img.removeAttribute("height");
  img.style.width = "";
  img.style.height = "";
  const dims = lbDims(trigger);
  if (dims) lbBox(img, dims);
  img.src = src;
  img.alt = caption || "";
  lb.querySelector(".lb-caption").textContent = caption || "";
  // APG carousel: a group's reachable name may carry the set position — "a
  // number and set size can serve as a meaningful alternative, e.g. '3 of 10'"
  // (group supports neither aria-setsize nor aria-posinset). A silent carrier,
  // like the slider's aria-valuenow: it updates the accessibility tree, never a
  // live region (the caption carries the spoken change).
  lb.setAttribute("aria-label", count > 1 ? `图片放大预览 · 第 ${idx + 1} 张，共 ${count} 张` : "图片放大预览");
  lbTrigger = trigger && document.contains(trigger) ? trigger : null;
  // iteration 75: on-screen prev/next state. Hidden for a singleton group (no
  // sequence to flip); at a boundary the boundary button disables — disabled
  // buttons drop out of focus-trap's FOCUSABLE set, so the Tab cycle tells the
  // same story as the keyboard clamp (lbNavigate) and the click path (lbStep).
  const multi = count > 1;
  const lbPrev = lb.querySelector("#lbPrev"), lbNext = lb.querySelector("#lbNext");
  lbPrev?.classList.toggle("hidden", !multi);
  lbNext?.classList.toggle("hidden", !multi);
  if (lbPrev) lbPrev.disabled = idx <= 0;
  if (lbNext) lbNext.disabled = idx >= count - 1;
}

// Iteration 30: ←/→ previous/next within the trigger's strip, Home/End first/
// last. Bound once to #lightbox — while it is open the iteration-27 trap keeps
// focus inside it, so key events bubble up from #lbClose to this listener; no
// document-level interceptor is added and nothing has to be removed on close
// (#lightbox is static markup). Only these four keys are claimed: Tab keeps
// the trap, ↑/Down stay the browser's (the image set is a one-dimensional
// sequence — no grid axis to model), and alt/ctrl/meta variants fall through
// to browser and AT shortcuts. Boundaries CLAMP instead of wrapping (pages
// have a real first and last; listbox/slider Home/End clamp too), and a
// single-image group makes the keys a no-op.
let lbKeysBound = false;
// Iteration 53: the sequence-replacement beat — the lightbox's last beatless
// surface. The mechanism is deliberately NOT document.startViewTransition://
// a same-document view transition would be the tidy API for exactly this
// (crossfade + size morph of the swapped image), but its update callback is
// invoked at a RENDERING OPPORTUNITY (measured: 27ms in a rendered run,
// never within the probe's --virtual-time-budget/--dump-dom run, where no
// frames are produced after load), so the state writes cannot be guaranteed
// to land in the keypress's own task — which is precisely what the
// iteration-8 box gates and the iteration-30 ln* contract read 80ms later.
// Recorded as a machine-checked negative, not a guess. The mechanism that
// keeps BOTH is a class-driven crossfade whose state update is plain
// synchronous code in lbNavigate:
//   lbHold pins the OLD frame to .lightbox::after at the OLD box (CSS custom
//   properties: --lb-gimg + a left/top/width/height quad), while the live
//   <img> and .lb-caption jump to opacity 0 — the held frame covers the box,
//   so an undecoded new image never flashes the backdrop through;
//   fillLightbox then runs synchronously (src/alt/caption/aria-label/the
//   iteration-8 clamped box — the same task as the keypress);
//   the release is deferred to the first frame AFTER the new image is
//   decodable (img.decode() raced against a 500ms timeout — Chrome's
//   "wait for the full image to load before starting the transition" +
//   "aggressive timeout" pattern), at which point releasing the hold runs
//   one --d3 300ms --ease-out window both ways: the old frame fades out
//   while its quad morphs to the new box, the new image and caption fade in —
//   symmetric, single-window, no exit asymmetry (a replacement is a covering
//   state flip, the iteration-50 ruling applied here). A frame-less fallback
//   timer releases the hold so the surface can never be stuck held.
// prefers-reduced-motion is guarded HERE in JS, not in CSS: the iteration-43
// 收口块 would cover the classes below, but the deferred release (rAF +
// decode race) is JS-driven and must be skipped too, so reduce runs the plain
// pre-53 swap; openLightbox clears the classes for the same reason a stale
// hold must never survive a close/reopen.
function lbHold(lb, img) {
  const r = img.getBoundingClientRect(), lbr = lb.getBoundingClientRect();
  lb.style.setProperty("--lb-gimg", `url("${img.getAttribute("src") || ""}")`);
  lb.style.setProperty("--lb-gx", (r.left - lbr.left) + "px");
  lb.style.setProperty("--lb-gy", (r.top - lbr.top) + "px");
  lb.style.setProperty("--lb-gw", r.width + "px");
  lb.style.setProperty("--lb-gh", r.height + "px");
  lb.dataset.lbHold = "1"; // the hold state — a data attribute, no class to leave stale
}
function lbRelease(lb) {
  const img = lb.querySelector("img");
  const r = img.getBoundingClientRect(), lbr = lb.getBoundingClientRect();
  lb.style.setProperty("--lb-gx", (r.left - lbr.left) + "px");
  lb.style.setProperty("--lb-gy", (r.top - lbr.top) + "px");
  lb.style.setProperty("--lb-gw", r.width + "px");
  lb.style.setProperty("--lb-gh", r.height + "px");
  delete lb.dataset.lbHold; // the crossfade: the base 300ms window fades the old frame out and morphs its quad to the new box
}
const lbSwap = (update, lb) => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { update(); return; }
  const img = lb.querySelector("img");
  lbHold(lb, img);
  update();
  const hold = Promise.race([
    img.decode().catch(() => {}),
    new Promise((r) => setTimeout(r, 500)),
  ]);
  hold.then(() => requestAnimationFrame(() => { if (lb.dataset.lbHold) lbRelease(lb); }));
  setTimeout(() => { if (lb.dataset.lbHold) lbRelease(lb); }, 800); // frame-less fallback
  setTimeout(() => lb.style.removeProperty("--lb-gimg"), 1400); // release the held frame's decode
};
function lbNavigate(ev) {
  if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft" && ev.key !== "Home" && ev.key !== "End") return;
  if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
  ev.preventDefault(); // the arrows/Home/End never scroll the page behind the modal
  ev.stopPropagation();
  const lb = document.getElementById("lightbox");
  if (lb.classList.contains("hidden")) return;
  const group = lbGroup(lbTrigger);
  const i = group.indexOf(lbTrigger);
  const j = ev.key === "ArrowRight" ? Math.min(i + 1, group.length - 1)
    : ev.key === "ArrowLeft" ? Math.max(i - 1, 0)
    : ev.key === "Home" ? 0 : group.length - 1;
  if (j < 0 || j === i || j >= group.length) return; // singleton / at a boundary: no-op
  // iteration 53: the beat is lbSwap (see its comment) — the open path's
  // iteration-48 reveal is untouched.
  lbSwap(() => {
    const next = group[j];
    fillLightbox(next.dataset.lightbox, next.dataset.caption, next, j, group.length);
  }, lb);
}

// Iteration 75: close + navigation controls wired ONCE, on first open, for
// every page with a lightbox. Before this the × button and the backdrop click
// were wired ONLY by boot-history, so both were dead on the run and library
// pages (Escape, via library.js's global keydown, was the sole way out — an
// accidental coupling the operator hit as "关闭按钮失效"). closeLightbox is
// idempotent (its hidden guard early-returns), so a page that also wires it
// stays harmless — boot-history's duplicate is deleted in the same iteration.
let lbCloseBound = false;
function lbBindClose() {
  if (lbCloseBound) return;
  lbCloseBound = true;
  const lb = document.getElementById("lightbox");
  document.getElementById("lbClose")?.addEventListener("click", closeLightbox);
  lb?.querySelector(".lb-backdrop")?.addEventListener("click", closeLightbox);
}
// Iteration 75: the pointer/touch half of the iteration-30 keyboard contract.
// A click rides the SAME lbSwap path (the 53 sequence-replacement beat) — one
// swap mechanism for both input halves; activation does not move focus (APG
// carousel), and the ←/→ keyboard listener on #lightbox keeps working as the
// events bubble up from the buttons.
let lbNavBound = false;
function lbBindNav() {
  if (lbNavBound) return;
  lbNavBound = true;
  const lb = document.getElementById("lightbox");
  lb?.querySelector("#lbPrev")?.addEventListener("click", () => lbStep(-1));
  lb?.querySelector("#lbNext")?.addEventListener("click", () => lbStep(1));
}
function lbStep(delta) {
  const lb = document.getElementById("lightbox");
  if (!lb || lb.classList.contains("hidden")) return;
  const group = lbGroup(lbTrigger);
  const i = group.indexOf(lbTrigger);
  const j = i + delta;
  if (j < 0 || j >= group.length) return; // singleton / boundary: no-op (same clamp as the keyboard path)
  lbSwap(() => {
    const next = group[j];
    fillLightbox(next.dataset.lightbox, next.dataset.caption, next, j, group.length);
  }, lb);
}

function openLightbox(src, caption, trigger) {
  const lb = document.getElementById("lightbox");
  lbBindClose(); // 75: × and backdrop now close on every hosting page
  lbBindNav();
  // iteration 53: a swap that never released (a page whose frames stopped)
  // can leave a held state behind; a stale held frame must not survive a
  // reopen.
  delete lb.dataset.lbHold;
  lb.style.removeProperty("--lb-gimg");
  lb.classList.remove("hidden"); // visible first: computed max-* resolves for the clamp below
  // APG dialog: while it is open, Tab / Shift+Tab cycle inside the lightbox
  // (focus-trap.js); released on every close path below
  trapFocus(lb);
  if (!lbKeysBound) { lbKeysBound = true; lb.addEventListener("keydown", lbNavigate); }
  const group = lbGroup(trigger);
  fillLightbox(src, caption, trigger, group.indexOf(trigger), group.length);
  lb.classList.remove("hidden");
  document.getElementById("lbClose").focus();
}
function closeLightbox() {
  const lb = document.getElementById("lightbox");
  // release the Tab cycle first: an already-hidden lightbox has already
  // released it (no-op here), a visible one unregisters before it disappears
  releaseFocus(lb);
  if (lb.classList.contains("hidden")) return;
  lb.classList.add("hidden");
  const el = lbTrigger;
  lbTrigger = null;
  if (el && document.contains(el)) el.focus();
}

// ── module: src/scripts/components/pacer.js ──
/* ---------- pacing: machine-fluent text, stochastic only at load/check ----------
 * Text detail streams at a CONSTANT cadence (no random stops) — fluent output
 * signals smooth generation. Random pauses appear ONLY at:
 *   (a) image evidence: items fill in one-by-one (generation feel)
 *   (b) batch text checks (tables / verify lines / kv): rows pop one-by-one
 *       (checking feel); the final PASS line waits longer (dramatic).
 */
const PACER = {
  entrance: 420,        // card pushIn (constant)
  charMs: 48,           // constant per-char cadence at 1x (~21 cps, machine-fluent)
  computing: [300, 1000], // pause before evidence items begin “working”
  itemDelay: {
    title: [180, 480], img: [260, 950], head: [120, 320], row: [150, 560],
    pair: [150, 480], line: [200, 700], chip: [120, 340], text: [200, 520],
    final: [600, 1300],   // last line of a check report (e.g. OVERALL PASS)
  },
  settle: 320,          // constant settle after the last item
  gapMin: 420,          // inter-card gap mirrors the real cadence (constant, no jitter)
  gapMax: 1600,
};

/* ---------- pacing telemetry (read-only observability for probes/debug) ----
 * One module-level record, mutated ONLY by the pacing paths below and by the
 * presenter (setPacerState). Probes read it through `window.VidNotes.pacer()`
 * (attached once, hands out copies — never the live record).
 *   factor/charMs — current speed and effective per-char cadence (0 = instant)
 *   chars/textLen — streamed vs total characters of the current text
 *   gen/queue/idx — presenter generation, pending queue, current moment
 *   phase         — idle | card | text | evidence | gap | done
 *   delays        — capped log of actually-scheduled pauses {kind, ms, factor, idx, pace}
 *   intervals     — capped log of observed inter-char ms (performance.now deltas)
 *   rescales      — capped log of QUEUE REORDERS (a speed change while a pause
 *                   was already scheduled but unfired): {kind, ms, factor, from, rem}
 *                   — ms = the newly scheduled wait, rem = the outstanding wait
 *                   BEFORE this reorder, computed under `from`; so every entry
 *                   is self-consistent: ms ≈ max(floor, rem × from / factor),
 *                   and ms = 0 when the speed jumped to the instant tier
 */
// iteration 24 (ADDITIVE, existing fields untouched): `frozen` is the freeze
// state of the presentation chain and `evShown` the count of evidence items
// revealed on the current card — together with idx and chars-vs-textLen they
// carry the BREAKPOINT a freeze-continue must resume from (probe-visible so the
// freeze invariants are machine-checked, not inferred from the DOM)
const TELE = {
  factor: 1, charMs: 0, chars: 0, textLen: 0, gen: 0, queue: 0, idx: -1,
  paceName: "pacer", phase: "idle", delays: [], intervals: [], rescales: [],
  frozen: false, evShown: 0,
};
const LOG_CAP = 512, IV_CAP = 96, RES_CAP = 128;
function setPacerState(patch) { Object.assign(TELE, patch); }
function logPacerDelay(kind, ms, f) {
  // `f` is the factor ACTUALLY used to schedule `ms` (scheduling time, which
  // may differ from the live factor when the speed changed mid-sequence) so
  // every logged pause is self-consistent for probe invariant checks
  TELE.delays.push({ kind, ms, factor: f, idx: TELE.idx, pace: TELE.paceName });
  if (TELE.delays.length > LOG_CAP) TELE.delays.shift();
}
// a reorder record is NOT a pause record: `delays` keeps meaning "each pause as
// FIRST scheduled" (its clamp/random decision, at its scheduling factor) while
// `rescales` records how an already-queued outstanding wait followed a speed change
function logRescale(kind, ms, f, from, rem) {
  TELE.rescales.push({ kind, ms, factor: f, from, rem });
  if (TELE.rescales.length > RES_CAP) TELE.rescales.shift();
}
function pacerSnapshot() {
  return { ...TELE, delays: TELE.delays.map((d) => ({ ...d })),
    intervals: [...TELE.intervals], rescales: TELE.rescales.map((r) => ({ ...r })) };
}

/* ---------- rescalable single-shot pauses (queued-wait speed consistency) ----
 * A setTimeout handle can only be CANCELLED, never re-aimed, so a speed change
 * while a pause is already queued has exactly one implementation: drop the
 * pending timer and rebuild it from the REMAINING wait. Every queued pause
 * (the presenter's gap, computing/settle/noev AND every per-item wait in
 * sequenceEvidence) is scheduled through this registry, so presenter.setFactor
 * can reorder them all
 * at once. The pause VALUE stays the one decided at scheduling time — clamp
 * ranges, rand draws and the instant constants are never touched, only the
 * outstanding wait is scaled by the factor ratio (elapsed progress preserved,
 * mirroring media playbackRate semantics: the position stays, the remaining
 * timeline plays at the new rate).
 */
const MAP = new Map(); // handle.id -> handle (only pauses still outstanding)
function scalePause(kind, ms, f, floor, fire) {
  const h = { kind, ms, f, floor, at: performance.now(), fire, id: 0, dead: false };
  h.wrap = () => { MAP.delete(h.id); if (!h.dead) fire(); };
  h.id = setTimeout(h.wrap, ms);
  MAP.set(h.id, h);
  return h; // opaque handle: stays valid across reorders (h.id mutates in place)
}
// cancel + deregister; called by presenter.pause()/hardSeek so a later speed
// change can never resurrect a cancelled pause (reorder mutates the same handle)
function clearPause(h) {
  if (!h) return;
  h.dead = true;
  MAP.delete(h.id);
  clearTimeout(h.id);
}
function rescaleLivePauses(nf) {
  if (!MAP.size) return;
  const now = performance.now();
  for (const h of [...MAP.values()]) {
    const rem = Math.max(0, h.ms - (now - h.at));
    if (rem <= 0) continue; // already at its firing edge: let the original win
    if (instantFactor(nf)) { reorder(h, 0, rem, nf, now); continue; } // → instant tier: release now
    if (instantFactor(h.f)) continue; // collapse constant (30/60) is not a scaled sample: never inflated
    if (nf === h.f) continue;
    reorder(h, Math.max(h.floor, rem * h.f / nf), rem, nf, now);
  }
}
function reorder(h, ms, rem, nf, now) {
  clearTimeout(h.id);
  MAP.delete(h.id);
  const from = h.f;
  h.f = nf; h.ms = ms; h.at = now;
  logRescale(h.kind, ms, nf, from, rem);
  h.id = setTimeout(h.wrap, ms);
  MAP.set(h.id, h);
}
if (typeof window !== "undefined") { // read-only handle; works in module and inlined builds
  window.VidNotes = window.VidNotes || {};
  window.VidNotes.pacer = pacerSnapshot;
}

// hold until the card entrance animation has actually finished
function afterEntrance(card, cb, instant = false, fallbackMs = 900) {
  let done = false;
  const finish = () => { if (!done) { done = true; cb(); } };
  if (instant) { setTimeout(finish, 60); return; }
  card.addEventListener("animationend", finish, { once: true });
  setTimeout(finish, fallbackMs);
}

function instantFactor(f) { return f >= 8; }

// ── module: src/scripts/components/stack-evidence.js ──
function itemDelay(it, items, pace) {
  const t = pace.itemDelay || PACER.itemDelay;
  const last = it.kind === "line" && it === items[items.length - 1];
  const kind = last ? "final" : (t[it.kind] ? it.kind : "text");
  const r = last ? (t.final || t.text) : (t[it.kind] || t.text);
  return { kind, ms: rand(r[0], r[1]) };
}

// collect evidence items in visual (DOM) order and mark them pending
function collectEvidenceItems(evEl) {
  const SEL = ".ev-title, .ev-thumb, .ev-page, .ev-wide, .ev-table tbody tr, .ev-table thead tr, .kv-pair, .vline, .sec-chip, .ev-caption, .ev-quotes";
  return [...evEl.querySelectorAll(SEL)].map((el) => {
    const kind = el.classList.contains("ev-title") ? "title"
      : el.matches(".ev-thumb, .ev-page, .ev-wide") ? "img"
      : el.closest(".ev-table") ? (el.parentElement.tagName === "TBODY" ? "row" : "head")
      : el.classList.contains("kv-pair") ? "pair"
      : el.classList.contains("vline") ? "line"
      : el.classList.contains("sec-chip") ? "chip" : "text";
    el.classList.add("pending-item"); // occupies zero space until its turn
    return { el, kind };
  });
}

// per-image sequential reveal: waits for the real load event, then grows into
// place. Iteration 75 (pdf 交付卡填充加速，运营方指令「不要让用户等太久」)：
// the load-gate had a measured failure mode on the s5 「交付物 33 页笔记」 strip
// — its `loading="lazy"` images below the stack window never fire load (lazy
// defers them indefinitely), so every item rode the fallback (3000ms × 16 ≈
// 45s of dead waiting on a 6× brisk run; the mechanism's actual pacer). Two
// fixes: (a) the reveal chain de-lazies an image when its turn arrives
// (loading="lazy" → "eager" starts the fetch NOW — the item is about to be
// shown, so lazy's initial-render rationale no longer applies; local fetches
// resolve in tens of ms and the real load event fires as designed); (b) the
// fallback drops 3000 → 800ms — a truly silent no-load can no longer tax the
// demo a full 3s per image (the error listener still resolves fast; only the
// pathological case needs the cap).
function revealItem(it, next) {
  const el = it.el;
  let shown = false;
  const show = () => {
    if (shown) return;
    shown = true;
    el.classList.remove("pending-item");
    el.classList.add("in");
    TELE.evShown = (TELE.evShown || 0) + 1;
    next();
  };
  if (it.kind === "img" && !(el.complete && el.naturalWidth)) {
    if (el.getAttribute("loading") === "lazy") el.setAttribute("loading", "eager");
    el.addEventListener("load", show, { once: true });
    el.addEventListener("error", show, { once: true });
    setTimeout(show, 800); // fallback: a silent no-load is capped at 800ms, never 3s
  } else {
    show();
  }
}

// build evidence on demand and reveal all items at once (rebuilds / instant)
function finalizeCardEvidence(card, m) {
  const evEl = card.querySelector(".sc-evidence");
  if (!evEl || !m.evidence) return;
  evEl.innerHTML = evHtml(m.evidence);
  const items = collectEvidenceItems(evEl);
  for (const it of items) { it.el.classList.remove("pending-item"); it.el.classList.add("in"); }
  TELE.evShown = items.length; // honest additive counter: an instant rebuild reveals all at once
  evEl.classList.add("ev-live");
  wireLightbox();
}

// evidence sequence: computing pause → items fill in one-by-one with per-kind
// random delays (images gated on their real load event), then a constant settle.
// `getFactor` yields the LIVE presenter factor: every item delay, the instant
// decision and the settle are recomputed per item, so mid-sequence speed changes
// take effect immediately; each actually-scheduled pause is logged for probes.
// BOUNDARY between the two respeed mechanisms: while one item's wait is still
// OUTSTANDING it belongs to the reorder registry below (its remaining wait is
// scaled, its rand draw / kind / floor are never re-rolled); the moment it fires,
// the next turn() owns the next scheduling and draws fresh at the LIVE factor —
// so the scaled quantity is always the OLD item's remainder, never the next
// item's delay (no double scaling; the sequence is strictly serial, hence at
// most one item wait is registered at any time).
// `gate` (iteration 24) is the freeze-continue junction: gate(cont) runs cont
// when the chain is live, DROPS it when stale, and PARKS it in the presenter's
// hold slot when the demo is frozen — so a pause mid-sequence no longer kills
// the chain at its gen guard, and the resume continues it exactly here (the
// outstanding item wait itself still belongs to the reorder registry above:
// freeze and rescale touch disjoint halves of the same wait)
function sequenceEvidence(card, m, pace, getFactor, guard, onDone, gate) {
  const evEl = card.querySelector(".sc-evidence");
  TELE.phase = "evidence";
  if (!m.evidence || !evEl) {
    const f = getFactor();
    const ms = instantFactor(f) ? 0 : Math.max(60, 300 / f);
    logPacerDelay("noev", ms, f);
    scalePause("noev", ms, f, 60, () => gate(onDone));
    return;
  }
  const f0 = getFactor();
  const instant = instantFactor(f0);
  // status line only (no frame) while "computing" — plain text, zero layout footprint
  evEl.classList.add("loading");
  const computing = instant ? 30 : Math.max(30, rand((pace.computing ?? PACER.computing)[0], (pace.computing ?? PACER.computing)[1]) / f0);
  logPacerDelay("computing", computing, f0);
  scalePause("computing", computing, f0, 30, () => {
    if (!guard()) { evEl.classList.remove("loading"); return; }
    gate(runSequence);
  });
  // the deferred insert runs through the gate too, so a freeze during the
  // computing wait leaves `.loading` in place and parks the whole build
  const runSequence = () => {
    // deferred insert: the evidence DOM comes into existence exactly now,
    // together with its first item — the frame never exists empty
    evEl.classList.remove("loading");
    // `.fast` (existing CSS, .14s) keeps the grow animations in step with the
    // compressed cadence at factor >= 4; at 1–2x the full .3–.6s animations play
    evEl.classList.toggle("fast", getFactor() >= 4);
    evEl.innerHTML = evHtml(m.evidence);
    wireLightbox();
    const items = collectEvidenceItems(evEl);
    let k = 0;
    const finish = () => {
      evEl.classList.add("ev-live");
      const f = getFactor();
      const settle = Math.max(60, (pace.settle ?? PACER.settle) / f);
      logPacerDelay("settle", settle, f);
      scalePause("settle", settle, f, 60, () => gate(onDone));
    };
    const turn = () => gate(runTurn);
    const runTurn = () => {
      if (k >= items.length) { finish(); return; }
      const it = items[k++];
      const f = getFactor();
      const inst = instantFactor(f);
      const dd = itemDelay(it, items, pace);
      const dk = k === 1 ? "first" : dd.kind;
      const delay = inst ? 30 : (k === 1 ? 0 : dd.ms / f);
      const scheduled = Math.max(20, delay);
      logPacerDelay(dk, scheduled, f);
      // the item wait is a queued pause too (kind = the item's kind, floor 20 =
      // this site's own scheduling floor): it registers in the same MAP, so a
      // speed change while it is still unfired rescales its REMAINING wait
      // (gap/computing/settle/noev rules verbatim: to the instant tier → 0;
      // scheduled under the instant tier → never inflated). See the boundary
      // note above the function for why this cannot double-scale
      scalePause(dk, scheduled, f, 20, () => gate(() => revealItem(it, turn)));
    };
    turn();
  };
}

// ── module: src/scripts/components/stack.js ──
// VidNotes moment stack: the “正在做” stage — cards, pacing, evidence sequencing.

const STACK_TAGS = { activity: "执行", quality: "关卡", decision: "判断", recovery: "恢复", milestone: "标记", done: "交付" };

// iteration 33: the collapsed card's accessible name — the same density as the
// library doc-card label (action verb + object + qualifier, library.js:60-70):
// the seek intent first, then the clock (same source as .m-time), the tag
// (same map as .m-tag) and a fixed-width text snippet (24 chars + … for the
// 11/112 moments that run longer), so a keyboard user gets the same
// information the mouse user reads visually before committing the jump
function seekLabel(m) {
  const t = m.text || "";
  return `跳回 ${clockOf(m.rel)} 的${STACK_TAGS[m.kind] || "动作"}：${t.slice(0, 24)}${t.length > 24 ? "…" : ""}`;
}

function makeStack(container, opts = {}) {
  const stack = {
    container, cap: opts.cap ?? 7, detailLen: opts.detailLen ?? 260, compact: !!opts.compact,
    onSeek: opts.onSeek ?? null, lastIdx: -1, olderCount: 0, foot: null,
    // iteration 33: the rel a card activation asked to seek to. Set ONLY by the
    // card path (click / Enter / Space, see pushStackCard) right before onSeek,
    // consumed by rebuildStack as the focus-restoration target. null on every
    // other rebuild (autoplay / drag / step), which is exactly how those paths
    // stay inert and never move the focus themselves
    focusRel: null,
    reset() { this.container.innerHTML = ""; this.lastIdx = -1; this.olderCount = 0; this.foot = null; this.focusRel = null; },
  };
  return stack;
}

function rebuildStack(stack, moments, idx) {
  // iteration 33: the focus state must be read BEFORE the clear — the card
  // holding it is about to be destroyed (WCAG 2.4.3: a rebuild must not drop
  // the focus to <body>). focusRel (a card activation) always wins; otherwise
  // the focus is restored only when it ALREADY lived inside this stack (a
  // keyboard user's focused card, possibly a lightbox image inside the head).
  // A rebuild whose focus is elsewhere — the scrubber, the body, i.e. the
  // autoplay / drag / step paths — keeps its hands off: it cannot steal it
  let wantedRel = stack.focusRel;
  if (wantedRel == null && document.activeElement && stack.container.contains(document.activeElement)) {
    const r = document.activeElement.closest?.(".stack-card")?.dataset.rel;
    if (r != null) wantedRel = +r;
  }
  stack.focusRel = null;
  stack.container.innerHTML = "";
  stack.foot = null;
  // iteration 33: the window is built NEWEST-FIRST (prepend per card, so the
  // loop runs from the OLDEST) — the same DOM order the live path produces
  // (present() prepends). It previously built oldest-first, which inverted
  // the stack after every seek and made pruneStack drop the NEWEST card (the
  // very moment a card activation had just jumped to, destroying any focus
  // target this rebuild could restore); one direction for both writers keeps
  // the visual order, the prune semantics and the focus target aligned
  const from = Math.max(0, idx - (stack.cap - 1));
  for (let i = from; i <= idx; i++) pushStackCard(stack, moments[i], i === idx, { instant: true, evInstant: true });
  stack.olderCount = from;
  ensureFoot(stack);
  stack.lastIdx = idx;
  // APG focus management: restore to the EQUIVALENT element — the rebuilt card
  // of the same moment (after relOfMoment quantization the head card carries
  // the activation's rel exactly), the head card as the fallback when that
  // moment fell outside the window. Never <body>
  if (wantedRel != null) {
    const tgt = stack.container.querySelector(`.stack-card[data-rel="${wantedRel}"]`) ||
      stack.container.querySelector(".stack-card");
    if (tgt) tgt.focus();
  }
}

function pushStackCard(stack, m, expanded, pace = {}) {
  const card = document.createElement("div");
  card.className = `stack-card st-${m.kind} ${expanded ? "expanded" : "collapsed"}${pace.instant ? "" : " enter"}` + (stack.compact ? " compact" : "");
  card.dataset.rel = m.rel;
  card.innerHTML = `
    <div class="sc-head"><span class="m-time">${clockOf(m.rel)}</span><span class="m-tag">${STACK_TAGS[m.kind]}</span>
      <span class="m-text">${esc(m.text)}</span></div>
    ${expanded ? `<div class="sc-body"><div class="sc-detail"></div><div class="sc-evidence"></div></div>` : ""}`;
  // the entrance animation duration comes from the pace, not the CSS default,
  // so it scales with the factor (1x stays at PACER.entrance)
  if (pace.entrance && !pace.instant) card.style.animationDuration = pace.entrance + "ms";
  stack.container.prepend(card);
  // iteration 33/34: the affordance is attached AT CREATION (both the entrance
  // and the instant paths pass through here). Iteration 34 GATES it on
  // stack.onSeek, decided right here — a collapsed card is operable ONLY where
  // a seek exists (the player stack). The compact demo stack replays a recorded
  // trajectory whose transport is the pause/speed controls (iteration 28), so
  // an onSeek-less collapsed card would be focusable + role=button + promising
  // "跳回…" while triggering nothing (WCAG 4.1.2: name/role/value must match
  // the real operation). It is instead PRESENTATIONAL: no tabindex
  // (unfocusable — never a keyboard dead stop), no role, no aria-label (its own
  // .m-time/.m-tag/.m-text is what AT reads in document order; a label on a
  // role-less div is dead markup). The expanded card keeps tabindex=-1 on BOTH
  // stacks: not in the Tab order, still script-focusable as rebuildStack's
  // restoration target, its operable descendants reachable on their own
  if (expanded) {
    card.setAttribute("tabindex", "-1");
  } else if (stack.onSeek) {
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", seekLabel(m));
  }
  // one commit path for pointer and keyboard: focusRel is recorded FIRST so the
  // rebuild the seek triggers knows where the focus must land (rebuildStack).
  // The listeners ride the SAME gate as the affordance: on an onSeek-less stack
  // they would be dead machinery — a click writing a focusRel nothing consumes
  // behind a null onSeek call
  if (stack.onSeek) {
    const seekTo = () => {
      stack.focusRel = +card.dataset.rel;
      stack.onSeek(+card.dataset.rel);
    };
    card.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-lightbox]")) return;
      if (!card.classList.contains("expanded")) seekTo();
    });
    card.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      if (ev.target.closest("[data-lightbox]")) return; // lightbox images keep their own keys
      ev.preventDefault(); // Space must not scroll the page; Enter keeps its default from stacking on the click path
      if (!card.classList.contains("expanded")) seekTo();
    });
  }
  // NOTE: evidence DOM is NOT rendered here — it is built on demand when the
  // generation step actually runs (deferred insert, zero footprint before that).
  if (expanded && pace.instant) {
    card.querySelector(".sc-detail").textContent = (m.detail || "").slice(0, stack.detailLen);
    if (m.evidence) finalizeCardEvidence(card, m);
  }
  return card;
}

function pruneStack(stack) {
  const cards = [...stack.container.querySelectorAll(".stack-card")];
  if (cards.length <= stack.cap) { stack.olderCount = 0; removeFoot(stack); return; }
  for (let i = stack.cap; i < cards.length; i++) cards[i].remove();
  stack.olderCount += cards.length - stack.cap;
  ensureFoot(stack);
}
function ensureFoot(stack) {
  if (!stack.olderCount) { removeFoot(stack); return; }
  if (!stack.foot) {
    stack.foot = document.createElement("div");
    stack.foot.className = "stack-foot";
    stack.container.appendChild(stack.foot);
  }
  stack.foot.textContent = `▲ 更早还有 ${stack.olderCount} 个动作`;
}
function removeFoot(stack) { stack.foot?.remove(); stack.foot = null; }

// ── module: src/scripts/components/stack-type.js ──
let typingToken = 0, typingFrozen = false, parkedStep = null;
function cancelTyping() { typingToken++; typingFrozen = false; parkedStep = null; }
// iteration 24: freeze-continue. pause() parks the in-flight character stream
// mid-character (its resumption point = the closure of the next step, a coroutine
// continuation: Kotlin-style save-the-locals-and-the-label), so a frozen demo no
// longer finishes its text on its own; play() releases it through resumeTyping.
// cancelTyping (hardSeek/stopRun) keeps clearing the park: a cancelled chain never
// resumes, so the two halves stay orthogonal
function freezeTyping() { typingFrozen = true; }
function resumeTyping() {
  typingFrozen = false;
  const s = parkedStep; parkedStep = null;
  if (s) s();
}


// streaming text: constant cadence (fluent, never halting), cancellable by seek/reset.
// `charMs` is the BASE per-char cadence at 1x; the effective delay is recomputed
// EVERY step from the LIVE factor (presenter.setFactor), so a mid-stream speed
// change takes effect on the next character; jumping to instant (>=8) dumps the
// remainder immediately. Observed inter-char intervals are logged for probes.
function streamText(el, text, opts = {}) {
  const token = ++typingToken;
  const { charMs = PACER.charMs, factor = 1, getFactor = null, onDone = () => {} } = opts;
  const live = () => (getFactor ? getFactor() : factor);
  // 8ms floor stays deliberately above the spec's 4ms nested-timer clamp
  const cadence = () => { const f = live(); return instantFactor(f) ? 0 : Math.max(8, charMs / f); };
  const tele = (chars, ms) => {
    TELE.phase = "text"; TELE.factor = live(); TELE.textLen = text.length;
    TELE.chars = chars; TELE.charMs = ms;
  };
  if (!text || opts.instant || cadence() === 0) {
    if (text) { el.textContent = text; tele(text.length, 0); TELE.intervals = []; }
    el.classList.remove("typing");
    onDone();
    return;
  }
  el.classList.add("typing");
  el.textContent = "";
  tele(0, cadence());
  TELE.intervals = []; // per-token: intervals of only the current text
  let i = 0, lastAt = 0;
    const step = () => {
    if (token !== typingToken) return; // cancelled by seek/reset
    if (typingFrozen) { parkedStep = step; lastAt = 0; return; } // paused mid-stream: park the continuation
    el.textContent = text.slice(0, ++i);
    const d = cadence();
    if (i < text.length && d === 0) { // speed jumped to instant mid-stream: dump the rest
      el.textContent = text;
      el.classList.remove("typing");
      tele(text.length, 0);
      onDone();
      return;
    }
    tele(i, d);
    if (i < text.length) {
      const now = performance.now();
      if (lastAt) { TELE.intervals.push(now - lastAt); if (TELE.intervals.length > IV_CAP) TELE.intervals.shift(); }
      lastAt = now;
      setTimeout(step, d);
    } else { el.classList.remove("typing"); onDone(); }
  };
  step();
}

// ── module: src/scripts/components/presenter.js ──
// VidNotes presenter: event-driven serial chain, never pushes while busy.
// All pacing durations scale with `factor`; speed changes (setFactor) take
// effect on the NEXT scheduled step — including mid-stream text, mid-
// sequence evidence items, AND pauses that are already queued but unfired
// (gap / computing / settle / noev are reordered to the new rate through
// stack.js' rescaleLivePauses) — and every pacing transition is mirrored into
// the shared telemetry record (stack.js) for probes.

function makePresenter(stack, moments, opts = {}) {
  const p = {
    stack, moments,
    pace: opts.pace ?? PACER,
    factor: opts.factor ?? 1,
    idx: -1, queue: [], timer: null, pending: null, playing: false, gen: 0,
    // iteration 24: freeze-continue state. `frozen` gates every junction of the
    // presentation chain; `hold` holds the ONE parked continuation (the chain is
    // strictly serial, so at most one junction can be parked at a time)
    frozen: false, hold: null, live: false,
    onTick: opts.onTick ?? (() => {}), onEnd: opts.onEnd ?? (() => {}),
    play() {
      if (this.playing) return;
      this.playing = true;
      this.frozen = false;
      resumeTyping(); // release a character stream parked mid-stream by pause()
      setPacerState({ frozen: false });
      const h = this.hold;
      this.hold = null;
      if (h) { h(); return; } // resume the frozen chain from its junction
      if (this.live) return; // mid-moment: the parked stream / outstanding
                             // wait resumes on its own — no idx+1 double-start
      this.drain();
    },
    pause() {
      // idempotent (like HTMLMediaElement.pause(): no effect when already
      // paused). The chain is NOT killed here: its guards now stop at their next
      // junction and park instead (see gate()). Text stops mid-character.
      this.playing = false;
      this.frozen = true;
      freezeTyping();
      setPacerState({ phase: "idle", frozen: true, gen: this.gen });
      // the gap (the only junction with a live registry handle at freeze time)
      // is cleared like before — the old handle must die so a later seek can
      // never fire it into the new chain; resume re-schedules the beat fresh
      if (this.timer) {
        clearPause(this.timer);
        this.timer = null;
        const i = this.idx;
        this.hold = () => this.scheduleGap(i, this.factor);
      }
    },
    setFactor(f) {
      const prev = this.factor;
      this.factor = f;
      setPacerState({ factor: f, charMs: instantFactor(f) ? 0 : this.pace.charMs / f });
      // the last blind spot: a pause already queued but unfired would otherwise
      // outrun the new speed. Reorder its REMAINING wait (the value decided at
      // scheduling time — clamp range / rand draw — is never re-rolled)
      if (f !== prev) rescaleLivePauses(f);
    },
    // iteration 24: the junction gate of the presentation chain. Every callback
    // that continues the chain (entrance→text, text→evidence, evidence item→next,
    // settle→gap, gap→drain) passes through here: stale ⇒ drop (seek/restart),
    // frozen ⇒ park as the resumption point, else run. This is the coroutine
    // continuation of the chain — pause no longer bumps gen, so the bump moved to
    // invalidate() (hardSeek / drag-commit / fresh present)
    gate(gen, fn) {
      if (gen !== this.gen) return;
      if (this.frozen) { this.hold = fn; return; }
      fn();
    },
    invalidate() {
      this.gen++;
      this.hold = null;
      this.frozen = false;
      this.live = false;
      setPacerState({ gen: this.gen, frozen: false });
    },
    drain() {
      if (!this.playing || this.timer || this.pending != null) return;
      const next = this.queue.length ? this.queue.shift() : (this.idx + 1 < this.moments.length ? this.idx + 1 : null);
      if (next == null) { this.playing = false; this.live = false; setPacerState({ phase: "done" }); this.onEnd(); return; }
      setPacerState({ queue: this.queue.length });
      this.present(next);
    },
    present(i) {
      const m = this.moments[i];
      this.idx = i;
      this.pending = i;
      this.hold = null; // a fresh chain supersedes any parked continuation
      this.live = true;
      const gen = this.gen = this.gen + 1;
      const pace = this.pace, factor = this.factor;
      const instant = instantFactor(factor);
      setPacerState({
        factor, idx: i, gen, queue: this.queue.length, phase: "card", chars: 0,
        textLen: (m.detail || "").slice(0, this.stack.detailLen).length,
        charMs: instant ? 0 : pace.charMs / factor,
        paceName: pace === PACER ? "pacer" : "demo",
        frozen: false, evShown: 0,
      });
      // 1. card enters immediately (previous card's gap already separated them);
      //    the entrance animation duration is set from pace.entrance so it scales
      const card = pushStackCard(this.stack, m, true, { entrance: (pace.entrance ?? 420) / factor, instant, evInstant: instant });
      pruneStack(this.stack);
      this.stack.lastIdx = i;
      this.pending = null;
      this.onTick(m, i);
      const runText = () => {
        // 2. after the entrance animation truly finished → stream text (constant,
        //    fluent). streamText recomputes the cadence from the LIVE factor on
        //    every character; pause() parks it mid-character via freezeTyping
        streamText(card.querySelector(".sc-detail"), (m.detail || "").slice(0, this.stack.detailLen),
          { charMs: pace.charMs, getFactor: () => this.factor, instant, onDone: () => {
            this.gate(gen, () => {
              wireLightbox();
              // 3. evidence: computing pause → items fill in one-by-one (random per
              //    item); sequenceEvidence re-reads the live factor per item and
              //    parks its own junctions through the same gate when frozen
              sequenceEvidence(card, m, pace, () => this.factor, () => gen === this.gen,
                () => this.scheduleGap(i, factor), (cont) => this.gate(gen, cont));
            });
          }});
      };
      afterEntrance(card, () => this.gate(gen, runText), instant, Math.max(90, (pace.entrance ?? 420) * 2 / factor));
    },
    // 4. the constant gap mirroring real cadence (clamp-then-divide ≡
    //    divide-then-clamp), shared by the present chain and the frozen-chain
    //    resume: a pause mid-gap drops the queued beat and the resume schedules
    //    it FRESH (the full value, at the live factor — the same clamp formula,
    //    so every logged gap keeps satisfying the bound invariants; the remaining
    //    fraction is NOT preserved: the inter-card beat restarts, like a player
    //    restarting a paused inter-track transition)
    scheduleGap(i, factor) {
      const m = this.moments[i], pace = this.pace, gen = this.gen;
      const nextRel = this.moments[i + 1]?.rel;
      const realGap = nextRel != null ? nextRel - m.rel : pace.gapMin;
      const gap = instantFactor(factor) ? 0 : Math.min(Math.max(realGap, pace.gapMin), pace.gapMax) / factor;
      const scheduled = Math.max(30, gap);
      logPacerDelay("gap", scheduled, factor);
      setPacerState({ phase: "gap" });
      this.timer = scalePause("gap", scheduled, factor, 30, () => { this.timer = null; this.gate(gen, () => { this.live = false; this.drain(); }); });
    },
    hardSeek(idx) {
      this.pause();
      cancelTyping();
      this.invalidate(); // kills any frozen continuation of the old chain
      this.queue = [];
      this.pending = null;
      this.idx = idx;
      rebuildStack(this.stack, this.moments, idx);
      this.stack.lastIdx = idx;
      setPacerState({ queue: 0, idx, phase: "idle" });
      if (idx >= 0) this.onTick(this.moments[idx], idx);
    },
  };
  return p;
}

// ── module: src/scripts/utils/pages.js ──
// pages.js — 页 ↔ 视图映射与跨页导航原语（iteration 70，多页拆分 I 期）。
//
// 分层（本仓模块环红线不动）：本模块是「水暖层」的无应用依赖表——只 import 零产
// 品模块。视图 token 与 hash.js 的 NAV_VIEWS 一一对应（fragment 家族不变：视图
// 寻址仍由 hash.js 解析；本模块只回答「这个视图住在哪个 html 文件」）。
//
// run 页不是视图：它由 convert 表单经 URL 交接参数到达（无 fragment 地址），其
// 视图归属 = convert（顶栏 tab 归属同理：演示是转换流的延续）。故视图→页的映射
// 是函数，页→视图是表（run 归 convert）。
// 第 77 次：原片回放（source 视图 + source.html）随原片功能整体退场，映射回到三视图。

// 视图 → 页文件（源页与 dist 页同名；相对路径使 4 页 + 共享束相对自洽）
const PAGES = {
  convert: "index.html", // 78 期：convert 页文件名改 index.html（首页）；视图 token 不变
  library: "library.html",
  history: "history.html",
};

// 页 → 视图（body[data-page] 的身份 → 它承载的视图）
const PAGE_TO_VIEW = {
  convert: "convert",
  run: "convert", // 演示页：转换流的延续，视图归属 convert
  library: "library",
  history: "history",
};

// 视图 → 页（未知视图抛错：跨页调用方（convert.js / library.js）的错配显式失败，
// 而不是静默落到一个错误页面——与 hash.js 的「非法值显式失败」同口径）
function pageFor(view) {
  const p = PAGES[view];
  if (!p) throw new Error(`pages.js: unknown view "${view}" (known: ${Object.keys(PAGES).join(", ")})`);
  return p;
}

// 当前文档承载的视图（页身份 = body[data-page]；缺失回落 convert）
function pageView() {
  return PAGE_TO_VIEW[document.body.dataset.page] || "convert";
}

// 跨页离散导航（替代 SPA 形态的 switchView 路径）：一次文档导航 = 一条历史条
// 目（与 SPA 的「视图切换写一条 push」语义对齐；fragment 透传给目标页 boot 消费）
function goPage(view, fragment) {
  location.assign(pageFor(view) + (fragment || ""));
}

// run 页「查看讲义」的交接形态：library 页 + ?doc=<runId> 弹层深开。
// 选 search param 而非 fragment：弹层深开是页级关注点，fragment 家族保持
// history-only 语义（hash.js 的 parseHash 语法逐字不变）
function goDoc(runId) {
  location.assign(PAGES.library + "?doc=" + encodeURIComponent(runId));
}

// ── module: src/scripts/components/pipeline-data.js ──
// pipeline-data.js — 管道车间的**轨迹数据常量层**（第 65 次自 pipeline.js 拆出，结构轮）。
//
// 单一职责：场景内容的**真实数值集**（逐条出处 = 会话记录行号或 materials/ 文件，
// 详见 docs/Explore_64.md §1）+ 场景渲染共用的**微助手**。零 import ⇒ 在打包器
// （build-inlined.js 的依赖拓扑里）是最底层模块 ⇒ 永不循环依赖。
//
// 第 82 次重锚（数据源整体替换为 black_hat_usa_2026）：全部常量改述新会话真值——
// 下载端点改 VP9/1920×1080/678 MB；字幕由「4 轨含手动 CC」改「单一 ASR 自动轨」；
// s2 由「三批 35 候选 + talking_head 误报替换」改「179 帧密集样本 + OCR 选图 +
// 20 幅成图 + bands.json 被覆写重裁」——选图路线差异见 docs/Explore_82.md §1。
// 帧名约定变更：旧「候选名 cand/*」→ 新「密集样本帧名 frames/f_NNN」（t = 15×NNN，
// 与 fps=1/15 抽帧同源）；candImg 随之改 frameImg 落 assets/frames/。
//
// 为什么微助手（byId / clamp01 / mmss / frameImg / litN）也住在本模块：build-inlined.js
// 把全部模块拼接进**同一个作用域**（遮罩扫描剥离 import/export 后按拓扑序拼接），
// 两个模块各声明同名 const/function 会直接 SyntaxError；把数据与共享微助手同住一处 =
// 单一声明点，消费方（pipeline-cuts.js / pipeline.js）一律 import，拓扑无环。
// 它们不进 utils.js：utils.js 是「无 DOM 依赖的纯函数工具」（byId / litN 是 DOM 写入），
// 而本层数值的格式（mmss / frame 路径）与渲染原语只服务管道车间。

// L19/L25 下载阶（yt-dlp 元数据探测 → 自动字幕 → 视频流后台下载 → 封面 → SSL 重试等待）
const DOWNLOAD = {
  steps: ["解析网页与元数据", "下载自动字幕轨", "下载视频流（后台）", "获取封面图", "等待下载完成（SSL 重试）"],
  // 端点事实：L101/102 结果 / materials/metadata.json（678 MB 原片真身留 materials/；
  // 83 期产物不再含视频字节——无播放功能，探头用 assets/frames 同秒帧图，见
  // pack-assets.sh 与 pipeline-cuts.js 头注释）
  endpoint: { bytes: "710 538 461 B", dur: "2686.581 s", codec: "VP9", res: "1920×1080" },
  cover: "assets/cover.jpg",
};

// L25 下载的可用字幕轨（全部为 ASR 自动字幕，无手动 CC）+ 两条派生轨：
// audio.srt = subs.en-orig.deov（去重叠归档，675 条）；clean = 用户要求的附录清洗版
// （L126–164 三次重写，去口水词/修 ASR 近音词/重建大小写，233 段 13 节）
const SUBTRACKS = [
  { tag: "en-orig", zh: "英文自动字幕", line: "ASR 自动轨（无手动 CC）" },
  { tag: "audio", zh: "去重叠归档", line: "audio.srt · 675 条" },
  { tag: "clean", zh: "附录清洗版", line: "transcript_clean.srt · 233 段" },
];
const SUB_HEALTH = "英文字幕 675 条 · 覆盖率 0.9987 · 唯一可用轨 = 英文 ASR 自动字幕（无手动 CC）";
const SUB_FINAL = "去重叠归档 audio.srt（L39–43）· 清洗版 233 段（用户要求文末附录，L126–164）";

// L102 单批 ffmpeg `fps=1/15` 密集抽帧 → 179 帧样本（frames/f_001…f_179）；
// L112–176 全片 OCR（rapidocr，107 条）定位幻灯片 → L189–207 裁 19 幅成图（OCR 三向
// 验证通过）+ L223 补裁 1 幅（达 verify_notes 的 20 文件门槛建）= 20 张唯一成图源帧。
// 去重口径 = **帧名**（20 帧唯一）；裁剪统一去 bands.json 的 155px 底部导航条。
// 事故点：bands.json 被 ocr_hardsubs detect --geometry 覆写（L197）→ 重新测量再重裁。
const CUT_BATCHES = [
  { line: "L189–207", name: "批一 · OCR 选图裁剪", calls: 19, names: ["f_062", "f_065", "f_092", "f_096", "f_106", "f_110", "f_119", "f_125", "f_127", "f_130", "f_133", "f_140", "f_144", "f_148", "f_150", "f_159", "f_165", "f_167", "f_172"] },
  { line: "L223", name: "批二 · 补 1 幅达 20 门槛建", calls: 1, names: ["f_111"] },
];
// 20 唯一帧名（批序拼接；无重复名）
const CUT_UNIQUE = CUT_BATCHES.flatMap((b) => b.names);
// 84 期：判别扫描的「入选」判定源——标签流中落在该集合的帧名转绿
// （判过 ≠ 入选：179 帧全部判过，20 帧入选教学图）
const PICK_SET = new Set(CUT_UNIQUE);
// bands 覆写注记的派发点：首个源帧落格即揭示（事故发生在全部最终裁剪之前，L197）
const CUT_NOTE_AT = 1;
const CUT_OVERWRITE = "bands.json 被 ocr_hardsubs detect --geometry 覆写 → 重新测量底部导航条再裁剪（L197）";
const CUT_NOTE = "L102 密集抽帧（fps=1/15）→ 179 帧样本；L112–176 全片 OCR 107 条 → 选 20 幅幻灯片裁剪成图";

// 帧评分真值（materials/frame_scores.json，L106–108 评分）：talking_head = 0（纯幻灯片
// 演讲，无一帧人物特写）——评分门全部通过，成图选择由 OCR 文本决定。
// f_002 = 第 2 帧（t=30s）蒙太奇高动；f_062 = fig_01 源帧；f_150 = fig_15 源帧。
// info 为 frame_filter 的画面信息量度量（并非选图依据——选图 = OCR，见 CUT_NOTE）。
const SCORE_FRAMES = 179; // L102 密集抽帧的 179 帧样本数（frames/f_001…f_179；评分逐帧过堂的对象基数，与 CUT_NOTE 同源）
const SCORES = [
  { frame: "f_002", t: 30, info: 0.4506, reject: false, verdict: "通过 · 非人物特写" },
  { frame: "f_062", t: 930, info: 0.1308, reject: false, verdict: "通过 · 入选教学图 fig_01（OCR）" },
  { frame: "f_150", t: 2250, info: 0.4684, reject: false, verdict: "通过 · 入选教学图 fig_15（OCR）" },
];
const TRI_TRACKS = ["时间轴", "字幕文本", "画面文字（OCR）"]; // L199 verify_figures 三向核验
const TRI_NOTE = "20 幅教学图全部通过三向核验（L207 首批 19 幅 + L223 补 1 幅）";

// L118 探测口径 → L181–187 写入 numerical_claims.tsv（27 条全部带机器时间且全部进正文）
const CLAIMS = [
  ["til agents do 100% of your work", "100%", "40:23"],
  ["ing by eating 90% of your work", "90%", "40:29"],
  ["CTF 约 30 年前在 DEF CON 诞生", "30年前", "04:54"],
  ["CTF 起源于约 31 年前的一场网络攻防战", "31年前", "05:07"],
  ["Yan 8 岁时随家人逃离苏联", "8岁", "06:49"],
  ["Shellphish 用 angr 统治全球 CTF 约两年", "2年", "07:35"],
  ["angr 被用于超过 1000 个研究、学术与产品工具", "1000", "07:48"],
  ["分析能力从 8 个程序扩展到 800 个", "8 800", "15:25"],
  ["HarmonyOS 部署在 10 亿台设备上", "10亿", "25:03"],
  ["Mythos 在 Linux 内核发现 479 个漏洞（华盛顿邮报 6 月报道）", "479", "28:35"],
  ["数十个上一代 GPT 堆叠产出约 300 个漏洞", "300", "28:55"],
  ["三个 GPT 加工作流达到约 600 个本地提权漏洞", "600", "30:13"],
  ["加入漏洞属性后超过 1024 个本地提权漏洞", "1024", "30:50"],
  ["发现速度约为报告速度的 10 倍", "10倍", "31:22"],
  ["每披露 1 个漏洞约危及 3 倍的设备", "3倍", "32:32"],
  ["Rust 重写的 coreutils 出现 79 个 CVE（讲者说法）", "79", "37:24"],
  ["Zellic 审计发现 113 个问题、其中 44 个分配 CVE", "113 44", "37:13"],
  ["Yan 从事进攻性漏洞研究超过 15 年", "15年", "38:24"],
  ["pwn.college 每月约 10000 名活跃学习者", "10000", "39:48"],
  ["Firmalice 论文只用 3 个固件样本评估", "3", "41:43"],
  ["Firmalice 论文发表于约 11 年前", "11年前", "41:33"],
  ["现代工作扩展到 1000 个固件样本", "1000", "42:10"],
  ["ARBITER 幻灯片总计 1,182,241 个目标、1,130 个报警、661 个漏洞", "1,182,241 1,130 661", "15:29"],
  ["ARBITER 论文在 76,516 个二进制上评估", "76,516", "15:37"],
  ["SoK 综述 116 篇 Android 安全文献、提取 56 个设计级漏洞", "116 56", "23:46"],
  ["OpenHarmony 复现其中 24 个漏洞", "24", "23:46"],
  ["披露研究确认 422 组此前未知的设备-攻击组合、涉超过 100 万台设备", "422 100万", "32:14"],
];
const RT_CHIPS = ["外部检索与核对 · 首轮（下载等待期并行，L57–92）", "独立报道与论文核对（WeLiveSecurity / NDSS / ASU / IEEE S&P）", "二轮补证（uutils CVE，L178）"];

const ENV_TOOLS = ["依赖工具就位", ".venv 环境发现", "视频下载组件", "音频处理组件", "排版编译组件", "图像处理组件", "OCR 组件", "平台探测 YouTube"];
// yt-dlp 2026.08.19（会话日 2026-10-03）→ 46 天内，仍为近期版本；.venv 为 L11 失误后定位
const ENV_FACT = "工作目录与 .venv 就位 · 下载组件为近期版本（46 天内）· 视频元数据探测完成";

const LATEX_STEPS = ["读取模板与写作参考", "撰写笔记正文（LaTeX 源）", "修订笔误与交叉引用", "xelatex 编译（修复 TikZ 错误）", "pdftotext 渲染校验"];
// L263/264 两遍退 0 → 33 页；CJK 首读 7766（L278 验收）→ 修订后 7779（L318 终验）
const PDF = { pages: 33, bytes: "3 928 374 B", cjkFirst: 7766, cjkLast: 7779 };
// 76: s4 pdf-strip 的页面图成形（渲染页路径由 pages 派生；src 落到位才写入——
// 65 期 src-at-arrival 纪律，避免演示前段一次性解码 33 张）
const PDF_PAGE_IMGS = Array.from({ length: PDF.pages }, (_, i) => `assets/pages/page-${String(i + 1).padStart(2, "0")}.jpg`);

const ARCHIVE = ["读取经验库规范", "通用清洗脚本入库", "更新经验文档（5 份）", "压缩去重归档", "经验固化为知识（L390）"];

// 新会话的错误结果（17 处，按阶段归 4 条；53 后随 pipe-recovery 组件退役为文档性常量）
const INCIDENTS = [
  { stage: "s0", maxRel: 11000, tag: "L11 · bash 返回 error 127（.venv/python 路径不存在）", note: "bash 未成功 → 定位 .venv 后改绝对路径重试" },
  { stage: "s2", maxRel: 1501000, tag: "L125/145/155 · clean_transcript.py 三次脚本失败（段落合并过激 / ASR 噪声误删）", note: "python 未成功 → 三次重写后通过（233 段清洗版）" },
  { stage: "s3", maxRel: 2553000, tag: "L230/234 · edit 未命中（oldText 漂移 / 无变化）", note: "edit 未成功 → 查实际文本后重试成功" },
  { stage: "s3", maxRel: 2705000, tag: "L300/306 · 修订脚本断言失败（措辞锚字漂移）", note: "断言未过 → grep 实际文本后修正重跑" },
];
const INCIDENT_GENERIC = { tag: "遇到 1 处小障碍", note: "工具调用未成功 → 自动改写策略重试后继续" };

const PHASES = [
  { key: "s0", name: "环境检查" }, { key: "s1", name: "获取源与字幕" }, { key: "s2", name: "选取笔记图" },
  { key: "s3", name: "撰写与交付" }, { key: "s4", name: "沉淀经验" }, { key: "s5", name: "收尾对账" },
];

// 83 期：帧 → 成图映射（figure_manifest.tsv 的 figure/frame 两列）——抽帧探头右格
// 由「同一帧图」改「该帧裁出的成图」后，左格帧 ↔ 右格成图 = OCR 选图→裁剪的因果对
const FIG_BY_FRAME = {
  f_062: "fig_01_three_ways", f_065: "fig_02_arbiter_table", f_092: "fig_03_vuln_properties",
  f_096: "fig_04_sok_openharmony", f_106: "fig_05_dlv_table", f_110: "fig_06_nextgen_models",
  f_119: "fig_07_workflow", f_125: "fig_08_benchmark_1024", f_127: "fig_09_disclosure_question",
  f_130: "fig_10_disclosure_dataset", f_133: "fig_11_toomanybugs", f_140: "fig_12_safelibs",
  f_144: "fig_13_port_rust_joke", f_148: "fig_14_gen_time_cves", f_150: "fig_15_osssec_uutils",
  f_159: "fig_16_human_learning", f_165: "fig_17_quotes_1975_2015", f_167: "fig_18_firmalice",
  f_172: "fig_19_sharpening", f_111: "fig_20_who_would_win",
};

/* ---------- 共享微助手（单作用域 bundle 的单一声明点，见文件头） ---------- */
const byId = (id) => document.getElementById(id);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
const frameImg = (name) => `assets/frames/${name}.jpg`;
const figImg = (name) => `assets/figures/${name}.jpg`; // 83 期：探头右格成图路径

// 通用点亮：容器内前 n 个子节点转 .on（toggle(force) ⇒ 幂等，过渡只触发一次
// = renderStepper / renderArts 的第 46/49 次机制）。渲染原语，driver 与 cuts 共用。
const litN = (container, n) => {
  if (!container) return;
  const items = container.children;
  for (let i = 0; i < items.length; i++) items[i].classList.toggle("on", i < n);
};

// ── module: src/scripts/components/pipeline-cuts.js ──
// pipeline-cuts.js — 管道车间 s2 帧网格与抽帧探头（第 65 次自 pipeline.js 拆出，结构轮）。
//
// 单一职责：**s2 选取笔记图**相位的呈现与渲染——抽帧网格（第 82 次重锚：L102 单批
// `fps=1/15` → 179 帧密集样本；L112–176 全片 OCR 107 条定位幻灯片 → L189–207 裁
// 19 幅 + L223 补 1 幅 = 20 张唯一成图源帧）的 DOM 构建器、按相位进度的逐帧点亮、
// 抽帧探头与帧评分/三向核验的渲染入口，以及这些 DOM 的重跑复位。拆分理由
// = s2 是管道车间内容密度最高、迭代最陡的相位面，独立模块给后续 s2 侧迭代留最大
// 余量（pipeline.js 500/500 零余量债务的清理目标）。布局（iteration 74，运营方指令
// 「三个横向排布动画组件修改为 pipe-probe 和 pipe-scores 组件竖向排布」）：probe +
// scores 两卡包进 .pipe-s2-side 容器（列向 grid），.pipe-s2 遂为二项网格 = cuts 一列 +
// 侧列竖排（scores 仍在末位，位置不变）；渲染读点全部 byId，DOM 包装零失锚。
//
// 80 期「抽帧探头双通道」（video seek + 同秒帧图覆盖层）已于 83 期整条退休：产品
// 没有任何线性播放 mp4 的功能，video 通道的全部可见信息 = 已打包的同秒帧图
// （assets/frames/f_NNN.jpg），故左格改为直接显示帧图；右格同时由「同一帧」改为
// 「该帧裁出的成图」（assets/figures/fig_XX.jpg，帧-图映射见 pipeline-data 的
// FIG_BY_FRAME）——探头从「视频 vs 静帧」变为「原片帧 → 裁剪成图」的因果对照，
// 信息量更高且产物 -44.2 MB 视频。退休清单（删除优于兼容，0.1 原则 8）：
// wireProbe / probeTarget / probeLive / probeWired / seeked 监听 / .probe-video /
// .probe-frame 绝对覆盖层。无 video ⇒ 80 期「无 byte-range 服务下 video 黑屏」的
// 根因不复存在，机制历史见 docs/Explore_80.md §2。
//
// 生长机制（第 65 次，运营方指令「帧不是同时准备好的，而是随着每一帧加入所在
// 容器逐渐增高」）：渲染语义逐字不变（点亮 = 纯函数 `litCutCells` 的 `classList
// .toggle(force)`，幂等、零计时器），生长全部由 pipeline.css 的 `.cut-cell` 族
// 承担（未点亮格 `display:none`（零预留槽位 / 零骨架），点亮格由 `@starting-style`
// 起跳、`padding-bottom` 通道从零面积生长到 16/9 槽位（aspect-ratio 不可过渡，
// 机制与终态几何等式见 docs/Explore_65.md §1）。到场时刻 = 点亮时刻 = 相位进度的
// 线性代理，故自动继承演示调速 / 暂停冻结-续播 / 视图隐藏冻结（第 64 次机制逐字不变）。


let curProbe = "";   // 探头当前落点的帧名（同名不重复渲染）

// 帧名 → 秒（密集样本帧 f_NNN 的抽帧点 = 15×NNN，与 fps=1/15 同源）
const tOf = (name) => 15 * +(String(name).match(/_(\d+)$/u) || [])[1];
// 序号 → 帧名（f_002…f_179，与抽帧命名同源，判别标签流用）
const frameName = (k) => "f_" + String(k).padStart(3, "0");

/* ---------- s2 构建器（首次渲染时一次性建 DOM，节点身份保持 ⇒ 过渡有 from 态） ---------- */

function phaseS2() {
  const batchHtml = CUT_BATCHES.map((b) => `
    <div class="cut-batch" data-batch="${b.line}">
      <div class="cb-head"><b>${b.name}</b><span>${b.line} · ${b.calls} 次调用</span></div>
      <div class="cb-cells">${b.names.map((name) => `
        <div class="cut-cell" data-t="${tOf(name)}" data-name="${name}">
          <img alt="密集样本帧 ${name}（${mmss(tOf(name))}）" loading="lazy" decoding="async">
          <span class="cc-t">${mmss(tOf(name))}</span>
        </div>`).join("")}
      </div>
    </div>`).join("")
  return `<section class="pipe-phase" data-phase="s2" hidden>
    <div class="pipe-s2">
      <div class="pipe-card pipe-cuts" id="pipeCuts">
        <div class="pc-head"><span>抽帧网格 · ffmpeg</span><span class="pc-badge" id="cutBadge">0 / ${CUT_UNIQUE.length} 帧</span></div>
        <div class="cut-note-cap" id="cutNoteCap">${CUT_NOTE}</div>
        <div class="cut-note" id="pipeOverwrite" hidden>${CUT_OVERWRITE}</div>
        ${batchHtml}
      </div>
      <div class="pipe-s2-side">
      <div class="pipe-card pipe-probe">
        <div class="pc-head"><span>抽帧探头 · 帧→成图</span><span class="pc-badge" id="probeBadge">t = —</span></div>
        <div class="probe-pair">
          <figure class="probe-source"><img id="probeFrame" alt="原片在这一秒的帧" decoding="async"><figcaption>原片帧（含导航条）</figcaption></figure>
          <figure class="probe-cand"><img id="probeImg" alt="该帧裁出的成图" decoding="async"><figcaption id="probeCap">等待落帧</figcaption></figure>
        </div>
        <div class="probe-why">左 = 原片在这一秒的帧（assets/frames · 密集样本）· 右 = 去除 155px 导航条后的成图（assets/figures）</div>
      </div>
      <div class="pipe-card pipe-scores">
        <div class="pc-head"><span>帧评分与三向核验</span><span class="pc-badge" id="scoreBadge">已判 0 / ${SCORE_FRAMES} 帧</span></div>
        <!-- iteration 81：逐帧判别扫描条——L102 密集抽帧 179 样本的单行等宽刻度，
             扫描窗随相位进度逐帧推进（扫到的刻度转亮 = 该帧已评分）；85 期起
             判定行改插入式滚动窗（litScoreRows：到达帧号才 prepend 插入，
             3 满删底部最旧），三向核验在扫描收尾后逐项点亮 —— renderS2 的 judged 派生 -->
        <div class="judge-strip" id="judgeStrip" aria-hidden="true">
          ${Array.from({ length: SCORE_FRAMES }, (_, k) => `<span class="jt"></span>`).join("")}
          <i class="judge-scan" id="judgeScan" style="width: ${(100 / SCORE_FRAMES).toFixed(3)}%"></i>
        </div>
        <!-- 84：帧过滤标签流（运营方指定形态）——扫描条正下方逐个落标签 f_NNN；
             滚动窗口 = 最近 10 个（judged > 10 ⇒ 头部出 「…」表示更早的还有很多；
             总数计数随徽章单调不减）；入选教学图的帧转绿（判过 ≠ 入选） -->
        <div class="judge-tags" id="judgeTags"></div>
        <!-- 85：判定行容器初始为空（插入式滚动窗——不再预渲染暗色待定行） -->
        <div class="score-rows" id="pipeScores"></div>
        <div class="tri-verify" id="pipeTri">
          ${TRI_TRACKS.map((t) => `<div class="tri-track"><i></i><span>${t}</span></div>`).join("")}
        </div>
        <div class="tri-note" id="pipeTriNote" hidden>${TRI_NOTE}</div>
      </div>
      </div>
    </div>
  </section>`;
}

/* ---------- 纯呈现渲染：s2 相位进度 → 帧网格 / 探头 / 评分 ---------- */

function renderS2(p, done) {
  const lit = Math.round(clamp01(p) * CUT_UNIQUE.length);
  litCutCells(lit);
  byId("cutBadge").textContent = `${lit} / ${CUT_UNIQUE.length} 帧`;
  // 批一+批二落满后（第 CUT_NOTE_AT 个单元）赌出覆写注记（真实事故点，派生自相位进度）
  byId("pipeOverwrite").hidden = lit < CUT_NOTE_AT;
  // 探头：随最新落点位渲染帧-图对（同帧名不重复渲染；83 期起无 video 通道）
  if (lit > 0) {
    const name = CUT_UNIQUE[lit - 1];
    if (name !== curProbe) {
      curProbe = name;
      const t = tOf(name);
      const figBase = FIG_BY_FRAME[name];
      const frame = byId("probeFrame");
      if (frame) { // 左格：原片在这一秒的帧（assets/frames，与抽帧点同源真值）
        frame.src = frameImg(name);
        frame.alt = `原片帧 ${name} · t=${t}s · ${mmss(t)}`;
      }
      byId("probeImg").src = figImg(figBase); // 右格：该帧裁出的成图
      byId("probeImg").alt = `成图 ${figBase}（自原片帧 ${name} 裁剪）`;
      byId("probeCap").textContent = `${name} → ${figBase}`;
      byId("probeBadge").textContent = `t = ${t} s · ${mmss(t)}`;
    }
  } else {
    byId("probeBadge").textContent = "t = —";
  }
  // iteration 81：逐帧判别扫描——相位进度派生 judged（0→179），扫描条逐帧推进、
  // 判定行在其帧号被扫到时落定（帧号 = 帧名 f_NNN 的 N：f_002=2、f_062=62、f_150=150），
  // 三向核验在扫描收尾后逐项点亮（真实顺序：L189–223 裁完才 L199 三向验证）
  const judged = Math.round(clamp01(p) * SCORE_FRAMES);
  litJudgeStrip(judged);
  litJudgeTags(judged);
  byId("scoreBadge").textContent = judged >= SCORE_FRAMES ? "无人物特写帧 · OCR 107 条（L176）" : `已判 ${judged} / ${SCORE_FRAMES} 帧`;
  litScoreRows(judged);
  const triStart = 0.86, triStep = 0.04; // 时间轴 → 字幕文本 → 画面文字（OCR），逐项点亮
  const triOn = p < triStart ? 0 : Math.min(TRI_TRACKS.length, Math.floor((p - triStart) / triStep) + 1);
  litN(byId("pipeTri"), triOn);
  byId("pipeTri").classList.toggle("aligned", p >= 0.965 || !!done);
  byId("pipeTriNote").hidden = !(p >= 0.98 || !!done);
}

// 网格点亮：按批次顺序点亮「新落帧」（20 帧名无重复，全部为新帧）。
// 缩略图 src 在点亮时才写入 —— 「真图入网格」的字面语义，也避免演示前段一次性发起 20
// 张解码（跨路径截图/探针的时机负担）。逐帧生长由 .cut-cell 的 CSS 承担（点亮即从零
// 面积生长，见文件头）。
function litCutCells(lit) {
  let used = 0;
  byId("pipeCuts").querySelectorAll(".cut-batch").forEach((batch) => {
    const cells = [...batch.querySelectorAll(".cut-cell")];
    const got = Math.max(0, Math.min(cells.length, lit - used));
    used += cells.length; // 批次之间按「新帧」记账（20 张成图源帧）
    cells.forEach((c, i) => {
      c.classList.toggle("on", i < got);
      if (i < got) { const im = c.querySelector("img"); if (im && !im.getAttribute("src")) im.setAttribute("src", frameImg(c.dataset.name)); }
    });
  });
}

// 84：帧过滤标签流——判别扫到第 k 帧即落一个 f_NNN 标签（滚动窗口 = 最近 10 个，
// judged > 10 ⇒ 头部补一个「…」表示更早的还有很多；总数计数由徽章单调不减承载）。
// 追踪 judgedSeen：前进 = 只追加新标签（幂等，过渡只触发一次）；回退（drive 跳点 /
// reset 后重入）= 整表清空再按目标重建（「回退是跳回」的 47 期词汇）。
// 入选帧（PICK_SET）转绿 = 「判过 ≠ 入选」的一眼可辨（运营方问题「表现不出哪些选中」）
const JUDGE_WINDOW = 10;
let judgedSeen = 0;
function litJudgeTags(judged) {
  const host = byId("judgeTags");
  if (!host) return;
  if (judged < judgedSeen) { host.innerHTML = ""; judgedSeen = 0; }
  if (judged > judgedSeen) {
    for (let k = judgedSeen + 1; k <= judged; k++) {
      const name = frameName(k);
      host.insertAdjacentHTML("beforeend",
        PICK_SET.has(name)
          ? `<span class="jt-tag is-pick" title="入选教学图（OCR 选定）">${name}</span>`
          : `<span class="jt-tag">${name}</span>`);
    }
    judgedSeen = judged;
    // 窗口滚动：超出的旧标签即时退场（退场无动画 = 零计时器纪律；总数计数不减）
    const tags = host.querySelectorAll(".jt-tag");
    for (let i = 0; i < tags.length - JUDGE_WINDOW; i++) tags[i].remove();
    if (judged > JUDGE_WINDOW && !host.querySelector(".jt-more"))
      host.insertAdjacentHTML("afterbegin", `<span class="jt-more" aria-hidden="true">…</span>`);
  }
}
// 85：判定行 = 插入式滚动窗（运营方指令「要有插帧的感觉；3 帧满了就自动
// 将最后一个删除」）——扫描到达判定帧号 ⇒ prepend 插入（最新判定在顶部，
// 诞生即 .on，复用 80 期 blockIn / valuePop / verdictStamp 三段入场动画）；
// 插入后 >= SCORE_WINDOW(3) ⇒ 删底部 .score-row（prepend 布局下「最后一个」
// = 最旧——与 84 期标签流「旧标签被替换」同一 FIFO 语义；数据仅 3 条判定 ⇒
// 满即删 f_002，终态 [f_150, f_062] 两条入选判定）。
// scoreSeen 追踪回退（judged 下降 ⇒ 整表重建，47 期「回退是跳回」词汇）。
const SCORE_WINDOW = 3;
let scoreSeen = 0;
const scoreRowHtml = (s) => `<div class="score-row ${s.reject ? "is-reject" : "is-keep"} on" data-frame="${s.frame}"><div class="sr-head"><span>${s.frame} · t=${s.t}s</span><span>${s.info}</span></div><div class="sr-bar"><i style="--w:${(s.info * 100).toFixed(1)}%"></i></div><div class="sr-verdict ${s.reject ? "reject" : "keep"}">${s.verdict}</div></div>`;
function litScoreRows(judged) {
  const host = byId("pipeScores");
  if (!host) return;
  const arrived = SCORES.filter((s) => judged >= +String(s.frame).slice(2)).length;
  if (arrived < scoreSeen) { host.innerHTML = ""; scoreSeen = 0; } // 回退：整表重建
  while (scoreSeen < arrived) {
    host.insertAdjacentHTML("afterbegin", scoreRowHtml(SCORES[scoreSeen]));
    scoreSeen++;
    const rows = host.querySelectorAll(".score-row");
    if (rows.length >= SCORE_WINDOW) rows[rows.length - 1].remove(); // 满窗删底部（最旧）
  }
}

// 逐帧判别扫描条：前 judged 个刻度转亮 + 扫描窗落位（1/179 宽，右缘到 100% 止）
function litJudgeStrip(judged) {
  const strip = byId("judgeStrip");
  if (!strip) return;
  strip.querySelectorAll(".jt").forEach((t, i) => t.classList.toggle("on", i < judged));
  const scan = byId("judgeScan");
  if (scan) scan.style.left = ((judged / SCORE_FRAMES) * (100 - 100 / SCORE_FRAMES)).toFixed(2) + "%";
}

/* ---------- s2 复位（resetPipeline 的第二路径，就地清零 = 46/49 词汇） ---------- */

function resetCuts() {
  curProbe = "";
  const frame = byId("probeFrame");
  if (frame) { frame.removeAttribute("src"); frame.alt = "原片在这一秒的帧"; }
  // 81：判别扫描条复位（刻度全熄 + 扫描窗归零 + 徽章待命）
  byId("judgeStrip")?.querySelectorAll(".jt").forEach((t) => t.classList.remove("on"));
  if (byId("judgeScan")) byId("judgeScan").style.left = "0%";
  // 84：标签流复位（整表清空 + 窗口追踪归零）
  if (byId("judgeTags")) byId("judgeTags").innerHTML = "";
  judgedSeen = 0;
  // 85：判定行滚动窗复位（整表清空 + scoreSeen 归零）
  if (byId("pipeScores")) byId("pipeScores").innerHTML = "";
  scoreSeen = 0;
  if (byId("scoreBadge")) byId("scoreBadge").textContent = `已判 0 / ${SCORE_FRAMES} 帧`;
  byId("pipeCuts")?.querySelectorAll(".cut-cell").forEach((c) => c.classList.remove("on"));
  byId("pipeCuts")?.querySelectorAll(".cut-batch").forEach((b) => b.classList.remove("on"));
  byId("pipeTri")?.classList.remove("aligned");
  byId("pipeTriNote")?.setAttribute("hidden", "");
  const img = byId("probeImg");
  if (img) { img.removeAttribute("src"); img.alt = "该帧裁出的成图"; }
  if (byId("probeCap")) byId("probeCap").textContent = "等待落帧";
  if (byId("probeBadge")) byId("probeBadge").textContent = "t = —";
  if (byId("cutBadge")) byId("cutBadge").textContent = `0 / ${CUT_UNIQUE.length} 帧`;
}

// 探针 / 截图可观测面：state 的 probeT 读子（curProbe 为本模块私有可变态）
function probeT() {
  return curProbe;
}

// ── module: src/scripts/components/pipeline.js ──
// VidNotes 管道车间（Pipeline Scene，组件群 II）：convert 视图「开始转换」之后、
// #runPanel 上方升起的机器动作场景。六个相位（s0–s5）按当前回放轨迹状态切换。
//
// 设计硬线：场景是回放状态的**纯呈现**——渲染入口是 (moment, run) → DOM 的**纯函数**
// （状态写入全用 classList.toggle(force)，幂等：同一时刻重写只产生同一 DOM ⇒ 每步
// 过渡只触发一次 = renderStepper / renderArts 的第 46/49 次机制），**零计时器** ⇒ 自动
// 继承三重既有机制、不引入新的时序状态机：演示调速（factor 1/6/8× 只改变 moment 推进
// 速率）、暂停 / 冻结-续播（第 24 次的 gate/frozen/hold：不推进 moment 即不写入；进行中
// 的 CSS 过渡自行落定 = 卡片冻结同语义）、视图隐藏冻结（第 25 次的 viewswitch → pause：
// 同理，且场景随 #view-convert 一并 display:none）。
//
// 相位派生（可回溯，见 docs/Explore_64.md §1）：相位 = moment.stage（s0–s5；末端
// done 时刻 → 六相位全完成）；相位内进度 p = clamp01((rel − stage.start)/(stage.end −
// stage.start))，rel 由 moment.t 派生（state.js relMoments 同一算式），stage 边界取自
// run.stages（build/product-data.json 既有字段，**数据层零触及**）；单元点亮数 = round(p
// × 单元数) = 真实进展的线性呈现代理（s2 跨度 456 474 ms；三批抽帧真实 rel 锚点 =
// 454 692 / 477 296 / 579 700）。
//
// 第 65 次结构轮（清债：本文件原 500/500 行零余量）：按单一职责拆为三模块——
//   pipeline-data.js = 轨迹数据常量（真实数值集）+ 共享微助手；
//   pipeline-cuts.js = s2 帧网格与抽帧探头渲染（含逐帧生长的语义不变性，见该文件头）；
//   pipeline.js（本文件）= 驱动 / 纯函数渲染（updatePipeline 与相位分发）+ 外部入口。
// 行为零变化：最终 DOM 结构与最终几何逐字不变；bundle / dist 体积小幅变化作事实登记
// （第 35 次拆分 +119 B 纯打包结构的先例口径）。场景内容数值仍是模块常量（出处 = 会话
// 记录行号或 materials/ 文件），不新增任何 run.* 数据字段；资产复用 82 期起自携的
// assets/frames/（成图源帧，83 期探头左格帧图）与 assets/figures/（探头右格成图）；
// 零新增 token /
// 零真 @media。


let built = false;   // 场景 DOM 只建一次（节点身份保持 ⇒ 过渡有 from 态，第 46/49 次机制）
let curPhase = "";   // 当前相位 key（相位切换的唯一写入口）
/* ---------- 构建（首次渲染时一次性建 DOM，节点身份保持 ⇒ 过渡有 from 态）---------- */

function build() {
  if (built) return;
  built = true;
  byId("pipelineScene").innerHTML = `
    <div class="pipe-head">
      <div class="pipe-title"><b>管道车间</b><span>机器动作 · 逐帧随回放状态推进</span></div>
    </div>
    <div class="pipe-body" id="pipeBody">
      ${phaseS0()}${phaseS1()}${phaseS2()}${phaseS3()}${phaseS4()}${phaseS5()}
    </div>`;
}

function phaseS0() {
  return `<section class="pipe-phase" data-phase="s0" hidden>
    <div class="chips" id="pipeS0Chips">${ENV_TOOLS.map((t) => `<span class="chip">${t}</span>`).join("")}</div>
    <div class="factline" id="pipeS0Fact">${ENV_FACT}</div>
  </section>`;
}

function phaseS1() {
  return `<section class="pipe-phase" data-phase="s1" hidden>
    <div class="pipe-cols">
      <div class="pipe-card">
        <div class="pc-head"><span>视频下载 · yt-dlp</span><span class="pc-badge" id="dlBadge">解析中</span></div>
        <ol class="dl-steps" id="pipeDlSteps"></ol>
        <div class="dl-bar"><i id="pipeDlFill"></i></div>
        <div class="dl-end" id="pipeDlEnd">
          <span>${DOWNLOAD.endpoint.bytes} · ${DOWNLOAD.endpoint.dur} · ${DOWNLOAD.endpoint.codec} ${DOWNLOAD.endpoint.res}</span>
          <img src="${DOWNLOAD.cover}" alt="原片封面（下载到达）" loading="lazy" decoding="async">
        </div>
      </div>
      <div class="pipe-card">
        <div class="pc-head"><span>字幕轨 · ${SUBTRACKS.length} 轨下载与清洗</span><span class="pc-badge" id="subBadge">0 / ${SUBTRACKS.length} 轨</span></div>
        <ul class="sub-tracks" id="pipeSubs"></ul>
        <div class="sub-final" id="pipeSubFinal">${SUB_FINAL}</div>
        <div class="sub-health" id="pipeSubHealth">${SUB_HEALTH}</div>
      </div>
    </div>
  </section>`;
}

function phaseS3() {
  return `<section class="pipe-phase" data-phase="s3" hidden>
    <div class="pipe-cols">
      <div class="pipe-card pipe-claims">
        <div class="pc-head"><span>数字声称 · extract_claims.py</span><span class="pc-badge" id="claimBadge">0 / ${CLAIMS.length} 条</span></div>
        <ol class="claim-list" id="pipeClaims">${CLAIMS.map((c) =>
          `<li><i class="cl-mark" aria-hidden="true"></i><span class="cl-text">${c[0]}</span><span class="cl-val">${c[1]}</span><span class="cl-time">⊕${c[2]}</span></li>`).join("")}</ol>
      </div>
      <div class="pipe-card">
        <div class="pc-head"><span>外部检索往返</span><span class="pc-badge">L57–92</span></div>
        <div class="rt-zone" id="pipeRt"></div>
      </div>
      <!-- iteration 76: 原片对照卡（素材驱动的核验动画面）——联系表 179 帧密集样本 +
           随核验进度滑动的核对视窗（spotlight），"逐条声称回看原片画面"的核对呈现 -->
      <div class="pipe-card pipe-verify">
        <div class="pc-head"><span>原片对照 · 密集帧联系表</span><span class="pc-badge" id="verifyBadge">0 / ${CLAIMS.length} 处</span></div>
        <div class="verify-scan">
          <img class="verify-sheet" src="assets/contact.jpg" alt="原片 179 帧密集样本联系表" loading="lazy" decoding="async">
          <div class="verify-window" id="verifyWindow"></div>
        </div>
        <div class="factline">逐条声称回看原片画面核对（联系表 = 179 帧密集样本）</div>
      </div>
    </div>
  </section>`;
}

function phaseS4() {
  return `<section class="pipe-phase" data-phase="s4" hidden>
    <div class="pipe-cols">
      <div class="pipe-card pipe-pdf">
        <div class="pc-head"><span>编译交付 · xelatex ×2</span><span class="pc-badge" id="pdfBadge">0 / ${PDF.pages} 页</span></div>
        <ol class="latex-flow" id="pipeLatex"></ol>
        <div class="pdf-strip" id="pipePdfStrip">${Array.from({ length: PDF.pages }, (_, i) =>
          `<span class="pdf-p" data-p="${i + 1}"><img alt="笔记第 ${i + 1} 页" loading="lazy" decoding="async"></span>`).join("")}</div>
        <div class="cjk-line">CJK 字符 <b id="pipeCjk">${PDF.cjkFirst}</b> → ${PDF.cjkLast}</div>
        <div class="pdf-end" id="pipePdfEnd">notes.pdf · ${PDF.pages} 页 · ${PDF.bytes}（L285–297 pdftotext 通读校验）</div>
      </div>
      <div class="pipe-card">
        <div class="pc-head"><span>写作与终检</span><span class="pc-badge">L209–326</span></div>
        <div class="factline">撰写 → 修复 TikZ 编译错误 → 终检验收闸门全过（L285）→ 渲染通读修订（L287–323）</div>
      </div>
    </div>
  </section>`;
}

function phaseS5() {
  return `<section class="pipe-phase" data-phase="s5" hidden>
    <!-- 84：交付完成动画（运营方指令 ⑥）——六相位落幕后拍下成功印章 + 下沉引导
         至场景正下方的交付卡 #runFoot（「下载笔记」声明式锚点，75 期）；
         纯呈现：无 a/button（psA11y 契约 = #pipelineScene 内零可交互元素）。
         85 期（运营方指令）：引导文案「讲义就在下方，点击下载」有误导感
         （暗示可点、本体无控件）⇒ 直接换成声明式下载按钮（75 期裁决同款：
         href + download 零 JS 接线，复用 .btn-primary 家族）；
         契约面 psA11y 随改「恰好 1 个声明式锚点」——banner hidden 期间
         锚点不可聚焦（a11y 安全：仅终态可达） -->
    <div class="pipe-success" id="pipeSuccess" hidden>
      <span class="ps-check" aria-hidden="true">✓</span>
      <div class="ps-text">
        <b>转换完成 · 笔记已交付</b>
        <span>${PDF.pages} 页中文笔记 · ${PDF.bytes} · 全部验收闸门通过</span>
      </div>
      <a class="ps-download btn-primary" href="assets/notes.pdf" download="视记 VidNotes 笔记.pdf">下载笔记</a>
    </div>
    <!-- iteration 76: 归档收束——交付物本体 arrival（page-01 封面，blockIn 150ms 延迟拍
         乘在相面揭幕之后 =「首屏冲击 → 阶段推进 → 交付收束」的最后一拍此前缺位）+ 归档 chips -->
    <div class="archive-row">
      <figure class="archive-artifact">
        <img src="assets/pages/page-01.jpg" alt="交付物：${PDF.pages} 页中文笔记封面" loading="lazy" decoding="async">
        <figcaption>notes.pdf · ${PDF.pages} 页 · ${PDF.bytes}</figcaption>
      </figure>
      <div class="archive-side">
        <div class="chips" id="pipeS5Chips">${ARCHIVE.map((t) => `<span class="chip">${t}</span>`).join("")}</div>
        <div class="factline">所有产物完成且验证通过 → 按经验固化制度归档（L327–411）</div>
      </div>
    </div>
  </section>`;
}
/* ---------- 纯呈现渲染：moment → DOM ---------- */

// 相位下标 + 各相位进度的唯一派生函数。坐标口径统一为**相对偏移**：rel 与 stage
// 边界一律减去 t0 —— 绝对纪元值与相对毫秒混用会让每个 clamp01 恒为 0（实测缺陷）。
function derive(run, m, done) {
  const t0 = Date.parse(run.startedAt);
  const rel = done ? run.durationMs : Math.max(0, Date.parse(m.t) - t0);
  const stages = run.stages.map((s) => ({ start: Date.parse(s.start) - t0, end: Date.parse(s.end) - t0 }));
  const lastEnd = stages[stages.length - 1].end;
  const finished = !!done || rel >= lastEnd;
  const idx = finished ? stages.length - 1 : stageIndex(stages, rel, m && m.stage);
  return { progs: stages.map((s, i) => {
    if (finished) return 1;
    if (i < idx) return 1;
    if (i > idx) return 0;
    return clamp01((rel - s.start) / (s.end - s.start));
  }) };
}

function stageIndex(stages, rel, stage) {
  const byKey = PHASES.findIndex((p) => p.key === stage);
  if (byKey >= 0) return byKey;
  for (let k = 0; k < stages.length; k++) if (rel <= stages[k].end) return k;
  return stages.length - 1;
}

function updatePipeline(m, i, opts = {}) {
  const run = runs[0];
  const host = byId("pipelineScene");
  if (!run || !host) return;
  build();
  if (host.classList.contains("hidden")) return; // 演示未开始：不渲染
  const { progs } = derive(run, m, opts.done);
  // 注意：谓词不可带 || 回落串（「s5」是恒真值会让 findIndex 恒返回 0）——
  // 回落由 derive 的 finished 分支承担，这里只做单值匹配
  const idx = Math.max(0, PHASES.findIndex((p) => p.key === (m && m.stage)));
  const phase = PHASES[idx].key;
  if (phase !== curPhase) {
    curPhase = phase;
    byId("pipeBody").querySelectorAll(".pipe-phase").forEach((s) => {
      s.hidden = s.dataset.phase !== phase; // 相位切换：[hidden] 降级 + 入场过渡
    });
    /* 第 68 次：.pipe-rail 相位轨道移除——相位态与相位名与顶部 stageStepper 逐项重复
       （rail 唯一增量「· 72%」行内百分比的同期呈现仍在：step 填充条 + 各相位主体徽章）
       ⇒ 本块昔日对 rail-item 的 done/active 翻转一并退役（相位派生机与六相位主体不动）。 */
  }
  // 终态（done）时把六相位**逐一**按其最末进度渲染：自然结束的演示在每个阶段的
  // 末尾 moment 已把该相位渲染到 p=1（此路径是幂等重写），而冻结后直接 finish()
  // 的路径若只渲染当前相位，跳过的相位将停留在中途 —— 二者必须落同一终态。
  const renderPhase = (key, pp, isDone) => {
    switch (key) {
      case "s0": litN(byId("pipeS0Chips"), Math.round(pp * ENV_TOOLS.length)); break;
      case "s1": renderS1(pp); break;
      case "s2": renderS2(pp, isDone); break;
      case "s3": renderS3(pp); break;
      case "s4": renderS4(pp); break;
      case "s5": renderS5(pp, isDone); break;
    }
  };
  const p = progs[Math.max(0, idx)];
  if (opts.done) PHASES.forEach((ph, k) => renderPhase(ph.key, progs[k], true));
  else renderPhase(phase, p, false);
}

function renderS1(p) {
  // 84：流式到场（运营方指令 ①②）——条目随相位进度逐个插入（诞生即 .on +
  // 入场动画），不再构建期预渲染暗色待命行；徽章 / 进度条 / 端点亮灯读数不动
  streamItems(byId("pipeDlSteps"), Math.round(clamp01(p) * DOWNLOAD.steps.length),
    (i) => `<li class="on"><i></i><span>${DOWNLOAD.steps[i]}</span></li>`);
  byId("dlBadge").textContent = p >= 0.999 ? "已到达" : ["解析中", "取播放列表", "列格式", "下载中", "下完成"][Math.min(4, Math.floor(p * 5))];
  byId("pipeDlFill").style.width = (p * 100).toFixed(1) + "%";
  byId("pipeDlEnd").classList.toggle("arrived", p >= 0.98);
  const subs = Math.round(p * SUBTRACKS.length);
  streamItems(byId("pipeSubs"), subs,
    (i) => `<li class="on"><code>${SUBTRACKS[i].tag}</code><span>${SUBTRACKS[i].zh} · ${SUBTRACKS[i].line}</span></li>`);
  byId("subBadge").textContent = `${subs} / ${SUBTRACKS.length} 轨`;
  byId("pipeSubFinal").classList.toggle("arrived", subs >= 4);
  byId("pipeSubHealth").classList.toggle("ok", p >= 0.9);
}

function renderS3(p) {
  const claims = Math.round(p * CLAIMS.length);
  litN(byId("pipeClaims"), claims);
  byId("claimBadge").textContent = `${claims} / ${CLAIMS.length} 条`;
  // 84：流式到场（运营方指令 ④）——检索往返 chip 逐个插入，不再预显暗底
  streamItems(byId("pipeRt"), Math.min(RT_CHIPS.length, Math.round(p * RT_CHIPS.length * 1.5)),
    (i) => `<span class="rt-chip on">${RT_CHIPS[i]}</span>`);
  // iteration 76: 核对窗扫过联系表——已核验条数 ⇒ 视窗刻度（窗宽 12% ⇒ 行程 88%，末条到边）
  byId("verifyBadge").textContent = `${claims} / ${CLAIMS.length} 处`;
  byId("verifyWindow").style.left = ((claims / CLAIMS.length) * 88).toFixed(1) + "%";
}

function renderS4(p) {
  // 84：流式到场（运营方指令 ⑤）——编译步骤逐个插入
  streamItems(byId("pipeLatex"), Math.round(clamp01(p) * LATEX_STEPS.length),
    (i) => `<li class="on"><i></i><span>${LATEX_STEPS[i]}</span></li>`);
  const pages = Math.round(p * PDF.pages);
  byId("pdfBadge").textContent = `${pages} / ${PDF.pages} 页`;
  [...byId("pipePdfStrip").children].forEach((el, k) => {
    const on = k < pages;
    el.classList.toggle("arrived", on);
    // iteration 76: 到位即写页面图 src（「编译出一页」的字面语义；65 期 src-at-arrival 纪律）
    if (on) {
      const im = el.querySelector("img");
      if (im && !im.getAttribute("src")) im.setAttribute("src", PDF_PAGE_IMGS[k]);
    }
  });
  byId("pipeCjk").textContent = PDF.cjkFirst + Math.round(p * (PDF.cjkLast - PDF.cjkFirst));
  byId("pipePdfEnd").classList.toggle("arrived", p >= 0.985);
}

// 84：交付成功动画（运营方指令 ⑥）——归档收尾（p ≥ 0.97）或 done 拍下成功横幅；
// 回退（相位重入于低进度）即时隐藏（纯呈现幂等：hidden 翻转）。
function renderS5(p, isDone) {
  litN(byId("pipeS5Chips"), Math.round(clamp01(p) * ARCHIVE.length));
  byId("pipeSuccess").hidden = !(p >= 0.97 || isDone);
}

/* ---------- 流式条目助手（84 期，运营方指令「列表逐步加载」）---------- */
// 计数增 ⇒ 插入新条目（幂等：同计数零写入——已到条目不重播入场动画）；
// 计数减（drive 跳点回退）⇒ 整表清空后按目标重建（「回退是跳回」的 47 期词汇）。
// 调用方保证 count ≤ 全量（由 round(p × total) 派生）；reset 走 innerHTML 清空。
function streamItems(host, count, build) {
  if (!host) return;
  let cur = host.children.length;
  if (count < cur) { host.innerHTML = ""; cur = 0; }
  while (cur < count) { host.insertAdjacentHTML("beforeend", build(cur)); cur++; }
}

/* ---------- 外部入口（convert.js 挂点 + 探针 / 截图可观测面）---------- */

// 场景揭示：startConvert 与 runPanel 同步摘 hidden（第 59 次揭幕节拍）
function revealPipeline() {
  const host = byId("pipelineScene");
  if (host) host.classList.remove("hidden");
}

// 重跑复位：startConvert 重建演示时复位到待命（之后 update 从 p≈0 重写全部状态）
function resetPipeline() {
  curPhase = "";
  const host = byId("pipelineScene");
  if (!host || host.classList.contains("hidden")) return;
  resetCuts(); // s2 帧网格 / 探头 / 评分三态（pipeline-cuts 模块，就地清零）
  // 84：四张流式列表整表清空（不再走 litN 翻转——条目全部是到场插入的）
  ["pipeDlSteps", "pipeSubs", "pipeRt", "pipeLatex"].forEach((id) => { const e = byId(id); if (e) e.innerHTML = ""; });
  // 85：#pipeScores 改由 resetCuts 清空（判定行亦插入式，litN 翻转不再适用）
  ["pipeS0Chips", "pipeTri", "pipeClaims", "pipeS5Chips"]
    .forEach((id) => litN(byId(id), 0));
  byId("pipeSuccess")?.setAttribute("hidden", ""); // 84：成功横幅复位
  byId("pipePdfStrip")?.querySelectorAll(".pdf-p").forEach((c) => {
    c.classList.remove("arrived");
    const im = c.querySelector("img"); // 76: 页面图 src 就地清零（46/49 词汇）
    if (im) im.removeAttribute("src");
  });
  if (byId("verifyWindow")) byId("verifyWindow").style.left = "0%"; // 76: 核对窗归位
  ["pipeDlEnd", "pipeSubFinal", "pipeSubHealth", "pipePdfEnd"].forEach((id) => {
    const e = byId(id); if (e) e.classList.remove("arrived", "ok", "aligned");
  });
  byId("pipeDlFill").style.width = "0%";
  // 相位徽章与计数器一并复位（s4 的 CJK 不归位会残留上一轮末值）
  for (const [id, txt] of [["dlBadge", "解析中"], ["subBadge", `0 / ${SUBTRACKS.length} 轨`], ["claimBadge", `0 / ${CLAIMS.length} 条`], ["verifyBadge", `0 / ${CLAIMS.length} 处`], ["pdfBadge", `0 / ${PDF.pages} 页`]]) byId(id).textContent = txt;
  byId("pipeCjk").textContent = String(PDF.cjkFirst);
  if (byId("pipeSubHealth")) byId("pipeSubHealth").classList.remove("ok");
}

function finishPipeline() {
  const run = runs[0];
  const host = byId("pipelineScene");
  if (!run || !host || host.classList.contains("hidden")) return;
  updatePipeline({ stage: "s5", t: run.endedAt, kind: "done", detail: "" }, run.moments.length - 1, { done: true });
}

// 探针 / 截图的可观测面（与 window.VidNotes.pacer 同一暴露约定，pacer.js:121）：
// 77 期原片页退场后，本约定不再引 source.js（其 run.source 面已删）。
function drive(stage, frac) {
  const run = runs[0];
  if (!run || !byId("pipelineScene")) return;
  const i = PHASES.findIndex((p) => p.key === stage);
  if (i < 0) return;
  const start = Date.parse(run.stages[i].start), end = Date.parse(run.stages[i].end);
  const at = start + clamp01(frac) * (end - start);
  updatePipeline({ stage, t: new Date(at).toISOString(), kind: "activity", detail: "" }, i);
}

// forRel(rel, kind)：用**真实 rel** 造合成时刻再走同一条 updatePipeline（探针用
// 它落在 recovery 时刻 L145 rel=1 501 000 / OCR 完成 L176 rel=2 080 000；截图取证用它落任意相位）。
function forRel(rel, kind = "activity") {
  const run = runs[0];
  if (!run || !byId("pipelineScene")) return;
  const t0 = Date.parse(run.startedAt);
  const bounds = run.stages.map((s) => ({ start: Date.parse(s.start) - t0, end: Date.parse(s.end) - t0 }));
  const idx = stageIndex(bounds, Math.max(0, rel), null);
  updatePipeline({ stage: PHASES[idx].key, t: new Date(t0 + Math.max(0, rel)).toISOString(), kind, detail: "" }, idx);
}

function pipelineState() {
  if (!built) return null;
  return {
    phase: curPhase,
    cutLit: byId("pipeCuts")?.querySelectorAll(".cut-cell.on:not(.is-dup)").length ?? 0,
    claimLit: byId("pipeClaims")?.querySelectorAll("li.on").length ?? 0,
    pdfArrived: byId("pipePdfStrip")?.querySelectorAll(".pdf-p.arrived").length ?? 0,
    cjk: byId("pipeCjk")?.textContent ?? "",
    probeT: probeT(), // 83: 当前探头落点帧名（帧-图对照的左格帧）
  };
}

// 暴露约定同 pacer.js（探针与截图驱动的单一入口）
window.VidNotes = window.VidNotes || {};
window.VidNotes.pipeline = {
  update: updatePipeline, reset: resetPipeline, reveal: revealPipeline, finish: finishPipeline,
  drive, forRel, state: pipelineState, phases: PHASES.map((p) => p.key),
};;

// ── module: src/scripts/components/convert.js ──
// VidNotes convert view: paste a link, replay a run's trajectory as a live demo.
// iteration 70（多页拆分 I 期）：跨页导航原语与 fragment 构串——run 交付卡的三座
// 跨页桥（回放这次轨迹 → history 深链 / 查看讲义 → library 弹层深开 / 再转一次 →
// convert 表单页）替代 SPA 形态的 switchView 同页路径（66 的 heroExit 退场与
// 55 的 flyCapture→flyToPlayer 飞球随分页退役，见 Explore_70 §1.7 登记）
// iteration 64: 管道车间（组件群 II）—— convert 视图 runPanel 上方的机器动作
// 场景。渲染为回放状态的纯函数（零计时器），只在本模块的四个既有挂点调用。

// iteration 74: ARTS（交付物自检表）下线（运营方指令「移除底部 artifacts-check 组件」）：
// 交付物自检与交付卡信息层级重复，交付卡仅保留三座跨页桥按钮；49 的交付卡
// opacity 揭幕存活（convert.css 侧注释）。

let runPresenter = null;
let runStack = null;
let demoPaceValue = "brisk";
let cvNudge = 0; // live-region re-announce counter (player.js announce()'s trick)
const DEMO_PACE = {
  entrance: 350, charMs: 26,
  computing: [160, 520],
  itemDelay: { title: [100, 260], img: [150, 520], head: [70, 180], row: [90, 300], pair: [90, 260], line: [110, 380], chip: [70, 190], text: [110, 280], final: [320, 700] },
  settle: 180, gapMin: 150, gapMax: 500,
};
const DEMO_FACTORS = { immersive: 1, brisk: 6, instant: 8 };

// iteration 16: inline feedback channel for the convert form. #cvMsg doubles
// as its own polite live region: present and EMPTY in the initial markup so AT
// registers the region before any message (MDN live regions / WAI ARIA19),
// role=status + polite + atomic — a missing link is a hint, not an alert; and
// the trailing-space nudge is player.js announce()'s solution to "identical
// content may not re-announce on AT" (two consecutive empty submissions).
function announceCv(msg) {
  const el = document.getElementById("cvMsg");
  if (!el) return;
  if (!msg) { el.textContent = ""; return; } // :empty collapses it out of layout
  el.textContent = msg + " ".repeat(++cvNudge % 3 + 1);
}

function setUrlInvalid(on) {
  // iteration 70：#urlInput 只存在于 convert 页（表单页）；startConvert 的校验半身
  // 在 run 页也会被调到（交接参数直接进演示），选项缺失即空指针——页化后表单
  // 控件跨页缺失属正常，guarded no-op
  const input = document.getElementById("urlInput");
  if (!input) return;
  if (on) {
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", "cvMsg");
  } else {
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  }
}

// wired from boot-convert.js (iteration 70: 接线迁移自 main.js): the form's
// rejection state does not outlive the user's next keystroke (ARIA19 clears the
// previous message before the next attempt)
function clearConvertFeedback() {
  setUrlInvalid(false);
  announceCv("");
}

// iteration 70（多页拆分 I 期）：表单的跨页交接半身。校验与第 16 次守卫同源
//（空链接 → aria-invalid + 就地通告，返回 null，调用方零导航、零滚动）；通过
// 则返回 run.html 的交接 URL。参数走 search params 而非 fragment：run 页不是
// 视图、无可寻址状态，交接的是「这次演示的输入」（fragment 家族的 view/run/rel
// 三分量语法逐字不变）。白名单与 boot-run.js 的 MODES/PACES 同源——交接的写与
// 读只能是这一对表，非法值在两端都回落默认。
const MODES = ["auto", "conceptual-talk", "technical-slide"];
const PACES = ["brisk", "instant", "immersive"];
function convertHandoff(url, mode, pace) {
  const link = (url ?? "").trim();
  if (!link) {
    setUrlInvalid(true);
    announceCv("请先粘贴视频链接，再开始转换");
    return null;
  }
  setUrlInvalid(false);
  const m = MODES.includes(mode) ? mode : "auto";
  const p = PACES.includes(pace) ? pace : "brisk";
  return "run.html?url=" + encodeURIComponent(link) + "&mode=" + m + "&pace=" + p;
}

// iteration 22: the run panel's dwell control. presenter.pause()/play() are the
// presenter's own existing halves — the same pair hardSeek and stopRun already
// use — so this only wires them to a button. (iteration 74: the #cvMsg announce
// half — one discrete line per pause/resume — retired with the element itself;
// the run page's only pause/resume feedback is the button's own label +
// aria-pressed, same contract as the player's #plPlay.) Label+
// state are written together, mirroring player.js setPlayBtn: the label carries
// the ACTION activation will take (the media-player convention), aria-pressed
// carries the STATE "the demo is running" — same-source with #plPlay, so the
// app's two replay surfaces behave identically for AT.
function setPauseBtn(on) {
  const b = document.getElementById("btnPauseRun");
  if (!b) return;
  b.textContent = on ? "⏸ 暂停" : "▶ 继续";
  b.setAttribute("aria-pressed", on ? "true" : "false");
}

// the control exists only while a demo is live (an ended demo has no pause
// action). Focus safety first: a resumed run can finish while focus still rests
// on the button the user just clicked — blur to <body> BEFORE display:none, so
// no focus is left inside an unrendered subtree (the iteration-5/9 invariant).
function hidePauseBtn() {
  const b = document.getElementById("btnPauseRun");
  if (!b) return;
  if (document.activeElement === b) b.blur();
  b.classList.add("hidden");
}

// wired here (not main.js — that module is outside this iteration's boundary):
// assignment is idempotent, so re-attaching per start is harmless. Discrete
// events only (iteration-10 discipline): one announcement per pause/resume —
// onTick fires once per moment (112 per brisk run) and would flood a live region.
function showPauseBtn() {
  const b = document.getElementById("btnPauseRun");
  if (!b) return;
  b.classList.remove("hidden");
  b.onclick = onPauseToggle;
  setPauseBtn(true); // the demo always starts playing
}

function onPauseToggle() {
  if (!runPresenter) return;
  if (runPresenter.playing) {
    runPresenter.pause();
    setPauseBtn(false);
  } else {
    runPresenter.play();
    setPauseBtn(true);
  }
}

// iteration 75: the runtime speed group (28's #demoSpeeds) RETIRED — operator
// instruction「完全按照提交时选的时间来演示」: the demo runs purely at the
// handoff pace (#demoPace preset → pace param → factor), no in-run control.
// Retired with it: setDemoSpeed/demoSpeedBtns/showDemoSpeeds/hideDemoSpeeds
// (and their four call sites) and the demo side of the factor-rescale
// contract (ds*) — the presenter's setFactor + rescaleLivePauses remain, now
// exercised only by the player's five-tier #plSpeeds (history page rgComp*).
// The pace→factor mapping itself survives at startConvert's makePresenter
// opts (DEMO_FACTORS): the submission-time choice is the only speed the demo
// has — the run-transport is now 暂停钮 + 时钟.

// iteration 25: freeze the demo when its view stops being current. state.js
// announces every view change as a "viewswitch" CustomEvent (it cannot import
// this module — convert.js imports state.js, a back-import would close a module
// cycle), so this module-level listener is the host module's own self-defense.
// Only the demo's EXISTING halves are called: pause() — the iteration-24 freeze
// primitive, VERBATIM (parks the chain at its junction, freezes the char stream,
// keeps idx/chars/evShown/frozen as the observable breakpoint) — plus
// setPauseBtn, so the control offers 继续 when the user returns.
//
// Resume semantics — STAY FROZEN on return, the user releases it with the
// iteration-22 button. (1) WCAG 2.2.2 keeps motion user-controlled: a view change
// is a navigation intent, not a "resume the animation" intent, and auto-resume
// would restart streaming the moment the view lands. (2) The user left to read
// the library/history; auto-resume would push dynamic content back into focus
// and break the reading rhythm the switch itself interrupted. (3) The breakpoint
// survives EXACTLY — pause() is idempotent (playing already false), so an
// auto-freeze on a user-paused demo is a no-op and its button state is preserved
// byte for byte. (4) One release path for both manual and automatic freezes: ▶
// 继续, whose label-carries-the-action / aria-pressed-carries-the-state contract
// extends to the automatic case unchanged (the user cannot tell the two apart).
//
// State coverage: running ⇒ frozen in place on leave, button flips to 继续;
// user-paused ⇒ pause() is idempotent, the manual freeze and its button state
// survive the round trip untouched; ended ⇒ playing===false so no call runs and
// runFoot's delivery card is never replayed; not started ⇒ runPresenter is null
// and the guard short-circuits.
// iteration 70（多页拆分 I 期）：宿主事件迁移——「视图不再 current」（SPA 的
// viewswitch）在多页形态就是「文档不可见」（Page Visibility API：用户离开
// 本演示页 = 去别的页）。依旧是模块级监听、依旧只调演示的既有两半：
// pause()（第 24 次冻结原语，断点逐字节存活）+ setPauseBtn（钮置「▶ 继续」）。
// 其余论证逐字不变：WCAG 2.2.2「动作由用户控制」（不自动续播，钮释放）、
// pause() 幂等（用户手动暂停的断点与钮状态逐字节存活）、一种释放路径两种来源
// （手动/自动冻结的不可区分性）。
//
// State coverage — 与 25 次同表：running ⇒ hidden 时冻结、钮置 继续；user-paused
// ⇒ pause() 幂等零改；ended ⇒ playing===false 零调用，runFoot 交付拍不重播；
// not started ⇒ runPresenter===null 短路。
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (runPresenter && runPresenter.playing) {
      runPresenter.pause(); // 离开时零通告：离场文档已不可见，通告是死文本
      setPauseBtn(false); // 回来时钮必须是「▶ 继续」
    }
    return;
  }
  // back: nothing to do for the demo itself — 25's freeze-continue breakpoint
  // survives exactly and its button already reads ▶ 继续 (iteration 74: the
  // re-announce half retired with run-page #cvMsg; the ended demo — frozen===
  // false — replays nothing either way, so no guard is needed here)
});

// iteration 16: terminate an in-flight demo BEFORE rebuilding it. The form stays
// clickable while a replay runs; without this the previous presenter's timers
// keep firing — its guards only park at the chain's own junctions, so two
// presenters would append to the same #runStack (duplicate/interleaved cards,
// double telemetry). This is the presenter's own full-stop half, the same pair
// hardSeek uses in the same order: pause() (playing=false; freezes the chain in
// place — the parked continuation belongs to the discarded instance, so it can
// never run) plus cancelTyping() for the parked character stream. Idempotent on
// an instance that already ended via onEnd.
function stopRun() {
  hidePauseBtn();
  if (!runPresenter) return;
  runPresenter.pause();
  cancelTyping();
  runPresenter = null;
  runStack = null;
}

// returns true when a demo actually started (main.js scrolls the panel into
// view only then); false when the submission was rejected (empty link: the
// form itself shows the inline feedback — no scroll, no demo disturbed)
// iteration 70（多页拆分 I 期）：页参数化——SPA 形态的 demoPace 读自表单元素；
// 多页形态由 boot-run.js 从交接 URL 取值传入（convertHandoff 白名单同源）。
function startConvert(url, mode, pace) {
  // 校验半身保留（空链接场景在 convertHandoff 拦截；本函数作为演示启动器仍自保）
  const link = (url ?? "").trim();
  if (!link) {
    setUrlInvalid(true);
    announceCv("请先粘贴视频链接，再开始转换");
    return false;
  }
  setUrlInvalid(false);
  const prev = runPresenter, wasPlaying = !!(prev && prev.playing);
  stopRun(); // duplicate-submission guard: at most one live demo, in any state
  resetPipeline(); // iteration 64: 场景复位到待命（onTick 随后从 p≈0 重写全部状态）
  // iteration 74: 跨页形态的重复提交 = 文档卸载销毁旧计时器链（boot-run 等价论证）；
  // 旧演示的通告文本线已随 run 页 #cvMsg 退役，此处零通告零反馈
  const run = runs[0]; // demo: replay the single real run's trajectory
  const moments = relMoments(run);
  const total = run.durationMs;
  document.getElementById("runPanel").classList.remove("hidden");
  revealPipeline(); // iteration 64: 场景与 runPanel 同步摘 hidden（第 59 次揭幕家族节拍）
  document.getElementById("runFoot").classList.add("hidden");
  document.getElementById("runTitle").textContent = run.doc.title;
  document.getElementById("runSub").textContent = run.platform + " · " + url + (mode === "auto" ? "" : " · " + mode);
  renderStepper(run, 0);
  document.getElementById("runClock").textContent = "00:00";
  // iteration 69: demo 栈上限 5 → 20（运营方指令「将原本 6 条栈帧满后移除最早的
  // 帧的规则改为 20 条」——实读为 cap 5，非 6；stack.js 默认 7 与 player.js cap 7 逐字
  // 不动）。配合 .stack-demo 滚动口（stack.css）：前 20 条全保留在 DOM、超 20 才
  // 由 pruneStack 裁剪最旧 + stack-foot「▲ 更早还有 N 个动作」出现
  runStack = makeStack(document.getElementById("runStack"), { compact: true, cap: 20, detailLen: 200 });
  runStack.reset();
  demoPaceValue = pace || document.getElementById("demoPace")?.value || "brisk";
  showPauseBtn(); // visible + in the running state before the first tick
  // iteration 66 的 heroExit 随分页退役（hero 与 run 已在不同页：run.html 加载即
  // 是舞台，揭幕由第 59 次的 .run-panel 母盒 + 内容子三拍承担，见 run.html 注释）
  runPresenter = makePresenter(runStack, moments, {
    pace: DEMO_PACE,
    factor: DEMO_FACTORS[demoPaceValue] ?? 6,
    onTick: (m, i) => {
      updatePipeline(m, i); // iteration 64: 相位派生自当前时刻（纯呈现，无计时）
      renderStepper(run, m.rel);
      document.getElementById("runClock").textContent = clockOf(m.rel);
    },
    onEnd: () => finishConvert(run),
  });
  // 75: no group to sync anymore — the submission-time preset (DEMO_FACTORS
  // via opts.factor) IS the demo's only speed (see the retirement note above)
  runPresenter.play();
}

// iteration 46: build the .stage-step nodes ONCE per stage list, then flip
// the state classes in place. The per-tick innerHTML rewrite destroyed node
// identity every tick, so the .stage-step transition (and any class-triggered
// animation) had no previous value on the same node — a freshly inserted node
// carrying the class is an initial render, not a transition. Behaviour is
// unchanged: same markup, same classes at the same moment, written by the same
// synchronous task that writes the clock/artifacts — only the nodes
// survive, so pending→active→done now has a "from" state. Keyed by the stage
// signature (name+hint): a different stage table rebuilds the set; a
// same-shape restart reuses the nodes, so done→pending transitions too.
let stepperSig = "";
function renderStepper(run, elapsed) {
  const el = document.getElementById("stageStepper");
  const t0 = Date.parse(run.startedAt);
  const now = t0 + elapsed;
  const sig = run.stages.map((s) => s.name + "|" + s.hint).join(";");
  if (sig !== stepperSig) {
    el.innerHTML = run.stages.map((s) =>
      `<div class="stage-step"><div class="s-name">${s.name}</div><div class="s-hint">${s.hint}</div></div>`
    ).join("");
    stepperSig = sig;
  }
  const steps = el.children;
  run.stages.forEach((s, i) => {
    const done = !!(s.end && now >= Date.parse(s.end));
    const active = !done && !!(s.start && now >= Date.parse(s.start));
    steps[i].classList.toggle("done", done);
    steps[i].classList.toggle("active", active);
  });
}

// iteration 74: renderArts / artsSig 整体下线（交付物自检与交付卡信息层级重复，
// 同上）——曾在此的节点身份机制（构建一次后就地翻转，46/49 同款裁决）随宿主退役。
function finishConvert(run) {
  finishPipeline(); // iteration 64: 六相位全完成（done 时刻）
  hidePauseBtn(); // the run is over: no pause action remains, runFoot carries the next ones
  document.getElementById("runClock").textContent = clockOf(run.durationMs);
  renderStepper(run, run.durationMs);
  wireLightbox();
  // iteration 70（多页拆分 I 期）：交付卡三座跨页桥（替代同页 openDocModal /
  // switchView+openPlayer 路径）；iteration 75：第一桥改为声明式下载锚点
  // （「下载笔记」<a download href="assets/notes.pdf">——零 JS 接线；
  // library.html?doc=<run> 弹层深链独立存活，不再由本桥承载）：
  //   回放这次轨迹 → history.html#history/<run>（fragment 家族不变，目标页
  //     reconcile 打开 player，断点语义由 40 次幂等逻辑承担）
  //   再转一次 → index.html（表单页 = 首页，78 期由 convert.html 改名；「滚回表单并聚焦」
  //     由页面加载承载——
  //     表单位于首屏顶部，52 首屏错峰即入场编排）
  document.getElementById("btnReplayRun").onclick = () =>
    goPage("history", hashFragment("history", run.id));
  document.getElementById("runFoot").classList.remove("hidden");
  // iteration 66 的 heroReturn 随分页退役：演示结束后的表单回返 = 回到 convert
  // 表单页（再转一次桥）；本页「再转一次」显式可达点（设计推论 ② 的指针路径）
  // ——守卫语义零改：空链接仍在 convert 页就地提示（convertHandoff），重复提交
  // 的旧演示由文档卸载销毁（boot-run 注释的等价论证）
  document.getElementById("btnConvertAgain").onclick = () => goPage("convert");
}

// ── module: src/scripts/components/player.js ──
// VidNotes history replay player: run list, ribbon, transport, stack replay.
// iteration 40: URL 深链写点位（应用 → URL）。player 的打开是离散导航事件（push），
// 位置分量只走 replace（不污染历史栈）；语义见 nav.js / hash.js。

let player = null;

function renderRunList() {
  const el = document.getElementById("runList");
  el.innerHTML = runs.map((r, i) => `
    <div class="run-item" data-run="${i}">
      <div class="ri-icon">▶</div>
      <div><div class="ri-name">${esc(r.doc.title)}</div>
      <div class="ri-sub">${esc(r.platform)} · ${Math.round(r.videoDurationSec / 60)} 分钟源 · ${r.mode} 类型 · ${new Date(r.startedAt).toLocaleDateString("zh-CN")}</div></div>
      <div class="ri-meta">${r.durationMs / 60000 | 0} 分钟 · ${r.operations} 步操作 · ${r.moments.length} 时刻<br>0 次人工介入</div>
      <span class="ri-badge">已交付</span>
    </div>`).join("");
  el.querySelectorAll(".run-item").forEach((it) => it.addEventListener("click", () => openPlayer(runs[+it.dataset.run])));
  document.getElementById("histCount").textContent = runs.length;
}

// iteration 40: opts.rel = 打开时即落到该回放位置（URL 位置深链 boot/hashchange 恢复用）。
// 既有调用方（run-item 点击 / btnReplayRun / mReplay）不带 opts ⇒ rel 0，行为不变。
function openPlayer(run, opts = {}) {
  // iteration 40: URL ← 打开事件：一条离散 push 条目（若与 switchView("history") 同任务，
  // 会被 hash.js 的微任务合并成恰好一条 —— 这正是 mReplay/btnReplayRun 的调用形状）
  const openRel = Math.max(0, opts.rel ?? 0);
  navWrite(hashFragment("history", run.id, openRel), true);
  document.getElementById("player").classList.remove("hidden");
  document.querySelectorAll(".run-item").forEach((it) => it.classList.toggle("selected", runs[+it.dataset.run] === run));
  const moments = relMoments(run);
  document.getElementById("plTitle").textContent = run.doc.title;
  document.getElementById("plSub").textContent = `${run.platform} · ${Math.round(run.videoDurationSec / 60)} 分钟源视频 · ${run.mode} 类型 · 生成耗时 ${run.durationMs / 60000 | 0} 分钟`;
  renderRibbon(run, 0);
  renderDocCard(run);
  renderQuality(run);
  player = { run, moments, total: run.durationMs, rel: 0, lineOf: lineOfMoments(moments) };
  // iteration 17: converge the freshly rendered (all-pending) sidebar onto the
  // opening position — a no-op at rel 0, but keeps renderQuality/the flip
  // logic on one source of truth for any future non-zero opening.
  updateQuality(player.rel);
  // iteration 10: the slider's upper bound is run-specific (static markup
  // cannot know it); write it here once, then updateScrubUI keeps the value
  // triples in sync from this same player state.
  document.getElementById("plScrub").setAttribute("aria-valuemax", String(Math.round(player.total)));
  wireScrub();
  player.stack = makeStack(document.getElementById("plStack"), {
    cap: 7, detailLen: 260,
    onSeek: (rel) => { hardSeek(relOfMoment(moments, rel)); resume(); },
  });
  player.stack.reset();
  player.presenter = makePresenter(player.stack, moments, {
    factor: 2,
    onTick: (m, i) => {
      player.rel = m.rel;
      renderRibbon(player.run, player.rel);
      updateScrubUI(player.rel, player.total);
      // iteration 17: reveal the acceptance items earned at this position.
      // announce ONLY while actually playing at a perceivable speed:
      // presenter.hardSeek also fires onTick (playing=false) — a jump arrives
      // rather than watches a gate pass, and its own 已跳到 announce covers
      // the commit, so the flip stays silent there. And the instant tier
      // (factor >= 8) is a fast-forward skim where crossings arrive in bursts
      // — announcing each would flood #plLive and break the iteration-10
      // constant-window no-flood contract (a 1.5 s steady window allows at
      // most one live change). At 1x–4x each crossing is seconds from its
      // neighbour: exactly one discrete event per passage, on the same
      // channel and the same human scale as seek/speed/play/pause/end.
      const fresh = updateQuality(player.rel);
      if (fresh.length && player.presenter.playing && !instantFactor(player.presenter.factor))
        announce(fresh.length === 1
          ? `验收「${fresh[0]}」已通过`
          : `验收 ${fresh.length} 项已通过，共 ${player.run.quality.length} 项`);
    },
    onEnd: () => {
      player.rel = player.total;
      renderRibbon(player.run, player.rel);
      updateScrubUI(player.rel, player.total);
      setPlayBtn(false, "↺ 重播");
      // iteration 40: 位置深链写点（回放结束）：终点浅写入 URL（replace，无条目）
      navWrite(hashFragment("history", player.run.id, player.rel), false);
      announce("回放结束");
    },
  });
  setFactor(2);
  player.presenter.idx = -1;
  updateScrubUI(0, player.total);
  // iteration 40: 位置深链（#history/<run>/@<rel>）落地——复用既有 hardSeek 原语
  // （硬切到时刻格点：ribbon/scrub/侧栏/栈同源落位）。hashchange 驱动而来的这次
  // hardSeek 期间，其自身的 URL 写被 withNavApply 抑制（URL 已是目标串）。
  if (openRel > 0) hardSeek(openRel);
  document.getElementById("player").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* 跨视图的焦点运镜（iteration 55）：把两座桥（convert 的 #btnReplayRun / library
   的 #mReplay）的「两次独立入场」缝成一条「源 → 目的地」的连续 morph。
   语义 = container transform / 共享元素（M3 container transform incoming 档 300ms；
   WICG view-transitions：不同 DOM 元素被当作同一东西 morph 过去，位置+尺寸+内容交叉
   淡入）。机制选型刻意不是 startViewTransition：iteration 53 已实证其更新回调依赖
   渲染机会、探针虚拟钟下永不运行——本仓「状态同步 + 独立视觉层」的模板（53 的鬼影
   层）在此复用：flyCapture 只读不写（在任何状态翻转之前拿源 rect+视觉快照），
   flyToPlayer 在 switchView/openPlayer/focus() 之后同步起播，状态契约逐字不变。
   起播用同步 flush（void layer.offsetHeight）而非 rAF——同样规避渲染机会依赖。
   层存于文档坐标系（absolute）：openPlayer 的 scrollIntoView(smooth) 与 switchView 的
   scrollTo(instant) 同任务发起，飞行窗内文档正在滚动，fixed 会粘视口漂移断裂；
   absolute + rect+scrollY 让层随文档滚动、终点钉在目的地，与页面的下滑合成一条
   连续运镜。目的地取 .player-head（揭幕首行）而非整面板：整面板 morph 会整屏铺色
   一拍（闪光读法），head 区把视线钉在揭幕起点且交叉淡入负担最小。
   层零交互阻塞（pointer-events none / aria-hidden / 无 tabindex）且可中断
   （45 口径）：transitionend(transitionend) + 兜底 timer（读 computed
   transitionDuration + 500ms——虚拟钟下 transitionend 不触发、timer 是唯一释放路径，
   且窗长被外部改变时同样兜底到位）+ viewswitch 取消 + 重发取消，四路保证永不泄漏。
   reduced-motion = matchMedia 命中即返回 null ⇒ 整段 skip，点击行为与 54 逐字等价；
   深链路径（boot/uh*）本就不点桥，无层生成。*/
const FLY_SLACK_MS = 500; // 窗长之上的余量（产品钟 --d3=0.3s ⇒ 兜底 800ms，同 53 无帧口径）
let flyLayer = null, flyTimer = null;

function flyCapture(src) {
  // RM 守卫：整段跳过（API 无关，53/48 口径）——无层生成，点击=54 现状
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  if (!src || !src.getBoundingClientRect) return null;
  const r = src.getBoundingClientRect();
  if (!r || r.width <= 0 || r.height <= 0) return null; // 防御：不可见源不运镜
  const cs = getComputedStyle(src);
  return {
    // 文档坐标系：层随文档滚动，终点钉在目的地（fixed 会随 scroll 漂移断裂）
    x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height,
    text: src.textContent.trim(),
    // 视觉快照（computed style 逐像素继承源：ghost 桥与 primary 桥同一机制两形态）
    bg: cs.backgroundColor, color: cs.color,
    border: cs.borderTopWidth + " " + cs.borderTopStyle + " " + cs.borderTopColor,
    radius: cs.borderRadius,
    font: cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily,
    pad: cs.padding, align: cs.textAlign,
  };
}

function flyCancel() {
  if (flyLayer) { flyLayer.remove(); flyLayer = null; }
  if (flyTimer) { clearTimeout(flyTimer); flyTimer = null; }
}

function flyToPlayer(snap) {
  if (!snap) return; // RM 跳过或防御性 null：点击行为逐字不变
  const head = document.querySelector(".player:not(.hidden) > .player-head");
  if (!head) return; // player 未开（深链/重入路径）——47 揭幕独立成立
  flyCancel(); // 重发取消：旧飞行层即删（45 可中断口径）
  const layer = document.createElement("div");
  layer.className = "fly-layer"; // 仓内唯一新类原子（死规则观察器：drPoll 命中即非死）
  layer.setAttribute("aria-hidden", "true"); // 零 tab 序 / 零 AT 可读性影响
  layer.textContent = snap.text;
  layer.style.cssText =
    "background:" + snap.bg + ";color:" + snap.color + ";border:" + snap.border +
    ";border-radius:" + snap.radius + ";box-shadow:var(--shadow-panel)" +
    ";font:" + snap.font + ";padding:" + snap.pad + ";text-align:" + snap.align +
    ";left:" + snap.x + "px;top:" + snap.y + "px;width:" + snap.w + "px;height:" + snap.h +
    "px;opacity:1";
  document.body.appendChild(layer);
  flyLayer = layer;
  void layer.offsetHeight; // 同步 flush：源 quad 落为 computed 值，transition 才有前值
  const r = head.getBoundingClientRect();
  layer.style.left = (r.left + window.scrollX) + "px";
  layer.style.top = (r.top + window.scrollY) + "px";
  layer.style.width = r.width + "px";
  layer.style.height = r.height + "px";
  layer.style.opacity = "0"; // 与 47 揭幕（0→1）同窗交叉淡入
  layer.addEventListener("transitionend", (e) => {
    if (e.propertyName === "opacity") flyCancel();
  });
  // 探针虚拟钟下 transition 由实时钟驱动（transitionend 可永不触发）——timer 是兜底。
  // 时长读 computed transitionDuration：窗长被外部改变（RM 收口块/取证慢动作）时同样兜底到位
  const flyMs = (parseFloat(getComputedStyle(layer).transitionDuration) || 0.3) * 1000;
  flyTimer = setTimeout(flyCancel, flyMs + FLY_SLACK_MS);
}

// 可中断：飞行途中再切视图即删——跨页拆分（70）后「切视图」=文档导航，文档
// 卸载连同飞行层一并销毁，此监听随 viewswitch 一同退役（该事件不再派发）；
// flyCapture/flyToPlayer 保留为机制遗存（II期以跨文档 View Transitions 评估复活），
// 释放仍由 transitionend + 兜底 timer + 重发取消三路保证不泄漏。

function relOfMoment(moments, rel) {
  let r = 0;
  for (const m of moments) if (m.rel <= rel) r = m.rel; else break;
  return r;
}
function idxOfRel(moments, rel) {
  let idx = -1;
  for (let i = 0; i < moments.length; i++) if (moments[i].rel <= rel) idx = i; else break;
  return idx;
}
function updateScrubUI(rel, total) {
  document.getElementById("plScrubFill").style.width = (rel / total * 100) + "%";
  document.getElementById("plScrubHead").style.left = (rel / total * 100) + "%";
  // the visible clock and the slider's aria-valuetext are the same string from
  // the same expression: raw ms (aria-valuenow) is not user-friendly, so APG
  // requires a valuetext; every clock-writing path (tick / drag / click /
  // keyboard / open) goes through here, so the aria triples stay in sync for free
  const clock = clockOf(rel) + " / " + clockOf(total);
  document.getElementById("plClock").textContent = clock;
  const scrub = document.getElementById("plScrub");
  scrub.setAttribute("aria-valuenow", String(Math.round(rel))); // ms, same unit/precision as valuemin/valuemax
  scrub.setAttribute("aria-valuetext", clock);
}
function updatePlayer(rel) {
  // light refresh for scrubbing: clock + ribbon + optional stack rebuild on index change
  player.rel = Math.max(0, Math.min(player.total, rel));
  const idx = idxOfRel(player.moments, player.rel);
  renderRibbon(player.run, player.rel);
  updateScrubUI(player.rel, player.total);
  // iteration 17: drag preview mirrors the sidebar silently (the iteration-10
  // drag discipline: drags never write #plLive; the flip alone is the signal) —
  // the flip return value is dropped on purpose.
  updateQuality(player.rel);
  if (player.presenter.idx !== idx) {
    // iteration 24: the drag started with pause(), which now FREEZES the chain
    // instead of killing it — moving to another moment must also drop the
    // parked continuation, or the resume would finish the old (now detached)
    // card's evidence and only then continue
    player.presenter.invalidate();
    player.presenter.idx = idx;
    player.presenter.queue = [];
    rebuildStack(player.stack, player.moments, idx);
  }
}
function hardSeek(rel) {
  const idx = idxOfRel(player.moments, rel);
  player.presenter.hardSeek(idx);
  player.rel = idx >= 0 ? player.moments[idx].rel : 0;
  renderRibbon(player.run, player.rel);
  updateScrubUI(player.rel, player.total);
  // iteration 17: seek commit flips the sidebar silently — onTick inside
  // presenter.hardSeek already brought the rows to this position (playing is
  // false there), and the arrival announce below covers the commit itself.
  updateQuality(player.rel);
  // iteration 40: 位置深链写点（离散 seek 提交）：replace，不增历史条目；连续 tick
  // 与拖拽预览（updatePlayer）不写——hash 只在离散导航点上落位
  navWrite(hashFragment("history", player.run.id, player.rel), false);
  // discrete announcement: a seek COMMIT (click, keyboard step, stack onSeek) —
  // updatePlayer during a drag stays silent, so quick drags never flood #plLive
  announce("已跳到 " + clockOf(player.rel));
}
function resume() { play(); }
function play() {
  if (!player) return;
  if (player.presenter.idx >= player.moments.length - 1 && !player.presenter.queue.length) {
    // restart from the top
    hardSeek(0);
  }
  player.presenter.play();
  setPlayBtn(true, "⏸ 暂停");
  announce("播放");
}
function pause() {
  if (!player) return;
  player.presenter.pause();
  setPlayBtn(false, "▶ 播放");
  // iteration 40: 位置深链写点（暂停）：把断点位置浅写入 URL——刷新/分享后回到此处。
  // 离开视图的自动冻结（下方 viewswitch 监听）走 presenter.pause() 原语不经此函数，
  // 不产生重复写（写点只拒用户主动的离散暂停，与「每表面一个离散通道」口径一致）
  navWrite(hashFragment("history", player.run.id, player.rel), false);
  announce("暂停");
}
function setFactor(s) {
  if (!player) return;
  player.presenter.setFactor(s);
  document.querySelectorAll("#plSpeeds button").forEach((b) => {
    const on = +b.dataset.speed === s;
    b.classList.toggle("active", on);
    // exclusive single-select group: aria-current marks the one item that is
    // visually current (class="active"); the other four are "not current" by
    // having no attribute at all (aria-current="false" is not exposed either)
    if (on) b.setAttribute("aria-current", "true");
    else b.removeAttribute("aria-current");
  });
  announce(s + " 倍速");
}

// iteration 26: the same view-switch self-defense for THIS surface — a RUNNING
// replay freezes when the history view stops being current. state.js dispatches
// "viewswitch" after every switch (iteration 25, verbatim); this module-level
// listener is registered ONCE at module evaluation — the exact pattern convert.js
// uses (an openPlayer registration would need a guard flag like scrubWired
// anyway, and the reaction must outlive whichever run instance is open: the
// closure reads the live binding of `player`, replaced by every openPlayer).
// Only the presenter's EXISTING halves are called — pause(), the iteration-24
// freeze primitive VERBATIM (parks the chain at its junction, freezes the char
// stream, keeps idx/chars/evShown/frozen as the observable breakpoint) — plus
// setPlayBtn, so the transport offers ▶ 播放 when the user returns.
//
// No announce on the away path: the outgoing view is already aria-hidden +
// inert + display:none when the event arrives (state.js dispatches AFTER the
// flip), so a #plLive write there is dead — the iteration-25 precedent.
//
// Resume semantics — STAY FROZEN on return, the user releases it with ▶ 播放:
// aligned with iteration 25's decision chain verbatim (WCAG 2.2.2: a view
// change is navigation, not a resume intent; returning to read the history must
// not restart dynamic content; pause() is idempotent so a user-paused replay
// and its button state survive byte-for-byte; one release path — the two-state
// #plPlay, whose label-carries-the-action / aria-pressed-carries-the-state
// contract extends to the automatic case unchanged). The slider's aria triple
// (aria-valuenow / valuetext / the visible clock) stays AT the breakpoint: this
// listener writes no scrub UI, and only onTick (playing) writes it — so the
// slider, the frozen idx/chars and #plLive all tell one story.
//
// State coverage: running ⇒ frozen in place, button flips to ▶ 播放;
// user-paused ⇒ pause() is idempotent, the manual freeze and its button state
// survive the round trip untouched; ended ⇒ playing===false so no call runs and
// the ↺ 重播 state is never disturbed (frozen===false also means no re-announce);
// not opened ⇒ player===null, both branches short-circuit (the viewswitch that
// btnReplayRun/mReplay dispatch BEFORE openPlayer is exactly this case).
// iteration 70（多页拆分 I 期）：宿主事件迁移——「history 视图不再 current」（SPA
// 的 viewswitch）在多页形态就是「文档不可见」（Page Visibility API）。依旧只调
// player 的既有两半：pause()（24 次冻结原语，断点逐字节存活）+ setPlayBtn
// （钮置「▶ 播放」）；其余论证逐字不变（WCAG 2.2.2 不自动续播、pause() 幂等使
// 手动暂停的断点与钮状态逐字节存活、一种释放路径两种来源）。
//
// 与 convert.js 的演示冻结同源同日：两个回放表面（history player / run 演示）
// 各自随自己的文档可见性冻结，跨页后不存在「在别的视图里续播」的路径了。
//
// State coverage — 与 26 次同表：running ⇒ hidden 时冻结、钮置 ▶ 播放；
// user-paused ⇒ pause() 幂等零改；ended ⇒ playing===false 零调用（↺ 重播
// 状态不被扰动）；未开 ⇒ player===null 短路。
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (player && player.presenter.playing) {
      player.presenter.pause();
      setPlayBtn(false, "▶ 播放");
    }
    return;
  }
  // back: one discrete re-announce for a FROZEN replay only — the ended
  // replay (frozen===false) announces nothing and replays nothing
  if (player && player.presenter.frozen) announce("暂停");
});

// ---- iteration 10: replay accessibility — slider keyboard + announcements ----
// Step units are fractions of the run duration, read from the same player.total
// the visual fill uses (no parallel model). 1% of the 1150.971 s replay ≈ 11.5 s,
// 10% ≈ 1:55 — coarse on purpose: the seek target is quantized onto the moment
// grid by idxOfRel exactly like a mouse click, so keyboard and pointer behave
// identically (same commit path hardSeek, same precision).
const STEP = 0.01;      // ←/→/↑/↓      — APG "one step"
const STEP_BIG = 0.10;  // PageUp/PageDown — APG "larger than the step change made by Up Arrow"
let scrubWired = false;
let liveNudge = 0;

// #plPlay is a genuine two-state control, so its label (visual truth) and its
// aria-pressed (AT state) are written together from the three state points.
function setPlayBtn(on, label) {
  const b = document.getElementById("plPlay");
  b.textContent = label;
  b.setAttribute("aria-pressed", on ? "true" : "false");
}

// Discrete replay events only (seek/speed/play/pause/end). The per-moment clock
// is never announced: onTick updates it 112 times per replay (a burst at 16x),
// which a live region would queue completely — the flood this avoids. A focused
// slider exposes its own value through aria-valuetext, so the clock needs no
// live semantics at all; politeness handles human-rate key repeats by design.
function announce(msg) {
  const el = document.getElementById("plLive");
  if (!el) return;
  // identical content may not re-announce on AT (MDN live-region note), and
  // consecutive identical events happen (same speed twice, same seek target),
  // so each write carries a distinct amount of trailing whitespace: inaudible
  // (trimmed by AT), enough to change the region's text.
  el.textContent = msg + " ".repeat(++liveNudge % 3 + 1);
}

// Keyboard operation of the slider, attached once when the player first opens.
function wireScrub() {
  if (scrubWired) return;
  scrubWired = true;
  document.getElementById("plScrub").addEventListener("keydown", (ev) => {
    if (!player) return;
    const steps = { ArrowRight: STEP, ArrowUp: STEP, ArrowLeft: -STEP, ArrowDown: -STEP, PageUp: STEP_BIG, PageDown: -STEP_BIG };
    const d = steps[ev.key];
    if (d === undefined && ev.key !== "Home" && ev.key !== "End") return; // unmapped keys pass through untouched
    ev.preventDefault(); // arrows/PageUp/PageDown/Home/End must move the slider, not scroll the page
    const wasPlaying = player.presenter.playing;
    const target = ev.key === "Home" ? 0
      : ev.key === "End" ? player.total
      : player.rel + d * player.total; // same ms unit and the same clamp as a pointer seek (main.js scrubRel)
    hardSeek(Math.max(0, Math.min(player.total, target))); // commit through the existing seek path — no parallel logic
    if (wasPlaying) play(); // mirror the stack onSeek pattern: commit, then keep playing if it was
  });
}

function renderRibbon(run, rel) {
  const el = document.getElementById("plRibbon");
  const t0 = Date.parse(run.startedAt);
  el.innerHTML = run.stages.map((s) => {
    const a = Math.max(0, Date.parse(s.start) - t0), b = Math.min(run.durationMs, Date.parse(s.end) - t0);
    const dur = Math.max(b - a, 60000);
    let cls = "";
    if (rel >= b) cls = "done";
    else if (rel >= a) cls = "active";
    return `<div class="ribbon-seg ${cls}" style="flex:${dur}" title="${s.name} · ${clockOf(dur)}"></div>`;
  }).join("");
}

function renderDocCard(run) {
  document.getElementById("plDocCard").innerHTML = `
    <h4>交付物</h4>
    <div class="d-title">${esc(run.doc.title)} · ${run.doc.pages} 页笔记</div>
    <div class="d-facts">
      <span class="fact">${run.doc.pages} 页</span><span class="fact">${run.doc.cjk} 字</span>
      <span class="fact">${run.doc.figures} 图</span><span class="fact">${run.doc.atoms} 教学点</span>
    </div>
    <div class="m-detail" style="margin-top:8px">${esc(run.doc.summary)}</div>`;
}

// iteration 17: the "current row" of the replay is the furthest transcript
// line reached: moments are rel-sorted, a few carry no line, and gate lines
// are not strictly monotonic in the array, so a cumulative max (computed once
// per open, O(1) per tick after) is the honest notion of "how far the replay
// has written". idx -1 (before the first moment) maps to -1: no gate line can
// pass (they are all ≥ 1), so an unstarted replay shows every row pending.
function lineOfMoments(moments) {
  const acc = [];
  let mx = -1;
  for (const m of moments) {
    if (m.line != null) mx = Math.max(mx, m.line);
    acc.push(mx);
  }
  return acc;
}

// iteration 17: render once, then flip rows individually. A full innerHTML
// rebuild per tick (112 per replay) would destroy an assistive-tech reading
// cursor resting in the aside and repaint all 9 rows every moment; the number
// of flips over a whole forward replay is bounded by the gate count. Each
// flip writes three nodes of ONE row: the class pair, the glyph (aria-hidden,
// the sr-only text carries the semantics) and the sr-only status word.
// Returns the titles of the rows that JUST passed, so the caller decides
// whether the event is announced (onTick while playing) or silent (drag
// preview / seek commit). No aria-busy: #plQuality is not a live region
// (announcements ride #plLive), and the flip loop is one synchronous task,
// so the DOM is consistent at every task boundary an AT reader can observe.
function updateQuality(rel) {
  if (!player) return [];
  const idx = idxOfRel(player.moments, rel);
  const curLine = idx >= 0 ? player.lineOf[idx] : -1;
  const fresh = [];
  const qRows = document.querySelectorAll("#plQuality .q-row");
  qRows.forEach((row) => {
    const line = row.dataset.line === "" ? null : +row.dataset.line;
    const pass = line != null && line <= curLine;
    if (pass === row.classList.contains("q-pass")) return; // unchanged: no DOM write at all
    row.classList.toggle("q-pass", pass);
    row.classList.toggle("q-pending", !pass);
    row.querySelector("b").textContent = pass ? "✓" : "○";
    row.querySelector(".sr-only").textContent = pass ? "已通过" : "待通过";
    if (pass) fresh.push(row.dataset.title);
  });
  // iteration 47: 游标（frontier）迁移 = 已通过行中 data-line 最大者。run 数据的
  // quality 行序非按 line 单调（[6,14,25,67,61,87,112,136,206]），DOM 末行 ≠
  // frontier，取 max-line 才是「回放位置同步的高亮」的语义。三种调用路径
  // （onTick / 拖拽预览 / seek 提交）共用这一段：frontier 未变则零 DOM 写入
  // （与翻转循环同语义的 early-return——拖拽每 mousemove 调用本函数，零额外
  // DOM 写入）；全部待通过时 front 为 null，游标消失。fresh 返回值与上层
  // announce 门控逐字不变。
  let front = null, frontLine = -1;
  qRows.forEach((row) => {
    if (!row.classList.contains("q-pass")) return;
    const fl = row.dataset.line === "" ? null : +row.dataset.line;
    if (fl != null && fl > frontLine) { frontLine = fl; front = row; }
  });
  const curFront = document.querySelector("#plQuality .q-row.q-front");
  if (curFront !== front) {
    if (curFront) curFront.classList.remove("q-front");
    if (front) front.classList.add("q-front");
  }
  return fresh;
}

function renderQuality(run) {
  // iteration 17: every row starts PENDING — the 9 ✓ up front was the spoiler
  // (the run earned these gates along the trajectory, not before it). The row
  // keeps its criterion text visible (a rubric is not an outcome); only the
  // pass state is revealed by updateQuality as the replay crosses `line`.
  document.getElementById("plQuality").innerHTML = `<h4>自动验收（${run.quality.length} 项）</h4>` +
    run.quality.map((q) => `<div class="q-row q-pending" data-line="${q.line ?? ""}" data-title="${esc(q.title)}"><b aria-hidden="true">○</b><span class="sr-only">待通过</span>${esc(q.title)}<br><span style="color:var(--ink-3)">${esc(q.detail)}</span></div>`).join("");
}

// ── module: src/scripts/components/nav.js ──
// nav.js — URL ↔ 应用状态双向接线（iteration 40；iteration 70 多页拆分 I 期 页化）。
//
// 分层不变（本仓模块环红线）：hash.js 是无应用依赖的水暖层；player.js 只 import
// hash.js 的写原语；本模块是「调用方」层级——import state.js 与 player.js 的既有
//导出，与 convert.js/library.js/boot-*.js 同级。图无环：
//   hash → （无依赖）； pages → （无依赖）； state → hash； player → state/hash/pages；
//   nav → state/player/hash/pages。
//
// **URL → 应用**只复用既有函数（views 的 a11y 初态由页壳承载、player 走 openPlayer
// 含冻结-续播断点语义、位置走 hardSeek），不写第二份同步代码。**幂等**：目标
// player 已就位则零 DOM 操作——浏览器后退回到「player 已开」时，冻结断点
// （iteration 24/26）逐字节存活，不重开、不 hardSeek。
//
// iteration 70 的映射规则：fragment 的 view 分量决定**住在哪一页**——
//   - 目标视图的页 == 当前页（run 页的视图归属 = convert）⇒ 就在本页应用
//     （history 页的 run/rel 分量、纯视图地址零操作）；
//   - 不符 ⇒ location.replace(目标页 + 同一 fragment)：fragment 原样带到目标页
//     boot 再由本函数消费 ⇒ 整个深链家族（#library/#history/<run>/@ms…）
//     的跨页可达性只此一条路径，无第二份语法。
// 非法/越界 hash 静默回落默认视图（convert——40 次任务口径：不抛错、不循环）。

// reconcile：把 location.hash 描述的目标态与当前应用态对齐（唯一入口）
function reconcileHash() {
  const raw = location.hash;
  // 空散列 = 页身份即地址（直接打开 library.html 本就是寻址文档库）：无深链信息可
  // 应用、无重定向目标——就地零操作。只有散列显式命名了别的视图才谈跨页跳转。
  const st = raw === "" ? { view: pageView() } : (parseHash(raw) || { view: "convert" });
  let view = st.view;
  if (st.runId && !runs.some((r) => r.id === st.runId)) view = "convert"; // 越界 run → 默认视图
  if (raw !== "" && PAGES[view] !== PAGES[pageView()]) {
    // 落点在别的页：fragment 原样带到目标页（越界/非法散列带它回转换页= 静默回落）
    location.replace(PAGES[view] + raw);
    return;
  }
  if (view !== "history" || !st.runId) return;  // 视图级地址：player 状态不动（无关闭语义）
  const run = runs.find((r) => r.id === st.runId);
  if (!(player && player.run === run)) openPlayer(run, { rel: st.rel ?? 0 });
  else if (st.rel != null && st.rel !== player.rel) hardSeek(st.rel); // 位置深链 URL→app
  // 否则零操作：视图与 player 均已就位（含 player 已开但 hash 无 @rel：断点存活）
}

// boot 显式应用：页面初载时 hashchange 不触发（且即便触发，幂等检查也会吸收）。
// 调用点：各 boot-<page>.js 在自身渲染之后（此时该页 DOM 已就绪、runs 已装，
// location.hash 可直接恢复「player（+ 位置）」或触发跨页替换导航）
function applyHashAtBoot() { withNavApply(reconcileHash); }

// 浏览器后退/前进、地址栏手改、书签、#链接：全部经此一条路径到 reconcile
window.addEventListener("hashchange", () => withNavApply(reconcileHash));

// 迭代 40 的 URL 重寻址（回到 history 且 player 已开）在多页形态下由 player.js
// 的既有 navWrite 写点与 location 导航承载：跨页桥（goPage）把 fragment 写进目标
// URL，本页 boot 消费它；同页内的离散写（openPlayer push / 位置 replace）路径不变。

// ── module: src/scripts/components/boot-convert.js ──
// boot-convert.js — 落地页 boot（iteration 70，多页拆分 I 期）。
// SPA 形态的 main.js 表单接线迁移至此：submit → 校验（第 16 次守卫，空链接就地
// 提示、不导航）→ 通过则跨页交接到 run.html（URL search params 携带演示输入与
// 节奏档）。分体版/dist 版同一接线。

function bootConvert() {
  const form = document.getElementById("convertForm");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const handoff = convertHandoff(
      document.getElementById("urlInput").value,
      document.getElementById("modeSelect").value,
      document.getElementById("demoPace").value,
    );
    // 校验被拒（空链接）：就地反馈、零导航、零滚动（第 16 次口径逐字不变）
    if (handoff) location.assign(handoff);
  });
  // 表单的拒绝状态不活过用户的下一次按键（ARIA19 口径逐字不变）
  document.getElementById("urlInput").addEventListener("input", clearConvertFeedback);
  // 深链落点：convert 页是默认视图，纯视图地址零操作；hash 指向他页时
  // （#library / #history/<run>）由 reconcile 替换导航过去，fragment
  // 原样透传给目标页 boot 消费——整个 fragment 家族的跨页可达性入口
  applyHashAtBoot();
}

// ── module: src/scripts/components/boot-run.js ──
// boot-run.js — 演示页 boot（iteration 70，多页拆分 I 期）。
// index.html（convert 页，78 期改名 = 提交转换地址的首页）的表单经
// ?url=&mode=&pace= 交接到此：参数校验（非法值回落 auto/brisk——与深链家族
// 「非法/越界静默回落」同口径；缺 url 则回入口 index.html）→ startConvert 启动演示（pacer / 调速 / 暂停 / pushIn 插针 /
// cap 20 逐字不变，宿主从 #view-convert 换成本页的 #runPanel；74：#cvMsg
// 通告线与交付卡挣得拍随 artifacts-check 组件退役）。
// 重复提交终止旧演示（第 16 次守卫）的跨页等价 = 文档卸载销毁旧计时器链：
// 新文档的演示是唯一活演示，同文档双演示竞态结构性不存在。

// 与 convertHandoff 的两份白名单同源（交接的写与读只能是这一对表）。命名与
// convert.js 的 MODES/PACES（数组）分立：经典束是单一作用域，顶层名须唯一。
const VALID_MODES = new Set(["auto", "conceptual-talk", "technical-slide"]);
const VALID_PACES = new Set(["brisk", "instant", "immersive"]);

function bootRun() {
  const q = new URLSearchParams(location.search);
  const url = (q.get("url") || "").trim();
  if (!url) {
    // 缺交接参数（手敲 URL / 书签直达）→ 回入口：演示没有输入就没有演示
    location.replace("index.html");
    return;
  }
  const mode = VALID_MODES.has(q.get("mode")) ? q.get("mode") : "auto";
  const pace = VALID_PACES.has(q.get("pace")) ? q.get("pace") : "brisk";
  startConvert(url, mode, pace);
  // 深链落点：run 页的视图归属 = convert，纯视图地址零操作；fragment 指向他页
  // 时由 reconcile 替换导航（与 boot-convert 同入口，一处实现）
  applyHashAtBoot();
  // iteration 66 的焦点口径跨页承载：新场景的 AT 接收点 = 演示运输钮
  // （#btnPauseRun，startConvert 已使其可见——同 SPA 形态 heroExit 的落点）
  document.getElementById("btnPauseRun")?.focus({ preventScroll: true });
}

// ── module: src/scripts/components/library.js ──
// VidNotes library view: doc cards + document modal (APG dialog pattern).
// iteration 70（多页拆分 I 期）：卡片与弹层逐字不变；mReplay「回放生成轨迹」
// 跨页化（goPage + hashFragment，替代 switchView+openPlayer 同页路径）。

// the element that opened the doc modal; focus returns to it on close
// (guarded: innerHTML re-renders can leave it dangling)
let modalTrigger = null;

/* iteration 13: the traceability appendix for "每个数字都有出处". The times are
 * SOURCE-VIDEO instants (the original clip's own clock) — NOT the replay
 * timeline, which plays the process-moment stream — so they are labelled as
 * such and carry no click target of any kind. Rendered only when the additive
 * doc.sourceClaims exists and is non-empty; without it the modal is
 * byte-identical to before. Semantic per MDN/WCAG SC 1.3.1: a data <table>
 * with a sr-only <caption>, four <th scope="col"> column headers and a
 * <th scope="row"> row header per claim; the time cell is a <time> whose
 * datetime is a valid duration string (built at the product-build boundary).
 * The badge is colour + check mark + text (SC 1.4.1 G14); a row that is not
 * in the notes renders the plain cell text, so no class exists for a state
 * this dataset never carries (the dead-rule discipline of iteration 12).
 */
function claimsHtml(d) {
  const rows = Array.isArray(d.sourceClaims) ? d.sourceClaims : [];
  if (!rows.length) return "";
  return `<section class="m-claims" aria-labelledby="mcTitle">
    <h3 id="mcTitle">数字出处<span class="mc-count">${rows.length} 条</span></h3>
    <p class="mc-note">下列时刻均为<b>源视频内</b>时间（原片播放轴），与本站回放轨迹的时间轴不同；每条均标注是否已写入笔记。</p>
    <table class="mc-table">
      <caption class="sr-only">数字出处表：每条数字声称的数值、源视频内时间与是否已写入笔记</caption>
      <thead><tr><th scope="col">数字声称</th><th scope="col">数值</th><th scope="col">源视频时间</th><th scope="col">入笔记</th></tr></thead>
      <tbody>${rows.map((c) => `<tr>
        <th scope="row">${esc(c.claim)}</th>
        <td>${esc(c.value)}</td>
        <td>${c.sourceTime ? `<time${c.seconds != null ? ` datetime="PT${c.seconds}S"` : ""}>${esc(c.sourceTime)}</time>` : "—"}</td>
        <td>${c.inNotes ? '<span class="mc-in">✓ 已入笔记</span>' : "未入笔记"}</td>
      </tr>`).join("")}</tbody>
    </table>
  </section>`;
}

function renderLibrary() {
  const grid = document.getElementById("docGrid");
  grid.innerHTML = runs.map((r, i) => `
    <div class="doc-card" data-run="${i}">
      <div class="doc-thumb">${esc(r.platform)} · ${esc(r.sourceTitle.split("·")[1] || r.title)} · ${Math.round(r.videoDurationSec / 60)} 分钟</div>
      <h3>${esc(r.doc.title)}</h3>
      <div class="doc-meta">${new Date(r.startedAt).toLocaleString("zh-CN")} · ${esc(r.mode)} 类型 · ${r.durationMs / 60000 | 0} 分钟生成</div>
      <div class="doc-facts">
        <span class="fact">${r.doc.pages} 页</span><span class="fact">${r.doc.cjk} 字</span>
        <span class="fact">${r.doc.figures} 张图</span><span class="fact">${r.doc.atoms} 个教学点</span>
        <span class="fact">${r.doc.claims} 条数字出处</span>
      </div>
      <div class="doc-status">✓ 已交付 · 可回放轨迹</div>
    </div>`).join("");
  // cards open the modal by mouse and by keyboard — focus return below only
  // helps keyboard users if the trigger itself is focusable
  grid.querySelectorAll(".doc-card").forEach((c) => {
    c.setAttribute("tabindex", "0");
    c.setAttribute("role", "button");
    c.setAttribute("aria-label", `打开《${runs[+c.dataset.run].doc.title}》笔记详情`);
    c.addEventListener("click", () => openDocModal(runs[+c.dataset.run], c));
    c.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      openDocModal(runs[+c.dataset.run], c);
    });
  });
  document.getElementById("libCount").textContent = runs.length;
}

function openDocModal(run, trigger) {
  const d = run.doc;
  const pdf = run.moments.find((mm) => mm.kind === "done")?.evidence;
  document.getElementById("docModalBody").innerHTML = `
    <h2 id="docModalTitle">${esc(d.title)}</h2>
    <div class="m-sub">${esc(run.platform)} 源视频 · ${Math.round(run.videoDurationSec / 60)} 分钟 · 判为「${esc(d.mode)}」类型 · ${run.durationMs / 60000 | 0} 分钟自动生成</div>
    <div class="m-facts">
      <span class="fact">${d.pages} 页 A4</span><span class="fact">${d.cjk} 中文字</span>
      <span class="fact">${d.figures} 张教学图</span><span class="fact">${d.atoms} 个教学点</span><span class="fact">${d.claims} 条数字出处</span>
    </div>
    ${pdf ? `<div class="m-pages">${pdf.pages.map((p, i) =>
      `<img class="ev-page" data-lightbox="${p}" data-caption="第 ${i + 1} 页" src="${p}"${dimAttrs(pdf.imgSizes, p)} alt="第 ${i + 1} 页" loading="lazy" decoding="async">`).join("")}</div>` : ""}
    <div class="m-body">${esc(d.summary)}<br><br>章节：${pdf?.sections.map((s) => `${s.n}. ${esc(s.title)}`).join(" · ") || ""}<br><br>交付前通过全部 ${run.quality.length} 项自动验收。</div>
    ${claimsHtml(d)}
    <div class="m-actions">
      <button class="btn-primary" id="mReplay">回放生成轨迹</button>
      <button class="btn-ghost" id="mClose">关闭</button>
    </div>`;
  const modal = document.getElementById("docModal");
  modal.classList.remove("hidden");
  // APG dialog: while it is open, Tab / Shift+Tab cycle inside the dialog
  // (focus-trap.js); released on every close path below
  trapFocus(modal);
  modalTrigger = trigger && document.contains(trigger) ? trigger : null;
  wireLightbox(document.getElementById("docModalBody"));
  // APG dialog: focus moves into the dialog on open (its first control here)
  document.getElementById("docModalClose").focus();
  document.getElementById("mReplay").onclick = () =>
    // iteration 70：跨页桥——fragment 透传到 history 页，目标页 boot 的 reconcile
    // 打开该 run 的 player（旧 SPA 路径 = closeDocModal + switchView + openPlayer
    // + 聚焦 plPlay + 飞球；复盘登记：55 飞球与弹层释放随分页退役，落点焦点由
    // boot-history 的深链焦点口径承载）
    goPage("history", hashFragment("history", run.id));
  document.getElementById("mClose").onclick = () => closeDocModal();
}
function closeDocModal(returnFocus = true) {
  const modal = document.getElementById("docModal");
  // release the Tab cycle first: an already-hidden modal has already released
  // it (no-op here), a visible one unregisters before it disappears
  releaseFocus(modal);
  if (modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  // APG dialog: on close, focus returns to the invoking element if it still exists
  const el = modalTrigger;
  modalTrigger = null;
  if (returnFocus && el && document.contains(el)) el.focus();
}
// iteration 70：模块级监听在多页形态下随页面求值（经典束在每页都执行模块
// 顶层代码），故对可能缺失的锚点用可选链守卫——library 页上它们恒在、行为
// 逐字不变；无弹层的页上零调用（监听注册本身是 null-safe 的空操作）。
document.querySelector(".modal-backdrop")?.addEventListener("click", () => closeDocModal());
document.getElementById("docModalClose")?.addEventListener("click", () => closeDocModal());
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const lb = document.getElementById("lightbox");
  if (!lb) return; // 本页无 lightbox（convert/source 页：Escape 无覆盖层可关）
  // APG dialog stacking: the lightbox (z-index 300) sits above this modal
  // (z-index 200), so while it is open Escape dismisses only it — the doc modal
  // stays put; the next Escape then closes the modal.
  if (lb.classList.contains("hidden")) closeDocModal();
  else closeLightbox();
});

// ── module: src/scripts/components/boot-library.js ──
// boot-library.js — 文档库页 boot（iteration 70，多页拆分 I 期）。
// renderLibrary（卡片 + 计数徽标）+ ?doc=<runId> 弹层深开（run.html「查看讲义」
// 的跨页等价落点：直达该 run 的笔记弹层，内容可达性不降级）。

function bootLibrary() {
  renderLibrary();
  // 深链落点先于弹层深开：若 fragment 指向他页（#history/<run> 等），reconcile
  // 会替换导航走，本页的弹层深开就不必再跑
  applyHashAtBoot();
  const doc = new URLSearchParams(location.search).get("doc");
  if (!doc) return;
  const run = runs.find((r) => r.id === doc);
  if (run) openDocModal(run); // 越界/未知 doc 静默忽略（与深链回落同口径）
}

// ── module: src/scripts/components/boot-history.js ──
// boot-history.js — 历史轨迹页 boot（iteration 70，多页拆分 I 期）。
// SPA 形态 main.js 的 player 接线迁移至此（plPlay 双态钮 / plSpeeds 五档 /
// plScrub 拖拽 + 键盘步进 / lightbox 关闭），深链恢复由 applyHashAtBoot 承担
// （#history/<run>/@<ms> 的 player + 位置分量，reconcile 幂等、断点存活）。

function bootHistory() {
  renderRunList();
  // 深链恢复（第 40 次）：runList 先渲染（openPlayer 的 .run-item 选中态需要它）
  applyHashAtBoot();

  document.getElementById("plPlay").addEventListener("click", () => {
    if (player) { if (player.presenter.playing) pause(); else play(); }
  });
  document.querySelectorAll("#plSpeeds button").forEach((b) => b.addEventListener("click", () => setFactor(+b.dataset.speed)));
  const scrub = document.getElementById("plScrub");
  const scrubRel = (ev) => {
    const r = scrub.getBoundingClientRect();
    return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * player.total;
  };
  let scrubbing = false, wasPlaying = false;
  scrub.addEventListener("click", (ev) => {
    if (!player) return;
    hardSeek(scrubRel(ev));
  });
  scrub.addEventListener("mousedown", (ev) => {
    if (!player) return;
    scrubbing = true;
    wasPlaying = player.presenter.playing;
    pause();
    updatePlayer(scrubRel(ev));
  });
  window.addEventListener("mousemove", (ev) => { if (scrubbing && player) updatePlayer(scrubRel(ev)); });
  window.addEventListener("mouseup", () => {
    if (scrubbing) { scrubbing = false; if (player && wasPlaying) play(); }
  });
  // iteration 75: #lbClose / .lb-backdrop 点击关闭改由 evidence.js 的
  // openLightbox 集中接线（lbBindClose，一次式全页通用），本页的重复接线删除
  // （closeLightbox 幂等，历史两路并存无害但属冗实现）。

  // 焦点口径跨页承载（iteration 55 的 mReplay / convert.js 的 btnReplayRun 落点）：
  // 深链携带 run 分量时（跨页桥的唯一形态：#history/<run>[/@ms]）落点聚焦
  // #plPlay——openPlayer 已使其可聚焦；纯视图地址（#history / 空）不夺焦点
  if (location.hash.includes("/") && player) document.getElementById("plPlay").focus({ preventScroll: true });
}

// ── module: src/scripts/main.js ──
// VidNotes app entry（iteration 70，多页拆分 I 期）：页调度器。
//
// SPA 形态的 main.js 集中接线所有视图；多页形态下每页是一个文档，本入口退化为
// 调度器——数据装载与顶栏计数先行，然后按 <body data-page> 执行对应 boot 模块。
// 既有接线逐字迁移至 boot-<page>.js（表单校验/交接、演示 + 跨页链接、弹层 + ?doc
// 深开、player + 深链恢复）。state.js 的视图渲染与 hash.js 的深链
// 水暖层零改。http 分体版（模块图）与 dist 经典束共用同一入口与同一调度逻辑。
// 第 77 次：原片回放页（boot-source.js）随原片功能整体退场，BOOTS 回到四页。

const BOOTS = {
  convert: bootConvert,
  run: bootRun,
  library: bootLibrary,
  history: bootHistory,
};

(async () => {
  const data = await loadData();
  seedRuns(data);
  // 顶栏计数徽标：SPA 形态由 renderLibrary/renderRunList 写入；多页形态下转换/
  // 演示页不跑那两个渲染器，徽标由调度器统一写（元素缺失跳过——页壳标记
  // 的初值 1 与数据 runs.length 一致，是 boot 前的渐进增强值）
  for (const id of ["libCount", "histCount"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(runs.length);
  }
  const page = document.body.dataset.page;
  BOOTS[page]?.();
})();


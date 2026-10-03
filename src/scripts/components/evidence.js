// VidNotes evidence renderers (per evidence.type) + lightbox wiring.
import { esc } from "../utils/utils.js";
import { trapFocus, releaseFocus } from "../utils/focus-trap.js";

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
export const dimAttrs = (sizes, img) => {
  const s = sizes?.[img];
  return Array.isArray(s) && Number.isInteger(s[0]) && Number.isInteger(s[1]) && s[0] > 0 && s[1] > 0
    ? ` width="${s[0]}" height="${s[1]}"`
    : "";
};

export function evHtml(e) {
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
export function wireLightbox(root = document) {
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
export function closeLightbox() {
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

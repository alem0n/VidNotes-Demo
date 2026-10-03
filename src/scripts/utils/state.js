// VidNotes run state: data loading, in-memory run list, view switching.
// iteration 40: switchView 也是 URL 寻址的写点位（应用 → URL）：视图切换是离散导航事件，
// 产生可后退的一条历史条目（push）。写本身经 hash.js（微任务合并刷出——同任务内的
// switchView+openPlayer 对因此只占一条条目），URL 语义见 nav.js / hash.js。
import { navWrite, hashFragment } from "./hash.js";

export const runs = []; // in-memory run list (seeded from data)

export async function loadData() {
  if (window.__PRODUCT_DATA__) return window.__PRODUCT_DATA__;
  const res = await fetch("build/product-data.json");
  return res.json();
}

export function seedRuns(data) {
  runs.push(...data.runs.map((r) => ({ ...r, demo: false })));
}

export function relMoments(run) {
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
export function switchView(name) {
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

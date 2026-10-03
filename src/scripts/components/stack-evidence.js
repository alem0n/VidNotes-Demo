import { rand } from "../utils/utils.js";
import { evHtml, wireLightbox } from "./evidence.js";
import { PACER, TELE, logPacerDelay, scalePause, instantFactor } from "./pacer.js";
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
export function finalizeCardEvidence(card, m) {
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
export function sequenceEvidence(card, m, pace, getFactor, guard, onDone, gate) {
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

// VidNotes moment stack: the “正在做” stage — cards, pacing, evidence sequencing.
import { clockOf, esc } from "../utils/utils.js";
import { finalizeCardEvidence } from "./stack-evidence.js";

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

export function makeStack(container, opts = {}) {
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

export function rebuildStack(stack, moments, idx) {
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

export function pushStackCard(stack, m, expanded, pace = {}) {
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

export function pruneStack(stack) {
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

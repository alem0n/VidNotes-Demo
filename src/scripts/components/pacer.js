/* ---------- pacing: machine-fluent text, stochastic only at load/check ----------
 * Text detail streams at a CONSTANT cadence (no random stops) — fluent output
 * signals smooth generation. Random pauses appear ONLY at:
 *   (a) image evidence: items fill in one-by-one (generation feel)
 *   (b) batch text checks (tables / verify lines / kv): rows pop one-by-one
 *       (checking feel); the final PASS line waits longer (dramatic).
 */
export const PACER = {
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
export const TELE = {
  factor: 1, charMs: 0, chars: 0, textLen: 0, gen: 0, queue: 0, idx: -1,
  paceName: "pacer", phase: "idle", delays: [], intervals: [], rescales: [],
  frozen: false, evShown: 0,
};
export const LOG_CAP = 512, IV_CAP = 96, RES_CAP = 128;
export function setPacerState(patch) { Object.assign(TELE, patch); }
export function logPacerDelay(kind, ms, f) {
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
export function pacerSnapshot() {
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
export function scalePause(kind, ms, f, floor, fire) {
  const h = { kind, ms, f, floor, at: performance.now(), fire, id: 0, dead: false };
  h.wrap = () => { MAP.delete(h.id); if (!h.dead) fire(); };
  h.id = setTimeout(h.wrap, ms);
  MAP.set(h.id, h);
  return h; // opaque handle: stays valid across reorders (h.id mutates in place)
}
// cancel + deregister; called by presenter.pause()/hardSeek so a later speed
// change can never resurrect a cancelled pause (reorder mutates the same handle)
export function clearPause(h) {
  if (!h) return;
  h.dead = true;
  MAP.delete(h.id);
  clearTimeout(h.id);
}
export function rescaleLivePauses(nf) {
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
export function afterEntrance(card, cb, instant = false, fallbackMs = 900) {
  let done = false;
  const finish = () => { if (!done) { done = true; cb(); } };
  if (instant) { setTimeout(finish, 60); return; }
  card.addEventListener("animationend", finish, { once: true });
  setTimeout(finish, fallbackMs);
}

export function instantFactor(f) { return f >= 8; }

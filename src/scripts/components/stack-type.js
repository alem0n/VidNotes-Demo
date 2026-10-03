import { PACER, TELE, IV_CAP, instantFactor } from "./pacer.js";
let typingToken = 0, typingFrozen = false, parkedStep = null;
export function cancelTyping() { typingToken++; typingFrozen = false; parkedStep = null; }
// iteration 24: freeze-continue. pause() parks the in-flight character stream
// mid-character (its resumption point = the closure of the next step, a coroutine
// continuation: Kotlin-style save-the-locals-and-the-label), so a frozen demo no
// longer finishes its text on its own; play() releases it through resumeTyping.
// cancelTyping (hardSeek/stopRun) keeps clearing the park: a cancelled chain never
// resumes, so the two halves stay orthogonal
export function freezeTyping() { typingFrozen = true; }
export function resumeTyping() {
  typingFrozen = false;
  const s = parkedStep; parkedStep = null;
  if (s) s();
}


// streaming text: constant cadence (fluent, never halting), cancellable by seek/reset.
// `charMs` is the BASE per-char cadence at 1x; the effective delay is recomputed
// EVERY step from the LIVE factor (presenter.setFactor), so a mid-stream speed
// change takes effect on the next character; jumping to instant (>=8) dumps the
// remainder immediately. Observed inter-char intervals are logged for probes.
export function streamText(el, text, opts = {}) {
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

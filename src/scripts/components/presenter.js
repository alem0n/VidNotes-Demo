// VidNotes presenter: event-driven serial chain, never pushes while busy.
// All pacing durations scale with `factor`; speed changes (setFactor) take
// effect on the NEXT scheduled step — including mid-stream text, mid-
// sequence evidence items, AND pauses that are already queued but unfired
// (gap / computing / settle / noev are reordered to the new rate through
// stack.js' rescaleLivePauses) — and every pacing transition is mirrored into
// the shared telemetry record (stack.js) for probes.
import { PACER, instantFactor, setPacerState, logPacerDelay, scalePause, clearPause, rescaleLivePauses, afterEntrance } from "./pacer.js";
import { streamText, cancelTyping, freezeTyping, resumeTyping } from "./stack-type.js";
import { sequenceEvidence } from "./stack-evidence.js";
import { pushStackCard, pruneStack, rebuildStack } from "./stack.js";
import { wireLightbox } from "./evidence.js";

export function makePresenter(stack, moments, opts = {}) {
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

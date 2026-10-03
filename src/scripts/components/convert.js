// VidNotes convert view: paste a link, replay a run's trajectory as a live demo.
import { runs, relMoments } from "../utils/state.js";
import { clockOf } from "../utils/utils.js";
import { makeStack } from "./stack.js";
import { cancelTyping } from "./stack-type.js";
import { makePresenter } from "./presenter.js";
import { wireLightbox } from "./evidence.js";
// iteration 70（多页拆分 I 期）：跨页导航原语与 fragment 构串——run 交付卡的三座
// 跨页桥（回放这次轨迹 → history 深链 / 查看讲义 → library 弹层深开 / 再转一次 →
// convert 表单页）替代 SPA 形态的 switchView 同页路径（66 的 heroExit 退场与
// 55 的 flyCapture→flyToPlayer 飞球随分页退役，见 Explore_70 §1.7 登记）
import { goPage } from "../utils/pages.js";
import { hashFragment } from "../utils/hash.js";
// iteration 64: 管道车间（组件群 II）—— convert 视图 runPanel 上方的机器动作
// 场景。渲染为回放状态的纯函数（零计时器），只在本模块的四个既有挂点调用。
import { revealPipeline, resetPipeline, updatePipeline, finishPipeline } from "./pipeline.js";

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
export function clearConvertFeedback() {
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
export function convertHandoff(url, mode, pace) {
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
export function startConvert(url, mode, pace) {
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

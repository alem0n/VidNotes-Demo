// VidNotes history replay player: run list, ribbon, transport, stack replay.
import { runs, relMoments } from "../utils/state.js";
import { clockOf, esc } from "../utils/utils.js";
import { makeStack, rebuildStack } from "./stack.js";
import { instantFactor } from "./pacer.js";
import { makePresenter } from "./presenter.js";
// iteration 40: URL 深链写点位（应用 → URL）。player 的打开是离散导航事件（push），
// 位置分量只走 replace（不污染历史栈）；语义见 nav.js / hash.js。
import { navWrite, hashFragment } from "../utils/hash.js";

export let player = null;

export function renderRunList() {
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
export function openPlayer(run, opts = {}) {
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

export function flyCapture(src) {
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

export function flyToPlayer(snap) {
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
export function updatePlayer(rel) {
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
export function hardSeek(rel) {
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
export function play() {
  if (!player) return;
  if (player.presenter.idx >= player.moments.length - 1 && !player.presenter.queue.length) {
    // restart from the top
    hardSeek(0);
  }
  player.presenter.play();
  setPlayBtn(true, "⏸ 暂停");
  announce("播放");
}
export function pause() {
  if (!player) return;
  player.presenter.pause();
  setPlayBtn(false, "▶ 播放");
  // iteration 40: 位置深链写点（暂停）：把断点位置浅写入 URL——刷新/分享后回到此处。
  // 离开视图的自动冻结（下方 viewswitch 监听）走 presenter.pause() 原语不经此函数，
  // 不产生重复写（写点只拒用户主动的离散暂停，与「每表面一个离散通道」口径一致）
  navWrite(hashFragment("history", player.run.id, player.rel), false);
  announce("暂停");
}
export function setFactor(s) {
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
export function wireScrub() {
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

// inject-run.1.js — 演示页（run.html?…&pace=brisk）契约 · 上：初始化 / 演示
// 本体 / 死控件守卫 / 暂停-续播 / 冻结-续播断点（iteration 71，多页拆分 II 期）。
//
// 承载旧契约的键族：
//   - rn*（演示运行本体：旧 tm*Demo*/stackCards/evidence/artsOk/clock 的页级读数）
//   - dk*（演示栈「无死控件」2 键，34 次家族逐字移植：旧片段的入口是表单提交，
//     本页是 URL 交接参数 → startConvert —— 同一启动原语，宿主从 #view-convert
//     换成本页 #runPanel）
//   - cp*（22 次暂停/续播：钮双态 + aria-pressed 同源 + 冻结精确性 + 续播
//     到达自己的 onEnd；74：#cvMsg 单条离散通告随 run 页元素退役）
//     **退役**：cpGuard* 五键（同文档重复提交守卫）——多页形态下「重复提交」
//     = 跨页导航（文档卸载销毁旧计时器链，boot-run 的等价论证）；栈上限 cap 20
//     由 rnCap 独立保留（单次 brisk 全程就是 134 时刻的满负载）
//   - fr*(T)/(E)（24 次冻结-续播的文本相位与证据相位两节，逐字移植）
const booted = await waitBoot("run");
await seedData();
installAtomObserver();
// 演示真正起步：pacer 的 demo 实例 + 播放中（pace=brisk ⇒ factor 6，74 中档 6×）
const live = await until(() => { const s = snap(); return s && s.paceName === "demo" && s.factor === 6 && s.phase !== "idle"; }, 3000, 20);
out.push("rnBoot=" + (booted && live));

// (1) 初始化读数（表单已跨页退场；本页是舞台）
const rPb = document.getElementById("btnPauseRun");
const rSt = () => document.getElementById("runStack");
out.push("rnInit=" + (!document.getElementById("runPanel").classList.contains("hidden") &&
  !rPb.classList.contains("hidden") && rPb.getAttribute("aria-pressed") === "true" &&
  rPb.textContent.includes("暂停")));
out.push("rnPanelOnly=" + (document.getElementById("convertForm") === null && // 无表单（跨页退场）
  document.getElementById("runList") === null));
// 75: rnSpeedGrp/rnTierPreset 随 #demoSpeeds 组退役——演示的档位唯由交接参数
// pace 决定（riBoot/rnBoot 的 factor 读数即预设档位的机器证明，无需组 UI）
out.push("rnView=" + (hidState("convert") === "ok")); // run 页视图归属 = convert
out.push("rnNoHashWrite=" + (location.hash === "")); // 交接参数走 search 不入 fragment 家族

// (2) 演示中段（文本相位 + 栈增长 + 步进器 + 管道车间相位对齐）
const txt = await until(() => { const s = snap(); return s.phase === "text" && s.chars >= 20; }, 6000, 30);
const sDemo = snap();
out.push("rnTxt=" + (txt && sDemo.chars < sDemo.textLen));
out.push("rnFactor=" + (sDemo.factor === 6));
out.push("rnCharMs=" + (sDemo.charMs === 8)); // 26/6 = 4.3 触 stack-type.js 的 8ms 字符地板（Math.max(8, charMs/f)）
const cards1 = () => document.querySelectorAll("#runStack .stack-card").length;
const cardsA = await until(() => cards1() >= 2, 6000, 30);
out.push("rnCards=" + (cardsA && cards1() >= 2));
// 步进器：6 阶段、恰好一个 active（与 onTick 同任务写的）
const steps = () => [...document.querySelectorAll("#stageStepper .stage-step")];
out.push("rnStepper=" + (steps().length === 6 &&
  steps().filter((s) => s.classList.contains("active")).length === 1 &&
  steps().filter((s) => s.classList.contains("done")).length >= 0));
// 管道车间相位 == 步进器 active 步（两条独立派生，同一 onTick 任务——64 次口径）
const psLive = () => {
  const ai = steps().findIndex((s) => s.classList.contains("active"));
  const lastDone = Math.max(-1, ...steps().map((s, i) => (s.classList.contains("done") ? i : -1)));
  const allDone = steps().every((s) => s.classList.contains("done"));
  return allDone ? "s5" : (ai >= 0 ? window.VidNotes.pipeline.phases[ai] : window.VidNotes.pipeline.phases[Math.min(steps().length - 1, lastDone + 1)]);
};
out.push("psLive=" + (window.VidNotes.pipeline && window.VidNotes.pipeline.state().phase === psLive()));
out.push("psSceneLit=" + (!document.getElementById("pipelineScene").classList.contains("hidden") &&
  document.getElementById("pipelineScene").getAttribute("role") === "group"));

// (3) dk* 演示栈无死控件（34 次家族：无 role / 不在 tab 序 / 无跳回承诺 /
//     激活全惰性；本片段先把演示冻结到可确定态）
await until(() => cards1() >= 3, 6000, 30);
rPb.click();
await sleep(80);
const dkC = [...document.querySelectorAll("#runStack .stack-card")];
out.push("dkNoAff=" + (dkC.length >= 2 && dkC.every((c) =>
  c.getAttribute("role") === null && c.tabIndex === -1 &&
  (c.getAttribute("aria-label") === null || !c.getAttribute("aria-label").startsWith("跳回")))));
const dkF = dkC[0];
const dkAct = document.activeElement, dkIdx = snap().idx, dkPh = snap().phase;
const dkK1 = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
const dkK2 = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
dkF.click();
dkF.dispatchEvent(dkK1);
dkF.dispatchEvent(dkK2);
await sleep(60);
out.push("dkInert=" + (document.activeElement === dkAct && snap().idx === dkIdx &&
  !dkK1.defaultPrevented && !dkK2.defaultPrevented));
rPb.click(); // 续播，进入下面的 cp*/fr* 段

// (4) cp* 暂停/续播（22 次家族；a11y 状态计数 AT 侧翻转）
let cpToFalse = 0, cpToTrue = 0, cpPrev = null;
const cpTick = setInterval(() => {
  const on = rPb.getAttribute("aria-pressed") === "true";
  if (cpPrev !== null && on !== cpPrev) { if (on) cpToTrue++; else cpToFalse++; }
  cpPrev = on;
}, 20);
cpPrev = rPb.getAttribute("aria-pressed") === "true";
const stIds = () => [...rSt().querySelectorAll(".stack-card")]
  .map((c) => c.dataset.rel + "\u0000" + (c.querySelector(".m-text")?.textContent || ""));
// 停在 GAP 窗（gap 在 streamText onDone 之后才排，pause() 落 phase idle 精确）
const cpGap = () => { const s = snap(); return s.idx >= 5 && s.phase === "gap"; };
const cpMid = await until(cpGap, 40000, 5);
const cpGapIdx = snap().idx;
out.push("cpAtGap=" + cpMid);
rPb.click();
out.push("cpPressed=" + (rPb.getAttribute("aria-pressed") === "false" && rPb.textContent.includes("继续")));
out.push("cpIdle=" + (snap().phase === "idle"));
const cpF = [];
for (let k = 0; k < 6; k++) {
  await sleep(300);
  const s = snap();
  cpF.push([s.idx, document.getElementById("runClock").textContent, cards1(), s.delays.length, s.phase]);
}
out.push("cpFreezeIdx=" + cpF.every((f) => f[0] === cpGapIdx && f[4] === "idle"));
out.push("cpFreezeClk=" + cpF.every((f, i) => i === 0 || f[1] === cpF[0][1]));
out.push("cpFreezeCards=" + cpF.every((f) => f[2] === cpF[0][2]));
out.push("cpFreezeDl=" + cpF.every((f) => f[3] === cpF[0][3]));
rPb.click(); // 续播：同一 presenter 实例从结点继续
out.push("cpResumed=" + (rPb.getAttribute("aria-pressed") === "true" && rPb.textContent.includes("暂停")));
out.push("cpResCard=" + (await until(() => { const s = snap(); return s.idx > cpGapIdx && s.phase === "card"; }, 4000, 10)));
out.push("cpResGap=" + (await until(() => { const s = snap(); return s.idx > cpGapIdx && s.phase === "gap"; }, 8000, 10)));
out.push("cpCvResetN=" + (cpToFalse + "r" + cpToTrue)); // 本段一次 to-false + 一次 to-true

// (5) fr*(T) 文本相位冻结-续播（24 次家族；brisk 下 10.4ms/char 逐字可采样）
const frTxt = await until(() => { const s = snap(); return s.phase === "text" && s.chars >= 8 && s.chars + 16 <= s.textLen; }, 6000, 10);
const frC0 = snap().chars, frI0 = snap().idx, frTl = snap().textLen;
out.push("frTxtSeen=" + (frTxt && frC0 >= 8 && frC0 + 16 <= frTl));
rPb.click();
out.push("frFrz=" + (snap().frozen === true && snap().chars === frC0 && snap().phase === "idle" &&
  rPb.getAttribute("aria-pressed") === "false"));
const frTF = [];
for (let k = 0; k < 5; k++) {
  await sleep(120);
  const s = snap();
  frTF.push(s.idx + "/" + s.chars + "/" + s.evShown + "/" + s.delays.length);
}
out.push("frTxtFreeze=" + frTF.every((x) => x === frTF[0] && x.startsWith(frI0 + "/" + frC0 + "/")));
rPb.click();
out.push("frTxtGo=" + (snap().frozen === false && rPb.getAttribute("aria-pressed") === "true"));
let frPrev = frC0, frSteps = 0, frTBad = "", frMin = frC0, frMax = frC0;
for (let k = 0; k < 8; k++) {
  await sleep(15); // 74：6× 下 8×15ms 窗口流过 ≈28 字 ≤ 60 界；倾泻 = textLen 量级仍被捕获
  const c = snap().chars;
  if (c < frPrev) frTBad += "reset" + k + " ";
  if (c > frPrev) frSteps++;
  frPrev = c;
  if (c < frMin) frMin = c;
  if (c > frMax) frMax = c;
}
out.push("frTxtContN=" + frC0 + ">" + frMin + ">" + frMax + "s" + frSteps + "b" + frTBad);
out.push("frTxtCont=" + (frTBad === "" && frSteps >= 2 && frPrev > frC0));
out.push("frTxtStep=" + (frPrev > frC0 && frPrev - frC0 <= 60 && snap().textLen === frTl)); // 74：6× 采样窗 8×15ms（≈28 字）；整段倾泻是 textLen 量级
const frTDone = await until(() => { const s = snap(); return s.idx === frI0 && (s.phase === "evidence" || s.phase === "gap"); }, 9000, 20);
out.push("frTxtCardDone=" + frTDone);

// (6) fr*(E) 证据相位冻结-续播：剩余条目按序填满（不跳不重）
const frEvOf = (card) => card ? card.querySelector(".sc-evidence") : null;
const frCard = () => document.querySelector("#runStack .stack-card.expanded");
const frInOf = (ev) => ev ? ev.querySelectorAll(".in").length : -1;
const frEvSeen = await until(() => {
  if (snap().phase !== "evidence") return false;
  const ev = frEvOf(frCard());
  return !!ev && frInOf(ev) >= 1 && ev.querySelectorAll(".pending-item").length >= 1;
}, 20000, 10);
const frEv0 = frEvOf(frCard()), frIn0 = frInOf(frEv0);
const frTotE = frIn0 + frEv0.querySelectorAll(".pending-item").length, frEIdx = snap().idx;
out.push("frEvSeenN=" + snap().evShown + "/" + frIn0 + "/" + frTotE);
out.push("frEvSeen=" + (frEvSeen && snap().evShown === frIn0));
rPb.click();
out.push("frEvFrz=" + (snap().frozen === true && snap().phase === "idle" && snap().idx === frEIdx));
const frEF = [];
for (let k = 0; k < 5; k++) {
  await sleep(120);
  const s = snap();
  frEF.push(s.idx + "/" + s.evShown + "/" + frInOf(frEv0) + "/" + s.delays.length);
}
out.push("frEvFreeze=" + frEF.every((x) => x === frEF[0] && x.startsWith(frEIdx + "/" + frIn0 + "/")));
rPb.click();
out.push("frEvGo=" + (snap().frozen === false));
const frEAll = await until(() => frInOf(frEv0) >= frTotE, 8000, 10);
out.push("frEvRemain=" + (frEAll && frInOf(frEv0) === frTotE));
const frEGap = await until(() => { const s = snap(); return s.idx === frEIdx && s.phase === "gap"; }, 8000, 10);
out.push("frEvGap=" + frEGap);
const frENext = await until(() => snap().idx === frEIdx + 1, 8000, 10);
out.push("frEvNext=" + frENext);
out.push("cpPauseN=" + (cpToFalse + "r" + cpToTrue));
clearInterval(cpTick);

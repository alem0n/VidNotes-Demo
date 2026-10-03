// inject-history.2.js — 历史轨迹页契约 · 下：冻结组合 / 时刻栈键盘 / 文档隐藏
// 冻结 / 深链寻址页内子集（iteration 71，多页拆分 II 期）。
//
// 承载旧契约的键族：
//   - fr*(S)/(H)（pause→换速→resume 与 pause→hardSeek 两个组合，逐字移植：
//     旧片段从 convert 视角的 btnReplayRun 进 player——本页直接是 history 宿主，
//     入口换成本页 .run-item 打开后的 #plPlay 运输钮，断言读点全同）
//   - rg* 的降速方向一场景（4x→1x 队列内等待的重定标——升速方向在 run 页的
//     dsRg* 承载，机制同一 rescaleLivePauses；家族其余场景梯退休，论证见
//     Explore_71 §3）
//   - sk*（时刻栈卡片键盘可达 + 焦点保持，第 33/37/44 次家族逐字移植：
//     37 次的滚静窗与 44 次的同任务内读点都保留）
//   - ph*（player 文档隐藏自动冻结，第 26 次家族：旧宿主是 viewswitch，70 次
//     I 期迁到 visibilitychange——本契约用合成 visibilitychange 复现「离开/
// 回返」语义：defineProperty 覆盖 document.hidden/visibilityState 后派发事件，
//     冻结原语/断点/钮状态/不自动续播/单条通告五个语义点逐字不变）
//   - uh* 的**页内子集**（openPlayer 单条 push / 后退-前进 / 地址栏编辑 /
//     位置深链 replace / 同目标无环）。跨页分量（#library 等会触发
//     location.replace 到他页的散列）迁移到 run-boot 的 invalid-on-history 标本
// 状态归一：确保「1x 播放中」的确定态（history.1 留下的是播放态；双保险处理
// 「暂停/已结束」两种残留——一次 click 都进入 play()）。注意两个片段是同一
// 模块作用域：ensurePlaying/ensurePaused 定义在 history.1 的 (5) 段，此处直接用
if (pbEl.textContent.includes("暂停")) { pbEl.click(); await sleep(120); }
speed(1).click(); // 遥测回 1x（下文的所有冻结/重定标场景都在已知速率下）
pbEl.click();     // ▶ 播放 或 ↺ 重播 ⇒ play()（已结束则从头重播）
await sleep(200);

// (1) fr*(S)：冻结 → 换速 → 续播（两机制各执同一等待的一半：门只停结点，
//     rescaleLivePauses 只重定向未触发的等待）
speed(4).click(); await sleep(60); // 等待型段落提速到 4x（语义不依赖速率）
const plEv = () => document.querySelector("#plStack .stack-card.expanded .sc-evidence");
const rsArr = (s) => s.rescales || [];
const rsPred = (r) => r.factor >= 8 ? 0 : Math.max(r.kind === "settle" ? 60 : 30, r.rem * r.from / r.factor); // 82 期：settle 的常量下限 60（stack-evidence.js:127）
const dlLast = () => { const a = snap().delays; return a[a.length - 1]; };
speed(4).click(); await sleep(60); // 等待型段落提速到 4x（语义不依赖速率）
const frSEen = await until(() => {
  if (snap().phase !== "evidence") return false;
  const ev = plEv();
  return !!ev && ev.querySelectorAll(".in").length >= 1 && ev.querySelectorAll(".pending-item").length >= 1;
}, 30000, 10);
const frSIdx = snap().idx;
out.push("frPSSeen=" + (frSEen && snap().frozen === false));
pbEl.click(); // 冻结
out.push("frPSFrz=" + (snap().frozen === true && snap().idx === frSIdx &&
  pbEl.getAttribute("aria-pressed") === "false"));
const frSN0 = rsArr(snap()).length;
speed(4).click(); // 冻结中改率：未触发的等待被重定标
const frSRs = rsArr(snap()).slice(frSN0);
out.push("frPSStill=" + (snap().frozen === true && snap().idx === frSIdx &&
  snap().evShown === plEv().querySelectorAll(".in").length));
out.push("frPSRsOK=" + frSRs.every((r) => Math.abs(rsPred(r) - r.ms) <= 1.5));
out.push("frPSRsN=" + frSRs.length);
pbEl.click(); // 续播：被重定标的等待随后续
out.push("frPSGo=" + (snap().frozen === false && pbEl.getAttribute("aria-pressed") === "true"));
const frPSDone = await until(() => snap().idx > frSIdx, 8000, 10);
out.push("frPSCont=" + frPSDone);

// (2) rg* 降速方向：4x 队列内的等待切 1x ⇒ 等待变长（与 run 页 dsRg* 的升速
//     方向互补；不变式 self-consistency 全表同口径）
speed(4).click();
await until(() => snap().factor === 4, 2000, 5);
const dlB = dlLast();
const compSeen = await until(() => { const d = dlLast(); return d && d !== dlB && d.kind === "computing" && snap().phase === "evidence"; }, 6000, 5);
const cA = compSeen ? dlLast() : null;
out.push("rgCompSeen=" + (compSeen && !!cA && cA.kind === "computing" && cA.factor === 4));
speed(1).click();
const rCRec = (function () { const a = rsArr(snap()); return a.length ? a[a.length - 1] : null; })();
const compFired = await until(() => { const d = dlLast(); return !!d && d.kind !== "computing"; }, 4000, 5);
out.push("rgCompF=" + (!!(rCRec && rCRec.kind === "computing" && rCRec.from === 4 && rCRec.factor === 1)));
out.push("rgCompExtend=" + (!!(rCRec && rCRec.ms > rCRec.rem))); // 降速 ⇒ 等待变长
out.push("rgCompProp=" + (!!(rCRec && Math.abs(rsPred(rCRec) - rCRec.ms) <= 1.5)));
out.push("rgCompN=" + (cA ? cA.ms.toFixed(1) : "-") + "/" + (rCRec ? rCRec.rem.toFixed(1) : "-") + "/" + (rCRec ? rCRec.ms.toFixed(1) : "-"));
const rsAll = rsArr(snap());
const rsSelfBad = rsAll.filter((r) => !["gap", "noev", "settle", "computing", "first", "title", "img", "head", "row", "pair", "line", "chip", "text", "final"].includes(r.kind) ||
  (r.from >= 8) || Math.abs(rsPred(r) - r.ms) > 1.5);
out.push("rgSelf=" + (rsSelfBad.length === 0));
out.push("rgSelfN=" + rsAll.length + "b" + rsSelfBad.length);
out.push("rgSelfBad=" + (rsSelfBad.length ? rsSelfBad.slice(0, 4).map((r) => r.kind + ":" + r.ms.toFixed(1)).join(" ") : "none"));
const evLive = await until(() => { const ev = plEv(); return !!ev && ev.querySelectorAll(".in").length >= 1; }, 4000, 20);
out.push("rgCompEvs=" + evLive);

// (3) fr*(H)：冻结 → hardSeek ⇒ 冻链必须死、不复活（续播从落点开始，无同
//     时刻重复卡）。需要再等一个证据相位
const frHSeen = await until(() => {
  if (snap().phase !== "evidence") return false;
  const ev = plEv();
  return !!ev && ev.querySelectorAll(".in").length >= 1 && ev.querySelectorAll(".pending-item").length >= 1;
}, 20000, 10);
const frHIdx = snap().idx;
out.push("frHSeen=" + !!frHSeen);
pbEl.click();
out.push("frHFrz=" + (snap().frozen === true && snap().idx === frHIdx));
slEl.focus();
keyOn(slEl, "Home"); // 离散 seek：pause + cancelTyping + invalidate
await sleep(150);
const frHJump = snap().idx;
out.push("frHSeek=" + (frHJump < frHIdx && snap().frozen === false));
pbEl.click(); // 从落点续播
out.push("frHGo=" + (snap().frozen === false && pbEl.getAttribute("aria-pressed") === "true"));
let frHDup = 0;
for (let k = 0; k < 10; k++) {
  await sleep(200);
  const ids = [...document.querySelectorAll("#plStack .stack-card")]
    .map((c) => c.dataset.rel + "\u0000" + (c.querySelector(".m-text")?.textContent || ""));
  frHDup = Math.max(frHDup, ids.filter((x, i) => ids.indexOf(x) !== i).length);
}
out.push("frHNoDup=" + (frHDup === 0));
out.push("frHNoDupN=" + frHDup);
const frHAdv = await until(() => snap().idx > frHJump, 8000, 10);
out.push("frHCont=" + frHAdv);
// 停在冻结（给后续段落一个可确定状态）
pbEl.click();
out.push("frPark=" + (snap().frozen === true));

// (4) sk* 时刻栈键盘可达 + 焦点保持（33/37/44 次家族逐字移植）
const skCards = () => [...document.querySelectorAll("#plStack .stack-card")];
const skReady = await ensurePaused(3); // 暂停态 + ≥3 卡：可确定的栈（无活体入栈）
const skScrub = document.getElementById("plScrub");
const skClock = (r) => String(Math.floor(r / 60000)).padStart(2, "0") + ":" + String(Math.floor(r % 60000 / 1000)).padStart(2, "0");
skScrub.focus();
skScrub.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", bubbles: true, cancelable: true }));
await sleep(200);
const skC = skCards();
out.push("skNoSteal=" + (document.activeElement === skScrub && skC.length >= 2));
out.push("skAff=" + (skReady && skC.length >= 2 &&
  skC[0].classList.contains("expanded") && skC[0].tabIndex === -1 && skC[0].getAttribute("role") === null &&
  skC.slice(1).every((c) => c.classList.contains("collapsed") && c.tabIndex === 0 &&
    c.getAttribute("role") === "button" && c.getAttribute("aria-label"))));
const skT = skC[1];
const skLbl = skT?.getAttribute("aria-label") || null;
out.push("skLabel=" + (skLbl != null && skLbl.startsWith("跳回 ") &&
  skLbl.includes(skClock(+skT.dataset.rel)) &&
  skLbl.includes(skT.querySelector(".m-tag").textContent) &&
  skLbl.includes(skT.querySelector(".m-text").textContent.slice(0, 24))));
const skCommit = (c) =>
  document.activeElement.classList.contains("stack-card") &&
  document.activeElement.dataset.rel === c.dataset.rel &&
  document.activeElement.classList.contains("expanded");
const skClicked = document.querySelector("#plStack .stack-card.collapsed");
skClicked.click();
await sleep(200);
out.push("skClick=" + (skReady && skCommit(skClicked)));
// 37 次的滚静窗 + 44 次的同任务内读点（Space 的滚动残量在读点自身任务内比对）
document.getElementById("player").scrollIntoView({ behavior: "instant", block: "start" });
const skSmooth = document.documentElement.style.scrollBehavior;
document.documentElement.style.scrollBehavior = "auto";
const skE = document.querySelector("#plStack .stack-card.collapsed");
skE.focus();
const skEv = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
skE.dispatchEvent(skEv);
await sleep(200);
out.push("skEnter=" + (skEv.defaultPrevented && skCommit(skE)));
const skS = document.querySelector("#plStack .stack-card.collapsed");
skS.focus();
let skSy = window.scrollY;
for (let skQ = 0; skQ < 10; skQ++) { const skY = window.scrollY; await sleep(40); if (window.scrollY === skY) break; skSy = window.scrollY; }
const skSx = window.scrollX;
const skSv = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
skS.dispatchEvent(skSv);
const skSy2 = window.scrollY, skSx2 = window.scrollX;
await sleep(200);
out.push("skSpace=" + (skSv.defaultPrevented && skSy2 === skSy && skSx2 === skSx && skCommit(skS)));
document.documentElement.style.scrollBehavior = skSmooth;

// (5) ph* 文档隐藏自动冻结（26 次家族；宿主从 viewswitch 迁到 visibilitychange）
await ensurePlaying();
const phFreeze = () => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
};
const phBack = () => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
};
const phRun = await until(() => { const s = snap(); return s.phase === "text" && s.chars >= 20 && s.chars + 48 <= s.textLen; }, 6000, 30);
out.push("phOpen=" + (phRun && !document.getElementById("player").classList.contains("hidden") &&
  pbEl.getAttribute("aria-pressed") === "true" && pbEl.textContent.includes("暂停")));
const phI0 = snap().idx;
phFreeze(); // 「离开」：文档不可见 ⇒ 冻结
await sleep(150);
out.push("phFrz=" + (snap().frozen === true && snap().phase === "idle" && snap().idx === phI0 &&
  pbEl.getAttribute("aria-pressed") === "false" && pbEl.textContent.includes("播放")));
const phF = [];
for (let k = 0; k < 4; k++) { await sleep(250); const s = snap(); phF.push(s.idx + "/" + s.chars + "/" + s.evShown + "/" + s.delays.length); }
out.push("phFrzHold=" + phF.every((x) => x === phF[0]));
const phPI = snap().idx, phPC = snap().chars;
phBack(); // 「回返」：不自动续播 + 一条重通告
await sleep(200);
out.push("phStay=" + (snap().frozen === true && snap().phase === "idle" &&
  snap().idx === phPI && snap().chars === phPC && pbEl.getAttribute("aria-pressed") === "false"));
out.push("phBackAnn=" + (document.getElementById("plLive").textContent.includes("暂停")));
pbEl.click(); // 用户用同一控制释放断点
out.push("phGo=" + (snap().frozen === false && pbEl.getAttribute("aria-pressed") === "true"));
let phPrev = phPC, phSteps = 0, phBad = "", phMin = phPC, phMax = phPC;
for (let k = 0; k < 8; k++) {
  await sleep(45);
  const c = snap().chars;
  if (c < phPrev) phBad += "reset" + k + " ";
  if (c > phPrev) phSteps++;
  phPrev = c;
  if (c < phMin) phMin = c;
  if (c > phMax) phMax = c;
}
out.push("phContN=" + phPC + ">" + phMin + ">" + phMax + "s" + phSteps + "b" + phBad);
out.push("phCont=" + (phBad === "" && phSteps >= 2 && phPrev > phPC));
// (2) 用户自己的暂停在往返中逐字节存活
pbEl.click();
await sleep(120);
out.push("phManFrz=" + (snap().frozen === true && snap().phase === "idle" &&
  pbEl.getAttribute("aria-pressed") === "false"));
const phMI = snap().idx, phMC = snap().chars;
phFreeze(); await sleep(250);
out.push("phManAway=" + (snap().frozen === true && snap().phase === "idle" &&
  snap().idx === phMI && snap().chars === phMC && pbEl.getAttribute("aria-pressed") === "false"));
phBack(); await sleep(250);
out.push("phManBack=" + (snap().frozen === true && snap().idx === phMI && snap().chars === phMC &&
  pbEl.getAttribute("aria-pressed") === "false" && document.getElementById("plLive").textContent.includes("暂停")));
pbEl.click();
out.push("phManGo=" + (snap().frozen === false && pbEl.getAttribute("aria-pressed") === "true"));
// (3) 已结束的回放：往返既不重播也不通告（尾段跑完）
if (pbEl.textContent.includes("暂停")) pbEl.click();
speed(16).click();
pbEl.click();
const phDone = await until(() => { const s = snap(); return s.phase === "done" && pbEl.textContent.includes("重播"); }, 6000, 25);
out.push("phEnd=" + (phDone && pbEl.getAttribute("aria-pressed") === "false"));
const phCards = document.querySelectorAll("#plStack .stack-card").length, phDl = snap().delays.length;
phFreeze(); await sleep(300);
phBack(); await sleep(300);
out.push("phEndNoReplay=" + (snap().phase === "done" && snap().delays.length === phDl &&
  pbEl.textContent.includes("重播") && pbEl.getAttribute("aria-pressed") === "false" &&
  document.querySelectorAll("#plStack .stack-card").length === phCards));

// (6) uh* 深链寻址的页内子集（40 次家族；跨页分量迁到 run-boot 标本）
const uhPlay = pbEl;
if (uhPlay.textContent.includes("暂停")) uhPlay.click(); // 冻结到可确定态（pause 写 replace）
await sleep(300);
const uhScrub = document.getElementById("plScrub");
const uhRelBefore = uhScrub.getAttribute("aria-valuenow");
const uhHashBefore = location.hash;
// (a) app→URL：run-item 再开 = **一条**离散 push（openPlayer 带 rel=0 分量）
const uhLenA = history.length;
document.querySelector("#runList .run-item").click();
await sleep(200);
out.push("uhNav=" + (location.hash === "#history/run-20261003/@0" &&
  !document.getElementById("player").classList.contains("hidden") &&
  history.length - uhLenA === 1));
// (b) 浏览器后退：回到 h1 ⇒ 经唯一 reconciler 把 player 落回 rel1（不重开）
history.go(-1);
await until(() => location.hash === uhHashBefore, 3000, 50);
await sleep(300);
out.push("uhBack=" + (location.hash === uhHashBefore &&
  !document.getElementById("player").classList.contains("hidden") &&
  uhScrub.getAttribute("aria-valuenow") === uhRelBefore));
// (c) 前进：双向同步（URL→app 仍是同一条路径，落回 @0）
history.forward();
await until(() => location.hash === "#history/run-20261003/@0", 3000, 50);
await sleep(300);
out.push("uhFwd=" + (location.hash === "#history/run-20261003/@0" &&
  !document.getElementById("player").classList.contains("hidden") &&
  uhScrub.getAttribute("aria-valuenow") === "0"));
// (d) 地址栏编辑 → 纯视图地址（无 run 分量）：player 不动（无关闭/重开语义）
location.hash = "#history";
await until(() => location.hash === "#history", 3000, 50);
await sleep(300);
out.push("uhEdit=" + (location.hash === "#history" &&
  !document.getElementById("player").classList.contains("hidden") &&
  uhScrub.getAttribute("aria-valuenow") === "0"));
// (e) 位置深链：地址栏的 @rel 经同一 reconciler 落到 hardSeek；散列保持所输入串
location.hash = "#history/run-20261003/@600000";
await until(() => location.hash === "#history/run-20261003/@600000", 3000, 50);
await sleep(300);
out.push("uhDeep=" + (location.hash === "#history/run-20261003/@600000" &&
  !document.getElementById("player").classList.contains("hidden") &&
  uhScrub.getAttribute("aria-valuenow") === "261074")); // idxOfRel(600000) 量化落点（第 82 次重锚：220 时刻新网格）
// (f) 离散 seek 以 REPLACE 提交位置：历史栈不增长
const uhLen3 = history.length;
uhScrub.focus();
const uhK = new KeyboardEvent("keydown", { key: "PageDown", bubbles: true, cancelable: true });
uhScrub.dispatchEvent(uhK);
await until(() => location.hash !== "#history/run-20261003/@600000", 3000, 50);
const uhRelAfter = uhScrub.getAttribute("aria-valuenow");
out.push("uhPos=" + (uhK.defaultPrevented &&
  /^#history\/run-20261003\/@\d+$/.test(location.hash) &&
  location.hash === "#history/run-20261003/@" + uhRelAfter &&
  history.length === uhLen3));
// (g) 同目标散列再应用 = 无环：幂等零操作（仅条目自身 +1）
const uhLen4 = history.length;
location.hash = "#history/run-20261003";
await until(() => location.hash === "#history/run-20261003", 3000, 50);
await sleep(300);
out.push("uhNoLoop=" + (!document.getElementById("player").classList.contains("hidden") &&
  uhScrub.getAttribute("aria-valuenow") === uhRelAfter &&
  history.length - uhLen4 === 1));

// (7) ct* 本页子表（回放器/栈/player 三栏）
emitContrast({
  ink3: [".brand-text em", ".pill", ".footer p", ".player-sub", "#plSpeeds button:not(.active)", ".clock", ".stack-hint"],
  ink2: [".nav-item", ".count", ".sec-chip", ".kv-pair span", ".sc-head", ".pdoc-quality h4"],
  ink: [".view-title h2", ".player-title", ".run-item .ri-name"],
  accent: [".run-clock", ".nav-item.active", ".stage-step.active .s-name"],
  red: [".m-recovery .m-tag"],
  white: [".btn-primary", ".logo", "#plSpeeds button.active"],
});

dumpProbe("history");
finish();

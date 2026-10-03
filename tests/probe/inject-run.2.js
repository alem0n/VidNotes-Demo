// inject-run.2.js — 演示页契约 · 下：运行时调速组 / 文档隐藏冻结 / 终态 /
// 管道车间 / 原子落盘（iteration 71，多页拆分 II 期）。
//
// 承载旧契约的键族：
//   - ds*（28 次运行时调速组：role=group + aria-current 单选 + 遥测随动 +
//     队列内等待的重定标 + 终态隐藏。**退役**：dsReset 的「同文档再提交换预设」
//     ——多页形态的 per-run 复位 = 新页面加载，由 inject-run-instant 变体
//     （pace=instant 的初始档位读数）与 run-boot 的 run-handoff 标本共同等价
//     覆盖；dsAnnOne/dsAnnN（变速单条通告，74）随 run 页 #cvMsg 退役——调速
//     的可见反馈 = 组自身单选态，无独立通告文本线）
//   - ah*（25 次文档隐藏自动冻结，宿主从 viewswitch 迁到 visibilitychange：
//     合成事件复现离开/回返，五个语义点逐字不变）
//   - fin*（终态：交付卡 + 三座跨页桥接线 + 钮退场；74：art-rows 交付物自检
//     随 artifacts-check 退役，finArts 键随宿主删除）
//   - ps*（64 次管道车间 16 键，**逐字移植**：本页就是旧片段点回 convert 后
//     的宿主；唯一差异是入口无导航点击、hidState 页化）
// 注意：rPb 定义在 inject-run.1.js（同一模块作用域），此处直接引用（74 起
// rCv/cvMsg 已不在 run 页 DOM 中——所有通告类断言随元素退役）

// (1) ds* 调速组 —— 75 期整体退役（#demoSpeeds 删除：演示完全按提交时所选节奏）
//     原键族（dsTelem / dsRgSeen / dsRgF / dsRgProp / dsRgShrink / dsRgCont /
//     dsRgN / dsEnd）：演示实例的运行时变速 UI 不存在 ⇒ 其重定标路径不可达。
//     presenter.setFactor + rescaleLivePauses 机制逐字保留，由 history 页
//     rgComp*（player 五档 #plSpeeds）承载同一机器面（75 期合并键表时的
//     等价性裁决）。

// (2) ah* 文档隐藏自动冻结（合成 visibilitychange：离开/回返）
const ahFreeze = () => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
};
const ahBack = () => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
};
const ahRun = await until(() => { const s = snap(); return s.phase === "text" && s.chars >= 20 && s.chars + 48 <= s.textLen; }, 3000, 30);
out.push("ahRun=" + (ahRun && !rPb.classList.contains("hidden") && rPb.getAttribute("aria-pressed") === "true"));
const ahI0 = snap().idx;
ahFreeze(); // 离开
await sleep(150);
out.push("ahFrz=" + (snap().frozen === true && snap().phase === "idle" && snap().idx >= ahI0 &&
  rPb.getAttribute("aria-pressed") === "false" && rPb.textContent.includes("继续")));
const ahF = [];
for (let k = 0; k < 4; k++) { await sleep(250); const s = snap(); ahF.push(s.idx + "/" + s.chars + "/" + s.evShown + "/" + s.delays.length); }
out.push("ahFrzHold=" + ahF.every((x) => x === ahF[0]));
const ahPI = snap().idx, ahPC = snap().chars;
ahBack(); // 回返：不自动续播
await sleep(200);
out.push("ahStay=" + (snap().frozen === true && snap().phase === "idle" &&
  snap().idx === ahPI && snap().chars === ahPC && rPb.getAttribute("aria-pressed") === "false"));
rPb.click();
out.push("ahGo=" + (snap().frozen === false && rPb.getAttribute("aria-pressed") === "true"));
let ahPrev = ahPC, ahSteps = 0, ahBad = "", ahMin = ahPC, ahMax = ahPC;
for (let k = 0; k < 8; k++) {
  await sleep(45);
  const c = snap().chars;
  if (c < ahPrev) ahBad += "reset" + k + " ";
  if (c > ahPrev) ahSteps++;
  ahPrev = c;
  if (c < ahMin) ahMin = c;
  if (c > ahMax) ahMax = c;
}
out.push("ahContN=" + ahPC + ">" + ahMin + ">" + ahMax + "s" + ahSteps + "b" + ahBad);
out.push("ahCont=" + (ahBad === "" && ahSteps >= 2 && ahPrev > ahPC));
// 用户自己的暂停在往返中逐字节存活
rPb.click();
await sleep(120);
out.push("ahManFrz=" + (snap().frozen === true && snap().phase === "idle" && rPb.getAttribute("aria-pressed") === "false"));
const ahMI = snap().idx, ahMC = snap().chars;
ahFreeze(); await sleep(250);
out.push("ahManAway=" + (snap().frozen === true && snap().phase === "idle" &&
  snap().idx === ahMI && snap().chars === ahMC && rPb.getAttribute("aria-pressed") === "false"));
ahBack(); await sleep(250);
out.push("ahManBack=" + (snap().frozen === true && snap().idx === ahMI && snap().chars === ahMC &&
  rPb.getAttribute("aria-pressed") === "false"));

rPb.click();
out.push("ahManGo=" + (snap().frozen === false && rPb.getAttribute("aria-pressed") === "true"));

// (3) 自然收尾（75: 不再有变速点击——brisk 预设一路到 done）
const r28Done = await until(() => { const s = snap(); return s.phase === "done" && !document.getElementById("runFoot").classList.contains("hidden"); }, 12000, 100);

// (4) fin* 终态（交付卡 + 三座跨页桥）
out.push("finDone=" + r28Done);
out.push("finClock=" + (document.getElementById("runClock").textContent === clockOfM(T_MS)));
out.push("finFoot=" + (!document.getElementById("runFoot").classList.contains("hidden")));
out.push("finBtnHid=" + document.getElementById("btnPauseRun").classList.contains("hidden"));
out.push("finCap=" + (document.querySelectorAll("#runStack .stack-card").length <= 20)); // 69 次栈上限 cap 20
// 交付卡三桥（75: 第一桥 = 声明式下载锚点，接线语义改为属性断言；后两桥 onclick 不变）
const btnD = document.getElementById("btnDownloadDoc");
const btnR = document.getElementById("btnReplayRun");
const btnC = document.getElementById("btnConvertAgain");
out.push("finBridgeWire=" + (btnD.tagName === "A" && (btnD.getAttribute("download") || "").length > 0 &&
  btnD.getAttribute("href").endsWith("notes.pdf") && typeof btnR.onclick === "function" && typeof btnC.onclick === "function"));
out.push("finBridgeNames=" + (btnD.textContent.includes("下载笔记") && btnR.textContent.includes("回放这次轨迹") && btnC.textContent.includes("再转一次")));
// 栈上限满负载读数（220 时刻的 brisk 全程）
out.push("finStackN=" + document.querySelectorAll("#runStack .stack-card").length);

// (5) ps* 管道车间（64 次家族 16 键，逐字移植；宿主 = 本页 runPanel）
const psHost = document.getElementById("pipelineScene");
out.push("psStruct=" + (!!psHost &&
  psHost.classList.contains("pipeline-scene") &&
  !psHost.classList.contains("hidden") &&
  psHost.getAttribute("role") === "group" &&
  (psHost.getAttribute("aria-label") || "").length > 4 &&
  document.getElementById("pipeRail") === null &&
  document.querySelector(".run-side") === null &&
  document.getElementById("runMetrics") === null &&
  document.querySelector(".metric-grid") === null &&
  document.querySelector(".pipe-recovery") === null &&
  document.getElementById("pipeRecovery") === null &&
  document.getElementById("prTag") === null &&
  document.getElementById("prText") === null &&
  document.querySelector(".ph-label") === null &&
  document.querySelector(".pipe-s2-side") !== null && // 74：probe+scores 竖排容器
  document.querySelectorAll(".pipe-s2-side > .pipe-card").length === 2 &&
  document.querySelector(".pipe-s2-side > .pipe-card.pipe-probe") !== null &&
  document.querySelector(".pipe-s2-side > .pipe-card.pipe-scores") !== null &&
  document.querySelector(".pipe-s2 > .pipe-card.pipe-cuts") !== null &&
  document.querySelector(".verify-scan .verify-sheet")?.tagName === "IMG" && // 76：s3 原片对照
  document.querySelector(".verify-scan .verify-sheet")?.getAttribute("src") === "assets/contact.jpg" &&
  document.querySelector(".verify-scan .verify-window")?.id === "verifyWindow" &&
  document.querySelectorAll(".claim-list .cl-mark").length === 27 && // 76：核验标记（82 期：27 条声称）
  document.querySelector(".archive-artifact img")?.getAttribute("src") === "assets/pages/page-01.jpg" && // 76：s5 归档交付物
  document.querySelectorAll(".pdf-p img").length === 33 && // 76：s4 页面图（82 期：33 页）
  hidState("convert") === "ok"));
const psSteps = [...document.querySelectorAll("#stageStepper .stage-step")];
const psAi = psSteps.findIndex((s) => s.classList.contains("active"));
const psLastDone = Math.max(-1, ...psSteps.map((s, i) => (s.classList.contains("done") ? i : -1)));
const psAllDone = psSteps.every((s) => s.classList.contains("done"));
const psExpect = psAllDone
  ? "s5"
  : (psAi >= 0 ? window.VidNotes.pipeline.phases[psAi] : window.VidNotes.pipeline.phases[Math.min(psSteps.length - 1, psLastDone + 1)]);
out.push("psFinal=" + (window.VidNotes.pipeline.state().phase === "s5" && psExpect === "s5")); // 演示自然结束 = 终态
let psPhaseOk = true;
for (const k of window.VidNotes.pipeline.phases) {
  window.VidNotes.pipeline.drive(k, 0.5);
  await sleep(40);
  const vis = [...document.querySelectorAll("#pipeBody .pipe-phase")].filter((s) => !s.hidden);
  psPhaseOk = psPhaseOk && vis.length === 1 && vis[0].dataset.phase === k;
}
out.push("psPhases=" + psPhaseOk);
window.VidNotes.pipeline.drive("s2", 0.5);
await sleep(50);
const psBadge = document.getElementById("probeBadge").textContent;
// 82/83 期重锚：psT = 探头目标秒 = 15×帧号；psTn = 帧名，右格 = 该帧裁出的成图
const psT = +(psBadge.match(/t = (\d+) s/) || [])[1];
const psTn = "f_" + String(psT / 15).padStart(3, "0");
out.push("psCutGrid=" + (document.querySelectorAll("#pipeCuts .cut-cell.on").length === 10 &&
  document.querySelectorAll("#pipeCuts .cut-cell").length === 20 &&
  document.querySelectorAll("#pipeCuts .cut-cell img").length === 20 &&
  document.querySelectorAll("#pipeCuts .cut-cell.is-dup").length === 0 &&
  psT > 0 && psT % 15 === 0 &&
  // 83 期：探头 = 帧-图对照——左格帧图 / 右格成图 / caption = f_NNN → fig_XX
  document.getElementById("probeFrame").src.includes(psTn) &&
  document.getElementById("probeFrame").alt.includes(psTn) &&
  document.getElementById("probeImg").src.includes("assets/figures/") &&
  document.getElementById("probeCap").textContent.includes(psTn + " → ")));
const psFr = document.getElementById("probeFrame");
// 83 期：80 期双通道退休——video 元素已删除（无播放功能，见 pipeline-cuts.js 头注释）
out.push("psProbe=" + (document.querySelectorAll("#pipelineScene video").length === 0 &&
  psFr?.tagName === "IMG" &&
  psFr.closest(".probe-source")?.querySelector(":scope > #probeFrame") === psFr &&
  psFr.src.includes("assets/frames/")));
// 81/82：逐帧判别扫描——drive('s2', 0.5) ⇒ judged = 90：90 刻度亮、扫描窗落中段、
// 两判定行已落定（f_002=2、f_062=62 ≤ 89；f_150=150 未到）、判别未收尾不预对齐
const psJt = document.querySelectorAll("#judgeStrip .jt");
const psScan = document.getElementById("judgeScan");
out.push("psJudge=" + (psJt.length === 179 &&
  [...psJt].filter((t) => t.classList.contains("on")).length === 89 &&
  document.getElementById("scoreBadge").textContent === "已判 89 / 179 帧" &&
  parseFloat(psScan.style.left) > 45 && parseFloat(psScan.style.left) < 55 &&
  document.querySelectorAll(".score-row.is-keep.on").length === 2 &&
  document.querySelector(".score-row.is-reject") === null && // 82 期：纯幻灯片演讲无被除帧
  document.getElementById("pipeTri").classList.contains("aligned") === false));
// 84：帧过滤标签流——扫描条正下方逐个落 f_NNN 标签（窗口 = 最近 10 个 +
// 头部「…」表示还有很多；总数计数随徽章单调不减）；judged=89 ⇒ f_080…f_089
// 窗口内无入选帧（PICK_SET 全在 f_062+，后续 psJudgeTagsF 验入选转绿）
const psTags = [...document.querySelectorAll("#judgeTags .jt-tag")];
out.push("psJudgeTags=" + (psTags.length === 10 &&
  psTags[0].textContent === "f_080" && psTags[9].textContent === "f_089" &&
  psTags.every((t) => !t.classList.contains("is-pick")) &&
  document.querySelectorAll("#judgeTags .jt-more").length === 1 &&
  document.getElementById("judgeTags").children.length === 11));
const psUnlit = [...document.querySelectorAll("#pipeCuts .cut-cell:not(.on)")];
const psLitCells = [...document.querySelectorAll("#pipeCuts .cut-cell.on")];
out.push("psGrowA=" + (psUnlit.length === 10 &&
  psUnlit.every((c) => getComputedStyle(c).display === "none" && c.offsetHeight === 0) &&
  psLitCells.length === 10 &&
  psLitCells.every((c) => getComputedStyle(c).display !== "none" && c.offsetHeight > 0)));
const psCutH1 = Math.round(document.querySelector("#pipeCuts").getBoundingClientRect().height);
window.VidNotes.pipeline.drive("s2", 1);
await sleep(60);
const psCutH2 = Math.round(document.querySelector("#pipeCuts").getBoundingClientRect().height);
out.push("psGrowMon=" + (psCutH1 > 0 && psCutH2 > psCutH1));
// 84：标签流满刻——judged=179 ⇒ 窗口 f_170…f_179，f_172 为唯一入选（绿签）
// 85：判定行滚动窗——满刻 3 满删最旧（f_002 退场）⇒ 终态 [f_150, f_062]（prepend 序）
const psTagsF = [...document.querySelectorAll("#judgeTags .jt-tag")];
const psRowsF = [...document.querySelectorAll("#pipeScores .score-row")];
out.push("psJudgeTagsF=" + (psTagsF.length === 10 &&
  psTagsF[0].textContent === "f_170" && psTagsF[9].textContent === "f_179" &&
  psTagsF.filter((t) => t.classList.contains("is-pick")).length === 1 &&
  document.querySelector("#judgeTags .jt-tag.is-pick").textContent === "f_172" &&
  document.querySelectorAll("#judgeTags .jt-more").length === 1 &&
  psRowsF.length === 2 && psRowsF[0].dataset.frame === "f_150" && psRowsF[1].dataset.frame === "f_062" &&
  psRowsF.every((r) => r.classList.contains("is-keep") && r.classList.contains("on")) &&
  document.querySelector('#pipeScores .score-row[data-frame="f_002"]') === null));
const psMom = (RN && RN.moments) || [];
const psRel = (m) => Date.parse(m.t) - Date.parse(RN.startedAt);
out.push("psRec11=" + (!!RN && psMom.some((m) => m.kind === "recovery" && psRel(m) === 10298)));
out.push("psRec155=" + (!!RN && psMom.some((m) => m.kind === "recovery" && psRel(m) === 1511821)));
window.VidNotes.pipeline.drive("s2", 0.3); // 82 期：CUT_NOTE_AT=1 —— 首个源帧落格即揭 bands 覆写注记
await sleep(40);
out.push("psOverwrite=" + (document.getElementById("pipeOverwrite").hidden === false &&
  document.getElementById("pipeOverwrite").textContent.includes("bands.json") &&
  document.getElementById("pipeOverwrite").textContent.includes("覆写")));
window.VidNotes.pipeline.drive("s3", 1);
await sleep(50);
const psCl = [...document.querySelectorAll("#pipeClaims li")];
out.push("psClaims=" + (psCl.length === 27 &&
  psCl.every((li) => /⊕\d{1,2}:\d{2}/.test(li.querySelector(".cl-time").textContent)) &&
  psCl[0].querySelector(".cl-text").textContent.includes("100% of your work") &&
  document.getElementById("claimBadge").textContent.includes("27 / 27")));
window.VidNotes.pipeline.drive("s4", 1);
await sleep(50);
out.push("psPdf=" + (document.getElementById("pipeCjk").textContent === "7779" &&
  document.querySelectorAll("#pipePdfStrip .pdf-p.arrived").length === 33 &&
  document.querySelectorAll("#pipePdfStrip .pdf-p.arrived img[src$=\'jpg\']").length === 33 && // 76：每页到位即写页面图 src（82 期：33 页）
  [...document.querySelectorAll("#pipePdfStrip .pdf-p img")].every((im) => (im.getAttribute("alt") || "").includes("页")) &&
  document.getElementById("pdfBadge").textContent.includes("33 / 33")));
// 84：流式列表（运营方指令 ①②④⑤）——条目随相位进度逐个到场（不再先全显再逐个
// 点亮）；满刻计数 + 全 .on + 徽章；中段计数区间（0.5×5 浮点 ⇒ 2 或 3）；回退
// （drive 低值）整表重建后计数下降
window.VidNotes.pipeline.drive("s1", 1);
await sleep(40);
const sDl = [...document.querySelectorAll("#pipeDlSteps li")];
const sSubN = document.querySelectorAll("#pipeSubs li").length;
const sBadge = document.getElementById("dlBadge").textContent; // 就地捕获（后续 drive 会改写徽章）
window.VidNotes.pipeline.drive("s3", 1);
await sleep(40);
const sRtN = document.querySelectorAll("#pipeRt .rt-chip").length;
window.VidNotes.pipeline.drive("s4", 0.5);
await sleep(40);
const sLxN = document.querySelectorAll("#pipeLatex li").length;
window.VidNotes.pipeline.drive("s1", 0.3); // 回退路径：整表重建
await sleep(40);
const sBackN = document.querySelectorAll("#pipeDlSteps li").length;
out.push("psStreams=" + (sDl.length === 5 && sDl.every((li) => li.classList.contains("on")) &&
  sDl[0].textContent.includes("解析网页") && sDl[4].textContent.includes("SSL 重试") &&
  sSubN === 3 && sBadge === "已到达" &&
  sRtN === 3 && sLxN >= 2 && sLxN <= 3 && sBackN >= 1 && sBackN < 5));
// 84：交付成功动画（运营方指令 ⑥）——s5 满刻 ⇒ 成功横幅显 + 印章 + 下载按钮；
// 回退隐藏；85 期：引导文案换声明式下载锚点（.ps-download = btn-primary 同款）
window.VidNotes.pipeline.drive("s5", 1);
await sleep(60);
const okShown = !document.getElementById("pipeSuccess").hidden &&
  document.querySelector("#pipeSuccess .ps-check") !== null &&
  document.querySelector("#pipeSuccess .ps-text b").textContent.includes("转换完成") &&
  (() => { const a = document.querySelector("#pipeSuccess a.ps-download"); return a?.getAttribute("href").endsWith("notes.pdf") &&
    (a.getAttribute("download") || "").length > 0 && a.textContent.includes("下载笔记"); })();
window.VidNotes.pipeline.drive("s5", 0.2);
await sleep(40);
out.push("psSuccess=" + (okShown && document.getElementById("pipeSuccess").hidden === true));
out.push("psA11y=" + (document.querySelectorAll("#pipelineScene a, #pipelineScene button, #pipelineScene [tabindex]").length === 1 &&
  // 85：唯一的可交互元素 = 声明式下载锚点（84 期「零可交互」约定被运营方指令覆盖：
  // 引导文案有误导感 ⇒ 直接换成按钮）
  (() => { const a = document.querySelector("#pipelineScene a"); return a?.classList.contains("ps-download") &&
    a.getAttribute("href").endsWith("notes.pdf") && (a.getAttribute("download") || "").length > 0 &&
    a.textContent.includes("下载笔记"); })() &&
  [...document.querySelectorAll("#pipelineScene img")].every((im) => (im.getAttribute("alt") || "").length > 3)));
window.VidNotes.pipeline.reset();
await sleep(40);
const psRst = window.VidNotes.pipeline.state();
// 84：复位零态读数（须在 finish 前——finish 重建全满）
const psRst0 = {
  tags: document.querySelectorAll("#judgeTags .jt-tag").length,
  dl: document.querySelectorAll("#pipeDlSteps li").length,
  sub: document.querySelectorAll("#pipeSubs li").length,
  rt: document.querySelectorAll("#pipeRt .rt-chip").length,
  latex: document.querySelectorAll("#pipeLatex li").length,
  success: document.getElementById("pipeSuccess").hidden,
};
window.VidNotes.pipeline.finish();
await sleep(40);
out.push("psReset=" + (psRst.cutLit === 0 && psRst.pdfArrived === 0 && psRst.claimLit === 0 &&
  psRst.cjk === "7766" && window.VidNotes.pipeline.state().cutLit === 20 &&
  Object.values(psRst0).slice(0, 5).every((n) => n === 0) && psRst0.success === true &&
  // finish 后重建全满：标签流 10 + … / s1 五步 / 成功横幅再现
  document.querySelectorAll("#judgeTags .jt-tag").length === 10 &&
  document.querySelectorAll("#judgeTags .jt-more").length === 1 &&
  document.querySelectorAll("#pipeDlSteps li").length === 5 &&
  document.getElementById("pipeSuccess").hidden === false));
out.push("psFinalN=" + (window.VidNotes.pipeline.state().cutLit + "c" + window.VidNotes.pipeline.state().claimLit + "p" + window.VidNotes.pipeline.state().pdfArrived));

// (6) 本页对比子表 + 落盘
emitContrast({
  ink3: [".brand-text em", ".pill", ".footer p", ".stage-step:not(.done):not(.active) .s-name", ".stage-step .s-hint", ".run-sub", ".stack-hint", ".player-sub"],
  ink2: [".nav-item", ".count", ".sc-head", ".mode-select"],
  ink: [".view-title h2", ".player-title", ".run-title", "#runClock"],
  accent: [".run-clock", ".nav-item.active", ".stage-step.active .s-name"],
  green: [".stage-step.done .s-name"],
  white: [".btn-primary", ".logo"],
});
emitFocus(".btn-primary", ".run-panel");
emitLineS(["#btnPauseRun"]);

dumpProbe("run");
finish();

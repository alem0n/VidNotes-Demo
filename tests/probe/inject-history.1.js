// inject-history.1.js — 历史轨迹页（history.html）契约 · 上：run-list + 回放器
// 运输 + 活体键盘表 + 六类药丸（iteration 71，多页拆分 II 期）。
//
// 承载旧契约的键族：
//   - runItems / player 打开与静态语义（旧 btnReplayRun 路径 → 页内 .run-item
//     点击：跨页桥把 fragment 写进目标 URL，本页 reconcile 打开 player——同一
//     openPlayer/hardSeek 路径，断言读点不变）
//   - sl*/sp*/pb*（APG slider 运输组：role/tabindex/label/orientation/min/max/
//     now/text/live + aria-current 单选 + 双态钮 label/aria-pressed 同源）
//   - lv*（活体键盘表：步进/Home/End/钳制/未映射键放行/播放中提交/不洪泛窗）
//   - slSamp*（采样自洽：AT 值 = 可见钟 = 填充百分比，三元同任务写点）
//   - tm* 的速度族简缩（tm1x/tmMid4x/tm16xInst → rn/lv 族读数）
const booted = await waitBoot("history");
out.push("hiBoot=" + booted);
await seedData();
installAtomObserver();

const slEl = document.getElementById("plScrub");
const spEl = document.getElementById("plSpeeds");
const lvEl = document.getElementById("plLive");
const pbEl = document.getElementById("plPlay");
const spBtns = () => [...spEl.querySelectorAll("button")];
const speed = (s) => document.querySelector(`#plSpeeds button[data-speed="${s}"]`);
const key = (k) => keyOn(slEl, k);

// (1) run-list 与计数徽标
out.push("runItems=" + document.querySelectorAll("#runList .run-item").length);
out.push("histCount=" + (document.getElementById("histCount").textContent === "1"));
out.push("histView=" + (hidState("history") === "ok"));
out.push("histNoPlayer=" + document.getElementById("player").classList.contains("hidden"));

// (2) 打开 player（页内入口：.run-item 点击 → openPlayer，一条离散 push）
const len0 = history.length;
const runItem = document.querySelector("#runList .run-item");
runItem.click();
await sleep(200);
out.push("plOpen=" + (!document.getElementById("player").classList.contains("hidden") &&
  document.querySelector("#runList .run-item.selected") !== null));
out.push("plHash=" + (location.hash === "#history/run-20261003/@0")); // openPlayer 的 push 带 rel 分量
out.push("plPushOne=" + (history.length - len0 === 1)); // 一条离散条目（40 次 μ-task 合并口径）
out.push("plTitle=" + (document.getElementById("plTitle").textContent.trim().length > 0));
out.push("plSub=" + (document.getElementById("plSub").textContent.includes("源视频")));
out.push("plRibbon=" + (document.querySelectorAll("#plRibbon .ribbon-seg").length > 0));

// (3) 静态运输语义
out.push("slRole=" + (slEl.getAttribute("role") === "slider"));
out.push("slTabI=" + (slEl.getAttribute("tabindex") === "0"));
out.push("slLabel=" + (slEl.getAttribute("aria-label") === "回放进度"));
out.push("slOrient=" + (slEl.getAttribute("aria-orientation") === "horizontal"));
out.push("slMin=" + (slEl.getAttribute("aria-valuemin") === "0"));
out.push("slMaxExact=" + (T_MS > 0 && +slEl.getAttribute("aria-valuemax") === Math.round(T_MS)));
out.push("slNow0=" + (slEl.getAttribute("aria-valuenow") === "0" &&
  slEl.getAttribute("aria-valuetext") === document.getElementById("plClock").textContent));
out.push("slLive=" + (lvEl !== null && lvEl.getAttribute("role") === "status" &&
  lvEl.getAttribute("aria-live") === "polite" && lvEl.getAttribute("aria-atomic") === "true"));
out.push("spGrp=" + (spEl.getAttribute("role") === "group" && spEl.getAttribute("aria-label") === "回放速度"));
out.push("spOneCur=" + (spBtns().length === 5 && spBtns().filter((b) => b.getAttribute("aria-current") === "true").length === 1 &&
  spBtns().find((b) => b.getAttribute("aria-current") === "true")?.dataset.speed === "2"));
out.push("pbPressed0=" + (pbEl.getAttribute("aria-pressed") === "false"));
out.push("pbLabel0=" + (pbEl.textContent === "▶ 播放"));

// (4) 采样自洽 + 不洪暴窗（活体值 twitter 采样器，同任务四元组不能撕裂）
let lvChg = 0, lvPrev = "";
const lvText = () => lvEl.textContent.trim();
const slSamp = [];
const slPoll = setInterval(() => {
  const now = slEl.getAttribute("aria-valuenow");
  if (now == null) return;
  const last = slSamp[slSamp.length - 1];
  if (last && last[1] === now) return;
  slSamp.push([+slEl.getAttribute("aria-valuemax"), now,
    slEl.getAttribute("aria-valuetext"),
    document.getElementById("plClock").textContent,
    document.getElementById("plScrubFill").style.width]);
  if (lvEl.textContent !== lvPrev) { lvPrev = lvEl.textContent; lvChg++; }
}, 40);

// (5) 起播与速度族（状态归一：先确保一个「播放中」的确定态——上一段结束时
//     的按钮可能是 ▶ 播放 / ↺ 重播，一次 click 都进入 play()）
// 钮三态：⏸ 暂停=播放中 / ▶ 播放=暂停 / ↺ 重播=已结束。两段共享的归一助手
// （ensurePaused 供 history.2 的 sk* 段取得「可确定的暂停栈」）
const ensurePlaying = async () => {
  if (pbEl.textContent.includes("播放") || pbEl.textContent.includes("重播")) { pbEl.click(); await sleep(150); }
  return true;
};
const ensurePaused = async (minCards) => {
  await ensurePlaying();
  if (minCards) await until(() => document.querySelectorAll("#plStack .stack-card").length >= minCards, 9000, 30);
  if (pbEl.textContent.includes("暂停")) { pbEl.click(); await sleep(120); }
  return true;
};
speed(1).click();
await ensurePlaying();
const txt15 = await until(() => { const s = snap(); return s.phase === "text" && s.chars >= 10; }, 3000, 30);
const cp1 = snap();
const iv1 = cp1.intervals;
out.push("lv1x=" + (txt15 && cp1.factor === 1 && cp1.charMs === 48 && cp1.chars < cp1.textLen));
out.push("lv1xIv=" + (iv1.length >= 8 && iv1.every((x) => x >= 40 && x <= 60))); // 恒速 ≈48ms/char
out.push("lvConst=" + (iv1.length >= 8 && Math.max(...iv1) - Math.min(...iv1) <= 8)); // 无随机停顿
out.push("lv1xIvN=" + iv1.length + "v" + iv1.map((x) => x.toFixed(1)).join(","));
// 4x 中流换速：下一批字符以新速率
speed(4).click();
const tail4 = await until(() => { const s = snap(); return s.charMs === 12 && s.intervals.slice(-10).every((x) => x >= 9 && x <= 16) && s.intervals.length >= 10; }, 2000, 20);
const cp2 = snap();
out.push("lvMid4x=" + (tail4 && cp2.factor === 4 && cp2.charMs === 12));
out.push("lvMid4xIv=" + (tail4 && cp2.intervals.slice(-10).every((x) => x >= 9 && x <= 16)));
out.push("lvMid4xIvN=" + cp2.intervals.length + "v" + cp2.intervals.slice(-14).map((x) => x.toFixed(1)).join(","));
// 16x 极速档：余字即刻倾泻（零新步进）
const ivLenBefore = cp2.intervals.length, charsBefore = cp2.chars;
speed(16).click();
const dumped = await until(() => { const s = snap(); return s.phase !== "text" || s.chars === s.textLen; }, 500, 5);
const cpD = snap();
out.push("lv16xInst=" + (dumped && cpD.chars === cpD.textLen && cpD.intervals.length === ivLenBefore && charsBefore < cpD.textLen));
// 16x 跑到 idx4 再降 4x，让下一证据卡以 4x 序列化，再中途切 16x（证据序列内活因子）
// 第 72 次重锚：首个带证据时刻的索引随数据漂移 ⇒ 现算（数据神谕，不再硬编码 4/5）
const evIdx = RN.moments.findIndex((m) => m.evidence);
const at4 = await until(() => snap().idx === evIdx - 1, 12000, 5);
speed(4).click();
const evRunning = await until(() => {
  if (snap().idx !== evIdx) return false;
  const ev = document.querySelector("#plStack .stack-card.expanded .sc-evidence");
  return ev && ev.querySelectorAll(".in").length >= 2 && ev.querySelectorAll(".pending-item").length >= 1;
}, 8000, 20);
out.push("lvEv4x=" + evRunning);
speed(16).click();
const collapsed = await until(() => { const ev = document.querySelector("#plStack .stack-card.expanded .sc-evidence"); return !ev || ev.querySelectorAll(".pending-item").length === 0; }, 2000, 20);
out.push("lvEvCol=" + collapsed);
// 不洪泛窗：16x 恒速段，1500ms 内无离散事件 ⇒ #plLive 最多动一次而滑值≥3 新样
const chg0 = lvChg, samp0 = slSamp.length;
await sleep(1500);
out.push("lvNoFlood=" + ((lvChg - chg0) <= 1 && (slSamp.length - samp0) >= 3));
out.push("lvMutN=" + (lvChg - chg0) + "c" + (slSamp.length - samp0));
// 播到尾（按钮转「↺ 重播」）
const played = await until(() => pbEl.textContent.includes("重播"));
out.push("lvPlayed=" + played);
out.push("plClock=" + document.getElementById("plClock").textContent);
out.push("plStack=" + document.querySelectorAll("#plStack .stack-card").length);
out.push("plEvi=" + document.querySelectorAll("#plStack .ev-block").length);
clearInterval(slPoll);

// (6) 键盘表（归一：停在「播放中 1x」的确定态，再测双态钮与步进族）
if (pbEl.textContent.includes("暂停")) { pbEl.click(); await sleep(120); } // 先暂停（清掉残余播放态）
speed(1).click();
out.push("lvSpeed=" + (lvText().indexOf("1") >= 0 && lvText().indexOf("倍速") >= 0));
pbEl.click(); // ▶ 播放 或 ↺ 重播 → play()（已结束则从头重播）
await sleep(200);
const nowOf = () => +slEl.getAttribute("aria-valuenow");
out.push("spCurFlip=" + (spBtns().filter((b) => b.getAttribute("aria-current") === "true").length === 1 &&
  spBtns().find((b) => b.getAttribute("aria-current") === "true")?.dataset.speed === "1" &&
  spBtns().find((b) => b.dataset.speed === "1").classList.contains("active")));
out.push("pbPressedA=" + (pbEl.getAttribute("aria-pressed") === "true"));
out.push("pbLabelA=" + (pbEl.textContent === "⏸ 暂停"));
out.push("lvPlay=" + (lvText() === "播放"));
pbEl.click(); // 暂停
out.push("pbPressedB=" + (pbEl.getAttribute("aria-pressed") === "false"));
out.push("pbLabelB=" + (pbEl.textContent === "▶ 播放"));
out.push("lvPause=" + (lvText() === "暂停"));
// 键盘步进（pRel 独立复现状态机）
slEl.focus();
out.push("slFocus=" + (document.activeElement === slEl));
let pRel = nowOf();
const stepCheck = (k, frac, tag) => {
  const ev = key(k);
  pRel = eRel(eStep(pRel, frac));
  out.push(tag + "=" + (nowOf() === pRel &&
    slEl.getAttribute("aria-valuetext") === document.getElementById("plClock").textContent));
  return ev;
};
const evR = stepCheck("ArrowRight", 0.01, "slStepR");
out.push("slPd=" + evR.defaultPrevented);
stepCheck("ArrowUp", 0.01, "slStepU");
const evP = stepCheck("PageUp", 0.10, "slPgUp");
out.push("slPdPg=" + evP.defaultPrevented);
stepCheck("ArrowRight", 0.01, "slStepR2");
stepCheck("ArrowLeft", -0.01, "slStepL");
stepCheck("ArrowDown", -0.01, "slStepD");
stepCheck("PageDown", -0.10, "slPgDn");
out.push("lvSeek=" + (lvText().indexOf("已跳到") === 0));
const evH0 = key("Home");
out.push("slHome=" + (evH0.defaultPrevented && nowOf() === 0 &&
  slEl.getAttribute("aria-valuetext") === "00:00 / " + clockOfM(T_MS)));
const evH = key("ArrowLeft");
out.push("slClampMin=" + (evH.defaultPrevented && nowOf() === 0));
const evE0 = key("End");
out.push("slEnd=" + (evE0.defaultPrevented && nowOf() === RELS[RELS.length - 1] && nowOf() === Math.round(T_MS)));
const evE = key("ArrowRight");
out.push("slClampMax=" + (evE.defaultPrevented && nowOf() === Math.round(T_MS)));
out.push("slPass=" + (!key("x").defaultPrevented));
// 播放中的键盘提交必须落定且继续播放（hardSeek + resume 模式）
key("Home");
speed(16).click();
pbEl.click();
await sleep(250);
const idxB = snap().idx;
key("PageUp");
await sleep(700);
out.push("slResume=" + (pbEl.getAttribute("aria-pressed") === "true" && snap().idx > idxB));
pbEl.click(); // 暂停（给 history.2 一个可确定的冻结起点）
await sleep(150);
// 采样自洽：AT 值 = 可见钟；数值映射到填充百分比（CSSOM 6 位有效位序列化）
const slBad = slSamp.find((s2) => !(s2[0] > 0 && s2[2] === s2[3] &&
  Math.abs((+s2[1]) / s2[0] * 100 - parseFloat(s2[4])) < 0.01));
out.push("slSamples=" + !slBad);
out.push("slSampBad=" + (slBad ? slBad.join("/") : "none"));
out.push("slSampN=" + slSamp.length);
// 留给 history.2：1x 播放中（确定态）
speed(1).click();
if (!pbEl.textContent.includes("暂停")) { pbEl.click(); await sleep(200); }
out.push("hiLeavePlay=" + (pbEl.getAttribute("aria-pressed") === "true"));

// (7) tg* 六类药丸（第 12 次家族，逐字移植：合成宿主 + AA + 双通道 + token）
const KINDS = ["activity", "quality", "decision", "recovery", "milestone", "done"];
const tgHost = document.createElement("div");
tgHost.setAttribute("data-probe", "iteration12-pills");
tgHost.style.cssText = "position:absolute;left:-9999px;top:0;width:400px;";
document.body.appendChild(tgHost);
let tgMin = null, tgMinKind = "", tgBad = [];
for (const k of KINDS) {
  const c = document.createElement("div");
  c.className = "stack-card st-" + k + " expanded";
  c.innerHTML = '<div class="sc-head"><span class="m-time">00:00</span><span class="m-tag">' + k + '</span><span class="m-text">probe</span></div>';
  tgHost.appendChild(c);
  const tagEl = c.querySelector(".m-tag"), cs = getComputedStyle(tagEl);
  const r = crOf(cs.color, bgOf(tagEl));
  out.push("tg" + k[0].toUpperCase() + k.slice(1) + "=" + (r != null ? r.toFixed(3) + "@" + cs.color.replace(/\s/g, "") + "/" + cs.backgroundColor.replace(/\s/g, "") : "null"));
  if (r == null || r < 4.5) tgBad.push(k + ":" + (r != null ? r.toFixed(3) : "?"));
  if (r != null && (tgMin == null || r < tgMin)) { tgMin = r; tgMinKind = k; }
}
out.push("tgAA=" + (tgBad.length === 0));
out.push("tgBad=" + (tgBad.length ? tgBad.join(",") : "none"));
out.push("tgMin=" + (tgMin != null ? tgMin.toFixed(3) + "@" + tgMinKind : "none"));
const tgB = getComputedStyle(tgHost.querySelector(".m-tag"));
out.push("tgBase=" + (tgB.fontSize === "10px" && +tgB.fontWeight >= 600 && tgB.paddingTop !== "0px" && tgB.borderRadius === "8px"));
out.push("tgBaseN=" + tgB.fontSize + "/" + tgB.fontWeight + "/" + tgB.padding + "/" + tgB.borderRadius);
const tgLive = [...document.querySelectorAll("#plStack .stack-card .m-tag")];
const inkCs = getComputedStyle(document.body).color;
const tgLiveBad = [];
for (const t of tgLive) {
  const cs = getComputedStyle(t);
  if (cs.backgroundColor === "rgba(0, 0, 0, 0)" || cs.color === inkCs || !t.textContent.trim())
    tgLiveBad.push(t.textContent + ":" + cs.backgroundColor.replace(/\s/g, "") + "/" + cs.color.replace(/\s/g, ""));
}
out.push("tgLive=" + (tgLive.length > 0 && tgLiveBad.length === 0));
out.push("tgLiveN=" + tgLive.length + "bad" + tgLiveBad.length);
const tgAll = [...document.querySelectorAll("#plStack .m-tag")];
out.push("tgDual=" + (tgAll.length > 0 && tgAll.every((t) => t.textContent.trim().length > 0))); // SC 1.4.1 色非唯一编码
out.push("tgDualN=" + tgAll.length + "k" + [...new Set(tgAll.map((t) => t.textContent))].length);
const tgAmber = getComputedStyle(tgHost.querySelector(".st-decision .m-tag")).color;
const tgRed = getComputedStyle(tgHost.querySelector(".st-recovery .m-tag")).color;
out.push("tgToken=" + (tgAmber.replace(/\s/g, "") === "rgb(131,61,6)" && tgRed.replace(/\s/g, "") === "rgb(114,39,7)"));
out.push("tgTokenN=" + tgAmber.replace(/\s/g, "") + "/" + tgRed.replace(/\s/g, ""));
tgHost.remove();

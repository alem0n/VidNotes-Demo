// inject-library.js — 文档库页（library.html）契约（iteration 71，多页拆分 II 期）。
//
// 承载旧契约的键族（迁移表见 Explore_71 §3）：
//   - docCards / cardA11y（卡片结构 + tabindex/role/aria-label）
//   - dm*/mp*/cl*（APG 弹层：dialog 语义、打开/关闭、Esc 分层、焦点返回、
//     页面图计数/属性、数字出处表的结构与 AA）
//   - tf*（弹层 Tab/Shift+Tab 焦点环 + 灯箱叠层接管 + 关闭后无残余）
//   - lb*/ln*（灯箱：打开/尺寸/源/关闭 + 同组键盘导航 19 键，逐字移植）
//   - ct* 本页子表（含 .doc-thumb 渐变各停止点的最弱色对比）
// 旧契约的差异：入口不再有 nav 点击（本页即 library）；lnSilent 的「不触碰
// 别视图活动区域」重锚为「页内灯箱外的活动区域不变」（本页无 #plLive/#cvMsg）。
const booted = await waitBoot("library");
out.push("lbBoot=" + booted);
await seedData();
installAtomObserver();

// (0) 结构与卡片可寻址性
const dm = document.getElementById("docModal");
const lb = document.getElementById("lightbox");
out.push("docCards=" + document.querySelectorAll("#docGrid .doc-card").length);
const card = document.querySelector("#docGrid .doc-card");
out.push("cardA11y=" + (card.getAttribute("tabindex") === "0" && card.getAttribute("role") === "button" &&
  !!card.getAttribute("aria-label") && card.getAttribute("aria-label").includes("笔记详情")));
out.push("libCount=" + (document.getElementById("libCount").textContent === "1"));
// ?doc=<run> 深开（70 次 I 期页级深链）：boot-library 已在本页带参数时直开弹层
const docParam = new URLSearchParams(location.search).get("doc");
out.push("libDeepParam=" + (docParam ? docParam : "none"));

// (1) 打开弹层（键盘路径，与卡片 keydown 处理器同一入口）
card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
await sleep(200);
out.push("dmOpen=" + !dm.classList.contains("hidden"));
out.push("dmRole=" + (dm.getAttribute("role") === "dialog" && dm.getAttribute("aria-modal") === "true" &&
  dm.getAttribute("aria-labelledby") === "docModalTitle"));
out.push("dmLabelledby=" + (document.getElementById("docModalTitle")?.textContent.trim().length > 0));
out.push("dmName=" + (card.getAttribute("aria-label") || "").includes(document.getElementById("docModalTitle")?.textContent.trim() || "@@"));
out.push("dmFocusIn=" + (document.activeElement && dm.contains(document.activeElement)));
out.push("dmFocusClose=" + (document.activeElement.id === "docModalClose"));

// (2) 内容：33 页页面图（82 期数据源替换后页数）、pdf 交付物计数、章节、数字出处表
const pagesEls = () => [...document.querySelectorAll("#docModalBody .ev-page")];
out.push("mpCount=" + pagesEls().length);
out.push("mpLoaded=" + (pagesEls().filter((im) => im.complete && im.naturalWidth > 0).length >= 1));
out.push("mpAttrs=" + (pagesEls().every((im) => im.getAttribute("width") && im.getAttribute("height") &&
  (im.getAttribute("alt") || "").length > 2 && im.getAttribute("loading") === "lazy")));
const clRow = () => [...document.querySelectorAll("#docModalBody .mc-table tbody tr")];
out.push("clN=" + clRow().length);
out.push("clScope=" + (document.querySelectorAll("#docModalBody .mc-table thead th[scope=col]").length === 4 &&
  clRow().every((tr) => !!tr.querySelector("th[scope=row]"))));
out.push("clTime=" + (clRow().every((tr) => { const t = tr.querySelector("time"); return t && /PT\d+S/.test(t.getAttribute("datetime") || "") && t.textContent.trim() !== ""; })));
out.push("clIn=" + (document.querySelectorAll("#docModalBody .mc-in").length > 0 &&
  [...document.querySelectorAll("#docModalBody .mc-in")].every((s) => s.textContent.includes("已入笔记"))));
out.push("clClose=" + (document.getElementById("mClose")?.textContent.includes("关闭") && document.getElementById("mReplay")?.textContent.includes("回放")));
// 弹层内证据图与页面图同组（wireLightbox 的 .m-pages 分组）
out.push("mpSame=" + (document.querySelector("#docModalBody .m-pages")?.querySelectorAll("[data-lightbox]").length === pagesEls().length));

// (3) 灯箱打开（页面图 Enter）
// 弹层每次重开都会替换 #docModalBody 的 innerHTML ⇒ strip 引用必须现取
const lnStripOf = () => document.querySelector("#docModalBody .m-pages");
let lnStrip = lnStripOf();
const lnPages = () => [...(lnStripOf()?.querySelectorAll("[data-lightbox]") || [])];
const lnLb = lb;
const lnImg = lnLb.querySelector("img");
const lnCap = lnLb.querySelector(".lb-caption");
const lnCloseEl = document.getElementById("lbClose");
const lbPrevEl = document.getElementById("lbPrev"), lbNextEl = document.getElementById("lbNext"); // 75 屏上翻页钮
const ln0 = lnPages()[2];
ln0.focus();
ln0.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
await sleep(150);
out.push("lbOpen=" + (!lnLb.classList.contains("hidden") && lnImg.getAttribute("src") === ln0.dataset.lightbox &&
  document.activeElement === lnCloseEl));
out.push("lbCap=" + (lnCap.textContent === ln0.dataset.caption && lnCap.getAttribute("aria-live") === "polite"));
out.push("lbRole=" + (lnLb.getAttribute("role") === "dialog" && lnLb.getAttribute("aria-modal") === "true" &&
  lnLb.getAttribute("aria-label") === "图片放大预览 · 第 3 张，共 33 张"));
out.push("lbSz=" + (lnImg.getAttribute("width") === "827" && lnImg.getAttribute("height") === "1170"));

// (4) tf* 弹层焦点环（灯箱开着的复合态先测灯箱，再回弹层）——灯箱叠层接管
const tfDm = dm;
const tfWhere = (el) => (el ? (el.id || el.getAttribute("class") || el.tagName) : "none");
const tfTab = (shift) => new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true });
const tfLand = [];
tfLand.push(tfWhere(document.activeElement));
const tfLbC = lnCloseEl;
// 75: 灯箱焦点集 = 3（close + prev + next，多成员组中页均可用）。合成键不执行
// 浏览器默认焦点移动，可断言的形态是边界回卷：前向 Tab 自末项（#lbNext）
// 回卷到首项（#lbClose）；Shift+Tab 自首项回卷到末项（#lbNext）——APG dialog
// 的 Tab 环在扩集后仍只在边界被拦截，环内自然序由浏览器承载
lbNextEl.focus();
const tfL1 = tfTab(false); lbNextEl.dispatchEvent(tfL1);
out.push("tfLbCycle=" + (tfL1.defaultPrevented && document.activeElement === tfLbC && !tfDm.contains(document.activeElement)));
const tfL2 = tfTab(true); tfLbC.dispatchEvent(tfL2);
out.push("tfLbBack=" + (tfL2.defaultPrevented && document.activeElement === lbNextEl));
tfLand.push(tfWhere(document.activeElement));
// 灯箱内 ←/→ 仍然同组导航（灯箱自己的键表，见 ln*）——焦点先归位 #lbClose
lnCloseEl.focus();
lnCloseEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
await sleep(80);
out.push("tfLbNav=" + (lnImg.getAttribute("src") === lnPages()[3].dataset.lightbox && document.activeElement === lnCloseEl));
// Escape 只关灯箱（分层关闭：灯箱 z300 > 弹层 z200）
document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
await sleep(120);
out.push("tfLbEsc=" + (lnLb.classList.contains("hidden") && !tfDm.classList.contains("hidden")));
tfLand.push(tfWhere(document.activeElement));
// 弹层重为顶层：Tab 在末个可获焦（#mClose）包裹回首个（#docModalClose）
const tfLast = document.getElementById("mClose");
tfLast.focus();
const tfF1 = tfTab(false); tfLast.dispatchEvent(tfF1);
out.push("tfFwdWrap=" + (tfF1.defaultPrevented && document.activeElement.id === "docModalClose"));
out.push("tfFwdIn=" + tfDm.contains(document.activeElement));
const tfFirst = document.getElementById("docModalClose");
const tfB1 = tfTab(true); tfFirst.dispatchEvent(tfB1);
out.push("tfBackWrap=" + (tfB1.defaultPrevented && document.activeElement === tfLast));
out.push("tfBackIn=" + tfDm.contains(document.activeElement));
tfLand.push(tfWhere(document.activeElement));
// 中间项自然流动（不被拦截）
const tfImg = document.querySelector("#docModalBody .ev-page");
tfImg.focus();
const tfM1 = tfTab(false); tfImg.dispatchEvent(tfM1);
out.push("tfMidFlow=" + (!tfM1.defaultPrevented && document.activeElement === tfImg));
// 关闭弹层（Escape，焦点返回触发卡）后拦截器消失
document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
await sleep(120);
out.push("tfClose=" + (tfDm.classList.contains("hidden") && document.activeElement === card));
const tfR1 = tfTab(false); card.dispatchEvent(tfR1);
out.push("tfNoResid=" + (!tfR1.defaultPrevented && document.activeElement === card && !tfDm.contains(document.activeElement)));
tfLand.push(tfWhere(document.activeElement));
out.push("tfSeq=" + tfLand.join(">"));

// (5) lb* + ln* 灯箱同组键盘族（第 30 次 19 键，逐字移植）
card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
await sleep(200);
out.push("lnOpenG=" + (!dm.classList.contains("hidden") && lnPages().length === 33));
const lnKey = (key, shift) => new KeyboardEvent("keydown", { key, shiftKey: shift, bubbles: true, cancelable: true });
const lnPress = (key) => document.activeElement.dispatchEvent(lnKey(key));
const lnBoxEq = (el) => {
  const w = +el.getAttribute("width"), h = +el.getAttribute("height");
  const cs = getComputedStyle(lnImg);
  const mw = parseFloat(cs.maxWidth) || Infinity, mh = parseFloat(cs.maxHeight) || Infinity;
  const k = Math.min(1, mw / w, mh / h);
  return lnImg.getAttribute("width") === `${w}` && lnImg.getAttribute("height") === `${h}` &&
    Math.abs(parseFloat(lnImg.style.width) - w * k) < 0.01 && Math.abs(parseFloat(lnImg.style.height) - h * k) < 0.01;
};
lnStrip = lnStripOf();
const ln0b = lnPages()[2];
ln0b.focus();
ln0b.dispatchEvent(lnKey("Enter"));
await sleep(150);
// 页内其他活动区域（页身/页脚）在导航期间不变——lnSilent 的多页重锚
const liveBefore = [...document.querySelectorAll('[role=status], [aria-live]')]
  .filter((el) => !lnLb.contains(el)).map((el) => el.textContent);
out.push("lnOpen=" + (!lnLb.classList.contains("hidden") && lnImg.getAttribute("src") === ln0b.dataset.lightbox &&
  document.activeElement === lnCloseEl));
out.push("lnAria=" + (lnLb.getAttribute("aria-label") === "图片放大预览 · 第 3 张，共 33 张"));
lnPress("ArrowRight");
await sleep(80);
const ln1 = lnPages()[3];
out.push("lnNext=" + (lnImg.getAttribute("src") === ln1.dataset.lightbox && lnImg.alt === ln1.dataset.caption &&
  lnCap.textContent === ln1.dataset.caption && lnLb.getAttribute("aria-label") === "图片放大预览 · 第 4 张，共 33 张" &&
  lnCap.getAttribute("aria-live") === "polite"));
out.push("lnBox=" + lnBoxEq(ln1));
out.push("lnFocus=" + (document.activeElement === lnCloseEl));
lnPress("ArrowLeft");
await sleep(80);
out.push("lnPrev=" + (lnImg.getAttribute("src") === ln0b.dataset.lightbox &&
  lnLb.getAttribute("aria-label") === "图片放大预览 · 第 3 张，共 33 张" && lnBoxEq(ln0b)));
// 陈旧盒判别器：不同固有尺寸的合成成员（盒必须跟随目标）
const lnSyn = document.createElement("img");
lnSyn.className = "ev-page";
lnSyn.dataset.lightbox = "assets/frames/f_062.jpg"; // 82 期：synthetic 改用真实存在的帧资产（candidates 随旧数据退场；960×540 = 其真实固有尺寸）
lnSyn.dataset.caption = "合成成员（尺寸探针）";
lnSyn.setAttribute("width", "960");
lnSyn.setAttribute("height", "540");
lnStripOf().insertBefore(lnSyn, ln0b.nextSibling);
lnPress("ArrowRight");
await sleep(80);
out.push("lnMix=" + (lnImg.getAttribute("src") === "assets/frames/f_062.jpg" &&
  lnImg.alt === "合成成员（尺寸探针）" && lnLb.getAttribute("aria-label") === "图片放大预览 · 第 4 张，共 34 张" && // 82 期：33 页 + 合成 1 = 34
  lnBoxEq(lnSyn) && parseFloat(lnImg.style.width) === 960 && parseFloat(lnImg.style.height) === 540));
lnPress("ArrowLeft");
await sleep(80);
out.push("lnMixBack=" + (lnImg.getAttribute("src") === ln0b.dataset.lightbox &&
  lnImg.getAttribute("width") === "827" && lnImg.getAttribute("height") === "1170" && lnBoxEq(ln0b)));
lnSyn.remove();
lnPress("End");
await sleep(80);
out.push("lnEnd=" + (lnImg.getAttribute("src") === lnPages()[32].dataset.lightbox &&
  lnLb.getAttribute("aria-label") === "图片放大预览 · 第 33 张，共 33 张"));
lnPress("Home");
await sleep(80);
out.push("lnHome=" + (lnImg.getAttribute("src") === lnPages()[0].dataset.lightbox &&
  lnLb.getAttribute("aria-label") === "图片放大预览 · 第 1 张，共 33 张"));
lnPress("ArrowLeft");
await sleep(80);
out.push("lnClampL=" + (lnImg.getAttribute("src") === lnPages()[0].dataset.lightbox &&
  lnLb.getAttribute("aria-label") === "图片放大预览 · 第 1 张，共 33 张"));
lnPress("End"); await sleep(80);
lnPress("ArrowRight");
await sleep(80);
out.push("lnClampR=" + (lnImg.getAttribute("src") === lnPages()[32].dataset.lightbox &&
  lnLb.getAttribute("aria-label") === "图片放大预览 · 第 33 张，共 33 张"));
lnPress("ArrowUp"); await sleep(40);
lnPress("ArrowDown"); await sleep(40);
out.push("lnVert=" + (lnImg.getAttribute("src") === lnPages()[32].dataset.lightbox &&
  lnCap.textContent === "第 33 页")); // ↑/Down 不是导航键：图集是一维的
// tf* 的灯箱焦点环仍在导航后成立
const lnTabEv = lnKey("Tab", true); // Shift+Tab 自首项（#lbClose）回卷到末项
lnCloseEl.dispatchEvent(lnTabEv);
out.push("lnTab=" + (lnTabEv.defaultPrevented && document.activeElement === lbPrevEl &&
  !dm.contains(document.activeElement) &&
  [...lnLb.querySelectorAll(["a[href]", "button:not([disabled])", "[tabindex]:not([tabindex='-1'])"].join(","))].length === 2)); // 75: 焦点集 = close + prev（末页 ⇒ next 禁用，离开焦点环）
// (75) 屏上翻页钮（lbNav）状态：多成员组末页 ⇒ prev 可用 / next 禁用
out.push("lbBtns=" + (!lbPrevEl.classList.contains("hidden") && !lbPrevEl.disabled &&
  !lbNextEl.classList.contains("hidden") && lbNextEl.disabled));
// 静默导航：灯箱外的活动区域逐字不变
const liveAfter = [...document.querySelectorAll('[role=status], [aria-live]')]
  .filter((el) => !lnLb.contains(el)).map((el) => el.textContent);
out.push("lnSilent=" + (JSON.stringify(liveBefore) === JSON.stringify(liveAfter)));
// 单成员组：把所示页移出任何 strip ⇒ 全部导航键无操作
const lnSolo = lnPages()[32]; // 82 期：单成员组探针改末页（caption「第 33 页」与断言一致）
const lnSoloNext = lnSolo.nextSibling;
const lnSoloLbl = lnLb.getAttribute("aria-label");
dm.querySelector(".m-body").appendChild(lnSolo);
lnPress("ArrowRight"); await sleep(40);
lnPress("ArrowLeft"); await sleep(40);
lnPress("Home"); await sleep(40);
lnPress("End"); await sleep(40);
out.push("lnSgl=" + (lnImg.getAttribute("src") === lnSolo.dataset.lightbox && lnCap.textContent === "第 33 页" &&
  lnLb.getAttribute("aria-label") === lnSoloLbl));
// (75) 单成员组 ⇒ 两钮隐藏：lnSolo 已在 strip 外，重开 ⇒ lbGroup 返回单触发器
lnSolo.dispatchEvent(lnKey("Enter"));
await sleep(150);
out.push("lbBtnsSgl=" + (lbPrevEl.classList.contains("hidden") && lbNextEl.classList.contains("hidden") &&
  lnImg.getAttribute("src") === lnSolo.dataset.lightbox));
// (75) × 点击关闭（evidence.js lbBindClose 的跨页统一接线——run/library 此前失效的修复）
lnCloseEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
await sleep(120);
out.push("lbCloseFix=" + (lnLb.classList.contains("hidden") && !dm.classList.contains("hidden") &&
  document.activeElement === lnSolo));
lnSolo.dispatchEvent(lnKey("Enter")); // 重新打开（仍单成员组），随后的 Escape 序列照旧
await sleep(150);
lnStripOf().insertBefore(lnSolo, lnSoloNext);
// 关闭保持分层（Escape 只关灯箱）+ 焦点回到**当前所示**图
document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
await sleep(120);
out.push("lnEscLf=" + (lnLb.classList.contains("hidden") && !dm.classList.contains("hidden")));
out.push("lnRet=" + (document.activeElement === lnSolo &&
  dm.contains(document.activeElement) && lnStrip.contains(lnSolo)));
document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
await sleep(120);
out.push("dmEsc=" + (dm.classList.contains("hidden") && document.activeElement === card));

// (6) ct* 本页子表（.doc-thumb 白字对渐变各停止点取最弱色——弹层内测）
card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
await sleep(200);
emitContrast({
  ink3: [".brand-text em", ".pill", ".footer p", ".modal-card .m-sub", ".modal-close"],
  ink2: [".nav-item", ".count", ".fact", ".view-title p"],
  ink: [".view-title h2", ".modal-card h2"],
  green: [".doc-status", ".mc-in"],
  white: [".btn-primary", ".logo"],
});
const thEl = document.querySelector(".doc-thumb");
let thMin = null;
if (thEl) {
  const css = getComputedStyle(thEl).backgroundImage || "";
  const stops = [...css.matchAll(/rgba?\(([^)]+)\)/g)].map((m) => m[0]).concat(css.match(/#[0-9a-f]{6}/gi) || []);
  for (const s of stops) { const r = crOf(getComputedStyle(thEl).color, s); if (r != null && (thMin == null || r < thMin)) thMin = r; }
}
out.push("ctThumb=" + (thMin != null && thMin >= 4.5));
out.push("ctThumbN=" + (thMin != null ? thMin.toFixed(2) : "none"));
document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
await sleep(120);

dumpProbe("library");
finish();

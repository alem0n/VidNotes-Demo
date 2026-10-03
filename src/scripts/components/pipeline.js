// VidNotes 管道车间（Pipeline Scene，组件群 II）：convert 视图「开始转换」之后、
// #runPanel 上方升起的机器动作场景。六个相位（s0–s5）按当前回放轨迹状态切换。
//
// 设计硬线：场景是回放状态的**纯呈现**——渲染入口是 (moment, run) → DOM 的**纯函数**
// （状态写入全用 classList.toggle(force)，幂等：同一时刻重写只产生同一 DOM ⇒ 每步
// 过渡只触发一次 = renderStepper / renderArts 的第 46/49 次机制），**零计时器** ⇒ 自动
// 继承三重既有机制、不引入新的时序状态机：演示调速（factor 1/6/8× 只改变 moment 推进
// 速率）、暂停 / 冻结-续播（第 24 次的 gate/frozen/hold：不推进 moment 即不写入；进行中
// 的 CSS 过渡自行落定 = 卡片冻结同语义）、视图隐藏冻结（第 25 次的 viewswitch → pause：
// 同理，且场景随 #view-convert 一并 display:none）。
//
// 相位派生（可回溯，见 docs/Explore_64.md §1）：相位 = moment.stage（s0–s5；末端
// done 时刻 → 六相位全完成）；相位内进度 p = clamp01((rel − stage.start)/(stage.end −
// stage.start))，rel 由 moment.t 派生（state.js relMoments 同一算式），stage 边界取自
// run.stages（build/product-data.json 既有字段，**数据层零触及**）；单元点亮数 = round(p
// × 单元数) = 真实进展的线性呈现代理（s2 跨度 456 474 ms；三批抽帧真实 rel 锚点 =
// 454 692 / 477 296 / 579 700）。
//
// 第 65 次结构轮（清债：本文件原 500/500 行零余量）：按单一职责拆为三模块——
//   pipeline-data.js = 轨迹数据常量（真实数值集）+ 共享微助手；
//   pipeline-cuts.js = s2 帧网格与抽帧探头渲染（含逐帧生长的语义不变性，见该文件头）；
//   pipeline.js（本文件）= 驱动 / 纯函数渲染（updatePipeline 与相位分发）+ 外部入口。
// 行为零变化：最终 DOM 结构与最终几何逐字不变；bundle / dist 体积小幅变化作事实登记
// （第 35 次拆分 +119 B 纯打包结构的先例口径）。场景内容数值仍是模块常量（出处 = 会话
// 记录行号或 materials/ 文件），不新增任何 run.* 数据字段；资产复用 82 期起自携的
// assets/frames/（成图源帧，83 期探头左格帧图）与 assets/figures/（探头右格成图）；
// 零新增 token /
// 零真 @media。

import { runs } from "../utils/state.js";
import {
  byId, clamp01, litN,
  DOWNLOAD, SUBTRACKS, SUB_HEALTH, SUB_FINAL, ENV_TOOLS, ENV_FACT,
  CLAIMS, RT_CHIPS, LATEX_STEPS, PDF, ARCHIVE, PHASES, PDF_PAGE_IMGS,
} from "./pipeline-data.js";
import { phaseS2, renderS2, resetCuts, probeT } from "./pipeline-cuts.js";

let built = false;   // 场景 DOM 只建一次（节点身份保持 ⇒ 过渡有 from 态，第 46/49 次机制）
let curPhase = "";   // 当前相位 key（相位切换的唯一写入口）
/* ---------- 构建（首次渲染时一次性建 DOM，节点身份保持 ⇒ 过渡有 from 态）---------- */

function build() {
  if (built) return;
  built = true;
  byId("pipelineScene").innerHTML = `
    <div class="pipe-head">
      <div class="pipe-title"><b>管道车间</b><span>机器动作 · 逐帧随回放状态推进</span></div>
    </div>
    <div class="pipe-body" id="pipeBody">
      ${phaseS0()}${phaseS1()}${phaseS2()}${phaseS3()}${phaseS4()}${phaseS5()}
    </div>`;
}

function phaseS0() {
  return `<section class="pipe-phase" data-phase="s0" hidden>
    <div class="chips" id="pipeS0Chips">${ENV_TOOLS.map((t) => `<span class="chip">${t}</span>`).join("")}</div>
    <div class="factline" id="pipeS0Fact">${ENV_FACT}</div>
  </section>`;
}

function phaseS1() {
  return `<section class="pipe-phase" data-phase="s1" hidden>
    <div class="pipe-cols">
      <div class="pipe-card">
        <div class="pc-head"><span>视频下载 · yt-dlp</span><span class="pc-badge" id="dlBadge">解析中</span></div>
        <ol class="dl-steps" id="pipeDlSteps"></ol>
        <div class="dl-bar"><i id="pipeDlFill"></i></div>
        <div class="dl-end" id="pipeDlEnd">
          <span>${DOWNLOAD.endpoint.bytes} · ${DOWNLOAD.endpoint.dur} · ${DOWNLOAD.endpoint.codec} ${DOWNLOAD.endpoint.res}</span>
          <img src="${DOWNLOAD.cover}" alt="原片封面（下载到达）" loading="lazy" decoding="async">
        </div>
      </div>
      <div class="pipe-card">
        <div class="pc-head"><span>字幕轨 · ${SUBTRACKS.length} 轨下载与清洗</span><span class="pc-badge" id="subBadge">0 / ${SUBTRACKS.length} 轨</span></div>
        <ul class="sub-tracks" id="pipeSubs"></ul>
        <div class="sub-final" id="pipeSubFinal">${SUB_FINAL}</div>
        <div class="sub-health" id="pipeSubHealth">${SUB_HEALTH}</div>
      </div>
    </div>
  </section>`;
}

function phaseS3() {
  return `<section class="pipe-phase" data-phase="s3" hidden>
    <div class="pipe-cols">
      <div class="pipe-card pipe-claims">
        <div class="pc-head"><span>数字声称 · extract_claims.py</span><span class="pc-badge" id="claimBadge">0 / ${CLAIMS.length} 条</span></div>
        <ol class="claim-list" id="pipeClaims">${CLAIMS.map((c) =>
          `<li><i class="cl-mark" aria-hidden="true"></i><span class="cl-text">${c[0]}</span><span class="cl-val">${c[1]}</span><span class="cl-time">⊕${c[2]}</span></li>`).join("")}</ol>
      </div>
      <div class="pipe-card">
        <div class="pc-head"><span>外部检索往返</span><span class="pc-badge">L57–92</span></div>
        <div class="rt-zone" id="pipeRt"></div>
      </div>
      <!-- iteration 76: 原片对照卡（素材驱动的核验动画面）——联系表 179 帧密集样本 +
           随核验进度滑动的核对视窗（spotlight），"逐条声称回看原片画面"的核对呈现 -->
      <div class="pipe-card pipe-verify">
        <div class="pc-head"><span>原片对照 · 密集帧联系表</span><span class="pc-badge" id="verifyBadge">0 / ${CLAIMS.length} 处</span></div>
        <div class="verify-scan">
          <img class="verify-sheet" src="assets/contact.jpg" alt="原片 179 帧密集样本联系表" loading="lazy" decoding="async">
          <div class="verify-window" id="verifyWindow"></div>
        </div>
        <div class="factline">逐条声称回看原片画面核对（联系表 = 179 帧密集样本）</div>
      </div>
    </div>
  </section>`;
}

function phaseS4() {
  return `<section class="pipe-phase" data-phase="s4" hidden>
    <div class="pipe-cols">
      <div class="pipe-card pipe-pdf">
        <div class="pc-head"><span>编译交付 · xelatex ×2</span><span class="pc-badge" id="pdfBadge">0 / ${PDF.pages} 页</span></div>
        <ol class="latex-flow" id="pipeLatex"></ol>
        <div class="pdf-strip" id="pipePdfStrip">${Array.from({ length: PDF.pages }, (_, i) =>
          `<span class="pdf-p" data-p="${i + 1}"><img alt="笔记第 ${i + 1} 页" loading="lazy" decoding="async"></span>`).join("")}</div>
        <div class="cjk-line">CJK 字符 <b id="pipeCjk">${PDF.cjkFirst}</b> → ${PDF.cjkLast}</div>
        <div class="pdf-end" id="pipePdfEnd">notes.pdf · ${PDF.pages} 页 · ${PDF.bytes}（L285–297 pdftotext 通读校验）</div>
      </div>
      <div class="pipe-card">
        <div class="pc-head"><span>写作与终检</span><span class="pc-badge">L209–326</span></div>
        <div class="factline">撰写 → 修复 TikZ 编译错误 → 终检验收闸门全过（L285）→ 渲染通读修订（L287–323）</div>
      </div>
    </div>
  </section>`;
}

function phaseS5() {
  return `<section class="pipe-phase" data-phase="s5" hidden>
    <!-- 84：交付完成动画（运营方指令 ⑥）——六相位落幕后拍下成功印章 + 下沉引导
         至场景正下方的交付卡 #runFoot（「下载笔记」声明式锚点，75 期）；
         纯呈现：无 a/button（psA11y 契约 = #pipelineScene 内零可交互元素）。
         85 期（运营方指令）：引导文案「讲义就在下方，点击下载」有误导感
         （暗示可点、本体无控件）⇒ 直接换成声明式下载按钮（75 期裁决同款：
         href + download 零 JS 接线，复用 .btn-primary 家族）；
         契约面 psA11y 随改「恰好 1 个声明式锚点」——banner hidden 期间
         锚点不可聚焦（a11y 安全：仅终态可达） -->
    <div class="pipe-success" id="pipeSuccess" hidden>
      <span class="ps-check" aria-hidden="true">✓</span>
      <div class="ps-text">
        <b>转换完成 · 笔记已交付</b>
        <span>${PDF.pages} 页中文笔记 · ${PDF.bytes} · 全部验收闸门通过</span>
      </div>
      <a class="ps-download btn-primary" href="assets/notes.pdf" download="视记 VidNotes 笔记.pdf">下载笔记</a>
    </div>
    <!-- iteration 76: 归档收束——交付物本体 arrival（page-01 封面，blockIn 150ms 延迟拍
         乘在相面揭幕之后 =「首屏冲击 → 阶段推进 → 交付收束」的最后一拍此前缺位）+ 归档 chips -->
    <div class="archive-row">
      <figure class="archive-artifact">
        <img src="assets/pages/page-01.jpg" alt="交付物：${PDF.pages} 页中文笔记封面" loading="lazy" decoding="async">
        <figcaption>notes.pdf · ${PDF.pages} 页 · ${PDF.bytes}</figcaption>
      </figure>
      <div class="archive-side">
        <div class="chips" id="pipeS5Chips">${ARCHIVE.map((t) => `<span class="chip">${t}</span>`).join("")}</div>
        <div class="factline">所有产物完成且验证通过 → 按经验固化制度归档（L327–411）</div>
      </div>
    </div>
  </section>`;
}
/* ---------- 纯呈现渲染：moment → DOM ---------- */

// 相位下标 + 各相位进度的唯一派生函数。坐标口径统一为**相对偏移**：rel 与 stage
// 边界一律减去 t0 —— 绝对纪元值与相对毫秒混用会让每个 clamp01 恒为 0（实测缺陷）。
function derive(run, m, done) {
  const t0 = Date.parse(run.startedAt);
  const rel = done ? run.durationMs : Math.max(0, Date.parse(m.t) - t0);
  const stages = run.stages.map((s) => ({ start: Date.parse(s.start) - t0, end: Date.parse(s.end) - t0 }));
  const lastEnd = stages[stages.length - 1].end;
  const finished = !!done || rel >= lastEnd;
  const idx = finished ? stages.length - 1 : stageIndex(stages, rel, m && m.stage);
  return { progs: stages.map((s, i) => {
    if (finished) return 1;
    if (i < idx) return 1;
    if (i > idx) return 0;
    return clamp01((rel - s.start) / (s.end - s.start));
  }) };
}

function stageIndex(stages, rel, stage) {
  const byKey = PHASES.findIndex((p) => p.key === stage);
  if (byKey >= 0) return byKey;
  for (let k = 0; k < stages.length; k++) if (rel <= stages[k].end) return k;
  return stages.length - 1;
}

export function updatePipeline(m, i, opts = {}) {
  const run = runs[0];
  const host = byId("pipelineScene");
  if (!run || !host) return;
  build();
  if (host.classList.contains("hidden")) return; // 演示未开始：不渲染
  const { progs } = derive(run, m, opts.done);
  // 注意：谓词不可带 || 回落串（「s5」是恒真值会让 findIndex 恒返回 0）——
  // 回落由 derive 的 finished 分支承担，这里只做单值匹配
  const idx = Math.max(0, PHASES.findIndex((p) => p.key === (m && m.stage)));
  const phase = PHASES[idx].key;
  if (phase !== curPhase) {
    curPhase = phase;
    byId("pipeBody").querySelectorAll(".pipe-phase").forEach((s) => {
      s.hidden = s.dataset.phase !== phase; // 相位切换：[hidden] 降级 + 入场过渡
    });
    /* 第 68 次：.pipe-rail 相位轨道移除——相位态与相位名与顶部 stageStepper 逐项重复
       （rail 唯一增量「· 72%」行内百分比的同期呈现仍在：step 填充条 + 各相位主体徽章）
       ⇒ 本块昔日对 rail-item 的 done/active 翻转一并退役（相位派生机与六相位主体不动）。 */
  }
  // 终态（done）时把六相位**逐一**按其最末进度渲染：自然结束的演示在每个阶段的
  // 末尾 moment 已把该相位渲染到 p=1（此路径是幂等重写），而冻结后直接 finish()
  // 的路径若只渲染当前相位，跳过的相位将停留在中途 —— 二者必须落同一终态。
  const renderPhase = (key, pp, isDone) => {
    switch (key) {
      case "s0": litN(byId("pipeS0Chips"), Math.round(pp * ENV_TOOLS.length)); break;
      case "s1": renderS1(pp); break;
      case "s2": renderS2(pp, isDone); break;
      case "s3": renderS3(pp); break;
      case "s4": renderS4(pp); break;
      case "s5": renderS5(pp, isDone); break;
    }
  };
  const p = progs[Math.max(0, idx)];
  if (opts.done) PHASES.forEach((ph, k) => renderPhase(ph.key, progs[k], true));
  else renderPhase(phase, p, false);
}

function renderS1(p) {
  // 84：流式到场（运营方指令 ①②）——条目随相位进度逐个插入（诞生即 .on +
  // 入场动画），不再构建期预渲染暗色待命行；徽章 / 进度条 / 端点亮灯读数不动
  streamItems(byId("pipeDlSteps"), Math.round(clamp01(p) * DOWNLOAD.steps.length),
    (i) => `<li class="on"><i></i><span>${DOWNLOAD.steps[i]}</span></li>`);
  byId("dlBadge").textContent = p >= 0.999 ? "已到达" : ["解析中", "取播放列表", "列格式", "下载中", "下完成"][Math.min(4, Math.floor(p * 5))];
  byId("pipeDlFill").style.width = (p * 100).toFixed(1) + "%";
  byId("pipeDlEnd").classList.toggle("arrived", p >= 0.98);
  const subs = Math.round(p * SUBTRACKS.length);
  streamItems(byId("pipeSubs"), subs,
    (i) => `<li class="on"><code>${SUBTRACKS[i].tag}</code><span>${SUBTRACKS[i].zh} · ${SUBTRACKS[i].line}</span></li>`);
  byId("subBadge").textContent = `${subs} / ${SUBTRACKS.length} 轨`;
  byId("pipeSubFinal").classList.toggle("arrived", subs >= 4);
  byId("pipeSubHealth").classList.toggle("ok", p >= 0.9);
}

function renderS3(p) {
  const claims = Math.round(p * CLAIMS.length);
  litN(byId("pipeClaims"), claims);
  byId("claimBadge").textContent = `${claims} / ${CLAIMS.length} 条`;
  // 84：流式到场（运营方指令 ④）——检索往返 chip 逐个插入，不再预显暗底
  streamItems(byId("pipeRt"), Math.min(RT_CHIPS.length, Math.round(p * RT_CHIPS.length * 1.5)),
    (i) => `<span class="rt-chip on">${RT_CHIPS[i]}</span>`);
  // iteration 76: 核对窗扫过联系表——已核验条数 ⇒ 视窗刻度（窗宽 12% ⇒ 行程 88%，末条到边）
  byId("verifyBadge").textContent = `${claims} / ${CLAIMS.length} 处`;
  byId("verifyWindow").style.left = ((claims / CLAIMS.length) * 88).toFixed(1) + "%";
}

function renderS4(p) {
  // 84：流式到场（运营方指令 ⑤）——编译步骤逐个插入
  streamItems(byId("pipeLatex"), Math.round(clamp01(p) * LATEX_STEPS.length),
    (i) => `<li class="on"><i></i><span>${LATEX_STEPS[i]}</span></li>`);
  const pages = Math.round(p * PDF.pages);
  byId("pdfBadge").textContent = `${pages} / ${PDF.pages} 页`;
  [...byId("pipePdfStrip").children].forEach((el, k) => {
    const on = k < pages;
    el.classList.toggle("arrived", on);
    // iteration 76: 到位即写页面图 src（「编译出一页」的字面语义；65 期 src-at-arrival 纪律）
    if (on) {
      const im = el.querySelector("img");
      if (im && !im.getAttribute("src")) im.setAttribute("src", PDF_PAGE_IMGS[k]);
    }
  });
  byId("pipeCjk").textContent = PDF.cjkFirst + Math.round(p * (PDF.cjkLast - PDF.cjkFirst));
  byId("pipePdfEnd").classList.toggle("arrived", p >= 0.985);
}

// 84：交付成功动画（运营方指令 ⑥）——归档收尾（p ≥ 0.97）或 done 拍下成功横幅；
// 回退（相位重入于低进度）即时隐藏（纯呈现幂等：hidden 翻转）。
function renderS5(p, isDone) {
  litN(byId("pipeS5Chips"), Math.round(clamp01(p) * ARCHIVE.length));
  byId("pipeSuccess").hidden = !(p >= 0.97 || isDone);
}

/* ---------- 流式条目助手（84 期，运营方指令「列表逐步加载」）---------- */
// 计数增 ⇒ 插入新条目（幂等：同计数零写入——已到条目不重播入场动画）；
// 计数减（drive 跳点回退）⇒ 整表清空后按目标重建（「回退是跳回」的 47 期词汇）。
// 调用方保证 count ≤ 全量（由 round(p × total) 派生）；reset 走 innerHTML 清空。
function streamItems(host, count, build) {
  if (!host) return;
  let cur = host.children.length;
  if (count < cur) { host.innerHTML = ""; cur = 0; }
  while (cur < count) { host.insertAdjacentHTML("beforeend", build(cur)); cur++; }
}

/* ---------- 外部入口（convert.js 挂点 + 探针 / 截图可观测面）---------- */

// 场景揭示：startConvert 与 runPanel 同步摘 hidden（第 59 次揭幕节拍）
export function revealPipeline() {
  const host = byId("pipelineScene");
  if (host) host.classList.remove("hidden");
}

// 重跑复位：startConvert 重建演示时复位到待命（之后 update 从 p≈0 重写全部状态）
export function resetPipeline() {
  curPhase = "";
  const host = byId("pipelineScene");
  if (!host || host.classList.contains("hidden")) return;
  resetCuts(); // s2 帧网格 / 探头 / 评分三态（pipeline-cuts 模块，就地清零）
  // 84：四张流式列表整表清空（不再走 litN 翻转——条目全部是到场插入的）
  ["pipeDlSteps", "pipeSubs", "pipeRt", "pipeLatex"].forEach((id) => { const e = byId(id); if (e) e.innerHTML = ""; });
  // 85：#pipeScores 改由 resetCuts 清空（判定行亦插入式，litN 翻转不再适用）
  ["pipeS0Chips", "pipeTri", "pipeClaims", "pipeS5Chips"]
    .forEach((id) => litN(byId(id), 0));
  byId("pipeSuccess")?.setAttribute("hidden", ""); // 84：成功横幅复位
  byId("pipePdfStrip")?.querySelectorAll(".pdf-p").forEach((c) => {
    c.classList.remove("arrived");
    const im = c.querySelector("img"); // 76: 页面图 src 就地清零（46/49 词汇）
    if (im) im.removeAttribute("src");
  });
  if (byId("verifyWindow")) byId("verifyWindow").style.left = "0%"; // 76: 核对窗归位
  ["pipeDlEnd", "pipeSubFinal", "pipeSubHealth", "pipePdfEnd"].forEach((id) => {
    const e = byId(id); if (e) e.classList.remove("arrived", "ok", "aligned");
  });
  byId("pipeDlFill").style.width = "0%";
  // 相位徽章与计数器一并复位（s4 的 CJK 不归位会残留上一轮末值）
  for (const [id, txt] of [["dlBadge", "解析中"], ["subBadge", `0 / ${SUBTRACKS.length} 轨`], ["claimBadge", `0 / ${CLAIMS.length} 条`], ["verifyBadge", `0 / ${CLAIMS.length} 处`], ["pdfBadge", `0 / ${PDF.pages} 页`]]) byId(id).textContent = txt;
  byId("pipeCjk").textContent = String(PDF.cjkFirst);
  if (byId("pipeSubHealth")) byId("pipeSubHealth").classList.remove("ok");
}

export function finishPipeline() {
  const run = runs[0];
  const host = byId("pipelineScene");
  if (!run || !host || host.classList.contains("hidden")) return;
  updatePipeline({ stage: "s5", t: run.endedAt, kind: "done", detail: "" }, run.moments.length - 1, { done: true });
}

// 探针 / 截图的可观测面（与 window.VidNotes.pacer 同一暴露约定，pacer.js:121）：
// 77 期原片页退场后，本约定不再引 source.js（其 run.source 面已删）。
export function drive(stage, frac) {
  const run = runs[0];
  if (!run || !byId("pipelineScene")) return;
  const i = PHASES.findIndex((p) => p.key === stage);
  if (i < 0) return;
  const start = Date.parse(run.stages[i].start), end = Date.parse(run.stages[i].end);
  const at = start + clamp01(frac) * (end - start);
  updatePipeline({ stage, t: new Date(at).toISOString(), kind: "activity", detail: "" }, i);
}

// forRel(rel, kind)：用**真实 rel** 造合成时刻再走同一条 updatePipeline（探针用
// 它落在 recovery 时刻 L145 rel=1 501 000 / OCR 完成 L176 rel=2 080 000；截图取证用它落任意相位）。
export function forRel(rel, kind = "activity") {
  const run = runs[0];
  if (!run || !byId("pipelineScene")) return;
  const t0 = Date.parse(run.startedAt);
  const bounds = run.stages.map((s) => ({ start: Date.parse(s.start) - t0, end: Date.parse(s.end) - t0 }));
  const idx = stageIndex(bounds, Math.max(0, rel), null);
  updatePipeline({ stage: PHASES[idx].key, t: new Date(t0 + Math.max(0, rel)).toISOString(), kind, detail: "" }, idx);
}

export function pipelineState() {
  if (!built) return null;
  return {
    phase: curPhase,
    cutLit: byId("pipeCuts")?.querySelectorAll(".cut-cell.on:not(.is-dup)").length ?? 0,
    claimLit: byId("pipeClaims")?.querySelectorAll("li.on").length ?? 0,
    pdfArrived: byId("pipePdfStrip")?.querySelectorAll(".pdf-p.arrived").length ?? 0,
    cjk: byId("pipeCjk")?.textContent ?? "",
    probeT: probeT(), // 83: 当前探头落点帧名（帧-图对照的左格帧）
  };
}

// 暴露约定同 pacer.js（探针与截图驱动的单一入口）
window.VidNotes = window.VidNotes || {};
window.VidNotes.pipeline = {
  update: updatePipeline, reset: resetPipeline, reveal: revealPipeline, finish: finishPipeline,
  drive, forRel, state: pipelineState, phases: PHASES.map((p) => p.key),
};;

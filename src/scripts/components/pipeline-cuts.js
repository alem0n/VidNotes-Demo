// pipeline-cuts.js — 管道车间 s2 帧网格与抽帧探头（第 65 次自 pipeline.js 拆出，结构轮）。
//
// 单一职责：**s2 选取笔记图**相位的呈现与渲染——抽帧网格（第 82 次重锚：L102 单批
// `fps=1/15` → 179 帧密集样本；L112–176 全片 OCR 107 条定位幻灯片 → L189–207 裁
// 19 幅 + L223 补 1 幅 = 20 张唯一成图源帧）的 DOM 构建器、按相位进度的逐帧点亮、
// 抽帧探头与帧评分/三向核验的渲染入口，以及这些 DOM 的重跑复位。拆分理由
// = s2 是管道车间内容密度最高、迭代最陡的相位面，独立模块给后续 s2 侧迭代留最大
// 余量（pipeline.js 500/500 零余量债务的清理目标）。布局（iteration 74，运营方指令
// 「三个横向排布动画组件修改为 pipe-probe 和 pipe-scores 组件竖向排布」）：probe +
// scores 两卡包进 .pipe-s2-side 容器（列向 grid），.pipe-s2 遂为二项网格 = cuts 一列 +
// 侧列竖排（scores 仍在末位，位置不变）；渲染读点全部 byId，DOM 包装零失锚。
//
// 80 期「抽帧探头双通道」（video seek + 同秒帧图覆盖层）已于 83 期整条退休：产品
// 没有任何线性播放 mp4 的功能，video 通道的全部可见信息 = 已打包的同秒帧图
// （assets/frames/f_NNN.jpg），故左格改为直接显示帧图；右格同时由「同一帧」改为
// 「该帧裁出的成图」（assets/figures/fig_XX.jpg，帧-图映射见 pipeline-data 的
// FIG_BY_FRAME）——探头从「视频 vs 静帧」变为「原片帧 → 裁剪成图」的因果对照，
// 信息量更高且产物 -44.2 MB 视频。退休清单（删除优于兼容，0.1 原则 8）：
// wireProbe / probeTarget / probeLive / probeWired / seeked 监听 / .probe-video /
// .probe-frame 绝对覆盖层。无 video ⇒ 80 期「无 byte-range 服务下 video 黑屏」的
// 根因不复存在，机制历史见 docs/Explore_80.md §2。
//
// 生长机制（第 65 次，运营方指令「帧不是同时准备好的，而是随着每一帧加入所在
// 容器逐渐增高」）：渲染语义逐字不变（点亮 = 纯函数 `litCutCells` 的 `classList
// .toggle(force)`，幂等、零计时器），生长全部由 pipeline.css 的 `.cut-cell` 族
// 承担（未点亮格 `display:none`（零预留槽位 / 零骨架），点亮格由 `@starting-style`
// 起跳、`padding-bottom` 通道从零面积生长到 16/9 槽位（aspect-ratio 不可过渡，
// 机制与终态几何等式见 docs/Explore_65.md §1）。到场时刻 = 点亮时刻 = 相位进度的
// 线性代理，故自动继承演示调速 / 暂停冻结-续播 / 视图隐藏冻结（第 64 次机制逐字不变）。

import {
  byId, clamp01, mmss, frameImg, figImg, litN,
  CUT_BATCHES, CUT_UNIQUE, CUT_NOTE_AT, CUT_OVERWRITE, CUT_NOTE, SCORE_FRAMES, SCORES, TRI_TRACKS, TRI_NOTE,
  FIG_BY_FRAME, PICK_SET,
} from "./pipeline-data.js";

let curProbe = "";   // 探头当前落点的帧名（同名不重复渲染）

// 帧名 → 秒（密集样本帧 f_NNN 的抽帧点 = 15×NNN，与 fps=1/15 同源）
const tOf = (name) => 15 * +(String(name).match(/_(\d+)$/u) || [])[1];
// 序号 → 帧名（f_002…f_179，与抽帧命名同源，判别标签流用）
const frameName = (k) => "f_" + String(k).padStart(3, "0");

/* ---------- s2 构建器（首次渲染时一次性建 DOM，节点身份保持 ⇒ 过渡有 from 态） ---------- */

export function phaseS2() {
  const batchHtml = CUT_BATCHES.map((b) => `
    <div class="cut-batch" data-batch="${b.line}">
      <div class="cb-head"><b>${b.name}</b><span>${b.line} · ${b.calls} 次调用</span></div>
      <div class="cb-cells">${b.names.map((name) => `
        <div class="cut-cell" data-t="${tOf(name)}" data-name="${name}">
          <img alt="密集样本帧 ${name}（${mmss(tOf(name))}）" loading="lazy" decoding="async">
          <span class="cc-t">${mmss(tOf(name))}</span>
        </div>`).join("")}
      </div>
    </div>`).join("")
  return `<section class="pipe-phase" data-phase="s2" hidden>
    <div class="pipe-s2">
      <div class="pipe-card pipe-cuts" id="pipeCuts">
        <div class="pc-head"><span>抽帧网格 · ffmpeg</span><span class="pc-badge" id="cutBadge">0 / ${CUT_UNIQUE.length} 帧</span></div>
        <div class="cut-note-cap" id="cutNoteCap">${CUT_NOTE}</div>
        <div class="cut-note" id="pipeOverwrite" hidden>${CUT_OVERWRITE}</div>
        ${batchHtml}
      </div>
      <div class="pipe-s2-side">
      <div class="pipe-card pipe-probe">
        <div class="pc-head"><span>抽帧探头 · 帧→成图</span><span class="pc-badge" id="probeBadge">t = —</span></div>
        <div class="probe-pair">
          <figure class="probe-source"><img id="probeFrame" alt="原片在这一秒的帧" decoding="async"><figcaption>原片帧（含导航条）</figcaption></figure>
          <figure class="probe-cand"><img id="probeImg" alt="该帧裁出的成图" decoding="async"><figcaption id="probeCap">等待落帧</figcaption></figure>
        </div>
        <div class="probe-why">左 = 原片在这一秒的帧（assets/frames · 密集样本）· 右 = 去除 155px 导航条后的成图（assets/figures）</div>
      </div>
      <div class="pipe-card pipe-scores">
        <div class="pc-head"><span>帧评分与三向核验</span><span class="pc-badge" id="scoreBadge">已判 0 / ${SCORE_FRAMES} 帧</span></div>
        <!-- iteration 81：逐帧判别扫描条——L102 密集抽帧 179 样本的单行等宽刻度，
             扫描窗随相位进度逐帧推进（扫到的刻度转亮 = 该帧已评分）；85 期起
             判定行改插入式滚动窗（litScoreRows：到达帧号才 prepend 插入，
             3 满删底部最旧），三向核验在扫描收尾后逐项点亮 —— renderS2 的 judged 派生 -->
        <div class="judge-strip" id="judgeStrip" aria-hidden="true">
          ${Array.from({ length: SCORE_FRAMES }, (_, k) => `<span class="jt"></span>`).join("")}
          <i class="judge-scan" id="judgeScan" style="width: ${(100 / SCORE_FRAMES).toFixed(3)}%"></i>
        </div>
        <!-- 84：帧过滤标签流（运营方指定形态）——扫描条正下方逐个落标签 f_NNN；
             滚动窗口 = 最近 10 个（judged > 10 ⇒ 头部出 「…」表示更早的还有很多；
             总数计数随徽章单调不减）；入选教学图的帧转绿（判过 ≠ 入选） -->
        <div class="judge-tags" id="judgeTags"></div>
        <!-- 85：判定行容器初始为空（插入式滚动窗——不再预渲染暗色待定行） -->
        <div class="score-rows" id="pipeScores"></div>
        <div class="tri-verify" id="pipeTri">
          ${TRI_TRACKS.map((t) => `<div class="tri-track"><i></i><span>${t}</span></div>`).join("")}
        </div>
        <div class="tri-note" id="pipeTriNote" hidden>${TRI_NOTE}</div>
      </div>
      </div>
    </div>
  </section>`;
}

/* ---------- 纯呈现渲染：s2 相位进度 → 帧网格 / 探头 / 评分 ---------- */

export function renderS2(p, done) {
  const lit = Math.round(clamp01(p) * CUT_UNIQUE.length);
  litCutCells(lit);
  byId("cutBadge").textContent = `${lit} / ${CUT_UNIQUE.length} 帧`;
  // 批一+批二落满后（第 CUT_NOTE_AT 个单元）赌出覆写注记（真实事故点，派生自相位进度）
  byId("pipeOverwrite").hidden = lit < CUT_NOTE_AT;
  // 探头：随最新落点位渲染帧-图对（同帧名不重复渲染；83 期起无 video 通道）
  if (lit > 0) {
    const name = CUT_UNIQUE[lit - 1];
    if (name !== curProbe) {
      curProbe = name;
      const t = tOf(name);
      const figBase = FIG_BY_FRAME[name];
      const frame = byId("probeFrame");
      if (frame) { // 左格：原片在这一秒的帧（assets/frames，与抽帧点同源真值）
        frame.src = frameImg(name);
        frame.alt = `原片帧 ${name} · t=${t}s · ${mmss(t)}`;
      }
      byId("probeImg").src = figImg(figBase); // 右格：该帧裁出的成图
      byId("probeImg").alt = `成图 ${figBase}（自原片帧 ${name} 裁剪）`;
      byId("probeCap").textContent = `${name} → ${figBase}`;
      byId("probeBadge").textContent = `t = ${t} s · ${mmss(t)}`;
    }
  } else {
    byId("probeBadge").textContent = "t = —";
  }
  // iteration 81：逐帧判别扫描——相位进度派生 judged（0→179），扫描条逐帧推进、
  // 判定行在其帧号被扫到时落定（帧号 = 帧名 f_NNN 的 N：f_002=2、f_062=62、f_150=150），
  // 三向核验在扫描收尾后逐项点亮（真实顺序：L189–223 裁完才 L199 三向验证）
  const judged = Math.round(clamp01(p) * SCORE_FRAMES);
  litJudgeStrip(judged);
  litJudgeTags(judged);
  byId("scoreBadge").textContent = judged >= SCORE_FRAMES ? "无人物特写帧 · OCR 107 条（L176）" : `已判 ${judged} / ${SCORE_FRAMES} 帧`;
  litScoreRows(judged);
  const triStart = 0.86, triStep = 0.04; // 时间轴 → 字幕文本 → 画面文字（OCR），逐项点亮
  const triOn = p < triStart ? 0 : Math.min(TRI_TRACKS.length, Math.floor((p - triStart) / triStep) + 1);
  litN(byId("pipeTri"), triOn);
  byId("pipeTri").classList.toggle("aligned", p >= 0.965 || !!done);
  byId("pipeTriNote").hidden = !(p >= 0.98 || !!done);
}

// 网格点亮：按批次顺序点亮「新落帧」（20 帧名无重复，全部为新帧）。
// 缩略图 src 在点亮时才写入 —— 「真图入网格」的字面语义，也避免演示前段一次性发起 20
// 张解码（跨路径截图/探针的时机负担）。逐帧生长由 .cut-cell 的 CSS 承担（点亮即从零
// 面积生长，见文件头）。
function litCutCells(lit) {
  let used = 0;
  byId("pipeCuts").querySelectorAll(".cut-batch").forEach((batch) => {
    const cells = [...batch.querySelectorAll(".cut-cell")];
    const got = Math.max(0, Math.min(cells.length, lit - used));
    used += cells.length; // 批次之间按「新帧」记账（20 张成图源帧）
    cells.forEach((c, i) => {
      c.classList.toggle("on", i < got);
      if (i < got) { const im = c.querySelector("img"); if (im && !im.getAttribute("src")) im.setAttribute("src", frameImg(c.dataset.name)); }
    });
  });
}

// 84：帧过滤标签流——判别扫到第 k 帧即落一个 f_NNN 标签（滚动窗口 = 最近 10 个，
// judged > 10 ⇒ 头部补一个「…」表示更早的还有很多；总数计数由徽章单调不减承载）。
// 追踪 judgedSeen：前进 = 只追加新标签（幂等，过渡只触发一次）；回退（drive 跳点 /
// reset 后重入）= 整表清空再按目标重建（「回退是跳回」的 47 期词汇）。
// 入选帧（PICK_SET）转绿 = 「判过 ≠ 入选」的一眼可辨（运营方问题「表现不出哪些选中」）
const JUDGE_WINDOW = 10;
let judgedSeen = 0;
function litJudgeTags(judged) {
  const host = byId("judgeTags");
  if (!host) return;
  if (judged < judgedSeen) { host.innerHTML = ""; judgedSeen = 0; }
  if (judged > judgedSeen) {
    for (let k = judgedSeen + 1; k <= judged; k++) {
      const name = frameName(k);
      host.insertAdjacentHTML("beforeend",
        PICK_SET.has(name)
          ? `<span class="jt-tag is-pick" title="入选教学图（OCR 选定）">${name}</span>`
          : `<span class="jt-tag">${name}</span>`);
    }
    judgedSeen = judged;
    // 窗口滚动：超出的旧标签即时退场（退场无动画 = 零计时器纪律；总数计数不减）
    const tags = host.querySelectorAll(".jt-tag");
    for (let i = 0; i < tags.length - JUDGE_WINDOW; i++) tags[i].remove();
    if (judged > JUDGE_WINDOW && !host.querySelector(".jt-more"))
      host.insertAdjacentHTML("afterbegin", `<span class="jt-more" aria-hidden="true">…</span>`);
  }
}
// 85：判定行 = 插入式滚动窗（运营方指令「要有插帧的感觉；3 帧满了就自动
// 将最后一个删除」）——扫描到达判定帧号 ⇒ prepend 插入（最新判定在顶部，
// 诞生即 .on，复用 80 期 blockIn / valuePop / verdictStamp 三段入场动画）；
// 插入后 >= SCORE_WINDOW(3) ⇒ 删底部 .score-row（prepend 布局下「最后一个」
// = 最旧——与 84 期标签流「旧标签被替换」同一 FIFO 语义；数据仅 3 条判定 ⇒
// 满即删 f_002，终态 [f_150, f_062] 两条入选判定）。
// scoreSeen 追踪回退（judged 下降 ⇒ 整表重建，47 期「回退是跳回」词汇）。
const SCORE_WINDOW = 3;
let scoreSeen = 0;
const scoreRowHtml = (s) => `<div class="score-row ${s.reject ? "is-reject" : "is-keep"} on" data-frame="${s.frame}"><div class="sr-head"><span>${s.frame} · t=${s.t}s</span><span>${s.info}</span></div><div class="sr-bar"><i style="--w:${(s.info * 100).toFixed(1)}%"></i></div><div class="sr-verdict ${s.reject ? "reject" : "keep"}">${s.verdict}</div></div>`;
function litScoreRows(judged) {
  const host = byId("pipeScores");
  if (!host) return;
  const arrived = SCORES.filter((s) => judged >= +String(s.frame).slice(2)).length;
  if (arrived < scoreSeen) { host.innerHTML = ""; scoreSeen = 0; } // 回退：整表重建
  while (scoreSeen < arrived) {
    host.insertAdjacentHTML("afterbegin", scoreRowHtml(SCORES[scoreSeen]));
    scoreSeen++;
    const rows = host.querySelectorAll(".score-row");
    if (rows.length >= SCORE_WINDOW) rows[rows.length - 1].remove(); // 满窗删底部（最旧）
  }
}

// 逐帧判别扫描条：前 judged 个刻度转亮 + 扫描窗落位（1/179 宽，右缘到 100% 止）
function litJudgeStrip(judged) {
  const strip = byId("judgeStrip");
  if (!strip) return;
  strip.querySelectorAll(".jt").forEach((t, i) => t.classList.toggle("on", i < judged));
  const scan = byId("judgeScan");
  if (scan) scan.style.left = ((judged / SCORE_FRAMES) * (100 - 100 / SCORE_FRAMES)).toFixed(2) + "%";
}

/* ---------- s2 复位（resetPipeline 的第二路径，就地清零 = 46/49 词汇） ---------- */

export function resetCuts() {
  curProbe = "";
  const frame = byId("probeFrame");
  if (frame) { frame.removeAttribute("src"); frame.alt = "原片在这一秒的帧"; }
  // 81：判别扫描条复位（刻度全熄 + 扫描窗归零 + 徽章待命）
  byId("judgeStrip")?.querySelectorAll(".jt").forEach((t) => t.classList.remove("on"));
  if (byId("judgeScan")) byId("judgeScan").style.left = "0%";
  // 84：标签流复位（整表清空 + 窗口追踪归零）
  if (byId("judgeTags")) byId("judgeTags").innerHTML = "";
  judgedSeen = 0;
  // 85：判定行滚动窗复位（整表清空 + scoreSeen 归零）
  if (byId("pipeScores")) byId("pipeScores").innerHTML = "";
  scoreSeen = 0;
  if (byId("scoreBadge")) byId("scoreBadge").textContent = `已判 0 / ${SCORE_FRAMES} 帧`;
  byId("pipeCuts")?.querySelectorAll(".cut-cell").forEach((c) => c.classList.remove("on"));
  byId("pipeCuts")?.querySelectorAll(".cut-batch").forEach((b) => b.classList.remove("on"));
  byId("pipeTri")?.classList.remove("aligned");
  byId("pipeTriNote")?.setAttribute("hidden", "");
  const img = byId("probeImg");
  if (img) { img.removeAttribute("src"); img.alt = "该帧裁出的成图"; }
  if (byId("probeCap")) byId("probeCap").textContent = "等待落帧";
  if (byId("probeBadge")) byId("probeBadge").textContent = "t = —";
  if (byId("cutBadge")) byId("cutBadge").textContent = `0 / ${CUT_UNIQUE.length} 帧`;
}

// 探针 / 截图可观测面：state 的 probeT 读子（curProbe 为本模块私有可变态）
export function probeT() {
  return curProbe;
}

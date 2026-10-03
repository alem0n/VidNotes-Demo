// VidNotes library view: doc cards + document modal (APG dialog pattern).
// iteration 70（多页拆分 I 期）：卡片与弹层逐字不变；mReplay「回放生成轨迹」
// 跨页化（goPage + hashFragment，替代 switchView+openPlayer 同页路径）。
import { runs } from "../utils/state.js";
import { esc } from "../utils/utils.js";
import { goPage } from "../utils/pages.js";
import { hashFragment } from "../utils/hash.js";
import { wireLightbox, closeLightbox, dimAttrs } from "./evidence.js";
import { trapFocus, releaseFocus } from "../utils/focus-trap.js";

// the element that opened the doc modal; focus returns to it on close
// (guarded: innerHTML re-renders can leave it dangling)
let modalTrigger = null;

/* iteration 13: the traceability appendix for "每个数字都有出处". The times are
 * SOURCE-VIDEO instants (the original clip's own clock) — NOT the replay
 * timeline, which plays the process-moment stream — so they are labelled as
 * such and carry no click target of any kind. Rendered only when the additive
 * doc.sourceClaims exists and is non-empty; without it the modal is
 * byte-identical to before. Semantic per MDN/WCAG SC 1.3.1: a data <table>
 * with a sr-only <caption>, four <th scope="col"> column headers and a
 * <th scope="row"> row header per claim; the time cell is a <time> whose
 * datetime is a valid duration string (built at the product-build boundary).
 * The badge is colour + check mark + text (SC 1.4.1 G14); a row that is not
 * in the notes renders the plain cell text, so no class exists for a state
 * this dataset never carries (the dead-rule discipline of iteration 12).
 */
function claimsHtml(d) {
  const rows = Array.isArray(d.sourceClaims) ? d.sourceClaims : [];
  if (!rows.length) return "";
  return `<section class="m-claims" aria-labelledby="mcTitle">
    <h3 id="mcTitle">数字出处<span class="mc-count">${rows.length} 条</span></h3>
    <p class="mc-note">下列时刻均为<b>源视频内</b>时间（原片播放轴），与本站回放轨迹的时间轴不同；每条均标注是否已写入笔记。</p>
    <table class="mc-table">
      <caption class="sr-only">数字出处表：每条数字声称的数值、源视频内时间与是否已写入笔记</caption>
      <thead><tr><th scope="col">数字声称</th><th scope="col">数值</th><th scope="col">源视频时间</th><th scope="col">入笔记</th></tr></thead>
      <tbody>${rows.map((c) => `<tr>
        <th scope="row">${esc(c.claim)}</th>
        <td>${esc(c.value)}</td>
        <td>${c.sourceTime ? `<time${c.seconds != null ? ` datetime="PT${c.seconds}S"` : ""}>${esc(c.sourceTime)}</time>` : "—"}</td>
        <td>${c.inNotes ? '<span class="mc-in">✓ 已入笔记</span>' : "未入笔记"}</td>
      </tr>`).join("")}</tbody>
    </table>
  </section>`;
}

export function renderLibrary() {
  const grid = document.getElementById("docGrid");
  grid.innerHTML = runs.map((r, i) => `
    <div class="doc-card" data-run="${i}">
      <div class="doc-thumb">${esc(r.platform)} · ${esc(r.sourceTitle.split("·")[1] || r.title)} · ${Math.round(r.videoDurationSec / 60)} 分钟</div>
      <h3>${esc(r.doc.title)}</h3>
      <div class="doc-meta">${new Date(r.startedAt).toLocaleString("zh-CN")} · ${esc(r.mode)} 类型 · ${r.durationMs / 60000 | 0} 分钟生成</div>
      <div class="doc-facts">
        <span class="fact">${r.doc.pages} 页</span><span class="fact">${r.doc.cjk} 字</span>
        <span class="fact">${r.doc.figures} 张图</span><span class="fact">${r.doc.atoms} 个教学点</span>
        <span class="fact">${r.doc.claims} 条数字出处</span>
      </div>
      <div class="doc-status">✓ 已交付 · 可回放轨迹</div>
    </div>`).join("");
  // cards open the modal by mouse and by keyboard — focus return below only
  // helps keyboard users if the trigger itself is focusable
  grid.querySelectorAll(".doc-card").forEach((c) => {
    c.setAttribute("tabindex", "0");
    c.setAttribute("role", "button");
    c.setAttribute("aria-label", `打开《${runs[+c.dataset.run].doc.title}》笔记详情`);
    c.addEventListener("click", () => openDocModal(runs[+c.dataset.run], c));
    c.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      openDocModal(runs[+c.dataset.run], c);
    });
  });
  document.getElementById("libCount").textContent = runs.length;
}

export function openDocModal(run, trigger) {
  const d = run.doc;
  const pdf = run.moments.find((mm) => mm.kind === "done")?.evidence;
  document.getElementById("docModalBody").innerHTML = `
    <h2 id="docModalTitle">${esc(d.title)}</h2>
    <div class="m-sub">${esc(run.platform)} 源视频 · ${Math.round(run.videoDurationSec / 60)} 分钟 · 判为「${esc(d.mode)}」类型 · ${run.durationMs / 60000 | 0} 分钟自动生成</div>
    <div class="m-facts">
      <span class="fact">${d.pages} 页 A4</span><span class="fact">${d.cjk} 中文字</span>
      <span class="fact">${d.figures} 张教学图</span><span class="fact">${d.atoms} 个教学点</span><span class="fact">${d.claims} 条数字出处</span>
    </div>
    ${pdf ? `<div class="m-pages">${pdf.pages.map((p, i) =>
      `<img class="ev-page" data-lightbox="${p}" data-caption="第 ${i + 1} 页" src="${p}"${dimAttrs(pdf.imgSizes, p)} alt="第 ${i + 1} 页" loading="lazy" decoding="async">`).join("")}</div>` : ""}
    <div class="m-body">${esc(d.summary)}<br><br>章节：${pdf?.sections.map((s) => `${s.n}. ${esc(s.title)}`).join(" · ") || ""}<br><br>交付前通过全部 ${run.quality.length} 项自动验收。</div>
    ${claimsHtml(d)}
    <div class="m-actions">
      <button class="btn-primary" id="mReplay">回放生成轨迹</button>
      <button class="btn-ghost" id="mClose">关闭</button>
    </div>`;
  const modal = document.getElementById("docModal");
  modal.classList.remove("hidden");
  // APG dialog: while it is open, Tab / Shift+Tab cycle inside the dialog
  // (focus-trap.js); released on every close path below
  trapFocus(modal);
  modalTrigger = trigger && document.contains(trigger) ? trigger : null;
  wireLightbox(document.getElementById("docModalBody"));
  // APG dialog: focus moves into the dialog on open (its first control here)
  document.getElementById("docModalClose").focus();
  document.getElementById("mReplay").onclick = () =>
    // iteration 70：跨页桥——fragment 透传到 history 页，目标页 boot 的 reconcile
    // 打开该 run 的 player（旧 SPA 路径 = closeDocModal + switchView + openPlayer
    // + 聚焦 plPlay + 飞球；复盘登记：55 飞球与弹层释放随分页退役，落点焦点由
    // boot-history 的深链焦点口径承载）
    goPage("history", hashFragment("history", run.id));
  document.getElementById("mClose").onclick = () => closeDocModal();
}
function closeDocModal(returnFocus = true) {
  const modal = document.getElementById("docModal");
  // release the Tab cycle first: an already-hidden modal has already released
  // it (no-op here), a visible one unregisters before it disappears
  releaseFocus(modal);
  if (modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  // APG dialog: on close, focus returns to the invoking element if it still exists
  const el = modalTrigger;
  modalTrigger = null;
  if (returnFocus && el && document.contains(el)) el.focus();
}
// iteration 70：模块级监听在多页形态下随页面求值（经典束在每页都执行模块
// 顶层代码），故对可能缺失的锚点用可选链守卫——library 页上它们恒在、行为
// 逐字不变；无弹层的页上零调用（监听注册本身是 null-safe 的空操作）。
document.querySelector(".modal-backdrop")?.addEventListener("click", () => closeDocModal());
document.getElementById("docModalClose")?.addEventListener("click", () => closeDocModal());
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const lb = document.getElementById("lightbox");
  if (!lb) return; // 本页无 lightbox（convert/source 页：Escape 无覆盖层可关）
  // APG dialog stacking: the lightbox (z-index 300) sits above this modal
  // (z-index 200), so while it is open Escape dismisses only it — the doc modal
  // stays put; the next Escape then closes the modal.
  if (lb.classList.contains("hidden")) closeDocModal();
  else closeLightbox();
});

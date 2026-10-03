// boot-library.js — 文档库页 boot（iteration 70，多页拆分 I 期）。
// renderLibrary（卡片 + 计数徽标）+ ?doc=<runId> 弹层深开（run.html「查看讲义」
// 的跨页等价落点：直达该 run 的笔记弹层，内容可达性不降级）。
import { runs } from "../utils/state.js";
import { renderLibrary, openDocModal } from "./library.js";
import { applyHashAtBoot } from "./nav.js";

export function bootLibrary() {
  renderLibrary();
  // 深链落点先于弹层深开：若 fragment 指向他页（#history/<run> 等），reconcile
  // 会替换导航走，本页的弹层深开就不必再跑
  applyHashAtBoot();
  const doc = new URLSearchParams(location.search).get("doc");
  if (!doc) return;
  const run = runs.find((r) => r.id === doc);
  if (run) openDocModal(run); // 越界/未知 doc 静默忽略（与深链回落同口径）
}

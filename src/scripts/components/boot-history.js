// boot-history.js — 历史轨迹页 boot（iteration 70，多页拆分 I 期）。
// SPA 形态 main.js 的 player 接线迁移至此（plPlay 双态钮 / plSpeeds 五档 /
// plScrub 拖拽 + 键盘步进 / lightbox 关闭），深链恢复由 applyHashAtBoot 承担
// （#history/<run>/@<ms> 的 player + 位置分量，reconcile 幂等、断点存活）。
import { renderRunList, player, play, pause, setFactor, hardSeek, updatePlayer } from "./player.js";
import { applyHashAtBoot } from "./nav.js";

export function bootHistory() {
  renderRunList();
  // 深链恢复（第 40 次）：runList 先渲染（openPlayer 的 .run-item 选中态需要它）
  applyHashAtBoot();

  document.getElementById("plPlay").addEventListener("click", () => {
    if (player) { if (player.presenter.playing) pause(); else play(); }
  });
  document.querySelectorAll("#plSpeeds button").forEach((b) => b.addEventListener("click", () => setFactor(+b.dataset.speed)));
  const scrub = document.getElementById("plScrub");
  const scrubRel = (ev) => {
    const r = scrub.getBoundingClientRect();
    return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * player.total;
  };
  let scrubbing = false, wasPlaying = false;
  scrub.addEventListener("click", (ev) => {
    if (!player) return;
    hardSeek(scrubRel(ev));
  });
  scrub.addEventListener("mousedown", (ev) => {
    if (!player) return;
    scrubbing = true;
    wasPlaying = player.presenter.playing;
    pause();
    updatePlayer(scrubRel(ev));
  });
  window.addEventListener("mousemove", (ev) => { if (scrubbing && player) updatePlayer(scrubRel(ev)); });
  window.addEventListener("mouseup", () => {
    if (scrubbing) { scrubbing = false; if (player && wasPlaying) play(); }
  });
  // iteration 75: #lbClose / .lb-backdrop 点击关闭改由 evidence.js 的
  // openLightbox 集中接线（lbBindClose，一次式全页通用），本页的重复接线删除
  // （closeLightbox 幂等，历史两路并存无害但属冗实现）。

  // 焦点口径跨页承载（iteration 55 的 mReplay / convert.js 的 btnReplayRun 落点）：
  // 深链携带 run 分量时（跨页桥的唯一形态：#history/<run>[/@ms]）落点聚焦
  // #plPlay——openPlayer 已使其可聚焦；纯视图地址（#history / 空）不夺焦点
  if (location.hash.includes("/") && player) document.getElementById("plPlay").focus({ preventScroll: true });
}

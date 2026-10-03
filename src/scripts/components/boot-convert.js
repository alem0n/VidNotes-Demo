// boot-convert.js — 落地页 boot（iteration 70，多页拆分 I 期）。
// SPA 形态的 main.js 表单接线迁移至此：submit → 校验（第 16 次守卫，空链接就地
// 提示、不导航）→ 通过则跨页交接到 run.html（URL search params 携带演示输入与
// 节奏档）。分体版/dist 版同一接线。
import { convertHandoff, clearConvertFeedback } from "./convert.js";
import { applyHashAtBoot } from "./nav.js";

export function bootConvert() {
  const form = document.getElementById("convertForm");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const handoff = convertHandoff(
      document.getElementById("urlInput").value,
      document.getElementById("modeSelect").value,
      document.getElementById("demoPace").value,
    );
    // 校验被拒（空链接）：就地反馈、零导航、零滚动（第 16 次口径逐字不变）
    if (handoff) location.assign(handoff);
  });
  // 表单的拒绝状态不活过用户的下一次按键（ARIA19 口径逐字不变）
  document.getElementById("urlInput").addEventListener("input", clearConvertFeedback);
  // 深链落点：convert 页是默认视图，纯视图地址零操作；hash 指向他页时
  // （#library / #history/<run>）由 reconcile 替换导航过去，fragment
  // 原样透传给目标页 boot 消费——整个 fragment 家族的跨页可达性入口
  applyHashAtBoot();
}

// boot-run.js — 演示页 boot（iteration 70，多页拆分 I 期）。
// index.html（convert 页，78 期改名 = 提交转换地址的首页）的表单经
// ?url=&mode=&pace= 交接到此：参数校验（非法值回落 auto/brisk——与深链家族
// 「非法/越界静默回落」同口径；缺 url 则回入口 index.html）→ startConvert 启动演示（pacer / 调速 / 暂停 / pushIn 插针 /
// cap 20 逐字不变，宿主从 #view-convert 换成本页的 #runPanel；74：#cvMsg
// 通告线与交付卡挣得拍随 artifacts-check 组件退役）。
// 重复提交终止旧演示（第 16 次守卫）的跨页等价 = 文档卸载销毁旧计时器链：
// 新文档的演示是唯一活演示，同文档双演示竞态结构性不存在。
import { startConvert } from "./convert.js";
import { applyHashAtBoot } from "./nav.js";

// 与 convertHandoff 的两份白名单同源（交接的写与读只能是这一对表）。命名与
// convert.js 的 MODES/PACES（数组）分立：经典束是单一作用域，顶层名须唯一。
const VALID_MODES = new Set(["auto", "conceptual-talk", "technical-slide"]);
const VALID_PACES = new Set(["brisk", "instant", "immersive"]);

export function bootRun() {
  const q = new URLSearchParams(location.search);
  const url = (q.get("url") || "").trim();
  if (!url) {
    // 缺交接参数（手敲 URL / 书签直达）→ 回入口：演示没有输入就没有演示
    location.replace("index.html");
    return;
  }
  const mode = VALID_MODES.has(q.get("mode")) ? q.get("mode") : "auto";
  const pace = VALID_PACES.has(q.get("pace")) ? q.get("pace") : "brisk";
  startConvert(url, mode, pace);
  // 深链落点：run 页的视图归属 = convert，纯视图地址零操作；fragment 指向他页
  // 时由 reconcile 替换导航（与 boot-convert 同入口，一处实现）
  applyHashAtBoot();
  // iteration 66 的焦点口径跨页承载：新场景的 AT 接收点 = 演示运输钮
  // （#btnPauseRun，startConvert 已使其可见——同 SPA 形态 heroExit 的落点）
  document.getElementById("btnPauseRun")?.focus({ preventScroll: true });
}

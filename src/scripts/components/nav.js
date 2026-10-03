// nav.js — URL ↔ 应用状态双向接线（iteration 40；iteration 70 多页拆分 I 期 页化）。
//
// 分层不变（本仓模块环红线）：hash.js 是无应用依赖的水暖层；player.js 只 import
// hash.js 的写原语；本模块是「调用方」层级——import state.js 与 player.js 的既有
//导出，与 convert.js/library.js/boot-*.js 同级。图无环：
//   hash → （无依赖）； pages → （无依赖）； state → hash； player → state/hash/pages；
//   nav → state/player/hash/pages。
//
// **URL → 应用**只复用既有函数（views 的 a11y 初态由页壳承载、player 走 openPlayer
// 含冻结-续播断点语义、位置走 hardSeek），不写第二份同步代码。**幂等**：目标
// player 已就位则零 DOM 操作——浏览器后退回到「player 已开」时，冻结断点
// （iteration 24/26）逐字节存活，不重开、不 hardSeek。
//
// iteration 70 的映射规则：fragment 的 view 分量决定**住在哪一页**——
//   - 目标视图的页 == 当前页（run 页的视图归属 = convert）⇒ 就在本页应用
//     （history 页的 run/rel 分量、纯视图地址零操作）；
//   - 不符 ⇒ location.replace(目标页 + 同一 fragment)：fragment 原样带到目标页
//     boot 再由本函数消费 ⇒ 整个深链家族（#library/#history/<run>/@ms…）
//     的跨页可达性只此一条路径，无第二份语法。
// 非法/越界 hash 静默回落默认视图（convert——40 次任务口径：不抛错、不循环）。
import { runs } from "../utils/state.js";
import { player, openPlayer, hardSeek } from "./player.js";
import { parseHash, withNavApply } from "../utils/hash.js";
import { PAGES, pageView } from "../utils/pages.js";

// reconcile：把 location.hash 描述的目标态与当前应用态对齐（唯一入口）
function reconcileHash() {
  const raw = location.hash;
  // 空散列 = 页身份即地址（直接打开 library.html 本就是寻址文档库）：无深链信息可
  // 应用、无重定向目标——就地零操作。只有散列显式命名了别的视图才谈跨页跳转。
  const st = raw === "" ? { view: pageView() } : (parseHash(raw) || { view: "convert" });
  let view = st.view;
  if (st.runId && !runs.some((r) => r.id === st.runId)) view = "convert"; // 越界 run → 默认视图
  if (raw !== "" && PAGES[view] !== PAGES[pageView()]) {
    // 落点在别的页：fragment 原样带到目标页（越界/非法散列带它回转换页= 静默回落）
    location.replace(PAGES[view] + raw);
    return;
  }
  if (view !== "history" || !st.runId) return;  // 视图级地址：player 状态不动（无关闭语义）
  const run = runs.find((r) => r.id === st.runId);
  if (!(player && player.run === run)) openPlayer(run, { rel: st.rel ?? 0 });
  else if (st.rel != null && st.rel !== player.rel) hardSeek(st.rel); // 位置深链 URL→app
  // 否则零操作：视图与 player 均已就位（含 player 已开但 hash 无 @rel：断点存活）
}

// boot 显式应用：页面初载时 hashchange 不触发（且即便触发，幂等检查也会吸收）。
// 调用点：各 boot-<page>.js 在自身渲染之后（此时该页 DOM 已就绪、runs 已装，
// location.hash 可直接恢复「player（+ 位置）」或触发跨页替换导航）
export function applyHashAtBoot() { withNavApply(reconcileHash); }

// 浏览器后退/前进、地址栏手改、书签、#链接：全部经此一条路径到 reconcile
window.addEventListener("hashchange", () => withNavApply(reconcileHash));

// 迭代 40 的 URL 重寻址（回到 history 且 player 已开）在多页形态下由 player.js
// 的既有 navWrite 写点与 location 导航承载：跨页桥（goPage）把 fragment 写进目标
// URL，本页 boot 消费它；同页内的离散写（openPlayer push / 位置 replace）路径不变。

// hash.js — URL 深链水暖层（iteration 40）：fragment 解析 / 构串 / 写入 / 重入守卫。
//
// 纯 URL 语义，零应用依赖（不 import state/player —— 那是 nav.js 的层级；state.js /
// player.js 只把本模块当写原语用，方向与既有 utils.js 相同）。寻址方案：
//   #convert（= 空 hash，默认视图）/ #library / #history
//   #history/<runId>            深链到「该 run 的回放器已打开」
//   #history/<runId>/@<relMs>   再深链到「回放位置」（只由离散点以 replace 写入）
//
// 写路径用 history.pushState / replaceState：MDN 明示 pushState/replaceState 永不触发
// hashchange（"pushState() never causes a hashchange event to be fired, even if the new
// URL differs from the old URL only in its hash"），故「应用写 hash → hashchange 回流」
// 的事件结构性不存在；file:// 或隐私模式下的历史 SecurityError（WebKit bug 183028 /
// Chromium 41060861 的旧形态）用 try/catch 兜底为 location.hash 赋值——片段导航在任何
// 协议下都合法，其回流的 hashchange 由 reconcile 的幂等检查（目标态 == 当前态 ⇒ 零操作）
// 与 withNavApply 守卫吸收，仍不形成回路。

// 三个视图的合法 token（与 .view 的 id 后缀一一对应：view-<name>）。
// iteration 77：第四个 token "source"（原片回放面，第 63 次追加）随原片功能整体
// 退场而移除——旧 #source 地址此后与一切未知视图同回落（parseHash → null →
// nav.js 静默回落默认视图 convert），不为它留 compat shim（0.1 原则 8）。
export const NAV_VIEWS = ["convert", "library", "history"];

// 解析 fragment。返回 { view } / { view, runId } / { view, runId, rel }；
// 结构非法（未知视图、非 history 视图带 run、多余段、非 @整数 rel）返回 null，
// 调用方（nav.js）按任务口径静默回落默认视图。空 hash = 默认视图 convert。
export function parseHash(hash = location.hash) {
  const h = (hash || "").replace(/^#/, "");
  if (h === "") return { view: "convert" };
  const parts = h.split("/");
  const view = parts[0];
  if (!NAV_VIEWS.includes(view)) return null;
  if (parts.length === 1) return { view };
  if (view !== "history") return null; // 只有 history 视图携带 run 深链分量
  const runId = parts[1];
  if (!runId || runId.includes("@")) return null;
  if (parts.length === 2) return { view, runId };
  if (parts.length !== 3) return null;
  if (!/^@\d+$/.test(parts[2])) return null;
  return { view, runId, rel: Number(parts[2].slice(1)) };
}

// 唯一构串处（写与读的字符串格式只能在这里相遇）
export function hashFragment(view, runId, rel) {
  let f = "#" + view;
  if (runId != null) {
    f += "/" + runId;
    if (rel != null) f += "/@" + Math.round(rel); // ms 整数；解析端只认 @\d+
  }
  return f;
}

// ---- 应用 → URL：离散导航写 -------------------------------------------------
// 视图切换与打开 player 是离散导航事件（push：产生可后退的一条条目）；位置深链是 replace
// （不增条目）。同一同步任务内的多次写**合并**：微任务刷出取最终 fragment，且「任一次写是
// push 则整体 push」——convert.js 的 btnReplayRun / library.js 的 mReplay 序列
// （switchView("history") + openPlayer(run) 同任务）因此恰好一条历史条目，而非两条。
// 离散用户事件天然隔着宏任务边界，不会被错误合并。
let pending = null;       // { fragment, push }
let flushQueued = false;
let applying = 0;         // >0 = 正在 URL→应用（reconcile/boot），期间禁止再写

export function navWrite(fragment, push) {
  if (applying > 0) return; // 回流守卫①：reconcile 期间的自写被丢弃（防冗余条目与自激）
  pending = pending ? { fragment, push: pending.push || push } : { fragment, push };
  if (!flushQueued) { flushQueued = true; queueMicrotask(flush); }
}

function flush() {
  flushQueued = false;
  const p = pending;
  pending = null;
  if (!p || applying > 0 || location.hash === p.fragment) return; // 幂等：URL 已是目标串
  try {
    if (p.push) history.pushState(null, "", p.fragment);
    else history.replaceState(null, "", p.fragment);
  } catch {
    // 兜底（pushState/replaceState 不可用的浏览器或协议）：片段导航改 hash，会触发
    // hashchange → reconcile 落到与当前应用态相同的目标 → 幂等零操作 → 无回路
    location.hash = p.fragment;
  }
}

// ---- URL → 应用期间的重入守卫 -------------------------------------------------
// boot 的 applyHashAtBoot 与 hashchange 监听都包在这一层里：期间 switchView/openPlayer/
// hardSeek 触发的 navWrite 全部早退（状态本就来自 URL，写回既冗余又会凭空多出条目）。
export function withNavApply(fn) {
  applying++;
  try { return fn(); } finally { applying--; }
}

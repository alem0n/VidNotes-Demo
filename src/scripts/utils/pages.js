// pages.js — 页 ↔ 视图映射与跨页导航原语（iteration 70，多页拆分 I 期）。
//
// 分层（本仓模块环红线不动）：本模块是「水暖层」的无应用依赖表——只 import 零产
// 品模块。视图 token 与 hash.js 的 NAV_VIEWS 一一对应（fragment 家族不变：视图
// 寻址仍由 hash.js 解析；本模块只回答「这个视图住在哪个 html 文件」）。
//
// run 页不是视图：它由 convert 表单经 URL 交接参数到达（无 fragment 地址），其
// 视图归属 = convert（顶栏 tab 归属同理：演示是转换流的延续）。故视图→页的映射
// 是函数，页→视图是表（run 归 convert）。
// 第 77 次：原片回放（source 视图 + source.html）随原片功能整体退场，映射回到三视图。

// 视图 → 页文件（源页与 dist 页同名；相对路径使 4 页 + 共享束相对自洽）
export const PAGES = {
  convert: "index.html", // 78 期：convert 页文件名改 index.html（首页）；视图 token 不变
  library: "library.html",
  history: "history.html",
};

// 页 → 视图（body[data-page] 的身份 → 它承载的视图）
const PAGE_TO_VIEW = {
  convert: "convert",
  run: "convert", // 演示页：转换流的延续，视图归属 convert
  library: "library",
  history: "history",
};

// 视图 → 页（未知视图抛错：跨页调用方（convert.js / library.js）的错配显式失败，
// 而不是静默落到一个错误页面——与 hash.js 的「非法值显式失败」同口径）
export function pageFor(view) {
  const p = PAGES[view];
  if (!p) throw new Error(`pages.js: unknown view "${view}" (known: ${Object.keys(PAGES).join(", ")})`);
  return p;
}

// 当前文档承载的视图（页身份 = body[data-page]；缺失回落 convert）
export function pageView() {
  return PAGE_TO_VIEW[document.body.dataset.page] || "convert";
}

// 跨页离散导航（替代 SPA 形态的 switchView 路径）：一次文档导航 = 一条历史条
// 目（与 SPA 的「视图切换写一条 push」语义对齐；fragment 透传给目标页 boot 消费）
export function goPage(view, fragment) {
  location.assign(pageFor(view) + (fragment || ""));
}

// run 页「查看讲义」的交接形态：library 页 + ?doc=<runId> 弹层深开。
// 选 search param 而非 fragment：弹层深开是页级关注点，fragment 家族保持
// history-only 语义（hash.js 的 parseHash 语法逐字不变）
export function goDoc(runId) {
  location.assign(PAGES.library + "?doc=" + encodeURIComponent(runId));
}

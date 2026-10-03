// inject-convert.js — 落地页（index.html，78 期由 convert.html 改名）契约 II 期）。
//
// 承载旧契约的以下键族（迁移表见 Explore_71 §3）：
//   - 表单结构/活动区域（旧 acInit/lmMain/lmNavName/lmHeader/lmFooter/viewN/ahInit
//     子集 → cv*）
//   - 第 16 次空链接守卫（逐字：就地 aria-invalid + #cvMsg 通告 + 零导航 +
//     下一次按键清除拒绝态）
//   - ct* 计算样式对比审计（真实前/背景对，AA 4.5）
//   - dr* 原子采集 + CSSOM 规则表（页内 dump，驱动侧跨页并集聚合死规则）
//   - nb* 媒体查询存在性 + 桌面 1280 不落入窄块
//   - 顶栏锚点化（70 次 I 期）：锚点导航的原生可达性 + aria-current 唯一
//
// 不在本页测的（登记分工）：表单提交后的跨页交接（location.assign）原由
// tools/shot/smoke-pages.py 的端到端冒烟承载；该截图/冒烟工具链已整体删除，
// 跨页交接断言随之退场（该导航会卸载本文档，探针续体不可存活——70 次
// §3.7-II-1 的分工记录）；run 侧的参数校验/回落由 run-boot 的
// run-handoff / run-missing 标本承载。
const booted = await waitBoot("convert");
out.push("cvBoot=" + booted);
await seedData();
installAtomObserver();

// (1) 结构与语义
const form = document.getElementById("convertForm");
const cvMsg = document.getElementById("cvMsg");
out.push("cvForm=" + (!!form && form.tagName === "FORM"));
out.push("cvMsgLive=" + (cvMsg?.getAttribute("role") === "status" &&
  cvMsg?.getAttribute("aria-live") === "polite" && cvMsg?.getAttribute("aria-atomic") === "true"));
out.push("cvMsgEmpty=" + (cvMsg?.textContent === "")); // :empty 折叠出口布局（16 次口径）
out.push("cvControls=" + (document.querySelectorAll("#convertForm input, #convertForm select").length === 3 &&
  !!document.querySelector("#convertForm button[type=submit]")));
out.push("cvHero=" + (!!document.querySelector(".convert-hero h1") && !!document.querySelector(".hero-sub") &&
  document.querySelectorAll(".trust-row span").length === 3));
out.push("cvAction=" + (document.querySelector("#convertForm button[type=submit]")?.textContent.includes("开始转换")));
// 三个可选项各自有非空正文选项（可寻址的值），URL 输入框带占位提示
out.push("cvOpts=" + ([...document.querySelectorAll("#modeSelect option, #demoPace option")].length === 6 &&
  [...document.querySelectorAll("#modeSelect option, #demoPace option")].every((o) => o.value && o.textContent.trim()) &&
  (document.getElementById("urlInput")?.placeholder || "").length > 4));

// (2) 顶栏锚点化（70 次 I 期）：锚点 = 原生键盘可达 + href 深链；
//     aria-current="page" 全页恰好一个且指向 index.html（77 期原片页退场：3 项导航）
const navs = () => [...document.querySelectorAll(".nav-item")];
out.push("cvNavAnchor=" + (navs().length === 3 && navs().every((n) => n.tagName === "A" && /\.(html)$/i.test(n.getAttribute("href") || ""))));
out.push("cvNavCurrent=" + (navs().filter((n) => n.getAttribute("aria-current") === "page").length === 1 &&
  navs().find((n) => n.getAttribute("aria-current") === "page")?.getAttribute("href") === "index.html" &&
  navs().find((n) => n.getAttribute("aria-current") === "page")?.classList.contains("active")));
out.push("cvNavNames=" + (navs().map((n) => n.textContent.trim().replace(/\s+/g, "")).join("/") ));
out.push("cvNavLabel=" + (navs().every((n) => (n.getAttribute("aria-label") || n.textContent.trim()).length > 0)));
out.push("cvNavAria=" + (document.querySelector("nav.nav")?.getAttribute("aria-label") === "视图导航"));

// (3) 第 16 次空链接守卫（逐字不变：就地提示、零导航、aria-invalid、
//     下一次输入即清除拒绝态）
const urlInput = document.getElementById("urlInput");
const guardHref = location.href;
urlInput.value = "";
form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
await sleep(60);
out.push("cvGuardMsg=" + (cvMsg.textContent.includes("请先粘贴视频链接")));
out.push("cvGuardNoNav=" + (location.href === guardHref)); // 零导航（跨页前的同文档守卫）
out.push("cvGuardAria=" + (urlInput.getAttribute("aria-invalid") === "true" && urlInput.getAttribute("aria-describedby") === "cvMsg"));
urlInput.dispatchEvent(new Event("input", { bubbles: true }));
await sleep(40);
out.push("cvGuardClear=" + (urlInput.getAttribute("aria-invalid") === null && cvMsg.textContent === ""));
// 重复空提交必须再通告（同名内容靠尾空格 nudge 再宣读——player.js announce 的同一解法）
form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
await sleep(40);
out.push("cvGuardRepeat=" + (cvMsg.textContent.includes("请先粘贴视频链接")));
urlInput.dispatchEvent(new Event("input", { bubbles: true }));

// (4) 页身的 footer/页架（信息可发现性：三栏文案在每页存活）
out.push("lmFooter=" + (document.querySelectorAll(".footer-cols > div").length === 3 &&
  [...document.querySelectorAll(".footer-cols h3")].every((h) => h.textContent.trim())));
out.push("lmMain=" + (!!document.querySelector("main#main") && !!document.querySelector("header")));

// (5) 视图语义（页化：恰一个 .view，active 且不隐藏——vs1..vs4 退役后
//     的等价读数，见 Explore_71 §1.4）
out.push("cvView=" + (hidState("convert") === "ok"));

// (6) ct* 分组对比审计（第 20 次家族，页级子表：本页活元素的最小对比 / 死
//     选择器登记；旧契约在 SPA 一页扫三视图，多页后每页带自己的子表）
emitContrast({
  ink3: [".brand-text em", ".pill", ".footer p"],
  ink2: [".hero-sub", ".nav-item", ".mode-select", ".count"],
  ink: [".convert-hero h1", ".url-input"],
  accent: [".nav-item.active"],
  green: [".trust-row"],
  white: [".btn-primary", ".logo"],
});
emitPlaceholder("#urlInput");                       // SC 1.4.3 明示覆盖占位符
emitLineS(["#urlInput", "#modeSelect", "#demoPace"]); // SC 1.4.11 控件边框 3:1

// (7) nb* 桌面读数（规则存在性 nbRule640/nbRule980/srOnlyRule 是 CSS 结构事实，
//     页级 CSSOM 访问在 file:// origin=null 下被同源检查阻断——本轮实证——故
//     规则面迁移到 run-main 的驱动侧解析 dist/app.css；页内只量几何）
const cfBox = document.querySelector(".convert-form").getBoundingClientRect();
out.push("nbDesk=" + (cfBox.width > 640)); // 1280 视口下窄块未生效（表单不收窄）
out.push("nbDeskN=" + Math.round(cfBox.width) + "of" + window.innerWidth);
out.push("nbOvf=" + (document.documentElement.scrollWidth <= window.innerWidth &&
  document.body.scrollWidth <= window.innerWidth)); // 零横向溢出（桌面端）

// (8) dr* 页内原子采集落盘（驱动侧跨页并集聚合死规则）
dumpProbe("convert");

finish();

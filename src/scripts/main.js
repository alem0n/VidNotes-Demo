// VidNotes app entry（iteration 70，多页拆分 I 期）：页调度器。
//
// SPA 形态的 main.js 集中接线所有视图；多页形态下每页是一个文档，本入口退化为
// 调度器——数据装载与顶栏计数先行，然后按 <body data-page> 执行对应 boot 模块。
// 既有接线逐字迁移至 boot-<page>.js（表单校验/交接、演示 + 跨页链接、弹层 + ?doc
// 深开、player + 深链恢复）。state.js 的视图渲染与 hash.js 的深链
// 水暖层零改。http 分体版（模块图）与 dist 经典束共用同一入口与同一调度逻辑。
// 第 77 次：原片回放页（boot-source.js）随原片功能整体退场，BOOTS 回到四页。
import { loadData, seedRuns, runs } from "./utils/state.js";
import { bootConvert } from "./components/boot-convert.js";
import { bootRun } from "./components/boot-run.js";
import { bootLibrary } from "./components/boot-library.js";
import { bootHistory } from "./components/boot-history.js";

const BOOTS = {
  convert: bootConvert,
  run: bootRun,
  library: bootLibrary,
  history: bootHistory,
};

(async () => {
  const data = await loadData();
  seedRuns(data);
  // 顶栏计数徽标：SPA 形态由 renderLibrary/renderRunList 写入；多页形态下转换/
  // 演示页不跑那两个渲染器，徽标由调度器统一写（元素缺失跳过——页壳标记
  // 的初值 1 与数据 runs.length 一致，是 boot 前的渐进增强值）
  for (const id of ["libCount", "histCount"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(runs.length);
  }
  const page = document.body.dataset.page;
  BOOTS[page]?.();
})();

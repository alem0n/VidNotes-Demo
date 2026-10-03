// pipeline-data.js — 管道车间的**轨迹数据常量层**（第 65 次自 pipeline.js 拆出，结构轮）。
//
// 单一职责：场景内容的**真实数值集**（逐条出处 = 会话记录行号或 materials/ 文件，
// 详见 docs/Explore_64.md §1）+ 场景渲染共用的**微助手**。零 import ⇒ 在打包器
// （build-inlined.js 的依赖拓扑里）是最底层模块 ⇒ 永不循环依赖。
//
// 第 82 次重锚（数据源整体替换为 black_hat_usa_2026）：全部常量改述新会话真值——
// 下载端点改 VP9/1920×1080/678 MB；字幕由「4 轨含手动 CC」改「单一 ASR 自动轨」；
// s2 由「三批 35 候选 + talking_head 误报替换」改「179 帧密集样本 + OCR 选图 +
// 20 幅成图 + bands.json 被覆写重裁」——选图路线差异见 docs/Explore_82.md §1。
// 帧名约定变更：旧「候选名 cand/*」→ 新「密集样本帧名 frames/f_NNN」（t = 15×NNN，
// 与 fps=1/15 抽帧同源）；candImg 随之改 frameImg 落 assets/frames/。
//
// 为什么微助手（byId / clamp01 / mmss / frameImg / litN）也住在本模块：build-inlined.js
// 把全部模块拼接进**同一个作用域**（遮罩扫描剥离 import/export 后按拓扑序拼接），
// 两个模块各声明同名 const/function 会直接 SyntaxError；把数据与共享微助手同住一处 =
// 单一声明点，消费方（pipeline-cuts.js / pipeline.js）一律 import，拓扑无环。
// 它们不进 utils.js：utils.js 是「无 DOM 依赖的纯函数工具」（byId / litN 是 DOM 写入），
// 而本层数值的格式（mmss / frame 路径）与渲染原语只服务管道车间。

// L19/L25 下载阶（yt-dlp 元数据探测 → 自动字幕 → 视频流后台下载 → 封面 → SSL 重试等待）
export const DOWNLOAD = {
  steps: ["解析网页与元数据", "下载自动字幕轨", "下载视频流（后台）", "获取封面图", "等待下载完成（SSL 重试）"],
  // 端点事实：L101/102 结果 / materials/metadata.json（678 MB 原片真身留 materials/；
  // 83 期产物不再含视频字节——无播放功能，探头用 assets/frames 同秒帧图，见
  // pack-assets.sh 与 pipeline-cuts.js 头注释）
  endpoint: { bytes: "710 538 461 B", dur: "2686.581 s", codec: "VP9", res: "1920×1080" },
  cover: "assets/cover.jpg",
};

// L25 下载的可用字幕轨（全部为 ASR 自动字幕，无手动 CC）+ 两条派生轨：
// audio.srt = subs.en-orig.deov（去重叠归档，675 条）；clean = 用户要求的附录清洗版
// （L126–164 三次重写，去口水词/修 ASR 近音词/重建大小写，233 段 13 节）
export const SUBTRACKS = [
  { tag: "en-orig", zh: "英文自动字幕", line: "ASR 自动轨（无手动 CC）" },
  { tag: "audio", zh: "去重叠归档", line: "audio.srt · 675 条" },
  { tag: "clean", zh: "附录清洗版", line: "transcript_clean.srt · 233 段" },
];
export const SUB_HEALTH = "英文字幕 675 条 · 覆盖率 0.9987 · 唯一可用轨 = 英文 ASR 自动字幕（无手动 CC）";
export const SUB_FINAL = "去重叠归档 audio.srt（L39–43）· 清洗版 233 段（用户要求文末附录，L126–164）";

// L102 单批 ffmpeg `fps=1/15` 密集抽帧 → 179 帧样本（frames/f_001…f_179）；
// L112–176 全片 OCR（rapidocr，107 条）定位幻灯片 → L189–207 裁 19 幅成图（OCR 三向
// 验证通过）+ L223 补裁 1 幅（达 verify_notes 的 20 文件门槛建）= 20 张唯一成图源帧。
// 去重口径 = **帧名**（20 帧唯一）；裁剪统一去 bands.json 的 155px 底部导航条。
// 事故点：bands.json 被 ocr_hardsubs detect --geometry 覆写（L197）→ 重新测量再重裁。
export const CUT_BATCHES = [
  { line: "L189–207", name: "批一 · OCR 选图裁剪", calls: 19, names: ["f_062", "f_065", "f_092", "f_096", "f_106", "f_110", "f_119", "f_125", "f_127", "f_130", "f_133", "f_140", "f_144", "f_148", "f_150", "f_159", "f_165", "f_167", "f_172"] },
  { line: "L223", name: "批二 · 补 1 幅达 20 门槛建", calls: 1, names: ["f_111"] },
];
// 20 唯一帧名（批序拼接；无重复名）
export const CUT_UNIQUE = CUT_BATCHES.flatMap((b) => b.names);
// 84 期：判别扫描的「入选」判定源——标签流中落在该集合的帧名转绿
// （判过 ≠ 入选：179 帧全部判过，20 帧入选教学图）
export const PICK_SET = new Set(CUT_UNIQUE);
// bands 覆写注记的派发点：首个源帧落格即揭示（事故发生在全部最终裁剪之前，L197）
export const CUT_NOTE_AT = 1;
export const CUT_OVERWRITE = "bands.json 被 ocr_hardsubs detect --geometry 覆写 → 重新测量底部导航条再裁剪（L197）";
export const CUT_NOTE = "L102 密集抽帧（fps=1/15）→ 179 帧样本；L112–176 全片 OCR 107 条 → 选 20 幅幻灯片裁剪成图";

// 帧评分真值（materials/frame_scores.json，L106–108 评分）：talking_head = 0（纯幻灯片
// 演讲，无一帧人物特写）——评分门全部通过，成图选择由 OCR 文本决定。
// f_002 = 第 2 帧（t=30s）蒙太奇高动；f_062 = fig_01 源帧；f_150 = fig_15 源帧。
// info 为 frame_filter 的画面信息量度量（并非选图依据——选图 = OCR，见 CUT_NOTE）。
export const SCORE_FRAMES = 179; // L102 密集抽帧的 179 帧样本数（frames/f_001…f_179；评分逐帧过堂的对象基数，与 CUT_NOTE 同源）
export const SCORES = [
  { frame: "f_002", t: 30, info: 0.4506, reject: false, verdict: "通过 · 非人物特写" },
  { frame: "f_062", t: 930, info: 0.1308, reject: false, verdict: "通过 · 入选教学图 fig_01（OCR）" },
  { frame: "f_150", t: 2250, info: 0.4684, reject: false, verdict: "通过 · 入选教学图 fig_15（OCR）" },
];
export const TRI_TRACKS = ["时间轴", "字幕文本", "画面文字（OCR）"]; // L199 verify_figures 三向核验
export const TRI_NOTE = "20 幅教学图全部通过三向核验（L207 首批 19 幅 + L223 补 1 幅）";

// L118 探测口径 → L181–187 写入 numerical_claims.tsv（27 条全部带机器时间且全部进正文）
export const CLAIMS = [
  ["til agents do 100% of your work", "100%", "40:23"],
  ["ing by eating 90% of your work", "90%", "40:29"],
  ["CTF 约 30 年前在 DEF CON 诞生", "30年前", "04:54"],
  ["CTF 起源于约 31 年前的一场网络攻防战", "31年前", "05:07"],
  ["Yan 8 岁时随家人逃离苏联", "8岁", "06:49"],
  ["Shellphish 用 angr 统治全球 CTF 约两年", "2年", "07:35"],
  ["angr 被用于超过 1000 个研究、学术与产品工具", "1000", "07:48"],
  ["分析能力从 8 个程序扩展到 800 个", "8 800", "15:25"],
  ["HarmonyOS 部署在 10 亿台设备上", "10亿", "25:03"],
  ["Mythos 在 Linux 内核发现 479 个漏洞（华盛顿邮报 6 月报道）", "479", "28:35"],
  ["数十个上一代 GPT 堆叠产出约 300 个漏洞", "300", "28:55"],
  ["三个 GPT 加工作流达到约 600 个本地提权漏洞", "600", "30:13"],
  ["加入漏洞属性后超过 1024 个本地提权漏洞", "1024", "30:50"],
  ["发现速度约为报告速度的 10 倍", "10倍", "31:22"],
  ["每披露 1 个漏洞约危及 3 倍的设备", "3倍", "32:32"],
  ["Rust 重写的 coreutils 出现 79 个 CVE（讲者说法）", "79", "37:24"],
  ["Zellic 审计发现 113 个问题、其中 44 个分配 CVE", "113 44", "37:13"],
  ["Yan 从事进攻性漏洞研究超过 15 年", "15年", "38:24"],
  ["pwn.college 每月约 10000 名活跃学习者", "10000", "39:48"],
  ["Firmalice 论文只用 3 个固件样本评估", "3", "41:43"],
  ["Firmalice 论文发表于约 11 年前", "11年前", "41:33"],
  ["现代工作扩展到 1000 个固件样本", "1000", "42:10"],
  ["ARBITER 幻灯片总计 1,182,241 个目标、1,130 个报警、661 个漏洞", "1,182,241 1,130 661", "15:29"],
  ["ARBITER 论文在 76,516 个二进制上评估", "76,516", "15:37"],
  ["SoK 综述 116 篇 Android 安全文献、提取 56 个设计级漏洞", "116 56", "23:46"],
  ["OpenHarmony 复现其中 24 个漏洞", "24", "23:46"],
  ["披露研究确认 422 组此前未知的设备-攻击组合、涉超过 100 万台设备", "422 100万", "32:14"],
];
export const RT_CHIPS = ["外部检索与核对 · 首轮（下载等待期并行，L57–92）", "独立报道与论文核对（WeLiveSecurity / NDSS / ASU / IEEE S&P）", "二轮补证（uutils CVE，L178）"];

export const ENV_TOOLS = ["依赖工具就位", ".venv 环境发现", "视频下载组件", "音频处理组件", "排版编译组件", "图像处理组件", "OCR 组件", "平台探测 YouTube"];
// yt-dlp 2026.08.19（会话日 2026-10-03）→ 46 天内，仍为近期版本；.venv 为 L11 失误后定位
export const ENV_FACT = "工作目录与 .venv 就位 · 下载组件为近期版本（46 天内）· 视频元数据探测完成";

export const LATEX_STEPS = ["读取模板与写作参考", "撰写笔记正文（LaTeX 源）", "修订笔误与交叉引用", "xelatex 编译（修复 TikZ 错误）", "pdftotext 渲染校验"];
// L263/264 两遍退 0 → 33 页；CJK 首读 7766（L278 验收）→ 修订后 7779（L318 终验）
export const PDF = { pages: 33, bytes: "3 928 374 B", cjkFirst: 7766, cjkLast: 7779 };
// 76: s4 pdf-strip 的页面图成形（渲染页路径由 pages 派生；src 落到位才写入——
// 65 期 src-at-arrival 纪律，避免演示前段一次性解码 33 张）
export const PDF_PAGE_IMGS = Array.from({ length: PDF.pages }, (_, i) => `assets/pages/page-${String(i + 1).padStart(2, "0")}.jpg`);

export const ARCHIVE = ["读取经验库规范", "通用清洗脚本入库", "更新经验文档（5 份）", "压缩去重归档", "经验固化为知识（L390）"];

// 新会话的错误结果（17 处，按阶段归 4 条；53 后随 pipe-recovery 组件退役为文档性常量）
export const INCIDENTS = [
  { stage: "s0", maxRel: 11000, tag: "L11 · bash 返回 error 127（.venv/python 路径不存在）", note: "bash 未成功 → 定位 .venv 后改绝对路径重试" },
  { stage: "s2", maxRel: 1501000, tag: "L125/145/155 · clean_transcript.py 三次脚本失败（段落合并过激 / ASR 噪声误删）", note: "python 未成功 → 三次重写后通过（233 段清洗版）" },
  { stage: "s3", maxRel: 2553000, tag: "L230/234 · edit 未命中（oldText 漂移 / 无变化）", note: "edit 未成功 → 查实际文本后重试成功" },
  { stage: "s3", maxRel: 2705000, tag: "L300/306 · 修订脚本断言失败（措辞锚字漂移）", note: "断言未过 → grep 实际文本后修正重跑" },
];
export const INCIDENT_GENERIC = { tag: "遇到 1 处小障碍", note: "工具调用未成功 → 自动改写策略重试后继续" };

export const PHASES = [
  { key: "s0", name: "环境检查" }, { key: "s1", name: "获取源与字幕" }, { key: "s2", name: "选取笔记图" },
  { key: "s3", name: "撰写与交付" }, { key: "s4", name: "沉淀经验" }, { key: "s5", name: "收尾对账" },
];

// 83 期：帧 → 成图映射（figure_manifest.tsv 的 figure/frame 两列）——抽帧探头右格
// 由「同一帧图」改「该帧裁出的成图」后，左格帧 ↔ 右格成图 = OCR 选图→裁剪的因果对
export const FIG_BY_FRAME = {
  f_062: "fig_01_three_ways", f_065: "fig_02_arbiter_table", f_092: "fig_03_vuln_properties",
  f_096: "fig_04_sok_openharmony", f_106: "fig_05_dlv_table", f_110: "fig_06_nextgen_models",
  f_119: "fig_07_workflow", f_125: "fig_08_benchmark_1024", f_127: "fig_09_disclosure_question",
  f_130: "fig_10_disclosure_dataset", f_133: "fig_11_toomanybugs", f_140: "fig_12_safelibs",
  f_144: "fig_13_port_rust_joke", f_148: "fig_14_gen_time_cves", f_150: "fig_15_osssec_uutils",
  f_159: "fig_16_human_learning", f_165: "fig_17_quotes_1975_2015", f_167: "fig_18_firmalice",
  f_172: "fig_19_sharpening", f_111: "fig_20_who_would_win",
};

/* ---------- 共享微助手（单作用域 bundle 的单一声明点，见文件头） ---------- */
export const byId = (id) => document.getElementById(id);
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
export const frameImg = (name) => `assets/frames/${name}.jpg`;
export const figImg = (name) => `assets/figures/${name}.jpg`; // 83 期：探头右格成图路径

// 通用点亮：容器内前 n 个子节点转 .on（toggle(force) ⇒ 幂等，过渡只触发一次
// = renderStepper / renderArts 的第 46/49 次机制）。渲染原语，driver 与 cuts 共用。
export const litN = (container, n) => {
  if (!container) return;
  const items = container.children;
  for (let i = 0; i < items.length; i++) items[i].classList.toggle("on", i < n);
};

# tests/probe — 行为探针基建（验证资产，随仓版本化）

本目录是 VidNotes 的**行为验证基建**：主道双路探针（file:// + http://）、窄屏第三路、
`<320 css-px` 弹层回归门、静态对比比矩阵。第 1–20 次迭代这些脚本全部只存在于 `/tmp`，
每轮从上一轮的 `/tmp` 脚本派生；`/tmp` 一旦清理，434 项断言的验证链就断裂且无法从仓库
重建。第 21 次迭代把它们收进仓库（与产品同 VCS——测试自动化资产随产品变更一起提交，
是通行实践），于是「跑过即丢失」变成「随链可重建」。

**本目录与产物完全解耦**：构建管线的输入是封闭集合（`build.js` 只读
`data/product-data.json` 并暂存到 `build/`；`build-inlined.js` 只读
`build/product-data.json` + `index.html` + 5 个 CSS（自 `index.html` 连续 `<link>` 块按文档序读）+ 从 `main.js` 起的 import 闭包 + `assets/`），没有任何脚本
glob 扫全仓。本目录**不被任何构建消费**,两产物 sha256 不因本目录的存在而改变(数据真源已固化为 `data/product-data.json`,重跑构建逐字节复现）。本目录全部脚本只读不写。

## 前置条件

| 项 | 要求 |
|---|---|
| node | 本仓零依赖；v24 实测（`import` 语法自动探测，无需 package.json / npm install） |
| chrome | `google-chrome` 在 `PATH`，或用环境变量 `CHROME=/path/to/chrome` 覆盖 |
| 产物 | 已跑过三步构建（见下）；`dist/index.html`、`index.html`、`build/product-data.json` 存在 |
| 端口 | `8811` 空闲（`run-main.js` 与 `run-boot.js` 各自启停自己的 `serve.mjs`；被占用会报错而不强占） |
| 时间 | 全量约 3–7 分钟（chrome 的虚拟时钟预算 2.4e6 对应秒级墙钟；第 41 次新增的 boot 门约 15–30 s） |

## 完整命令序列

```bash
cd /home/user/code/exp/research-dev_21            # 或任一派生工作区根目录
node pipeline/build.js && node pipeline/build-inlined.js   # 产物前置（必跑）
node tests/probe/run-all.js                       # 全量：matrix → 双路 → 窄屏 → 弹层 → boot 门 → 级联序门
# 也可以分跑：
node tests/probe/contrast-matrix.js               # 静态对比比矩阵（秒级）
node tests/probe/run-main.js                      # 双路主道探针（约 2–3 分钟）
node tests/probe/run-narrow.js                    # 窄屏第三路 23 键 × 7 宽度（约 1 分钟）
node tests/probe/run-modal-narrow.js              # <320 弹层八档布尔门（约 1 分钟）
node tests/probe/run-boot.js                      # boot 深链恢复门：双路 × 6 hash 标本 × 7 bh* 键（约 15–30 s）
node tests/probe/check-cascade.js                 # 样式表级联序门（秒级，需产物前置）
node tests/probe/probe-html.js --print-inject     # 打印拼装后的注入脚本来阅读（不写文件）
```

任一步失败都以**非零退出码**结束并打印失败键清单；成功时各自打印一行 `OK`。

## 运行时会生成与删除的文件（不提交）

`dist/probe-file.html`、仓根 `probe-http.html`、`dist/nb-<320|360|375|414|480|640|760>.html`、
`dist/modal-narrow-<300|280|260|240|220|200|320|360>.html`、`dist/probe-boot-file.html`、仓根 `probe-boot-http.html`、以及 chrome 的临时 `--user-data-dir`
（`/tmp/vidnotes-{probe,boot}-*/`）。全部由运行器在**结束时的 `finally` 块**删除——这是第 1–20 次迭代
「验收后删除临时探针页」铁律的自动化。直接跑 `run-skspace.js`（独立压力守卫，不入 run-all
六组）会经由 spawn `probe-html.js` 生成**两路探针页 + `dist/probe-skstress.html`**，同样
在其 finally 全部清理（与 run-main 同构的闭环，第 38 次补齐）——跑后工作区 `git status
--porcelain` 为空；run-all 六组口径不受影响（run-main 自己生成并清理同两页）。文件:// 探针页必须置于 `dist/` 内，否则相对
`assets/` 资源 404（第 7 次确立的方法论）。`run-boot.js` 的两个 boot 页同理（dist/ 内 + 仓根分体页），
生成与清理在同一个 finally 块（第 41 次）。

chrome 调用与第 10–20 次逐字一致的 flag 集——`--headless=new --no-sandbox --disable-gpu
--enable-logging=stderr --v=0 --virtual-time-budget=2400000 --dump-dom
--window-size=1280,900`——唯一增加的是**每跑一个独立的临时 `--user-data-dir`**：避免与
已开启的桌面 chrome 抢默认 profile，也不留状态。`--virtual-time-budget` 让虚拟时钟快进，
预算到期后 `--dump-dom` 把序列化 DOM 打到 stdout，**`<title>` 就是结果载体**（注入脚本以
`document.title = "PROBE " + 条目.join(" | ")` 收尾）；stderr 扫页面级错误
（`Uncaught` / `CONSOLE(` / `JSERR:` / `REJERR:`）。

## 目录结构与来源

| 文件 | 作用 | 来源 |
|---|---|---|
| `inject-main.1.js`…`.7.js` | 主道注入探针的**字节片段**（第 1–2 片 = 17 次定稿的主道契约；片 3–4 含第 14/15 次的重排队列节、第 16/17 次证据节，第 23 次重写其 `catchItemAt`/`hitRec` 物品重排捕获与身份判定；第 5 片 = 第 22 次的 `cp*` 暂停/继续断言节；第 6 片 = 第 24 次的 `fr*` 冻结-续播断言节 + 第 25 次在其末尾追加的 `ah*` 视图隐藏自动冻结节 + 第 26 次在其后追加的 `ph*` 回放器视图隐藏自动冻结节 + 第 27 次在其后追加的 `tf*` 弹层 Tab/Shift+Tab 焦点循环节 + 第 28 次在其后追加的 `ds*` 演示运行时速度组节 (`document.title` 收尾自片 5 末移至片 6 末)；第 7 片 = 第 30 次的 `ln*` 弹层同组键盘导航节，收尾随之自片 6 末移至片 7 末并保持最后（其后第 33 次追加 `sk*`、第 34 次首部加 `dk*`、第 40 次末尾加 `uh*` URL 深链寻址节）；拼装后 2622 行） | `/tmp/probe17-inject.js`（第 17 次定稿，18/19 纯文档轮未跑探针 → 当前最新派生版） + 第 22/23/24/30 次新增节 |
| `probe-html.js` | 拼装注入（sha256 门禁）+ 生成两路探针页 | `/tmp/mkprobe20html.js`（19 行） |
| `run-main.js` | 双路驱动 + 校验 | 第 10–17 次固定的 shell 命令行（首次固化成脚本） |
| `narrow-template.html` | 窄屏 fixture（静态标记 + 23 键断言脚本；内联 `<style>` 块是占位；第 29 次起 run-head 含 `#btnPauseRun`/`#demoSpeeds` 的可见态标记） | `/tmp/nbpage13.html`（第 11 次起源 / 第 13 次定稿，710 行）逐字 + 第 29 次控件扩展 |
| `narrow-baseline.json` | 7 宽度期望标题（第 29 次快照：+`nbRunHead`/`nbRunHeadN` 两键；既有 19 键的数值与第 20/13 次快照逐字节相同） | `/tmp/nb20-*.txt` → `/tmp/nb-base29.json` |
| `run-narrow.js` | 窄屏派生（模板 `<style>` ← 当前 CSS：`index.html` 连续 link 块按文档序拼接，与 `build-inlined.js` 同口径）+ 7 宽度包裹 + 校验 | `/tmp/mknb20.js`（24 行）+ `/tmp/mknb13wrap.js`（16 行）的包裹技术 |
| `run-modal-narrow.js` | `<320` 弹层回归门（第 31 次起 7 宽度：300/280/260/240/**220**/320/360） | `/tmp/mknbmodal20.js`（74 行；源自 `/tmp/mknbmodal13.js`；第 29 次加 240、第 31 次加 220） |
| `contrast-matrix.js` | 静态对比比矩阵（token 从 `base.css :root` **实读**） | `/tmp/matrix20.js`（48 行；同 `matrix12/13.js`） |
| `run-all.js` | 顺序执行六组检查 | 新写（第 39 次加第六组 check-cascade.js，第 41 次加第五位 run-boot.js） |
| `check-cascade.js` | **样式表级联序机器门**（第 39 次新建，run-all 第六组）：从 `index.html` 连续 `<link>` 块按文档序拼接 5 个 CSS，机检媒体查询出现序 == 记录序（319/239/219/980/640/360 + 第 43 次登记的 `prefers-reduced-motion: reduce` 共 7 项）、注释遮罩后括号配平（终值 0 且全程非负）、各 CSS ≤ 500 行、dist 内联 `<style>` 内容 == 拼接串（端到端证明内联序 == link 级联序）；灵敏度实测三路（改档位数/吞闭括号/改色值）均 FAIL | 新写（第 39 次） |
| `boot-marker.js` | **boot 深链恢复的注入标记**（第 41 次新建）：只读不写——不 import 产品模块、不改 hash、不调任何历史方法；等 `#runList .run-item`（唯一只能由 boot 产出的完成信号）出现后读七项状态（`bhReady/bhView/bhPlayer/bhHash/bhH0/bhLen/bhValnow`）收尾写入 `document.title` | 新写（第 41 次） |
| `run-boot.js` | **boot 深链恢复门驱动器**（第 41 次新建，run-all 第五组）：双路(file:// dist 副本 + http 分体页,同注入 classic `__BH0` recorder 与 boot 标记)× 六 hash 标本,恒定量 `EXPECTED_SAMPLES=6 / EXPECTED_KEYS=7 / EXPECTED_PATHS=2` 显式自检;断言 oracle 在驱动器侧(视图/开合/valuenow/hash 逐字/`bhLen===bhH0` 零增长),valuenow 与 `build/product-data.json` 实时复算的 `idxOfRel` 时刻网格双比对;跨路 5 个态键逐字相等;两页 + serve.mjs + profile 全在 finally 回收 | 新写(第 41 次) |
| `run-skspace.js` | **独立压力守卫**（不入 run-all 六组）：file 路真实探针连跑 N 次（默认 50，`SK_RUNS`/argv 覆盖），逐次要求 592 片段 / 0 假 / 0 页面错误，汇总计数；为第 37 次的 skSpace 竞态（1/12 假阴性）提供重复次数级别的回归哨兵（第 44 次起该契约本身已确定性收口，本守卫转为回归哨兵）；其生成步骤 spawn 的 probe-html 两路输出 + stress 页均在 finally 清理（第 38 次补齐，跑后 porcelain 空） | 新写（第 37 次，第 38 次补清理，第 44 次补口径） |

**为什么是 `tests/probe/`**：这些是**验证资产（断言契约）**，不是构建工具——放 `tools/`
会暗示构建消费它（实测不消费）；`tests/` 是 in-repo 测试基建的通行位置，与产物目录
`build/` / `dist/` / `assets/` 语义清晰分离。子目录名沿用本链 1–20 轮文档一致的「探针」
术语，避免新词汇割裂。**入仓跟踪（不 gitignore）**：探针源码是断言契约本身，须随链可
重建；临时产物页由运行器生成并删除，不提交。

**为什么注入脚本拆片**：契约要求 JS ≤ 500 行，而注入脚本是 1959 行的单一体。拆成
多个**字节片段**（非独立模块，第 22 次起为多片，第 24 次起 6 片，第 30 次起 7 片），由 `probe-html.js` 按序拼装，并以 sha256 门禁证明拼装
结果与记录的哈希一致（原起点：逐字复现 `/tmp/probe17-inject.js`，sha `3d7239f6…`）——「逐字快照」因此是机器可验的性质，
而非口头声明。阅读整体请用 `node tests/probe/probe-html.js --print-inject`。

## 期望基线（验收口径）

| 检查 | 基线 | 出处 |
|---|---|---|
| 双路主道 | 两路标题各 **592 个片段 = 591 个良构 `key=value` 键 + 1 个裸布尔片段**（裸片段值 = `true`，见下「已知怪例」）、`false=0`、`JSERR/REJERR=0`、页面错误 0、两路**键集合相同**、值差全部落在「测量转储类」键内（`tm*IvN` / `rg*N` / `it*N` / `itPre` / `itRsDump` / `rgCompEvs`——每跑独立的时序采样与随机停顿抽样，键数 10–14 不等）。**口径**：556→592 = 434 继承（第 20 次基线） + 30 新增（第 22 次 `cp*` 暂停/继续节）+ 34 新增（第 24 次 `fr*` 冻结-续播节：30 个确定性布尔门 + 4 个计数转储；跨路恒同）+ 17 新增（第 25 次 `ah*` 视图隐藏自动冻结节（转换演示）：16 个确定性布尔门 + 1 个诊断计数转储；跨路恒同；键名与第 5 次的 `ahInit/ahA/ahB` 前缀共用、全名不撞）+ 15 新增（第 26 次 `ph*` 视图隐藏自动冻结节（history 回放器）：14 个确定性布尔门 + 1 个诊断计数转储；跨路恒同；前缀 `ph*` 与既有全部键全名不撞）+ 14 新增（第 27 次 `tf*` 弹层 Tab/Shift+Tab 焦点循环节：13 个确定性布尔门 + 1 个落点序列转储 `tfSeq`；跨路恒同；前缀 `tf*` 与既有全部键全名不撞）+ 12 新增（第 28 次 `ds*` 演示运行时速度组节：12 个确定性布尔门、无转储；跨路恒同；前缀 `ds*` 与既有全部键全名不撞）+ 19 新增（第 30 次 `ln*` 弹层同组键盘导航节（第 7 片）：19 个确定性布尔门、无转储；跨路恒同；前缀 `ln*` 与既有全部键全名不撞）+ 6 新增（第 33 次 `sk*` 时刻栈折叠卡键盘可达性/焦点保持节（片 7 `ln*` 之后）：6 个确定性布尔门、无转储；跨路恒同）+ 2 新增（第 34 次 `dk*` 演示栈无死 affordance 节（片 7 首部）：2 个确定性布尔门、无转储）+ 9 新增（第 40 次 `uh*` URL 深链寻址节（片 7 末尾、`sk*` 之后、收尾之前）：9 个确定性布尔门、无转储——app→URL 一次离散 push、后退/前进与地址栏手改经唯一幂等 reconciler（冻结断点逐字节存活）、非法 hash 静默回落默认视图、位置深链 replace 不增历史条目、回路 guard 幂等无操作；跨路恒同） | 第 17 次契约（`/tmp/probe17-inject.js`）→ 第 20 次两路快照复算（434）→ 第 22 次新增 30 键（`docs/Explore_22.md` 第三节）→ 第 23 次捕获口径重写（`docs/Explore_23.md` §1–2 根因与证明）→ 第 24 次新增 34 键（`docs/Explore_24.md` 第三节）→ 第 25 次追加 17 键（`docs/Explore_25.md` 第三节）→ 第 26 次追加 15 键（`docs/Explore_26.md` 第三节）→ 第 27 次追加 14 键（`docs/Explore_27.md` 第三节）→ 第 28 次追加 12 键（`docs/Explore_28.md` 第三节）→ 第 30 次追加 19 键（`docs/Explore_30.md` 第三节）→ 第 33/34 次追加 6+2 键（`docs/Explore_33/34.md`）→ 第 40 次追加 9 键（`docs/Explore_40.md` 第三节） |
| boot 深链恢复门（第三路探针契约） | **产品代码零改动**的 harness 扩展（第 41 次）：双路（file:// dist 副本 / http 分体页）× 六 hash 标本 × 每标本 7 个 `bh*` 读数，全确定性。标本：`#history/run-20261001/@600000` → `view-history` + player 开 + `aria-valuenow` = `idxOfRel(600000)` 时刻网格（驱动器从 `build/product-data.json` 实时复算双比对；第 72 次重锚 = 398796）；`#library` / `#history` → 各自视图且 player **不开**（纯视图地址不强行开 player）；`#history/no-such-run` / `#/garbage/deep/x` / 空 hash → 静默回落 `view-convert`。每标本断言：视图 active class、player 开合、hash **逐字**未被 boot 改写、`history.length` 零增长（`bhLen === bhH0`，h0 由注在主模块前的 classic recorder 取解析期基线）。跨路 5 个态键逐字相等；连续 10 跑 0 假 | 第 40 次手工六样本取证（`docs/Explore_40.md` §3/§4 未决项①）→ 第 41 次入网（`docs/Explore_41.md` 第三节） |
| 窄屏第三路 | 23 键 × 7 宽度全 true（13 严格布尔 + 10 计数），7 个标题与 `narrow-baseline.json` **逐字节相同** | 第 20 次快照（= 第 13 次快照，diff 7/7 identical）→ 第 29 次新增 2 键（`nbRunHead`/`nbRunHeadN`），既有数值逐字不变 |
| `<320` 弹层 | 300/280/260/240：`mSecScroll`/`mTblIn`/`mTblScroll`/`mCardRight` true、`mCardHsb` false、`mClipN=0cnone`、`mMinC=173`；**220**（第 31 次起覆盖）：同布尔门、`mMinC=165`、section 内容盒 171（顶层 `@media(max-width:239px)` 独立块再收一档：卡片 12→8、单元格 3→2、徽标 4→3；≥240 规则集逐字不变、实测数值逐字保持 182c182）；**200**（第 38 次起覆盖）：同布尔门、`mMinC=157`、section 内容盒 157（顶层 `@media(max-width:219px)` 独立块再收一档：卡片 8→6、单元格 2→1、徽标 3→2；边界取 219 而非 199——199 块不匹配视口 200 本身；219 同时关闭 198–212.9 的 239 档溢出洞、且从不匹配 ≥220，旧档实测数值逐字保持 171c171/182c182；slack 0 为杠杆算术的确定性结果，门带 +1 容差）；180 为新挂账（`mSecScroll=false@157c138`，但表格仍在卡片内：`mTblIn` true、`mClipN=0cnone`）；320/360：同布尔门、`mMinC=209`（319 媒体查询不应生效） | 第 20 次修复后实测（`docs/Explore_20.md` 第三节）→ 第 29 次内边距再收一档（187→173）并覆盖 240（`docs/Explore_29.md` 第三节）→ 第 31 次顶层 ≤239 收窄档覆盖 220（`docs/Explore_31.md` 第三节）→ 第 38 次顶层 ≤219 收窄档覆盖 200（`docs/Explore_38.md` 第三节，180 登记新挂账） |
| 对比比矩阵 | 六药丸对全部 ≥ 4.5（AA）；当前值 7.986 / 5.734 / 7.250 / 9.223 / 10.994 / 6.104，min **5.734**（安全余量档 ≥5.0），十真实底色无新 <5.0 对 | `base.css :root` 实读 + WCAG 自实现（同第 11/12/13/20 次口径）；第 29 次 CVD 明度阶梯后的矩阵（旧值 5.548/5.734/5.388/5.365/5.581/6.104，min 5.365，见 `docs/Explore_29.md`） |

**已知怪例（登记，不改契约）**：注入脚本的第 7 次遗留处 `out.push("tmLiveEv=" + A && B)` 因
运算符优先级绑定成 `("tmLiveEv=" + A) && B`，首串非空时压入的是裸布尔值——标题因此有
**433 个良构键 + 1 个裸 `true` 片段**（其值正是 tmLiveEv 断言本身：序列中途变速让同一
卡片的证据条目带上混合 factor）。`run-main.js` 按此口径网罗：片段数 434、键数 433、裸片段
恰好 1 且须为 `true`。第 17 次文档自述「433 条」数的是良构键；第 20 次文档「434 个条目」
数的是片段——同一标题。

**跨路值差的容差**：只允许落在「测量转储类」正则 `^(tm\w*N|rg\w+N|it\w*N|itPre|itRsDump|rgCompEvs)$`
内（无任何布尔断言键匹配该类）。第 20 次快照得 13 键、本目录首跑得 11–14 键（`rgInstN` 时同时不等）——
采样键的集合本身随机器负载浮动，属已登记的运行间差异；断言键两路逐字一致。

**故障可诊断性**：任一门失败时，`run-main.js` 把两路完整标题写入系统临时目录
（`/tmp/vidnotes-probe-<时间>-{file,http}.title`，不进仓库），便于事后定位**偶发**的假阴性。第 21
次观察到 1 次（两路同时出现单条 false、未捕获键名——随后 14 次复跑（6 串行 + 8 并行）全部
0 false）；疑似负载敏感的测量诊断类（`rg*Prop`/`it*Prop` 容差 ±1.5ms、`rg*Actual`/`it*Actual`
±90/±120ms、`tmConst` 间隔差 ≤8ms），故登记而不放宽 0 假门槛。
**第 22 次的新签名（同源偶发，非本轮引入）**：各连续复跑 13 次——未改动的母本基线
（`research-dev_21` HEAD `d177229` 的产物与 harness）出现 2/13、本轮工作区出现 1/13 的**同一签名**
失败：单路 `itXF=false` 且 `itXNextK`/`itRsKinds` 跨路值差（这三个键名不匹配 `VARIANCE_RE`，
所以被网罗为失败）。`itXF` 断言的是「4×→1× 变速时，被捕捉的物品等待的重排记录与捕捉句柄同源」
（`catchItemAt(4)` 的轮询与重排记录入册之间的竞态），发生在**回放器**侧、本轮焦点（转换视图暂停/继续）
**之前**，两工作区同概率出现 → 同一已登记的负载敏感现象。0 假门槛因此不放宽；遇到该签名复跑即可
（`docs/Explore_22.md` 第三节登记，含两工作区的复跑计数）。

**第 23 次的根因定位与确定性修复（该签名已消除，不再需要复跑）**：根因是**探针侧采样窗口竞态**，
非产品不确定性。`delays` 条目是**一次性写入**的（记录暂停的**原始**调度因子），`rescaleLivePauses`
重瞄句柄时**不改写**它；而 `catchItemAt(f)` 的捕获条件只用 `dlLast().factor === f`。第 H 节目标因子 4
恰是第 G 节留下的因子，于是本节自带的先导 `speed(16)` 把在飞的物品释放到瞬时档（0ms 计时器入队
但尚未运行）后，旧条目仍带 `factor=4`，捕获条件照样命中——8/8 个历史样本（4 失败 + 4 通过的落盘
标题）中捕获到的都是这个**已释放**的对象。随后的 `sleep(0.5×ms)` 骑在一个不存在的等待上，
`speed(1)` 重排的实际上是「此刻真正在飞」的暂停（物品 OR settle，随 rand 抽样漂移），`itXF` 的种类
比较便成了抛硬币；`itXNextK`/`itRsKinds` 是 downstream 的讲述性转储，一同分歧。**修复**（只动
`tests/probe/`）：`catchItemAt` 加**新鲜度门**（`speed(f)` 前取 `delays` 内容快照，被捕获条目须
内容全新）+ G/H/I 三节改用 `hitRec`（点击推出的新记录须**恰好 1 条**，且其 `rem` 落在
`(ms−elapsed−2, ms−elapsed]`——`elapsed` 为探针自测的捕获→点击逝时；详见 `docs/Explore_23.md` §2
的不变量证明）。「0 false」门槛由此从「抛硬币」变成「可证的恒真」；键数不变（464/463/1，第 24 次方升至 498/497/1），
仅 `itN`/`itXN`/`itIN` 转储增字段（`ms0/elapsed/rem/ms/wait/记录数`）供事后定位。修复后连续
15 次双路全过（`docs/Explore_23.md` 第三节跑录）。

**第 37 次的根因定位与确定性修复（skSpace 单键假，1/12）**：失败签名 = `skNoSteal/skAff/skLabel/skClick/skEnter`
全 true、单路 `skSpace=false`（落盘标题为证）。skEnter 已证 `defaultPrevented && skCommit`（同一
处理器、同一重建路径），唯一新增分量是 `scrollY/X` 快照比对。而该分量在本 harness **没有检出力**：
合成 keydown 的默认动作不滚屏（对照实验：真正聚焦、无处理器的 control 元素吃未 preventDefault 的
Space，窗口内 `scrollY` 恒 0）——故它的唯一失败路径是**别的滚动源**：虚拟时钟下 CSS 平滑滚动
**冻结但活着**（第 2 次 README 断言“虚拟时间预算不驱动平滑滚动”只在主调成立），可被偶发合成器帧
推进一小段（实测 +3/+13/+40）。skSpace 窗口开启时现场恰有两条 tail：openPlayer 的 pan（product
`player.js:82`）与探针自己的 `skS.focus()` 起的 focus 滚屏（被断言卡在视口之下 1030.9 > 757）。
根因归属：**探针侧观察窗口过宽**（把窗口内一切滚动归因于 Space），产品侧零改。**修复**（只动
`tests/probe/`，合取逐字不变、键数 583/582 不变）：两步键盘激活前置 a) 产品 pan **自完成**到其自身
目的地（`behavior:"instant"`，fragment-2 惯用法），b) 两步期间页面 `scroll-behavior` 抑制为 `auto`
（focus 滚屏即时 settle，不再生冻结动画；真实默认动作滚屏也会是即时而仍可抓），加 c) 快照前**静默位门**
（两样本 40 ms 相等；不静默则断言 loudly 失败）+ d) `run-skspace.js` 压力守卫。修复后连跑 0 假
（`docs/Explore_37.md` 第三节跑录：50 跑压力 + 10 跑双路）。

**第 44 次的残余收口（根因定位：post-dispatch 200 ms 窗口是最后一个可穿越跨度）**：第 37 次的三道门
消了「开窗时」的 tail，但 root 在第 43 次验收时又看到一次残余（file 路单键 `skSpace=false`，
http 路全真；落盘标题为证）。本轮定位（`docs/Explore_44.md` §一）：现行时间线为
`[静默位门→快照] →（零 await）→ [dispatch] → await sleep(200) → [比对]`——渲染帧 / 虚拟定时器
**只能在任务之间**处理，故快照到比对之间唯一能被帧穿越的跨度 = dispatch 之后的 200 ms 空闲时钟
（与第 37 次最小化复现 `sp1plain`（素 200 ms 窗口、无 dispatch、页面动了 13 px）同形状）。
本轮量化：母本 43 态 46 个新样本 0 复现（12 skstress + 10 双路 + 24 保真诊断）；保真诊断（真实 7 片
注入、仅 post-dispatch 段仪器化）实测 scrollY 逐跑钉在 312、dispatch 自身从不滚屏（`skdSyncEq`
24/24）、DP/Commit 24/24；确定性最小化复现（post-dispatch +60 ms 定时器滚屏 ——「严格晚于 dispatch
任务着陆的滚动位移」之时间类替身）：**旧语义（+200 ms 读）0/4 ↔ 新语义（同任务同步读）4/4**，
DP/Commit 4/4。**修复**（只动 `tests/probe/inject-main.7.js` 的 sk* (5) 块 + `probe-html.js`
的 INJECT_SHA/注释，合取四分量逐字不变、键数 592/591 不变、EXPECTED 常量不动）：把滚动比对
读点从 `await sleep(200)` 之后移到 `dispatchEvent` 之后、`sleep` 之前的**同一同步任务内**
（`skSy2/skSx2`）——零任务边界 ⇒ 帧/定时器结构性无法插入快照与比对之间，无论 tail 材料为何。
语义不弱化：键自身的效应（默认动作 + 处理器内重建/focus 恢复滚屏，后者在 `scroll-behavior=auto`
覆盖下即时）全部在 dispatch 内落地、同步读可见；旧读点多出的信息只是环境噪声（第 37 次已证默认
动作在本 harness 无滚屏力）。另登记一处文档/实现不符的修正：第 37 次文档称静默位门「不静默则
断言 loudly 失败」，实现实为取最后样本——同步点修复后快照前不静止不再可能传导为假（快照与比对
同任务），位门降级为 settle 等待，注释已如实改述。验证（`docs/Explore_44.md` §三）：
run-skspace 50/50 + run-main 连 10 跑双路 0 假 + run-all 六组全绿 + dist 逐字节不变。

## 更新流程（下一轮如何演进探针）

1. **演进断言契约**：改 `inject-main.1..7.js` 的相应片段（必要时重新切分，保持每片
   ≤500 行）——第 22 次即是把新断言节切成第 5 片、并把 `document.title` 收尾移到片 5 末尾，第 24 次把 `fr*` 节切成第 6 片并移走收尾，
   第 25 次把 `ah*` 节追加到片 6 末（收尾仍为最后两行），
   第 26 次把 `ph*` 节追加到 `ah*` 节之后（收尾仍为最后两行），
   第 27 次把 `tf*` 节追加到 `ph*` 节之后（收尾仍为最后两行），
   第 28 次把 `ds*` 节追加到 `tf*` 节之后（收尾仍为最后两行；12 个确定性布尔门、无转储），
   第 30 次因片 6 已满 500 行而把 `ln*` 节切成新建的片 7 并把收尾移至片 7 末（19 个确定性布尔门、无转储），
   第 37 次在片 7 的 `sk*` Enter/Space 两步外层包了 scroll-quiet 窗口（pan 自完成 +
     两步期间 `scroll-behavior` 抑制 + 静默位门），**合取与键数均未变**，仅快照取自静默窗口之后，
   第 44 次把 skSpace 的滚动比对读点移入 dispatch 的同一同步任务（`skSy2/skSx2`，零 await 边界
     ⇒ 帧无法插入快照与比对之间——结构性关闭 post-dispatch 200 ms 窗口），**合取四分量与键数未变**，
   第 40 次把 `uh*` URL 深链寻址节追加到片 7 末尾（`sk*` 之后、收尾之前；9 个确定性布尔门、无转储），
   拼装后跑 `node tests/probe/probe-html.js --print-inject | sha256sum`（或等价的 node 拼装）
   得到新 sha256，更新 `probe-html.js` 里的 `INJECT_SHA`、本 README 的基线表、以及
   `run-main.js` 的 `EXPECTED_FRAGMENTS` / `EXPECTED_KEYS`（如条目数变化）。新增键须为
   **确定性**值（布尔/固定计数），否则会以「跨路值差」身份触发 `VARIANCE_RE` 外的失败。
2. **窄屏断言演进**：改 `narrow-template.html` 的标记/断言脚本后，重跑 `run-narrow.js`
   并把新标题写回 `narrow-baseline.json`（基线文件是**结果快照**，不是期望来源）。
3. **token 演进**：`contrast-matrix.js` 从 `base.css` 实读（第 39 次 `:root` 随 style.css 拆分迁入 base.css），无需改；如需寻找深化候选值，
   `node tests/probe/contrast-matrix.js --search cyan` 输出 uniform-scaling 候选
   （第 12/20 次挑深化值用的同一工具）。
4. 产物层（9 个 JS 模块 / `index.html` / 5 个 CSS / 构建管线）**不在本目录的修改
   范围内**——本目录只消费产物做验证。
5. **boot 门演进**（第 41 次新增）：标本表/期望值/键数全部在 `run-boot.js` 顶部常量区
   （`SAMPLES` / `EXPECTED_SAMPLES` / `EXPECTED_KEYS` / `EXPECTED_PATHS` / `KEY_NAMES` /
   `STATE_KEYS` / `DEEP_TARGET_MS`），注入读数器是 `boot-marker.js`。增删标本或键时：
   a. 改常量与 `boot-marker.js` 的 `out.push` 序，保持 `EXPECTED_KEYS` == `KEY_NAMES` 长度 ==
   实际键数；b. 深链标本若换 `@rel`，`SAMPLES[0].valuenow` 必须等于驱动器从当前
   `build/product-data.json` 复算的网格值(启动时自检,漂移即报);c. 本基线表
   补行。键必须为**确定性读数**(裸 DOM 读,无采样),否则跨路相等断言会假。产品侧若
   为此改 boot 行为，必须走产品迭代流程（本门只观察不驱动产品）。

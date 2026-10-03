## 中文版

## 视记 VidNotes：基于 Atria Dawn Preview 的创意 Demo

**定位**：VidNotes 是为发布 Atria Dawn Preview 设计的创意展示场景，而非独立产品发布。Atria Dawn Preview 目前是文本模型，不直接理解视频画面；VidNotes 通过字幕和 OCR 将视频转为文本，再交由模型完成理解、研究、核查与生成。

**界面说明**：本 Demo 的可视化界面基于真实 session 记录进行呈现，用于回放和展示一次真实处理流程中的中间结果与最终交付，并非纯虚构示意。该界面同样也是 VidNotes 的产品目标界面，后续产品化将沿此交互与信息结构迭代。

### 创意描述

**01 视频转文本与长文本理解 | 从视频链接到结构化输入**

Atria Dawn Preview 是文本模型，对视频的理解通过字幕和 OCR 识别后的文本完成。VidNotes 的流程是：输入 YouTube 链接 → 下载视频与字幕 → 抽帧 → OCR 识别画面文字 → 得到字幕与 OCR 文本。关键帧截图用于 PDF 配图和溯源，不用于模型视觉理解。模型在文本层面完成长文本理解、信息抽取和结构重组，展示其处理长上下文与多来源文本的能力。

**02 深度研究与事实核查 | 从文本到可验证证据链**

Atria Dawn Preview 对字幕和 OCR 文本中的关键陈述进行联网搜索、交叉验证，并标注“存疑/错误”。最终文稿附溯源链接：视频时间戳 + 网页来源。模型不只总结，而是建立可验证证据链。这展示其工具调用、联网搜索、验证和长时程任务能力。

**03 可视化流程 | 让模型工作过程可见**

VidNotes 通过可视化界面展示处理进度、字幕、抽帧图、OCR 结果、分析结论和最终文稿溯源链接。关键帧图来自视频，用于配图与核对；模型处理的是文本。该可视化界面由真实 session 记录驱动/还原，用于展示真实处理过程。这展示 Atria Dawn Preview 在长流程中输出中间结果、保持可解释性的能力。同时，该界面也是产品目标界面，而不仅是演示外壳。

**04 经验复用 | 沉淀错误、提示词与流程模板**

系统沉淀常见错误、提示词和流程模板，并在下一次处理中自动复用。这展示 Atria Dawn Preview 在持续任务中的经验积累与流程优化能力。

**05 交付 | 图文并茂的 PDF**

最终输出为 PDF，包含视频关键帧截图，以及模型根据文本生成的示意图/图表。未来可结合 MinerU 将 PDF 转为 Markdown。用户流程：粘贴链接 → 等待处理 → 在线预览 → 下载 PDF。

**06 降低领域门槛与对话式理解 | 快速了解顶级会议，并以 PDF 与 AI 对话**

即使你不了解某个行业，VidNotes 也能帮助你快速了解顶级会议/议会的内容。生成的 PDF 不仅是阅读材料，更可作为与 AI 对话的基础设施：用户可以基于 PDF 内容向 AI 提问、追问、要求解释，快速理解会议中的关键议题、观点和结论。这让长视频/会议内容从“看完”变为“可对话、可探索”。

**07 当前阶段**

MVP，静态网页展示，基于真实 session 记录进行可视化回放，已跑通部分真实流程，尚未开放直接使用。该静态网页所呈现的界面同样是产品目标界面：它既用于展示真实 session，也定义后续网站与 Docker 形态的目标交互。规划形态包括网站与 Docker 镜像；二进制封装因依赖过多暂未实现。处理时长取决于硬件和网络，瓶颈在下载、抽帧和 OCR，分析与检索较快。目前支持 YouTube。目标用户为泛普通用户；若用户提供特定领域模型，可提升该领域文档生成质量。

### FAQ

**Q1：VidNotes 是什么？**  
A：基于 Atria Dawn Preview 的创意 Demo，展示文本模型如何把 YouTube 视频经字幕和 OCR 转成可核查的图文 PDF；其可视化界面基于真实 session 记录呈现，并作为产品目标界面。

**Q2：为什么做这个 Demo？**  
A：在发布新模型时，用具体场景展示 Atria Dawn Preview 的长文本理解、工具调用、联网搜索、事实核查和端到端交付能力。

**Q3：模型直接理解视频画面吗？**  
A：不。Atria Dawn Preview 目前是文本模型。视频理解通过字幕和 OCR 识别后的文本完成；关键帧截图用于 PDF 配图和溯源。

**Q4：模型具体做了什么？**  
A：接收字幕与 OCR 文本，进行内容分析、联网搜索、交叉验证、标注存疑/错误，并根据文本生成示意图/图表和结构化文稿。

**Q5：和普通视频总结有何区别？**  
A：不只是摘要，而是建立可验证证据链，输出介于视频简介和完整观看之间的图文文稿，并附视频时间戳与网页来源。

**Q6：如果我不了解这个行业，能用吗？**  
A：可以。VidNotes 能帮助你快速了解顶级会议/议会的内容，降低领域门槛。

**Q7：PDF 能用来和 AI 对话吗？**  
A：可以。生成的 PDF 可作为与 AI 对话的基础设施，你可以基于 PDF 内容向 AI 提问，快速理解会议内容。

**Q8：支持哪些平台？**  
A：目前 MVP 支持 YouTube。

**Q9：PDF 里有什么？**  
A：结构化文稿、关键帧截图、模型根据文本生成的示意图/图表、溯源链接。

**Q10：处理多久？**  
A：取决于硬件和网络。分析检索较快，主要耗时在下载、抽帧和 OCR。

**Q11：现在能用吗？**  
A：目前是 MVP 静态网页，基于真实 session 记录展示处理流程，已跑通部分真实流程，尚未开放直接使用。后续计划提供网站和 Docker 镜像。该界面同样是产品目标界面。

**Q12：需要技术知识吗？**  
A：不需要。可视化界面会展示每一步在做什么。

**Q13：未来方向？**  
A：结合 MinerU 支持 Markdown；支持用户提供领域模型；从静态展示走向可交互产品。

---

## English Version

## VidNotes: A Creative Demo Powered by Atria Dawn Preview

**Positioning**: VidNotes is a creative demo scenario designed for the launch of Atria Dawn Preview, not an independent product release. Atria Dawn Preview is currently a text model and does not directly understand video frames. VidNotes converts video into text through subtitles and OCR, then hands it to the model for understanding, research, verification, and generation.

**Interface Note**: The visual interface of this demo is presented from real session records, replaying an actual processing run and its intermediate results and final delivery rather than a purely fictional mockup. This interface is also the target product interface for VidNotes; future productization will iterate on this interaction and information structure.

### Creative Demo Description

**01 Video-to-Text and Long-Context Understanding | From a Video Link to Structured Input**

Atria Dawn Preview is a text model; its understanding of video is achieved through subtitles and OCR-extracted text. The VidNotes pipeline is: input a YouTube link → download video and subtitles → extract keyframes → OCR on-screen text → obtain subtitle and OCR text. Keyframe screenshots are used for PDF illustration and source tracing, not for model vision understanding. The model performs long-context understanding, information extraction, and structural reorganization at the text level, demonstrating its ability to handle long contexts and multi-source text.

**02 In-Depth Research and Fact-Checking | From Text to a Verifiable Chain of Evidence**

Atria Dawn Preview searches the web, cross-verifies key claims in the subtitle and OCR text, and flags statements as “questionable” or “incorrect.” The final document includes source links: video timestamps + web sources. The model does more than summarize; it builds a verifiable chain of evidence. This demonstrates its tool use, web search, verification, and long-horizon task capabilities.

**03 Visual Workflow | Making the Model’s Work Visible**

VidNotes uses a visual interface to show processing progress, subtitles, extracted keyframes, OCR results, analytical conclusions, and source links in the final document. Keyframe images come from the video and are used for illustration and checking; the model processes text. This visual interface is driven by/replayed from real session records to show a real processing run. This demonstrates Atria Dawn Preview’s ability to output intermediate results and remain interpretable in long workflows. At the same time, this interface is also the target product interface, not merely a demo shell.

**04 Experience Reuse | Turning Errors, Prompts, and Workflows into Reusable Assets**

The system captures common errors, prompts, and workflow templates, and automatically reuses them in future runs. This shows Atria Dawn Preview’s ability to accumulate experience and optimize processes across sustained tasks.

**05 Delivery | An Illustrated PDF**

The final output is a PDF containing keyframe screenshots and diagrams/charts generated by the model based on text. In the future, MinerU can be integrated to convert the PDF into Markdown. User flow: paste link → wait for processing → preview online → download PDF.

**06 Lowering Domain Barriers and Conversational Understanding | Quickly Grasp Top Conferences and Talk to AI via PDF**

Even if you are unfamiliar with an industry, VidNotes helps you quickly understand the content of top conferences/parliaments. The generated PDF is not just reading material; it serves as an infrastructure for conversing with AI: users can ask questions, follow up, and request explanations based on the PDF content, quickly understanding key topics, viewpoints, and conclusions. This turns long video/conference content from something to “watch” into something conversational and explorable.

**07 Current Stage**

MVP, a static web demonstration that visualizes/replays real session records and has run part of the real workflow, not yet open for direct use. The interface shown in this static web demo is also the target product interface: it is used both to present real sessions and to define the target interaction for the future website and Docker image. Planned forms include a website and a Docker image; binary packaging has not been implemented due to heavy dependencies. Processing time depends on hardware and network conditions, with bottlenecks in downloading, keyframe extraction, and OCR; analysis and retrieval are relatively fast. Currently supports YouTube. Target users are general users; domain-specific models can improve document generation quality in specialized fields.

### FAQ

**Q1: What is VidNotes?**  
A: A creative demo powered by Atria Dawn Preview, showing how a text model turns long YouTube videos into verifiable illustrated PDFs via subtitles and OCR. Its visual interface is presented from real session records and also serves as the target product interface.

**Q2: Why build this demo?**  
A: To showcase Atria Dawn Preview’s long-context understanding, tool use, web search, fact-checking, and end-to-end delivery capabilities through a concrete scenario.

**Q3: Does the model directly understand video frames?**  
A: No. Atria Dawn Preview is currently a text model. Video understanding is achieved through subtitles and OCR-extracted text; keyframe screenshots are used for PDF illustration and source tracing.

**Q4: What does the model actually do?**  
A: It receives subtitle and OCR text, analyzes content, searches the web, cross-verifies facts, flags questionable/incorrect statements, and generates diagrams/charts and a structured document based on the text.

**Q5: How is it different from ordinary video summaries?**  
A: It does more than summarize. It builds a verifiable chain of evidence and outputs an illustrated document between a video description and watching the full video, with video timestamps and web sources.

**Q6: Can I use it if I don’t know the industry?**  
A: Yes. VidNotes helps you quickly understand top conference/parliament content, lowering the domain barrier.

**Q7: Can the PDF be used to talk to AI?**  
A: Yes. The generated PDF serves as an infrastructure for conversing with AI. You can ask questions based on the PDF content to quickly understand the meeting content.

**Q8: Which platforms are supported?**  
A: The current MVP supports YouTube.

**Q9: What is in the PDF?**  
A: A structured document, keyframe screenshots, diagrams/charts generated by the model from text, and source links.

**Q10: How long does processing take?**  
A: It depends on hardware and network conditions. Analysis and retrieval are relatively fast; the main time is spent on downloading, keyframe extraction, and OCR.

**Q11: Can I use it now?**  
A: It is currently an MVP static web demonstration that visualizes real session records and has run part of the real workflow. It is not yet open for direct use. A website and Docker image are planned. This interface is also the target product interface.

**Q12: Do I need technical knowledge?**  
A: No. The visual interface shows what each step is doing.

**Q13: What are the future directions?**  
A: Integrate MinerU for Markdown support; support user-provided domain models; move from static demonstration to an interactive product.

---

## 构建 / Build

### 中文

**环境要求**：Node.js ≥ 20。构建链（`pipeline/`）只使用 Node 内置模块（`fs`/`path`/`url`/`vm`/`crypto`），**无需 `npm install`，无第三方依赖**。

```bash
# 1. 构建产物（data/product-data.json + src/ + public/ → dist/）
npm run build
# 等价于：node pipeline/build.js && node pipeline/build-inlined.js

# 2a. 直接使用：dist/ 为 file:// 安全的自包含静态产物，双击 dist/index.html 即可，零服务端零网络

# 2b. 或本地预览分体源（开发校验用，localhost only）
npm run serve
```

产物结构：`dist/` 下 4 个多页（`index.html` 入口 / `run.html` / `library.html` / `history.html`）+ 共享 `app.js` / `app.css` / `data.js` + 自携带的 `assets/`（图、帧、PDF 等）。

可选工具链（非构建必需）：
- 探针测试：`npm run probe`
- 从 `materials/` 过程素材重新打包 `assets/`（需 `magick` / `pdftoppm`）：`bash pipeline/pack-assets.sh <materials路径> <输出路径>`

数据真源：`data/product-data.json`（仓库内唯一数据真源），`materials/` 为该次真实处理的过程素材快照，均纳入版本控制。

### English

**Requirements**: Node.js ≥ 20. The build chain (`pipeline/`) uses only Node built-in modules (`fs`/`path`/`url`/`vm`/`crypto`) — **no `npm install`, no third-party dependencies**.

```bash
# 1. Build the product (data/product-data.json + src/ + public/ → dist/)
npm run build
# Equivalent to: node pipeline/build.js && node pipeline/build-inlined.js

# 2a. Direct use: dist/ is a file://-safe, self-contained static product — just open dist/index.html; no server, no network

# 2b. Or preview the split sources locally (dev verification, localhost only)
npm run serve
```

Product layout: 4 pages under `dist/` (`index.html` entry / `run.html` / `library.html` / `history.html`) + shared `app.js` / `app.css` / `data.js` + self-contained `assets/` (figures, frames, PDF, etc.).

Optional tooling (not required for building):
- Probe tests: `npm run probe`
- Re-pack `assets/` from `materials/` process artifacts (requires `magick` / `pdftoppm`): `bash pipeline/pack-assets.sh <path-to-materials> <output-path>`

Data source of truth: `data/product-data.json` (the single checked-in source of truth); `materials/` holds the process-material snapshot of that real run — both are version-controlled.

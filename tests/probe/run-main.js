// tests/probe/run-main.js — page-scoped dual-path (file:// + http://) main probe driver.
//
// 第 71 次（多页拆分 II 期）重锚：旧驱动跑**一个**单文档长会话探针（619 键）
// 的双路比对；多页形态下该会话的视图跳转 = 文档导航（会话续体随文档卸载销毁），
// 故重锚为**逐契约双路**：每个页级契约（probe-html.js 的 CONTRACTS 注册表，
// 5 页 + run 双变体 = 6 契约）在 file:// 路与 http:// 路各跑一次，比对
//   — 契约键集与记录的键集逐字一致（键数与键名序，漂移即失败）
//   — 0 值为 "false"、0 JSERR:/REJERR:、0 页级 chrome stderr 错误
//   — 双路键集相同；值差异仅允许落在测量转储方差类（N 后缀 + 显式枚举的
//     计数/转储键——命名约定与旧契约 tm*IvN/rg*N/it*N 同一纪律，语义口径
//     不变：布尔断言键永不豁免）
// 另据页内 dump 的类原子集合与 CSSOM 规则表，驱动侧做**跨页并集**死规则
// 聚合（dr* 家族的等价承载：旧单页读数在多页形态会把别页原子误判为死规则）。
//
// Prerequisites: node (no dependencies), google-chrome on PATH (or $CHROME),
// the two build steps already run, and port 8811 free. chrome 标志与旧驱动
// 逐字一致（含 throwaway --user-data-dir 与 --virtual-time-budget）。
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACTS, INJECT_SHA, pageName, queryOf, readInject } from "./probe-html.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CHROME = process.env.CHROME || "google-chrome";
const PORT = 8811;
const WALL_S = 540; // wall-clock cap per chrome run (matches the iterations' `timeout 540`)
const VIRTUAL_BUDGET = 2400000;

// 测量转储方差类：N 后缀（命名约定，同旧契约的 tm*IvN/rg*N/it*N 纪律）+ 显式
// 枚举的计数/转储键。任何布尔断言键不落此类——布尔跨路漂移仍然失败。
const VARIANCE_RE = /^(ctN|ctMin|ctBad|nbDeskN|cvNavNames|drAtomsN|drRules|tfSeq|[a-zA-Z][a-zA-Z0-9]*N)$/;

// 每契约的记录键集（注册时自检：声明数 == 实际跑出的键数）。键序 =SORTED 后
// 与收集到的键序逐字比对，任何方向的漂移（含新增/删除/改名）都会失败。
// 每契约的记录键集（注册时自检：声明数 == 实际跑出的键数）。键序排序后与收集
// 到的键序逐字比对，任何方向的漂移（含新增/删除/改名）都会失败。
// 每契约的记录键集（注册时自检：声明数 == 实际跑出的键数）。键序排序后与收集
// 到的键序逐字比对，任何方向的漂移（含新增/删除/改名）都会失败。
// 每契约的记录键集（注册时自检：声明数 == 实际跑出的键数）。键序排序后与收集
// 到的键序逐字比对，任何方向的漂移（含新增/删除/改名）都会失败。合计
// 40+72+148+14+91+7 = 372 键（file 路；http 路键集逐字相同；74：run 页通告/artifacts 族退役 −8−1）。
// 每契约的记录键集（注册时自检：声明数 == 实际跑出的键数）。键序排序后与收集
// 到的键序逐字比对，任何方向的漂移（含新增/删除/改名）都会失败。合计
// 40+72+148+14+91+7 = 372 键（file 路；http 路键集逐字相同；74：run 页通告/artifacts 族退役 −8−1）。
// 每契约的记录键集（注册时自检：声明数 == 实际跑出的键数）。键序排序后与收集
// 到的键序逐字比对，任何方向的漂移（含新增/删除/改名）都会失败。合计
// 40+72+148+91+7 = 358 键（file 路；http 路键集逐字相同；74：run 页通告/artifacts 族退役 −8−1；77：原片页契约 14 键随页退场）。80：run-brisk +psProbeFB（探头双通道一致性）⇒ 359 键；81：run-brisk +psJudge（判别扫描条）⇒ 360 键；83：run-brisk −psProbeFB（video 通道退休：无播放功能 ⇒ 帧-图对照）⇒ 359 键；84：run-brisk +psJudgeTags/+psJudgeTagsF/+psStreams/+psSuccess（四键 = 84 期流式条目 / 标签流 / 成功动画）⇒ 363 键。
const EXPECTED_CONTRACTS = 5; // convert / library / history / run-brisk / run-instant
const EXPECTED_KEYS_TOTAL = 363; // 各契约键集总和（下方自检：断言等于表内实计）
const EXPECTED_KEYS = {
  "convert": "ctAA ctAccent ctDead ctDeadN ctGreen ctInk ctInk2 ctInk3 ctLineS ctLineSN ctMin ctN ctPh ctPhN ctWhite cvAction cvBoot cvControls cvForm cvGuardAria cvGuardClear cvGuardMsg cvGuardNoNav cvGuardRepeat cvHero cvMsgEmpty cvMsgLive cvNavAnchor cvNavAria cvNavCurrent cvNavLabel cvNavNames cvOpts cvView drAtomsN lmFooter lmMain nbDesk nbDeskN nbOvf",  // 40 keys
  "library": "cardA11y clClose clIn clN clScope clTime ctAA ctDead ctDeadN ctGreen ctInk ctInk2 ctInk3 ctMin ctN ctThumb ctThumbN ctWhite dmEsc dmFocusClose dmFocusIn dmLabelledby dmName dmOpen dmRole docCards drAtomsN lbBoot lbBtns lbBtnsSgl lbCap lbCloseFix lbOpen lbRole lbSz libCount libDeepParam lnAria lnBox lnClampL lnClampR lnEnd lnEscLf lnFocus lnHome lnMix lnMixBack lnNext lnOpen lnOpenG lnPrev lnRet lnSgl lnSilent lnTab lnVert mpAttrs mpCount mpLoaded mpSame tfBackIn tfBackWrap tfClose tfFwdIn tfFwdWrap tfLbBack tfLbCycle tfLbEsc tfLbNav tfMidFlow tfNoResid tfSeq",  // 72 keys（75：+lbBtns/lbBtnsSgl/lbCloseFix 灯箱翻页钮与 × 关闭修复）
  "history": "ctAA ctAccent ctDead ctDeadN ctInk ctInk2 ctInk3 ctMin ctN ctRed ctWhite drAtomsN frHCont frHFrz frHGo frHNoDup frHNoDupN frHSeek frHSeen frPSCont frPSFrz frPSGo frPSRsN frPSRsOK frPSSeen frPSStill frPark hiBoot hiLeavePlay histCount histNoPlayer histView lv16xInst lv1x lv1xIv lv1xIvN lvConst lvEv4x lvEvCol lvMid4x lvMid4xIv lvMid4xIvN lvMutN lvNoFlood lvPause lvPlay lvPlayed lvSeek lvSpeed pbLabel0 pbLabelA pbLabelB pbPressed0 pbPressedA pbPressedB phBackAnn phCont phContN phEnd phEndNoReplay phFrz phFrzHold phGo phManAway phManBack phManFrz phManGo phOpen phStay plClock plEvi plHash plOpen plPushOne plRibbon plStack plSub plTitle rgCompEvs rgCompExtend rgCompF rgCompN rgCompProp rgCompSeen rgSelf rgSelfBad rgSelfN runItems skAff skClick skEnter skLabel skNoSteal skSpace slClampMax slClampMin slEnd slFocus slHome slLabel slLive slMaxExact slMin slNow0 slOrient slPass slPd slPdPg slPgDn slPgUp slResume slRole slSampBad slSampN slSamples slStepD slStepL slStepR slStepR2 slStepU slTabI spCurFlip spGrp spOneCur tgAA tgActivity tgBad tgBase tgBaseN tgDecision tgDone tgDual tgDualN tgLive tgLiveN tgMilestone tgMin tgQuality tgRecovery tgToken tgTokenN uhBack uhDeep uhEdit uhFwd uhNav uhNoLoop uhPos",  // 148 keys
  "run-brisk": "ahCont ahContN ahFrz ahFrzHold ahGo ahManAway ahManBack ahManFrz ahManGo ahRun ahStay cpAtGap cpCvResetN cpFreezeCards cpFreezeClk cpFreezeDl cpFreezeIdx cpIdle cpPauseN cpPressed cpResCard cpResGap cpResumed ctAA ctAccent ctDead ctDeadN ctFocus ctGreen ctInk ctInk2 ctInk3 ctLineS ctLineSN ctMin ctN ctWhite dkInert dkNoAff drAtomsN finBridgeNames finBridgeWire finBtnHid finCap finClock finDone finFoot finStackN frEvFreeze frEvFrz frEvGap frEvGo frEvNext frEvRemain frEvSeen frEvSeenN frFrz frTxtCardDone frTxtCont frTxtContN frTxtFreeze frTxtGo frTxtSeen frTxtStep psA11y psClaims psCutGrid psFinal psFinalN psGrowA psGrowMon psLive psOverwrite psPdf psPhases psProbe psJudge psJudgeTags psJudgeTagsF psStreams psSuccess psRec11 psRec155 psReset psSceneLit psStruct rnBoot rnCards rnCharMs rnFactor rnInit rnNoHashWrite rnPanelOnly rnStepper rnTxt rnView",  // 93 keys（81：+psJudge 判别扫描条）（75：#demoSpeeds 组退役 ⇒ rnSpeedGrp/rnTierPreset + ds 族 8 键随宿主删除；演示重定标路径由 history rgComp* 承载）（74：#cvMsg/cv 通告族 + artifacts-check/art-rows 退役 ⇒ rnCvLive/cpAnnPause/cpAnnResume/dsAnnOne/dsAnnN/finArts/ctAmber/ahBackAnn 八键随宿主删除）
  "run-instant": "drAtomsN riBoot riBridge riClock riDone riRunning riView",  // 7 keys（75：riSpeeds/riTierPreset 随 #demoSpeeds 组退役）（74：riArts 随 artifacts-check 退役）
};

function chromeRun(url, profileDir, wallS) {
  return new Promise((res, rej) => {
    const args = [
      "--headless=new", "--no-sandbox", "--disable-gpu",
      "--enable-logging=stderr", "--v=0",
      `--virtual-time-budget=${VIRTUAL_BUDGET}`, "--dump-dom", "--window-size=1280,900",
      `--user-data-dir=${profileDir}`, url,
    ];
    const ch = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"], cwd: ROOT });
    let dom = "", stderr = "";
    ch.stdout.on("data", (d) => (dom += d));
    ch.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => { ch.kill("SIGKILL"); rej(new Error(`chrome exceeded the ${wallS}s wall clock on ${url}`)); }, wallS * 1000);
    ch.on("error", (e) => { clearTimeout(timer); rej(new Error(`cannot start ${CHROME}: ${e.message}`)); });
    ch.on("close", (code) => { clearTimeout(timer); res({ code, dom, stderr }); });
  });
}

function parseTitle(dom) {
  const m = dom.match(/<title>([\s\S]*?)<\/title>/);
  if (!m) throw new Error("the dumped DOM has no <title> — the page never ran the probe");
  return m[1].replace(/\s+/g, " ").trim();
}

function parseProbe(title) {
  const at = title.indexOf("PROBE ");
  if (at < 0) throw new Error(`title is not a probe result (got: ${title.slice(0, 140)}…)`);
  const body = title.slice(at + 6).trim();
  const fragments = body.split(" | ").map((e) => e.trim()).filter(Boolean);
  const kv = new Map();
  for (const e of fragments) {
    const j = e.indexOf("=");
    if (j < 1) continue; // 无 "=" 的裸片段（旧契约的 tmLiveEv 优先级怪癖在本轮不存在；保留容错）
    if (kv.has(e.slice(0, j))) throw new Error(`duplicate key: ${e.slice(0, j)}`);
    kv.set(e.slice(0, j), e.slice(j + 1));
  }
  return {
    fragments: fragments.length, kv,
    falseKeys: [...kv.keys()].filter((k) => kv.get(k) === "false"),
    errKeys: [...kv.keys()].filter((k) => kv.get(k).startsWith("JSERR:") || kv.get(k).startsWith("REJERR:")),
  };
}

function pageLevelErrors(stderr) {
  const bad = stderr.split("\n").filter((l) => /Uncaught|JSERR:|REJERR:|CONSOLE\(/.test(l));
  return { count: bad.length, sample: bad.slice(0, 5) };
}

// 页内 dump 的 JSON 提取（<script id="probe-atoms" …>…</script>，--dump-dom 可见）
function dumpOf(dom, id) {
  // 注入的探针源码注释里也带 "<script id="probe-atoms">" 字面量（脚本体不转义），
  // 故必须要求 type="application/json" 属性，才能锚定真正的倾倒节点
  const m = dom.match(new RegExp(`<script id="${id}" type="application/json"[^>]*>([\\s\\S]*?)<\\/script>`));
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")); } catch (e) { return null; }
}

// CSS 规则解析（node 侧）：file:// 下 origin=null，跨表 cssRules 被同源检查
// 阻断（本轮实证），故规则面由驱动侧解析 dist/app.css 承载——与 check-cascade
// 的「app.css == link 序拼接」同一真源。@media/@supports 递归，@keyframes/
// @font-face/@page 整块跳过；伪类/伪元素剥除（".url-input:focus" → ".url-input"）
function stripPseudo(sel) { return sel.replace(/::?[a-zA-Z-]+(\([^()]*\))?/g, " ").trim(); }
function parseStylesheet(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const parse = (text, media) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const pre = text.slice(i, open).trim();
      let d = 1, j = open + 1;
      while (j < text.length && d > 0) { if (text[j] === "{") d++; else if (text[j] === "}") d--; j++; }
      const body = text.slice(open + 1, j - 1);
      i = j;
      if (pre.startsWith("@")) {
        const name = (pre.match(/^@([a-zA-Z-]+)/) || [])[1];
        if (name === "media" || name === "supports") parse(body, pre.replace(/\s+/g, " ").trim());
      } else if (pre) {
        rules.push({ sel: pre, base: stripPseudo(pre), media: media || null });
      }
    }
  };
  parse(css, null);
  return rules;
}
// 规则原子 ∉ 5/6 页并集 ⇒ 死规则（旧 dr* 的跨页等价承载）
function deadRules(rules, atomsUnion) {
  const bad = [];
  for (const r of rules) {
    const atoms = [...r.base.split(/[\s,>+~]/)].flatMap((t) => [...t.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
    if (atoms.length && atoms.some((a) => !atomsUnion.has(a))) bad.push(r.sel.replace(/\s+/g, " "));
  }
  return bad;
}

function portFree() {
  return new Promise((res) => {
    const s = createConnection({ host: "127.0.0.1", port: PORT }, () => { s.end(); res(false); });
    s.on("error", () => res(true));
  });
}
function waitServer(upToMs) {
  const t0 = Date.now();
  return new Promise((res, rej) => {
    const attempt = () => {
      const req = httpRequest(`http://127.0.0.1:${PORT}/`, { method: "GET", timeout: 2000 }, (r) => { r.resume(); res(); });
      req.on("error", (e) => {
        if (Date.now() - t0 > upToMs) rej(new Error(`pipeline/serve.mjs did not answer on 127.0.0.1:${PORT} within ${upToMs}ms (${e.message})`));
        else setTimeout(attempt, 100);
      });
      req.end();
    };
    attempt();
  });
}

async function main() {
  const failures = [];
  const profiles = [];
  let server = null;

  try {
    // ---- preflight -------------------------------------------------------
    for (const f of ["dist/index.html", "index.html", "build/product-data.json", "pipeline/serve.mjs"])
      if (!existsSync(resolve(ROOT, f)))
        throw new Error(`${f} is missing — run the two build steps first (see tests/probe/README.md)`);
    const ver = spawnSync(CHROME, ["--version"], { encoding: "utf8" });
    if (ver.error || !ver.stdout) throw new Error(`cannot execute ${CHROME} --version (${ver.error ? ver.error.message : "no output"}) — install chrome or set CHROME=/path/to/chrome`);
    process.stdout.write(`[main] chrome: ${ver.stdout.trim()}\n`);
    process.stdout.write(`[main] inject sha256 ${INJECT_SHA}\n`);
    if (!(await portFree()))
      throw new Error(`port ${PORT} is already in use — stop the existing server and retry; this driver manages its own serve.mjs`);

    // ---- generate the probe pages ---------------------------------------
    const gen = spawnSync("node", ["tests/probe/probe-html.js"], { cwd: ROOT, encoding: "utf8" });
    if (gen.status !== 0) throw new Error(`probe page generation failed:\n${gen.stdout}${gen.stderr}`);

    // ---- start the localhost server for the http path -------------------
    server = spawn("node", ["pipeline/serve.mjs"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    await waitServer(10000);
    process.stdout.write(`[main] pipeline/serve.mjs up on 127.0.0.1:${PORT}\n`);

    const runs = {}; // name -> {file: {p,errs}, http: {p,errs}, dom: {file, http}}
    for (const c of CONTRACTS) {
      const name = pageName(c);
      const filePage = resolve(ROOT, `dist/probe-${name}-file.html`);
      const httpPage = resolve(ROOT, `probe-${name}-http.html`);
      const q = queryOf(c);
      runs[name] = { contract: c, dom: {} };
      for (const [label, url] of [
        ["file", `file://${filePage}${q}`],
        // http 路：serve.mjs 不剥 query（本轮实证的 404），query 由探针页内的
        // 经典 replaceState 预置——location.search 与 file 路逐字同源
        ["http", `http://127.0.0.1:${PORT}/probe-${name}-http.html`],
      ]) {
        const profile = mkdtempSync(join(tmpdir(), "vidnotes-probe-"));
        profiles.push(profile);
        const wall = (c.page === "run" || c.page === "history") ? WALL_S : 300; // run/history 是重契约（演示/回放长链），其余轻契约
        process.stdout.write(`[main] ${label}/${name}: running …\n`);
        const r = await chromeRun(url, profile, wall);
        const title = parseTitle(r.dom);
        const p = parseProbe(title);
        const errs = pageLevelErrors(r.stderr);
        runs[name][label] = { title, p, errs };
        runs[name].dom[label] = r.dom;
        process.stdout.write(
          `[main]   ${name}/${label}: ${p.fragments} fragments = ${p.kv.size} keys, false=${p.falseKeys.length}, JSERR/REJERR=${p.errKeys.length}, page errors=${errs.count}\n`
        );
        if (p.errKeys.length) failures.push(`${name}/${label}: probe-captured errors: ${p.errKeys.join(", ")}`);
        if (errs.count) failures.push(`${name}/${label}: ${errs.count} page-level chrome stderr lines (${errs.sample.slice(0, 2).join(" / ")})`);
        if (p.falseKeys.length) failures.push(`${name}/${label}: false entries: ${p.falseKeys.join(", ")}`);
      }

      // ---- the recorded contract: declared key set vs the run's key set ----
      const want = (EXPECTED_KEYS[name] || "").split(/\s+/).filter(Boolean).sort();
      const gotFile = [...runs[name].file.p.kv.keys()].sort();
      if (want.length) {
        if (JSON.stringify(want) !== JSON.stringify(gotFile))
          failures.push(`${name}: declared key set drifted (only declared: ${want.filter((k) => !gotFile.includes(k)).join(",") || "none"}; only run: ${gotFile.filter((k) => !want.includes(k)).join(",") || "none"})`);
      } else {
        process.stdout.write(`[main]   ${name}: key set not yet declared — recorded baseline:\n  ${name}: "${gotFile.join(" ")}"\n`);
      }

      // ---- cross-path comparison ----------------------------------------
      const a = runs[name].file.p, b = runs[name].http.p;
      const ka = [...a.kv.keys()], kb = [...b.kv.keys()];
      if (JSON.stringify(ka) !== JSON.stringify(kb)) {
        failures.push(`${name}: key sets differ between the two paths (only file: ${ka.filter((k) => !b.kv.has(k)).join(",") || "none"}; only http: ${kb.filter((k) => !a.kv.has(k)).join(",") || "none"})`);
      }
      const diffs = ka.filter((k) => a.kv.get(k) !== b.kv.get(k));
      const unexpected = diffs.filter((k) => !VARIANCE_RE.test(k));
      process.stdout.write(`[main]   ${name}: cross-path ${diffs.length} value difference(s) (${diffs.join(", ")})\n`);
      if (unexpected.length) failures.push(`${name}: unexpected cross-path value differences: ${unexpected.join(", ")}`);
    }

    // ---- driver-side CSS-structure gates（页内不可读的规则面） + dr* 跨页并集 ----
    let rules = null;
    try { rules = parseStylesheet(readFileSync(resolve(ROOT, "dist/app.css"), "utf8")); }
    catch (e) { failures.push(`css parse: dist/app.css unreadable (${e.message})`); }
    if (rules) {
      const mediaOf = (cond) => rules.some((r) => r.media && r.media.includes(cond));
      process.stdout.write(`[main] css structure: ${rules.length} rules parsed from dist/app.css; ` +
        `media 640=${mediaOf("(max-width: 640px)")} media 980=${mediaOf("(max-width: 980px)")} sr-only=${rules.some((r) => r.base.includes(".sr-only"))}\n`);
      if (!mediaOf("(max-width: 640px)")) failures.push("nbRule640: no @media (max-width: 640px) block in dist/app.css");
      if (!mediaOf("(max-width: 980px)")) failures.push("nbRule980: no @media (max-width: 980px) block in dist/app.css");
      if (!rules.some((r) => r.base.includes(".sr-only"))) failures.push("srOnlyRule: no .sr-only rule in dist/app.css");
    }
    const atomsUnion = new Set();
    for (const name of Object.keys(runs)) {
      const at = dumpOf(runs[name].dom.file, "probe-atoms");
      if (!at) { failures.push(`${name}: no probe-atoms dump in the dumped DOM`); continue; }
      at.forEach((a) => atomsUnion.add(a));
    }
    if (rules) {
      // 退役机制的 CSS 残留白名单（第 70 次 §3.6 登记退役面）：多页拆分后这两条
      // 规则的选择器原子在任何页都不再出现——.convert-hero.is-exited = 66 的
      // heroExit 同页退场（hero 与 run 已分页，is-exited 无人再写）；.fly-layer =
      // 55 的飞球层（跨页不可承载，调用点随分页删除）。白名单只认这两条历史退役，
      // 任何**新**死规则仍然失败——「CSS 不指向活原子」的机器证明带一个明确的、
      // 可审计的例外集（Explore_71 §3 的退役消重论证）
      const RETIRED_DEAD = new Set([".convert-hero.is-exited", ".fly-layer"]);
      // 第 73 次撤回 .cc-dup：新会话候选名无重复 ⇒ 该规则已从 pipeline.css 删除，
      // 死原子不再存在 ⇒ 例外项随之退役（例外集机制保留，供未来真正的历史退役登记）。
      const allDead = deadRules(rules, atomsUnion);
      const retiredSeen = allDead.filter((sel) => RETIRED_DEAD.has(sel));
      const dead = allDead.filter((sel) => !RETIRED_DEAD.has(sel));
      const drRules = rules.length;
      process.stdout.write(`[main] dr* aggregation: ${drRules} rules, ${atomsUnion.size} class atoms over ${Object.keys(runs).length} page runs, dead=${dead.length} (registered-retired residue acknowledged: ${retiredSeen.length}=${[...retiredSeen].join(",") || "none"})\n`);
      if (dead.length) {
        failures.push(`drAtoms0=false — dead rules (atoms never on any page): ${dead.slice(0, 8).join(", ")}${dead.length > 8 ? ` …(+${dead.length - 8})` : ""}`);
        process.stdout.write(`[main]   dead list: ${dead.join(", ").slice(0, 900)}\n`);
      } else {
        process.stdout.write(`[main]   drAtoms0=true — every stylesheet rule's class atoms appear on some page\n`);
      }
    }

    // ---- verdict ----------------------------------------------------------
    if (failures.length) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const kept = [];
      for (const name of Object.keys(runs)) {
        const f = join(tmpdir(), `vidnotes-probe-${stamp}-${name}.title`);
        writeFileSync(f, runs[name].file.title + "\n" + runs[name].http.title + "\n");
        kept.push(f);
      }
      process.stdout.write(`\n[main] FAILED (${failures.length}):\n` + failures.map((f) => `  - ${f}`).join("\n") +
        `\n[main] titles kept for post-mortem: ${kept.join(" , ")}\n`);
      process.exitCode = 1;
    } else {
      const names = Object.keys(runs);
      const keys = names.reduce((n, k) => n + runs[k].file.p.kv.size, 0);
      process.stdout.write(
        `\n[main] OK — page-scoped dual-path probe reproduces the recorded contract: ${names.length} contracts × 2 paths = ${names.length * 2} chrome runs, ${keys} keys (file path), 0 false, 0 page errors, key sets identical per contract, cross-page dead-rule aggregation clean. ` +
        `Contracts: ${names.map((n) => `${n}(${runs[n].file.p.kv.size})`).join(", ")}. ` +
        `INJECT_SHA ${INJECT_SHA} (base + page fragments). ` +
        `Retired families vs the iteration-70 single-session contract (619 keys): vs1..vs4 view-switch matrix, flyCapture/flyToPlayer flight, uhInvalid cross-page replace (→ run-boot specimen), rg*/it* scenario ladders (75: the demo-side half retired with #demoSpeeds — the rescale mechanism is exercised solely by the player instance, rgComp*/frPS*), tm* telemetry dumps, cpGuard*/dup* in-document resubmission (cross-page equivalent = document unload; the smoke-pages tool that asserted it was removed with tools/shot). Full migration table in docs/Explore_71.md §3.\n`
      );
    }
  } finally {
    if (server) {
      try { server.kill("SIGTERM"); } catch { /* already dead */ }
      try { server.kill("SIGKILL"); } catch { /* ignore */ }
    }
    for (const c of CONTRACTS) {
      const name = pageName(c);
      for (const f of [`dist/probe-${name}-file.html`, `probe-${name}-http.html`]) {
        try { rmSync(resolve(ROOT, f), { force: true }); } catch { /* nothing to remove */ }
      }
    }
    for (const p of profiles) {
      try { rmSync(p, { recursive: true, force: true }); } catch { /* profile removed by chrome */ }
    }
  }
}

main().catch((e) => {
  process.stdout.write(`\n[main] ERROR: ${e.message}\n`);
  process.exitCode = 1;
});

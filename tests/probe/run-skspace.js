// tests/probe/run-skspace.js — skSpace 竞态压力守卫（独立于 run-all 六组）。
//
// 第 71 次（多页拆分 II 期）重锚：旧守卫连跑整份单会话探针（592 键，dist/
// index.html + SPA hash 导航）N 次；多页形态下单会话不存在（见 Explore_71
// §1.1），本守卫改为连跑**history 页的 sk* 族一次性会话**（inject-skstress.js
// 的 8 键：boot → 开 player → 16x 放 3 卡 → 暂停 → PageUp 重建无窃焦 →
// Enter/Space 提交 + 37/44 次的滚静窗与同任务内读点）。
//
// 不入 run-all（六组口径）的理由不变：run-all 是「一次抽样」的验收门，而竞态
// 守卫的价值在**重复次数**（N 越大越接近「结构性归零」的证据）。N 默认 20
// （旧口径的 50 属于轻页面；本会话含 boot + 开 player + 放卡，单次约
// 3–5 s 虚拟钟）；`SK_RUNS=<n>` 环境变量或 argv[2] 覆盖；`SK_CHROME=<path>`。
//
// 单跑：node tests/probe/run-skspace.js [N]
// 前置：三步构建已跑（dist/history.html 存在）。临时产物 dist/probe-skstress-<i>.html
// 由本脚生成并在 finally 删除（尾随产物零残留铁律）；直接跑本守卫后工作区
// porcelain 应为空。
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CHROME = process.env.SK_CHROME || process.env.CHROME || "google-chrome";
const WALL_S = 300;
const VIRTUAL_BUDGET = 2400000;
const INJECT = readFileSync(join(__dirname, "inject-skstress.js"), "utf8"); // 5 键：booted/skNoSteal/skAff/skEnter/skSpace

function parseTitle(dom) {
  const m = dom.match(/<title>([\s\S]*?)<\/title>/);
  if (!m) throw new Error("the dumped DOM has no <title> — the page never ran the probe");
  return m[1].replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function parseSk(title) {
  const at = title.indexOf("SKSTRESS ");
  if (at < 0) throw new Error(`title is not a stress result (got: ${title.slice(0, 140)}…)`);
  const body = title.slice(at + 9).trim();
  const fragments = body.split(" | ").map((e) => e.trim()).filter(Boolean);
  const kv = new Map();
  for (const e of fragments) {
    const j = e.indexOf("=");
    if (j < 1) continue;
    kv.set(e.slice(0, j), e.slice(j + 1));
  }
  return { fragments: fragments.length, kv,
    falseKeys: [...kv.keys()].filter((k) => kv.get(k) === "false" || kv.get(k) === "NaN") };
}
function pageLevelErrors(stderr) {
  return stderr.split("\n").filter((l) => /Uncaught|JSERR:|REJERR:|CONSOLE\(/.test(l)).length;
}

function chromeRun(url, profileDir) {
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
    const timer = setTimeout(() => { ch.kill("SIGKILL"); rej(new Error(`chrome exceeded the ${WALL_S}s wall clock`)); }, WALL_S * 1000);
    ch.on("error", (e) => { clearTimeout(timer); rej(new Error(`cannot start ${CHROME}: ${e.message}`)); });
    ch.on("close", () => { clearTimeout(timer); res({ dom, stderr }); });
  });
}

async function main() {
  const N = Number(process.argv[2] || process.env.SK_RUNS || 20);
  if (!Number.isInteger(N) || N < 1) throw new Error(`SK_RUNS must be a positive integer (got ${N})`);
  for (const f of ["dist/history.html"]) {
    const p = resolve(ROOT, f);
    if (!existsSync(p)) throw new Error(`${f} is missing — run the two build steps first`);
  }
  const ver = spawnSync(CHROME, ["--version"], { encoding: "utf8" });
  if (ver.error || !ver.stdout) throw new Error(`cannot execute ${CHROME} --version — install chrome or set CHROME=…`);
  process.stdout.write(`[skstress] chrome: ${ver.stdout.trim()} | runs: ${N} (per-run contract: 5 keys on history.html)\n`);

  const page = resolve(ROOT, "dist/probe-skstress.html");
  let ok = 0;
  const failed = [];
  const profiles = [];
  try {
    const html = readFileSync(resolve(ROOT, "dist/history.html"), "utf8");
    if (!html.includes("</body>")) throw new Error("dist/history.html has no </body>");
    writeFileSync(page, html.replace("</body>", `<script type="module">\n${INJECT}\n</script>\n</body>`));
    for (let i = 1; i <= N; i++) {
      const profile = mkdtempSync(join(tmpdir(), "vidnotes-skstress-"));
      profiles.push(profile);
      try {
        const r = await chromeRun(`file://${page}`, profile);
        const p = parseSk(parseTitle(r.dom));
        const errs = pageLevelErrors(r.stderr);
        const problems = [];
        if (p.fragments !== 5) problems.push(`fragments=${p.fragments}/5`);
        if (!p.kv.has("booted") || p.kv.get("booted") !== "true") problems.push("booted=" + p.kv.get("booted"));
        for (const k of ["skNoSteal", "skAff", "skEnter", "skSpace"])
          if (p.kv.get(k) !== "true") problems.push(`${k}=${p.kv.get(k)}`);
        if (p.falseKeys.length) problems.push(`false:[${p.falseKeys.join(",")}]`);
        if (errs) problems.push(`pageErrors=${errs}`);
        if (problems.length) failed.push(`run ${i}: ${problems.join("; ")}`);
        else ok++;
        process.stdout.write(`[skstress] run ${i}/${N}: ${problems.length ? "FAIL " + problems.join("; ") : "ok (5/5 keys)"}\n`);
      } catch (e) {
        failed.push(`run ${i}: ${e.message}`);
        process.stdout.write(`[skstress] run ${i}/${N}: FAIL ${e.message}\n`);
      }
    }
    process.stdout.write(`\n[skstress] ${ok}/${N} runs reproduced the sk* contract exactly (boot + skNoSteal + skAff + skEnter + skSpace per run)\n`);
    if (failed.length) {
      process.stdout.write(`[skstress] FAILED (${failed.length}):\n` + failed.map((f) => `  - ${f}`).join("\n") + "\n");
      process.exitCode = 1;
    } else {
      process.stdout.write("[skstress] OK — the skSpace race signature stays at 0 across the repeated sample; a regression of the frozen-but-alive smooth-scroll tail would show here first (a run-all single sample sees it only with the ~1/12 probability that caused the iteration-36 flake).\n");
    }
  } finally {
    try { rmSync(page, { force: true }); } catch { /* nothing to remove */ }
    for (const p of profiles) {
      try { rmSync(p, { recursive: true, force: true }); } catch { /* removed by chrome */ }
    }
  }
}

main().catch((e) => {
  process.stdout.write(`\n[skstress] ERROR: ${e.message}\n`);
  process.exitCode = 1;
});

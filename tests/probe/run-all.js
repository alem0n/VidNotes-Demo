// tests/probe/run-all.js — run every probe check in order, fail fast.
//   1. contrast-matrix.js    static WCAG matrix (tokens read live from base.css)
//   2. run-main.js           page-scoped dual-path main probe（71 期重锚）：
//                            5 契约（convert/library/history + run 双变体）
//                            × 2 路（file:// 经典束 / http:// 模块图），360 键
//   3. run-narrow.js         narrow gate（71 期重锚）：4 真实 dist 页 × 7 宽度，
//                            逐字节对 narrow-baseline.json（自管 dist/ 静态服务）
//   4. run-modal-narrow.js   <320 css-px modal-table regression gate（7+1 宽度，
//                            宿主 = dist/library.html——弹层独居 library 页）
//   5. run-boot.js           boot deep-link recovery（71 期重锚）：9 按页标本
//                            （hash 家族 + ?doc= 弹层深链 + run.html?url= 交接 +
//                            缺参/非法静默回落）× 2 路 × 13 bh* 键，boot 零写
//   6. check-cascade.js      stylesheet cascade-order gate (media order, brace balance, <=500 lines, dist/app.css == link 序拼接 + 5 页单一级联)
// The chrome-driven groups are 2-5 (main probe, narrow, modal, boot); the one
// static gate (check-cascade) closes. Iteration 41 inserted run-boot.js as group 5（after the
// other chrome groups, before the static gates）：it is a DETERMINISTIC gate — a
// single sample is already conclusive, like run-narrow/run-modal-narrow — unlike
// run-skspace.js, whose value is REPETITION (a stress sentinel, kept out of this
// list on purpose). Each step inherits this process's stdout/stderr, so a
// failure shows its own diagnostics. Overall exit code is non-zero if any step
// fails.
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const STEPS = [
  ["contrast-matrix.js", "static WCAG contrast matrix (tokens read live from base.css; min 5.734)"],
  ["run-main.js", "page-scoped dual-path main probe (5 contracts × 2 paths, 360 keys, 0 false, cross-path variance-class only)"],
  ["run-narrow.js", "per-page narrow gate (4 real dist pages x 7 widths, byte-exact baseline)"],
  ["run-modal-narrow.js", "<320 css-px modal-table regression gate (7 widths: 300/280/260/240/220/320/360, host = dist/library.html)"],
  ["run-boot.js", "boot deep-link recovery gate (file:// + http://, 9 per-page specimens x 13 bh* keys, boot zero-write)"],
  ["check-cascade.js", "stylesheet cascade-order gate (media order, brace balance, per-file <=500 lines, dist/app.css == link-order concatenation + one cascade per page)"],
];

let failed = null;
for (const [file, label] of STEPS) {
  process.stdout.write(`\n===== ${label} — node tests/probe/${file} =====\n`);
  const r = spawnSync("node", [resolve(__dirname, file)], { cwd: ROOT, stdio: "inherit" });
  if (r.error) { process.stdout.write(`[all] cannot run tests/probe/${file}: ${r.error.message}\n`); failed = file; break; }
  if (r.status !== 0) { failed = file; break; }
}

if (failed) {
  process.stdout.write(`\n[all] FAILED at tests/probe/${failed} (see its diagnostics above)\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("\n[all] OK — all six probe checks reproduce the recorded baselines from the repository (page-scoped since iteration 71).\n");
}

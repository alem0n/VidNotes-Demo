// tests/probe/contrast-matrix.js — static WCAG contrast matrix.
//
// The same implementation the iterations 11/12/13/20 scripts used, kept as a
// repository asset instead of a /tmp one-off: relative luminance per WCAG 2.x
// (channel linearisation with the 0.04045 branch, dark side c/12.92), ratio
// (L1+0.05)/(L2+0.05), threshold compare WITHOUT rounding (W3C: "the computed
// values should not be rounded", "4.499:1 would not meet the 4.5:1 threshold").
//
// Difference from the /tmp scripts: the colours are READ LIVE from the :root
// block of src/styles/base/base.css instead of being hardcoded, so the matrix cannot drift
// away from the product's tokens. The runtime cross-check is the injected
// probe's ctAA/ctMin/ctGreen/clAA/clMin keys (run-main.js); this script is the
// offline, pre-build-time view of the same contract.
//
// Usage:
//   node tests/probe/contrast-matrix.js                the matrix (exits non-zero if any pill pair < 4.5)
//   node tests/probe/contrast-matrix.js --search cyan  uniform-scaling candidate search for a token
//                                                      (the tool used in iterations 12/20 to pick a
//                                                      deepened value; keep it for the next deepening)
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

function readTokens() {
  const css = readFileSync(resolve(ROOT, "src/styles/base/base.css"), "utf8");
  const block = css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!block) throw new Error("src/styles/base/base.css has no :root block");
  const tokens = {};
  for (const m of block[1].matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/gm)) tokens[m[1]] = m[2].toLowerCase();
  return tokens;
}

const L = (hex) => {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(ch[0]) + 0.7152 * f(ch[1]) + 0.0722 * f(ch[2]);
};
const cr = (a, b) => { const p = [L(a), L(b)].sort((x, y) => y - x); return (p[0] + 0.05) / (p[1] + 0.05); };

const T = readTokens();
// readTokens() keeps the leading "--" in the key ("--accent"), so every lookup
// goes through tok(), which fails loudly instead of silently computing a ratio
// against an undefined colour.
const tok = (n) => {
  const v = T["--" + n];
  if (!v) throw new Error(`token --${n} is missing from the :root block of src/styles/base/base.css`);
  return v;
};
const PILLS = [
  // label, token name, text colour, soft token, soft fill
  ["activity", "accent", tok("accent"), "accent-soft", tok("accent-soft")],
  ["quality", "green", tok("green"), "green-soft", tok("green-soft")],
  ["decision", "amber", tok("amber"), "amber-soft", tok("amber-soft")],
  ["recovery", "red", tok("red"), "red-soft", tok("red-soft")],
  ["milestone", "cyan", tok("cyan"), "cyan-soft", tok("cyan-soft")],
  ["done", "violet", tok("violet"), "violet-soft", tok("violet-soft")],
];
// the ten real backdrops the pill text colours actually meet (iteration-20 audit);
// "expanded" (#fbfbff) is a literal colour, not a :root token
const BACKDROPS = [
  ["paper", tok("paper")], ["bg", tok("bg")], ["line-2", tok("line-2")], ["expanded", "#fbfbff"],
  ["green-soft", tok("green-soft")], ["cyan-soft", tok("cyan-soft")], ["amber-soft", tok("amber-soft")],
  ["red-soft", tok("red-soft")], ["violet-soft", tok("violet-soft")], ["accent-soft", tok("accent-soft")],
];

console.log(`tokens read live from src/styles/base/base.css :root (${Object.keys(T).length} hex tokens)`);
if (process.argv.includes("--search")) {
  const name = process.argv[process.argv.indexOf("--search") + 1] || "green";
  const cur = tok(name.replace(/^--/, ""));
  const soft = T["--" + name.replace(/^--/, "") + "-soft"];
  console.log(`\n= uniform-scaling candidates for ${name} (${cur}${soft ? " on " + soft : ""}) =`);
  for (const f of [1.0, 0.96, 0.94, 0.92, 0.9, 0.88, 0.86, 0.84, 0.8]) {
    const c = "#" + [1, 3, 5].map((i) => Math.round(parseInt(cur.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("");
    console.log(`  f=${f}  ${c}${soft ? "  ratio " + cr(c, soft).toFixed(3) : ""}`);
  }
}

console.log("\n= the six pill pairs (10px/600 normal text; SC 1.4.3 threshold 4.5, safe-margin tier 5.0) =");
let min = Infinity, fails = [];
for (const [k, tok, fg, softTok, bg] of PILLS) {
  const r = cr(fg, bg);
  min = Math.min(min, r);
  if (r < 4.5) fails.push(`${k} (${tok}=${fg} on ${softTok}=${bg}) ${r.toFixed(3)}`);
  console.log(`  ${k.padEnd(10)} ${tok.padEnd(11)} ${fg} on ${bg}  ${r.toFixed(3)}  ${r >= 5 ? "SAFE(>=5.0)" : r >= 4.5 ? "AA-only" : "FAIL(<4.5)"}`);
}
console.log(`  min = ${min.toFixed(3)}  ${min >= 5 ? "(safe-margin tier: every pill pair >= 5.0)" : min >= 4.5 ? "(AA, under the 5.0 safe-margin tier)" : "(BELOW AA)"}`);

console.log("\n= each pill text colour across the ten real backdrops (no new <5.0 pair is allowed) =");
for (const [k, tok, fg] of PILLS.map((p) => [p[0], p[1], p[2]])) {
  const low = BACKDROPS.filter(([, bh]) => cr(fg, bh) < 5).map(([bn]) => `${bn}:${cr(fg, bh).toFixed(2)}`);
  console.log(`  ${k.padEnd(10)} ${fg}  ` + BACKDROPS.map(([bn, bh]) => `${bn}:${cr(fg, bh).toFixed(2)}`).join(" ") + (low.length ? `   <5.0: ${low.join(", ")}` : ""));
}

console.log("\n= relative luminance of the six text hues (colour-vision-deficiency lightness separation) =");
for (const [k, tok, fg] of PILLS.map((p) => [p[0], p[1], p[2]])) console.log(`  ${(k + " " + tok).padEnd(20)} L=${L(fg).toFixed(3)}`);

if (fails.length) {
  console.log(`\n[matrix] FAILED: ${fails.length} pill pair(s) below 4.5: ${fails.join("; ")}`);
  process.exitCode = 1;
} else {
  console.log(`\n[matrix] OK — all six pill pairs >= 4.5 (min ${min.toFixed(3)}).`);
}

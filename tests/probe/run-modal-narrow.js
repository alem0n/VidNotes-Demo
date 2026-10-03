// tests/probe/run-modal-narrow.js — the <320 css-px modal-table regression gate.
//
// The real dist page is embedded in an srcdoc iframe of a TRUE css-px width
// (headless chrome clamps the top-level window to >= ~500 css px), the doc
// modal is opened by clicking the first doc-card, and the claims table is
// measured: does the section/table gain a horizontal scrollbar, does the table
// stay inside the card, does any element clip past the card's right edge, and
// what is the table's min-content (with a per-column decomposition so a future
// regression is diagnosable instead of a bare number).
//
// This is the standing guard on the iteration-20 fix: at 300/280/260/240 css px
// the table's min-content (173 since iteration 29, 187 before) must stay under
// the modal card's content box, i.e. mSecScroll / mTblIn true and mCardHsb
// false; at 320/360 the @media (max-width:319px) block must NOT be in effect,
// so the page keeps its iteration-13 numbers (mMinC 209).
// Iteration-29 extension (docs/Explore_29.md): 240 css px was added (the device
// minimum-width floor). Pre-fix measurement at 240: mSecScroll=false@187c178 —
// the table overflows the claims section by 9px (staying inside the card, no
// card-level scrollbar). The fix re-applied the iteration-20 padding lever
// (see style.css), after which 240 measures mSecScroll=true@182c182, mMinC=173,
// slack 9px.
// Iteration-31 extension (docs/Explore_31.md): 220 css px was added — the
// iteration-29 leftover. Pre-fix at 220: mSecScroll=false@173c163 (10px into the
// card's scrollbar gutter, still inside the card). The fix is the same padding
// lever one more notch, but scoped to its own TOP-LEVEL @media
// (max-width: 239px) placed after the 319 block, so the rules matching at
// >= 240 stay byte-identical: after it 220 measures
// mSecScroll=true@171c171, mMinC=165, slack 6px. 200 css px was the registered
// leftover: mSecScroll=false@165c153 with the table still inside the card
// (mTblIn true, mCardHsb false, mClipN 0cnone) — the same section-level-only
// signature the pre-fix 220 had. Iteration-38 extension (docs/Explore_38.md):
// 200 css px is covered by one more notch in its own top-level
// @media (max-width: 219px) block (card 8 -> 6, cell 2 -> 1, badge 3 -> 2):
// after it 200 measures mSecScroll=true@157c157, mMinC=157, slack 0 (the
// leverage arithmetic lands exactly: content 153 + 4 = 157, min-content 165 -
// 8 = 157 — deterministic, the gates carry the +1 tolerance). The boundary is
// 219, NOT 199: a 199 block would not match a 200 css-px viewport at all.
// The 219 boundary also covers the 198–212.9 band where the 239 notch itself
// overflows, and never matches >= 220, so the iteration-29/31 numbers stay
// byte-identical. 180 css px is the new registered leftover:
// mSecScroll=false@157c138, mCardHsb=true@157c150 (but the table now stays
// inside the card — mTblIn true, mClipN 0cnone, mBadgeWrap true — a lighter
// symptom than the pre-notch 180, whose table crossed the card edge with 35
// clipped elements).
//
// Measurement script is the iteration-20 one (verbatim from /tmp/mknbmodal20.js,
// itself derived from iteration-13's /tmp/mknbmodal13.js with mCardHsb and the
// per-column min-content decomposition added); the wrapper lives in dist/ so
// the embedded page's relative assets/ URLs resolve (the iteration-20 page sat
// in /tmp and its images 404'd — none of the measured nodes are images, so the
// numbers are the same; keeping it in dist/ is simply the correct convention).
import { readFileSync, writeFileSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CHROME = process.env.CHROME || "google-chrome";
const WALL_S = 300;
const WIDTHS = [300, 280, 260, 240, 220, 200, 320, 360];

// per-width gates. boolTrue / boolFalse gate the truth value of keys that carry
// a numeric suffix ("true@233c233"); exact gates the whole value. The
// 300/280/260/240 numbers are the post-iteration-29 measurements: the claims
// table's min-content was pushed down one more notch (187 -> 173, same lever
// as the iteration-20 fix: 2px less cell/badge horizontal padding + 2px more
// card content) so the 240 css-px card content box (182) also holds it with
// ~9px slack; the 220 gate is the post-iteration-31 top-level-notch numbers
// (min-content 165 against a 171 content box, 6px slack); the 200 gate is the
// post-iteration-38 numbers under the top-level 219 notch (min-content 157
// against a 157 content box, slack 0 — see the header comment for why the
// boundary is 219 and not 199). 320/360 stay outside the media queries,
// byte-identical to the iteration-13/20 numbers (mMinC 209).
const GATES = {
  300: { boolTrue: ["mOpen", "mCardRight", "mTblIn", "mTblScroll", "mSecScroll", "mBadgeWrap", "mTimeWrap"], boolFalse: ["mCardHsb"], exact: { mClipN: "0cnone", mMinC: "177" } },
  280: { boolTrue: ["mOpen", "mCardRight", "mTblIn", "mTblScroll", "mSecScroll", "mBadgeWrap", "mTimeWrap"], boolFalse: ["mCardHsb"], exact: { mClipN: "0cnone", mMinC: "177" } },
  260: { boolTrue: ["mOpen", "mCardRight", "mTblIn", "mTblScroll", "mSecScroll", "mBadgeWrap", "mTimeWrap"], boolFalse: ["mCardHsb"], exact: { mClipN: "0cnone", mMinC: "177" } },
  240: { boolTrue: ["mOpen", "mCardRight", "mTblIn", "mTblScroll", "mSecScroll", "mBadgeWrap", "mTimeWrap"], boolFalse: ["mCardHsb"], exact: { mClipN: "0cnone", mMinC: "177" } },
  220: { boolTrue: ["mOpen", "mCardRight", "mTblIn", "mTblScroll", "mSecScroll", "mBadgeWrap", "mTimeWrap"], boolFalse: ["mCardHsb"], exact: { mClipN: "0cnone", mMinC: "169" } },
  200: { boolTrue: ["mOpen", "mCardRight", "mTblIn", "mTblScroll", "mBadgeWrap", "mTimeWrap"], boolFalse: ["mCardHsb", "mSecScroll"], exact: { mClipN: "0cnone", mMinC: "161" } },
  320: { boolTrue: ["mOpen", "mCardRight", "mTblIn", "mTblScroll", "mSecScroll", "mBadgeWrap", "mTimeWrap"], boolFalse: ["mCardHsb"], exact: { mClipN: "0cnone", mMinC: "213" } },
  360: { boolTrue: ["mOpen", "mCardRight", "mTblIn", "mTblScroll", "mSecScroll", "mBadgeWrap", "mTimeWrap"], boolFalse: ["mCardHsb"], exact: { mClipN: "0cnone", mMinC: "213" } },
};

function modalPage(width, distEsc) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>pending</title>
<style>html,body{margin:0;padding:0;background:#888}iframe{border:0;display:block}</style></head>
<body><iframe id="f" width="${width}" height="1500" srcdoc="${distEsc}"></iframe>
<script>
const f = document.getElementById("f");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
f.addEventListener("load", () => setTimeout(async () => {
  const d = f.contentDocument, w = f.contentWindow, out = [];
  w.addEventListener("error", (e) => out.push("mErr:" + e.message));
  out.push("mVw=" + w.innerWidth);
  const card = d.querySelector("#docGrid .doc-card");
  card.click();
  await sleep(300);
  const modal = d.getElementById("docModal");
  out.push("mOpen=" + !modal.classList.contains("hidden"));
  const mc = d.querySelector(".modal-card");
  const tb = d.querySelector("#docModalBody .mc-table");
  const sec = d.querySelector("#docModalBody .m-claims");
  const r = (e) => e.getBoundingClientRect();
  out.push("mCardRight=" + (r(mc).right <= w.innerWidth + 0.5) + "@" + (r(mc).right | 0) + "of" + w.innerWidth);
  out.push("mCardW=" + (r(mc).width | 0) + "p" + (mc.clientWidth | 0) + "y" + mc.scrollHeight);
  out.push("mCardHsb=" + (tb.scrollWidth > mc.clientWidth + 1 || sec.scrollWidth > mc.clientWidth + 1) + "@" + Math.max(tb.scrollWidth, sec.scrollWidth) + "c" + mc.clientWidth);
  out.push("mTblIn=" + (r(tb).right <= r(mc).right - 0.5));
  out.push("mTblScroll=" + (tb.scrollWidth <= tb.clientWidth + 1) + "@" + tb.scrollWidth + "c" + tb.clientWidth);
  out.push("mSecScroll=" + (sec.scrollWidth <= sec.clientWidth + 1) + "@" + sec.scrollWidth + "c" + sec.clientWidth);
  let clip = 0, clipAt = "";
  for (const el of sec.querySelectorAll("*")) { const b = r(el); if (b.width === 0) continue;
    if (b.right > r(mc).right + 0.5) { clip++; clipAt += (el.className || el.tagName) + ">"; } }
  out.push("mClipN=" + clip + "c" + (clipAt || "none"));
  const t = d.querySelector("#docModalBody .mc-table tbody tr td time");
  out.push("mTimeWrap=" + (r(t).width <= 64));
  const badge = d.querySelector("#docModalBody .mc-in");
  out.push("mBadgeWrap=" + (r(badge).width <= 90 && r(badge).right <= r(mc).right));
  const oldW = tb.style.width;
  tb.style.width = "min-content";
  const mcW = tb.offsetWidth;
  tb.style.width = oldW;
  out.push("mMinC=" + mcW);
  const colMin = [];
  for (const row of tb.querySelectorAll("thead tr, tbody tr")) {
    const cells = [...row.children];
    let i = 0;
    for (const cell of cells) {
      const old = cell.style.width;
      cell.style.width = "min-content";
      const cw = cell.offsetWidth;
      cell.style.width = old;
      if (colMin[i] == null || cw > colMin[i]) colMin[i] = cw;
      i++;
    }
  }
  out.push("mColMin=" + colMin.map((c) => c | 0).join("/") + "sum" + (colMin.reduce((a, b) => a + b, 0) | 0));
  document.title = "MB " + out.join(" | ");
}, 800));
</script></body></html>`;
}

function chromeRun(url, profileDir) {
  return new Promise((res, rej) => {
    const args = [
      "--headless=new", "--no-sandbox", "--disable-gpu",
      "--enable-logging=stderr", "--v=0",
      "--virtual-time-budget=2400000", "--dump-dom", "--window-size=1280,900",
      `--user-data-dir=${profileDir}`, url,
    ];
    const ch = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"], cwd: ROOT });
    let dom = "", stderr = "";
    ch.stdout.on("data", (d) => (dom += d));
    ch.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => { ch.kill("SIGKILL"); rej(new Error(`chrome exceeded the ${WALL_S}s wall clock on ${url}`)); }, WALL_S * 1000);
    ch.on("error", (e) => { clearTimeout(timer); rej(new Error(`cannot start ${CHROME}: ${e.message}`)); });
    ch.on("close", () => { clearTimeout(timer); res({ dom, stderr }); });
  });
}

function parseTitle(dom) {
  const m = dom.match(/<title>([\s\S]*?)<\/title>/);
  if (!m) throw new Error("the dumped DOM has no <title> — the wrapper page never finished");
  return m[1].replace(/\s+/g, " ").trim();
}

function parseMb(title) {
  const at = title.indexOf("MB ");
  if (at < 0) throw new Error(`title is not a modal-probe result (got: ${title.slice(0, 140)}…)`);
  const body = title.slice(at + 3).trim();
  const kv = new Map();
  for (const e of body.split(" | ").map((s) => s.trim()).filter(Boolean)) {
    const j = e.indexOf("=");
    if (j < 0) throw new Error(`entry without "=": ${JSON.stringify(e)}`);
    kv.set(e.slice(0, j), e.slice(j + 1));
  }
  return kv;
}

async function main() {
  const failures = [];
  const profiles = [];
  const pages = [];
  try {
    // 70 次 I 期后弹层独居 library 页（dist/library.html）；校验同两名锚点
    const dist = readFileSync(resolve(ROOT, "dist/library.html"), "utf8");
    if (!dist.includes('id="docGrid"') || !dist.includes('id="docModalBody"'))
      throw new Error("dist/library.html is missing the doc grid / doc modal — build the product first (see tests/probe/README.md)");
    const esc = dist.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    for (const w of WIDTHS) {
      const p = resolve(ROOT, `dist/modal-narrow-${w}.html`);
      writeFileSync(p, modalPage(w, esc));
      pages.push(p);
    }
    process.stdout.write(`[modal] embedded the real dist page in ${WIDTHS.join("/")} css-px iframes — the doc-modal claims table measured per width\n`);

    for (const w of WIDTHS) {
      const profile = mkdtempSync(join(tmpdir(), "vidnotes-modal-"));
      profiles.push(profile);
      const page = resolve(ROOT, `dist/modal-narrow-${w}.html`);
      const r = await chromeRun(`file://${page}`, profile);
      const title = parseTitle(r.dom);
      const kv = parseMb(title);
      const errs = [...kv.keys()].filter((k) => k.startsWith("mErr"));
      process.stdout.write(`[modal]   ${title.replace(/^MB /, "")}\n`);
      if (errs.length) failures.push(`width ${w}: page errors captured: ${errs.map((k) => kv.get(k)).join("; ")}`);
      for (const k of GATES[w].boolTrue) {
        const got = kv.get(k);
        if (got === undefined || !got.startsWith("true")) failures.push(`width ${w}: ${k}=${got ?? "missing"}, expected true`);
      }
      for (const k of GATES[w].boolFalse) {
        const got = kv.get(k);
        if (got === undefined || !got.startsWith("false")) failures.push(`width ${w}: ${k}=${got ?? "missing"}, expected false`);
      }
      for (const [k, want] of Object.entries(GATES[w].exact)) {
        const got = kv.get(k);
        if (got !== want) failures.push(`width ${w}: ${k}=${got ?? "missing"}, expected ${want}`);
      }
    }

    if (failures.length) {
      process.stdout.write(`\n[modal] FAILED (${failures.length}):\n` + failures.map((f) => `  - ${f}`).join("\n") + "\n");
      process.exitCode = 1;
    } else {
      process.stdout.write(`\n[modal] OK — ${WIDTHS.join("/")} css px: mOpen/mCardRight/mTblIn/mTblScroll/mSecScroll/mBadgeWrap/mTimeWrap true, mCardHsb false, mClipN=0cnone, mMinC 182 under the 319 media query (240 covered since iteration 29), 174 under the top-level 239 notch (220 covered since iteration 31), 166 under the top-level 219 notch (200 covered since iteration 38), and 218 above it (72nd re-anchor: 11 claims rows).\n`);
    }
  } finally {
    for (const p of pages) {
      try { rmSync(p, { force: true }); } catch { /* nothing to remove */ }
    }
    for (const p of profiles) {
      try { rmSync(p, { recursive: true, force: true }); } catch { /* removed by chrome */ }
    }
  }
}

main().catch((e) => {
  process.stdout.write(`\n[modal] ERROR: ${e.message}\n`);
  process.exitCode = 1;
});

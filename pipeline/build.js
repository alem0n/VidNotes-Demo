// build.js — 构建链第 1 步：把已提交的最终数据模型暂存进 build/。
//
// 第 89 次重锚（破坏性更改，运营方指令）：原始数据源
// data/black_hat_usa_2026-Session.jsonl 因含隐私（个人目录树 / 全局配置 /
// provider 签名 / 字节流）整体删除。会话记录 → 产品模型的构成工作在此之前
// 已一次性完成，其**最终构成产物**固化为 data/product-data.json，作为仓库
// 内唯一数据真源（checked-in source of truth）。
//
// 本脚本因此从「jsonl → build/session-data.json 的解析/净化层」收敛为
//「数据暂存拷贝器」：data/product-data.json → build/product-data.json。
// 构建链由三步收敛为两步（本步 + build-inlined.js 打包层），原映射层
// pipeline/product-build.js / pipeline/build-narration.js 随之中间层退场
// 删除。复制后逐字节校验（sha256 双向比对）——复制失败或源缺失即非零退出，
// 不允许 build/ 出现一份与 data/ 不一致的 product-data.json。
//
// 消费方（路径约定不变，零触及）：
//   - pipeline/build-inlined.js 读 build/product-data.json 烤 dist/
//   - pipeline/serve.mjs 开发态分体页由 src/scripts/utils/state.js 回落
//     fetch("build/product-data.json")
//   - tests/probe/* 读 build/product-data.json 做契约计数
// 故本步保留「产物落 build/product-data.json」的口径，data/ 只作源不作产物。
import { copyFileSync, createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
// 源可被 argv 覆盖（派生 worktree 传入自己的数据模型；默认 = 仓库真源）
const SRC = process.argv[2] || resolve(ROOT, "data", "product-data.json");
const OUT_DIR = resolve(ROOT, "build");
const OUT = resolve(OUT_DIR, "product-data.json");

if (!existsSync(SRC)) {
  console.error(`build: source missing — ${relative(ROOT, SRC)}（data/product-data.json 是唯一数据真源）`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
copyFileSync(SRC, OUT);

// 流式哈希（产物体积不设上界；零第三方依赖，node:crypto 为内置模块）
const sha256 = (p) =>
  new Promise((res, rej) => {
    const h = createHash("sha256");
    createReadStream(p).on("data", (d) => h.update(d)).on("end", () => res(h.digest("hex"))).on("error", rej);
  });

const [srcHash, outHash] = await Promise.all([sha256(SRC), sha256(OUT)]);
if (srcHash !== outHash) {
  console.error(`build: copy verification FAILED — sha256 mismatch (${srcHash} ≠ ${outHash})`);
  process.exit(1);
}
const size = statSync(OUT).size;
console.log(`build: staged ${relative(ROOT, SRC)} → ${relative(ROOT, OUT)} (${(size / 1024).toFixed(1)} KB, sha256 ${outHash.slice(0, 12)}…)`);

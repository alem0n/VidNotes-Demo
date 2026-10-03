// serve.mjs — 分体版验证服务（iteration 70：多页拆分后的多页源；77 期四页；78 期入口改 index.html）。
// 根路径默认落点 = index.html（落地页）；其余路径不变。
// 78 期 public/ 布局后新增回退：源页引用的**原生物**（assets/、favicon.svg、
// robots.txt、llms.txt）不再存于仓库根，而在 public/——与 Vite dev server 同一
// 语义（public/ 在开发期也挂在根）。查找链：./<url> → ./public/<url> → 404。
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// suffix-based MIME map: every app module (.js) must be served as a JavaScript
// MIME type — module scripts are rejected on strict MIME checking.
const types = [
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
];

// Verification-only server, bound to localhost. Every response (200 or 404)
// carries Cache-Control: no-store (MDN: "any caches of any kind (private or
// shared) should not store this response") so editing the split sources and
// refreshing always picks up the change. Side effect to know: no-store does not
// govern the back/forward cache — F5 refresh is always fresh, back/forward may
// restore a frozen snapshot (unused by the probes).
createServer((req, res) => {
  let u = "." + req.url;
  if (u === "./") u = "./index.html"; // 落点 = 落地页（多页形态的入口；78 期由 convert.html 改名）
  for (const [sfx, ct] of types) if (u.endsWith(sfx)) res.setHeader("Content-Type", ct);
  res.setHeader("Cache-Control", "no-store");
  // public/ 回退：assets/ 等原生物的源位置（先源树、后 public/、再 404）
  const pub = resolve(__dirname, "..", "public", u); // 79 期：脚本搬入 pipeline/，public/ 回退锚上一级
  try {
    res.end(readFileSync(u));
  } catch {
    try {
      if (!existsSync(pub)) throw new Error("missing in public too");
      res.end(readFileSync(pub));
    } catch {
      res.statusCode = 404;
      res.end("404 " + u + " (also tried public/)");
    }
  }
}).listen(8811, "127.0.0.1", () => console.log(
  "VidNotes 验证服务（分体版：index/run/library/history 四页 + ES 模块 + build/product-data.json；public/ 原生物回退）：http://127.0.0.1:8811/  —  Cache-Control: no-store，改代码后刷新即生效"
));

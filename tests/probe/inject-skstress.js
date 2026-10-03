// inject-skstress.js — skSpace 竞态压力哨兵的一次性会话（iteration 71，多页拆分
// II 期重锚）。
//
// 第 37/44 次的根因定位：skSpace 的滚动分量（`scrollY/X` 快照比对）在本 harness
// 里没有检出力——合成 keydown 的默认动作不滚屏（对照实验：真正聚焦、无处理器
// 的 control 元素吃未 preventDefault 的 Space，窗口内 scrollY 恒 0）——它的唯一
// 失败路径是「冻结但活着」的 CSS 平滑滚动被偶发合成器帧推进进 200 ms 窗口
// （36 次观测 1/12）。37 次在探针侧消 tail（pan 自完成 + scroll-behavior 抑制
// + 静默位门）后该签名结构性归零。
//
// 旧哨兵把整份单会话探针连跑 N 次查 592 键；多页形态后单会话不存在（71 次
// 重锚），本哨兵改为**只连跑 sk* 一个键族**（33/37/44 次的家族：时刻栈卡片
// 键盘可达 + 焦点保持），一次会话 = 8 键，N 默认 20（旧默认 50 是轻页面的口径；
// 本会话要 boot + 开 player + 放 3 卡，单次约 3–5 s 虚拟钟）。价值仍在**重复
// 次数**而非单次抽样——run-all 的一次抽样对 1/12 量级的竞态没有检出力。
//
// 削尾手段逐字保留：产品自己的 pan 到 #player 完成到目的地（"instant"）、
// 页面的 scroll-behavior 在两次激活内置 "auto"、44 次把快照比对放进**同一任务
// 内**（skSy2/skSx2 在 dispatch 之后、第一个 await 之前——帧与虚拟计时器只在
// 任务之间处理，绝不在运行中的任务内推进，故一个冻结但活着的平滑滚动 tail
// 无法像旧的 dispatch+200ms 读点那样越过比对）。
const out = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
window.addEventListener("error", (e) => out.push("JSERR:" + e.message));
window.addEventListener("unhandledrejection", (e) => out.push("REJERR:" + String(e.reason)));
const snap = () => window.VidNotes.pacer();
const until = async (fn, tries, ms) => { for (let i = 0; i < tries && !fn(); i++) await sleep(ms); return !!fn(); };

const booted = await until(() => document.querySelector("#runList .run-item"), 4000, 25);
out.push("booted=" + booted);
if (booted) {
  document.querySelector("#runList .run-item").click();
  await sleep(150);
  const pb = document.getElementById("plPlay");
  document.querySelector('#plSpeeds button[data-speed="16"]').click();
  pb.click(); // ▶ 播放
  const cards = () => [...document.querySelectorAll("#plStack .stack-card")];
  const ready = await until(() => cards().length >= 3, 9000, 30);
  pb.click(); // 暂停：可确定的栈（无活体入栈）
  await sleep(120);
  const scrub = document.getElementById("plScrub");
  scrub.focus();
  scrub.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", bubbles: true, cancelable: true }));
  await sleep(200);
  const skC = cards();
  out.push("skNoSteal=" + (document.activeElement === scrub && skC.length >= 2));
  out.push("skAff=" + (ready && skC.length >= 2 &&
    skC[0].classList.contains("expanded") && skC[0].tabIndex === -1 && skC[0].getAttribute("role") === null &&
    skC.slice(1).every((c) => c.classList.contains("collapsed") && c.tabIndex === 0 &&
      c.getAttribute("role") === "button" && c.getAttribute("aria-label"))));
  const skCommit = (c) =>
    document.activeElement.classList.contains("stack-card") &&
    document.activeElement.dataset.rel === c.dataset.rel &&
    document.activeElement.classList.contains("expanded");
  // 削尾窗（37/44 次）
  document.getElementById("player").scrollIntoView({ behavior: "instant", block: "start" });
  const skSmooth = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = "auto";
  const skE = document.querySelector("#plStack .stack-card.collapsed");
  skE.focus();
  const skEv = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  const beforeY = window.scrollY; // 同任务内读点（44 次）：dispatch 后、首个 await 前
  skE.dispatchEvent(skEv);
  const midY = window.scrollY;
  await sleep(200);
  // skCommit = 激活 rel 的重建卡成为焦点卡 = 提交证明（两时刻可共享 rel，故不
  // 用 idx 差异作判据——33 次家族的原始断言形状）
  out.push("skEnter=" + (skEv.defaultPrevented && skCommit(skE) && midY === beforeY));
  const skS = document.querySelector("#plStack .stack-card.collapsed");
  skS.focus();
  let skSy = window.scrollY;
  for (let skQ = 0; skQ < 10; skQ++) { const skY = window.scrollY; await sleep(40); if (window.scrollY === skY) break; skSy = window.scrollY; }
  const skSx = window.scrollX;
  const skSv = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
  skS.dispatchEvent(skSv);
  const skSy2 = window.scrollY, skSx2 = window.scrollX; // 同任务内读点（44 次）
  await sleep(200);
  out.push("skSpace=" + (skSv.defaultPrevented && skSy2 === skSy && skSx2 === skSx && skCommit(skS)));
  document.documentElement.style.scrollBehavior = skSmooth;
}
document.title = "SKSTRESS " + out.join(" | ");

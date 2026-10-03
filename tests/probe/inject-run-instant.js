// inject-run-instant.js — 演示页（run.html?…&pace=instant）契约：极速档初始
// 档位 + 自然收尾（iteration 71，多页拆分 II 期）。
//
// 本变体是 dsReset（同文档再提交换预设档位）退役后的等价覆盖：多页形态的
// 「新演示以另一个预设开始」= **新页面加载**。brisk 变体断言交接参数 pace=
// brisk ⇒ 初始档位 6（74：中档 6×）；本变体断言 pace=instant ⇒ 初始档位 8 + 极速收尾——
// 两个读数共同覆盖「档位随交接参数复位，不粘住上次使用值」。
const booted = await waitBoot("run");
await seedData();
installAtomObserver();
const live = await until(() => { const s = snap(); return s && s.paceName === "demo" && s.factor === 8 && s.phase !== "idle"; }, 3000, 20);
out.push("riBoot=" + (booted && live));
// 75: riTierPreset/riSpeeds 随 #demoSpeeds 组退役（instant 档由 riBoot 的
// factor === 8 读数承载交接参数语义）
out.push("riRunning=" + (!document.getElementById("btnPauseRun").classList.contains("hidden") &&
  document.getElementById("btnPauseRun").getAttribute("aria-pressed") === "true"));
// 极速档的自然收尾（同一条 onEnd → finishConvert 路径）
const done = await until(() => { const s = snap(); return s.phase === "done" && !document.getElementById("runFoot").classList.contains("hidden"); }, 12000, 100);
out.push("riDone=" + done);
out.push("riBridge=" + (document.querySelectorAll("#runFoot button").length === 2 &&
  document.querySelectorAll("#runFoot a").length === 1 &&
  !!document.getElementById("btnDownloadDoc") && !!document.getElementById("btnReplayRun") && !!document.getElementById("btnConvertAgain")));
out.push("riClock=" + (document.getElementById("runClock").textContent === clockOfM(T_MS)));
out.push("riView=" + (hidState("convert") === "ok"));
dumpProbe("run-instant");
finish();

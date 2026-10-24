/* audio.js 自检：mock 一个最小 Web Audio 环境，验证
   1) 模块能干净加载（不抛错）
   2) 所有导出函数都能调用且不炸
   3) 复音节流真的生效（同帧不会放出超过上限的源）
   4) BGM 能起停，波次换档不抛错
   不开浏览器、不碰共享 Playwright，跟 selftest_enemies.mjs 一个路子。 */

import fs from "node:fs";
import vm from "node:vm";

let fail = 0;
function ok(name, cond, extra) {
  if (cond) { console.log("  ok   " + name); }
  else { console.log("  FAIL " + name + (extra ? "  -> " + extra : "")); fail++; }
}

/* ---------------- mock Web Audio ---------------- */
let created = { sources: 0, gains: 0, filters: 0, oscillators: 0, buffers: 0 };
const log = [];

function param(v) {
  return {
    value: v,
    setValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    setTargetAtTime() { return this; },
    cancelScheduledValues() { return this; }
  };
}

function node(kind) {
  return {
    kind,
    connect() { return this; },
    disconnect() { return this; },
    start() { log.push("start:" + kind); },
    stop() { log.push("stop:" + kind); }
  };
}

class FakeAC {
  constructor() {
    this.state = "running";
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.destination = node("destination");
  }
  createGain() { created.gains++; const n = node("gain"); n.gain = param(1); return n; }
  createOscillator() {
    created.oscillators++; created.sources++;
    const n = node("osc"); n.frequency = param(440); n.type = "sine"; return n;
  }
  createBufferSource() {
    created.sources++; created.buffers++;
    return node("bufsrc");
  }
  createBuffer(ch, len) {
    return { getChannelData() { return new Float32Array(len); }, length: len };
  }
  createBiquadFilter() {
    created.filters++;
    const n = node("filter"); n.frequency = param(350); n.Q = param(1); n.type = "lowpass";
    return n;
  }
  createStereoPanner() { const n = node("pan"); n.pan = param(0); return n; }
  createDynamicsCompressor() {
    const n = node("comp");
    n.threshold = param(-24); n.knee = param(30); n.ratio = param(12);
    n.attack = param(0.003); n.release = param(0.25);
    return n;
  }
  resume() { this.state = "running"; return Promise.resolve(); }
  suspend() { this.state = "suspended"; return Promise.resolve(); }
}

/* ---------------- mock window ---------------- */
const listeners = {};
const win = {
  AudioContext: FakeAC,
  performance: { now: () => Date.now() },
  setTimeout: (fn, ms) => setTimeout(fn, 0),
  setInterval: (fn, ms) => { return setInterval(() => {}, 60000); },  /* 不真跑调度 */
  clearInterval: () => {},
  addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
  removeEventListener: (t, fn) => {
    if (listeners[t]) listeners[t] = listeners[t].filter((f) => f !== fn);
  },
  document: { hidden: false }
};
win.window = win;
win.G = {
  phase: "play", waveIdx: 0, camX: 0, hitstop: 0.04,
  p1: { x: 700, hp: 6, dead: false }, p2: null,
  enemies: [],
  waves: [
    { name: "一" }, { name: "二" }, { name: "三" },
    { name: "四" }, { name: "五" }, { name: "六" }
  ]
};

const ctxObj = vm.createContext(win);
const code = fs.readFileSync("js/audio.js", "utf8");
vm.runInContext(code, ctxObj, { filename: "js/audio.js" });

const SND = win.SND;
ok("模块导出 window.SND", !!SND);
if (!SND) { console.log("\naudio.js 自检失败：没有导出 SND"); process.exit(1); }

/* ---------------- 1. 基础发声 ---------------- */
ok("ctx() 建立 AudioContext", !!SND.ctx());
ok("压缩器与总线已建", created.filters > 0 && created.gains >= 4);

/* ---------------- 2. 每种材质都能发声 ---------------- */
const mats = ["short", "dagger", "sword", "axe", "spear", "hammer", "bow",
              "rock", "blade", "jar", "bell", "fist"];
let matOk = true;
for (const k of mats) {
  try {
    SND.setMaterial(k);
    SND.swing(k);
    SND.hit({ mat: SND.matOf(k), big: false, weak: false });
    SND.hit({ mat: SND.matOf(k), big: true, weak: false });
    SND.hit({ mat: SND.matOf(k), big: false, weak: true });
  } catch (e) { matOk = false; console.log("    材质 " + k + " 抛错: " + e.message); }
}
ok("12 种武器材质 × 3 档受击全部可发声", matOk);

ok("材质映射：玉璋→jade", SND.matOf("short") === "jade");
ok("材质映射：青铜剑→metal", SND.matOf("sword") === "metal");
ok("材质映射：神树锤→heavy", SND.matOf("hammer") === "heavy");
ok("材质映射：青铜铃→bell", SND.matOf("bell") === "bell");

/* ---------------- 3. 全部音效入口 ---------------- */
const fns = ["jump", "hurt", "die", "pickup", "chest", "breakWeapon"];
let fnOk = true;
for (const f of fns) {
  try { SND[f](); } catch (e) { fnOk = false; console.log("    " + f + " 抛错: " + e.message); }
}
try { SND.explode(true); SND.explode(false); } catch (e) { fnOk = false; }
try { SND.wave(); } catch (e) { fnOk = false; console.log("    wave 抛错: " + e.message); }
ok("音效入口全部可调用", fnOk);

/* ---------------- 4. 复音节流 ---------------- */
/* 同一毫秒连打 20 刀，真正发声的源数应该被压住，不该线性增长。
   时钟必须拨到比前面所有测试都晚的值，否则 lastAt 还停在真实时间戳，
   节流判定会把每一刀都拒掉，测出来的 0 是假的。 */
let fixedTime = 4e12;
const realNow = Date.now;
const before = created.sources;
Date.now = () => fixedTime;
for (let i = 0; i < 20; i++) SND.hit({ mat: "metal", big: false, weak: false });
Date.now = realNow;
const burst = created.sources - before;
ok("同帧连打 20 刀确实发声（源数 > 0）", burst > 0, "放出 " + burst + " 个源");
ok("同帧连打 20 刀被节流（源数 ≤ 10）", burst <= 10, "放出 " + burst + " 个源");

/* 时钟往前推 30ms（小于 gap 22ms 之后、大于它之前）应仍然被节流 */
fixedTime += 5;
const before2 = created.sources;
Date.now = () => fixedTime;
SND.hit({ mat: "metal", big: false, weak: false });
Date.now = realNow;
ok("间隔 5ms 的第二次打击被拒绝", created.sources - before2 === 0,
   "放出 " + (created.sources - before2) + " 个源");

/* ---------------- 5. BGM ---------------- */
let bgmOk = true;
try {
  SND.bgm.start();
  SND.bgm.setWave();
  SND.bgm.breathe(true);
  SND.bgm.breathe(false);
  SND.bgm.stop(0.1);
} catch (e) { bgmOk = false; console.log("    BGM 抛错: " + e.message); }
ok("BGM 起停与喘息切换不抛错", bgmOk);

/* 喘息标志必须真的落到内部状态上，否则鼓点撤不掉 */
try {
  SND.bgm.start();
  SND.bgm.breathe(true);
  ok("喘息标志已置位", SND.bgm.isBreathe() === true);
  SND.bgm.setWave();
  ok("开新阵自动清掉喘息标志", SND.bgm.isBreathe() === false);
  SND.bgm.stop(0.05);
} catch (e) { fail++; console.log("  FAIL 喘息标志: " + e.message); }

/* 波次档位：末阵应当判成 BOSS 档（tier 3） */
win.G.waveIdx = 5;
ok("末阵判为 BOSS 档 tier=3", SND.bgm.tier() === 3, "实际 " + SND.bgm.tier());
win.G.waveIdx = 0;
ok("首阵判为最低档 tier=0", SND.bgm.tier() === 0, "实际 " + SND.bgm.tier());

/* ---------------- 6. 静音与音量 ---------------- */
ok("静音开关可切换", SND.mute(true) === true && SND.isMuted() === true);
ok("取消静音", SND.mute(false) === false && SND.isMuted() === false);
ok("音量可读写", Math.abs(SND.volume("sfx", 0.5) - 0.5) < 1e-6);

/* ---------------- 7. 无 AudioContext 时安全空转 ---------------- */
const win2 = { performance: { now: () => Date.now() }, setTimeout, setInterval,
               clearInterval, addEventListener() {}, removeEventListener() {},
               document: { hidden: false } };
win2.window = win2;
const ctx2 = vm.createContext(win2);
vm.runInContext(fs.readFileSync("js/audio.js", "utf8"), ctx2, { filename: "js/audio.js#noaudio" });
let silentOk = true;
try {
  const S2 = win2.SND;
  S2.ctx(); S2.swing("sword"); S2.hit({}); S2.jump(); S2.die();
  S2.bgm.start(); S2.bgm.stop();
} catch (e) { silentOk = false; console.log("    无 AudioContext 时抛错: " + e.message); }
ok("无 AudioContext 时全部安全空转", silentOk);

/* ---------------- 8. 结尾音 ---------------- */
try { SND.win(); SND.lose(); } catch (e) { fail++; console.log("  FAIL 胜负音抛错: " + e.message); }

console.log("----------------------------------------------");
if (fail === 0) console.log("audio 自检通过，0 失败");
else console.log("audio 自检失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);

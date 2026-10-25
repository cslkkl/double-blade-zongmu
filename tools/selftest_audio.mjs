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
let created = { sources: 0, gains: 0, filters: 0, oscillators: 0, buffers: 0, delays: 0 };
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
  createDelay(max) { created.delays++; const n = node("delay"); n.delayTime = param(0); n.maxDelayTime = max; return n; }
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
/* master 是整场响度的总闸：可读可写，且允许超过 1（压缩器已经摁住峰值） */
ok("主音量可读写且可超过 1", SND.volume("master", 1.4) > 1);
ok("主音量下限夹到 0", SND.volume("master", -1) === 0);
ok("静音时主音量不生效（静音优先）", (SND.mute(true), SND.volume("master", 1.25) === 1.25));
SND.mute(false);

/* ---------------- 6b. 总线音量上限 ---------------- */
/* 提音量不能把总线推过 1：那之前压缩器就够不着了，峰值会直接削波 */
const sfxVol = SND.volume("sfx");
ok("sfx 总线音量不超过 1", sfxVol <= 1, "实际 " + sfxVol);
ok("music 总线音量已抬高", SND.volume("music") > 0.45, "实际 " + SND.volume("music"));
SND.volume("sfx", 0.85);   /* 还原自检前的默认，避免影响后面的断言 */

/* ---------------- 6c. BGM 编曲：动机层与延时混响 ---------------- */
/* 混响支路（createDelay）必须在 ctx() 里建出来，否则新 BGM 听起来是干的 */
ok("music 支路挂了延时混响", created.delays > 0);

/* 各档位都要真的排出声音：把步进器推到头，检查调度产生了音源 */
function musicVoicesAt(waveIdx) {
  win.G.waveIdx = waveIdx;
  const before = created.sources;
  SND.bgm.start();
  SND.bgm.setWave();
  SND.bgm.stop(0.05);
  return created.sources - before;
}
const v0 = musicVoicesAt(0);
const v3 = musicVoicesAt(5);
ok("最低档会排出 BGM 音源", v0 > 0, "放出 " + v0 + " 个源");
ok("BOSS 档比最低档排得更满", v3 > v0, "档0=" + v0 + " 档3=" + v3);
win.G.waveIdx = 0;

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

/* ---------------- 9. 外部音轨 BGM（assets/audio/bgm-main.mp3） ---------------- */
/* 上面那半截跑在「没有 Audio 构造器」的 mock 里，验的是程序化兜底。
   这一段反过来：给一个假的 <audio> 元素，验音轨真的接管了 BGM ——
   素材能不能播、程序化那三层有没有让位、静音与压音是否落到元素的
   volume 上。file:// 下这条是唯一能真播 mp3 的写法（fetch 取不到字节）。 */
let tracks = [];
class FakeAudio {
  constructor() {
    this.src = ""; this.loop = false; this.preload = "";
    this.volume = 1; this.currentTime = 0; this.paused = true;
    this.listeners = {};
    tracks.push(this);
  }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  fire(t) { (this.listeners[t] || []).forEach((fn) => fn({ type: t })); }
}

const win3 = {
  Audio: FakeAudio,
  AudioContext: FakeAC,
  performance: { now: () => Date.now() },
  setTimeout: (fn, ms) => setTimeout(fn, 0),
  setInterval: (fn, ms) => setInterval(fn, ms),   /* 音轨看护定时器要真跑 */
  clearInterval: (id) => clearInterval(id),
  addEventListener() {}, removeEventListener() {},
  document: { hidden: false },
  G: { phase: "play", waveIdx: 0, camX: 0, hitstop: 0.04,
       p1: { x: 700, hp: 6, dead: false }, p2: null, enemies: [],
       waves: [{ name: "一" }, { name: "二" }] }
};
win3.window = win3;
const ctx3 = vm.createContext(win3);
vm.runInContext(fs.readFileSync("js/audio.js", "utf8"), ctx3, { filename: "js/audio.js#track" });
const S3 = win3.SND;

S3.bgm.start();
ok("音轨：起了 <audio> 元素", tracks.length === 1, "建了 " + tracks.length + " 个");
const el = tracks[0] || {};
ok("音轨：src 指向 assets/audio/bgm-main.mp3",
   String(el.src).indexOf("assets/audio/bgm-main.mp3") >= 0, "实际 " + el.src);
ok("音轨：循环播放", el.loop === true);
ok("音轨：已在播放", el.paused === false);
ok("音轨：接管后程序化 BGM 不启动（bgm.isOn 为假）", S3.bgm.isOn() === false);
ok("音轨：isTrack 为真", S3.bgm.isTrack() === true);
ok("音轨：音量按 music 总线 × 主增益折算（0 < v < 1）",
   el.volume > 0 && el.volume < 1, "实际 " + el.volume);

/* 静音闸必须同时关掉元素 —— 它不在 WebAudio 总线里，光改 master 是关不掉的 */
const volBeforeMute = el.volume;
S3.mute(true);
ok("音轨：静音后元素音量为 0", el.volume === 0, "实际 " + el.volume);
S3.mute(false);
ok("音轨：取消静音后音量回来", Math.abs(el.volume - volBeforeMute) < 1e-6,
   "实际 " + el.volume);

/* 喘息压音：元素这条路也要跟着 breathe 走，否则过场时音乐照旧吵 */
S3.bgm.breathe(true);
S3.bgm.start();                       /* 已在播，只是重算一次电平 */
const ducked = el.volume;
ok("音轨：喘息期音量被压低", ducked < volBeforeMute, "喘息 " + ducked + " vs 常态 " + volBeforeMute);
S3.bgm.breathe(false);
S3.bgm.setWave();
ok("音轨：开新阵后音量回满", Math.abs(el.volume - volBeforeMute) < 1e-6, "实际 " + el.volume);

/* 被自动播放策略拒掉：不许当场判死，要留着下一次手势重试 */
const el4 = tracks[0];
el4.paused = true;
S3.bgm.start();
await new Promise((r) => setTimeout(r, 260));   /* 看护定时器 140ms 一拍 */
ok("音轨：被拒播后由看护定时器重试并恢复播放", el4.paused === false);

/* 停播：淡出后必须真的 pause，并且回到开头 */
S3.bgm.stop(0.05);
await new Promise((r) => setTimeout(r, 220));
ok("音轨：停播后已暂停", el4.paused === true);
ok("音轨：停播后回到开头", el4.currentTime === 0, "实际 " + el4.currentTime);
ok("音轨：停播后 isTrack 为假", S3.bgm.isTrack() === false);

/* 元素报错（文件缺失 / 解码失败）→ 判死，再起 BGM 必须退回程序化。
   这一条是「素材可缺」那条硬约束的自动化防线。 */
const el5 = tracks[0];
el5.fire("error");
ok("音轨：元素 error 后判死", S3.bgm.isTrackDead() === true);
const beforeOsc = created.oscillators;
S3.bgm.start();
ok("音轨：判死后退回程序化 BGM（drone 振荡器起来了）",
   created.oscillators > beforeOsc, "新增 " + (created.oscillators - beforeOsc) + " 个");
S3.bgm.stop(0.05);

/* 注意：这一段用真的 setInterval，收尾前把看护定时器停掉，否则进程挂着不退 */
S3.bgm.stop(0.05);

console.log("----------------------------------------------");
if (fail === 0) console.log("audio 自检通过，0 失败");
else console.log("audio 自检失败 " + fail + " 项");
process.exit(fail === 0 ? 0 : 1);

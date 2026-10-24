/* node + mock canvas 自检：武器视觉三件套（站立帧 / 出招姿态 / 专属刀光）
 * 用法：node tools/selftest_weapons.mjs
 *
 * 只证明三件事，不证明好不好看：
 *   1. 每把武器都有落点 —— 三份数据块覆盖 WEAPONS 的 key，图真的在磁盘上；
 *   2. 绘制分流对 —— 站定画出 hold-*、挥砍画出 atk-*、走路不画 hold-*；
 *   3. 缺键逐级落回 —— 没有出招姿态回到攻击 clip，没有专属刀光回到通用三档，
 *      弓与投掷物不出手上弧光；任何一条降级都不许抛异常。
 *
 * 不启浏览器：多 agent 共用 Playwright 会互相抢浏览器，自检一律 node + mock canvas。
 */
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]+$/, "");
const read = (p) => fs.readFileSync(ROOT + "/" + p, "utf8");

const animSrc = read("js/anim-data.js");
const rigSrc = read("js/char-rig.js");
const fxSrc = read("js/fx.js");

/* ---------------------------------------------------------------- mock canvas */

const METHODS = [
  "save", "restore", "translate", "scale", "rotate", "setTransform", "transform",
  "beginPath", "closePath", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo",
  "arc", "arcTo", "ellipse", "rect", "fill", "stroke", "clip",
  "fillRect", "strokeRect", "clearRect", "drawImage",
  "createLinearGradient", "createRadialGradient", "createPattern",
  "setLineDash", "getLineDash", "measureText", "fillText", "strokeText", "putImageData"
];

let drawCalls = [];

function gradient() {
  return { addColorStop() {} };
}

function makeCtx() {
  const ctx = {
    canvas: { width: 1280, height: 720 },
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    shadowColor: "transparent",
    shadowBlur: 0,
    font: "10px sans-serif",
    textAlign: "left"
  };
  for (const m of METHODS) {
    if (m === "createLinearGradient" || m === "createRadialGradient" || m === "createPattern") {
      ctx[m] = () => gradient();
    } else if (m === "measureText") {
      ctx[m] = () => ({ width: 8 });
    } else if (m === "getLineDash") {
      ctx[m] = () => [];
    } else if (m === "drawImage") {
      ctx[m] = (img, ...rest) => {
        drawCalls.push({
          src: img && img.src,
          args: rest,
          comp: ctx.globalCompositeOperation,
          alpha: ctx.globalAlpha
        });
      };
    } else {
      ctx[m] = () => {};
    }
  }
  return ctx;
}

function makeSandbox() {
  const stats = { images: 0, canvases: 0 };
  const ctx = {};
  ctx.window = ctx;
  ctx.console = { log() {}, warn() {}, error() {} };
  ctx.Math = Math;
  ctx.isFinite = isFinite;
  ctx.document = {
    createElement(tag) {
      if (tag === "canvas") stats.canvases++;
      return { tag, width: 1, height: 1, getContext() { return makeCtx(); } };
    }
  };
  ctx.Image = class {
    constructor() {
      stats.images++;
      this.complete = false;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this._src = "";
    }
    set src(v) {
      this._src = v;
      this.complete = true;
      this.naturalWidth = 400;
      this.naturalHeight = 400;
    }
    get src() { return this._src; }
  };
  /* 通用档素材：不给它们的话「无 wkey 回落通用刀光」会落到纯代码弧光，
     测不出 drawImage 那一步，等于把降级路径当成失败。
     路径照真实文件名写，别用键名 —— 下面按路径判档。 */
  ctx.IMG = {};
  const genericFiles = {
    slash1: "assets/slash-1.webp",
    slash2: "assets/slash-2.webp",
    slash3: "assets/slash-3.webp",
    hit1: "assets/hit-1.webp",
    hit2: "assets/hit-2.webp",
    hit3: "assets/hit-3.webp",
    whirlRing: "assets/whirl-ring.webp",
    jadeTablet: "assets/props/jade-tablet.webp",
    pose0: "assets/char/pose-0.webp"
  };
  for (const k of Object.keys(genericFiles)) {
    ctx.IMG[k] = { complete: true, naturalWidth: 300, naturalHeight: 400, src: genericFiles[k] };
  }
  vm.createContext(ctx);
  return { ctx, stats };
}

/* Node 的 console.log 不认 %-8s 补位（那是 Python 的写法），自己补 */
function pad(s, n) {
  s = String(s);
  while (s.length < n) s += " ";
  return s;
}
function row(a, b, c) {
  return pad(a, 8) + " " + pad(b, 26) + " " + pad(c, 26);
}

/* ---------------------------------------------------------------- 载入 */

const { ctx: S } = makeSandbox();
vm.runInContext(animSrc, S);
vm.runInContext(rigSrc, S);
vm.runInContext(fxSrc, S);

const ANIM = S.window.ANIM || {};
const HOLD = S.window.ANIM_HOLD || {};
const ATK = S.window.WEAPON_ATTACK || {};
const ATKC = S.window.WEAPON_ATTACK_CLIP || {};
const WFX = S.window.WEAPON_FX || {};
const HITM = S.window.HIT_MATERIAL || {};
const CharArt = S.window.CharArt;
const FX = S.window.FX;

let fails = 0;
const rows = [];
function ok(cond, msg) {
  if (!cond) { fails++; console.error("  FAIL " + msg); }
}
function onDisk(rel) {
  if (!rel) return false;
  try { return fs.statSync(ROOT + "/" + rel).isFile(); } catch (e) { return false; }
}
function drawnPng(prefix) {
  /* 找出本帧画过、路径里带这个前缀（或匹配这个正则）的那条 drawImage */
  const re = prefix instanceof RegExp ? prefix : null;
  for (const c of drawCalls) {
    if (!c.src) continue;
    const s = String(c.src);
    if (re ? re.test(s) : s.indexOf(prefix) >= 0) return c;
  }
  return null;
}
/* 通用三档刀光的路径特征：assets/slash-1..3.webp（与专属的 wp-slash-* 区分） */
const GENERIC_SLASH = /(^|[\\/])slash-[123]\.webp$/;
const GENERIC_HIT = /(^|[\\/])hit-[123]\.webp$/;
function clear() { drawCalls = []; }

/* ---------------------------------------------------------------- 1. 契约与覆盖 */

ok(FX && typeof FX.drawSlash === "function", "FX.drawSlash 存在");
ok(FX && typeof FX.drawHit === "function", "FX.drawHit 存在");
ok(FX && typeof FX.drawProjFx === "function", "FX.drawProjFx 存在");
ok(FX && typeof FX.weaponFxReady === "function", "FX.weaponFxReady 存在");
ok(FX && typeof FX.matHitReady === "function", "FX.matHitReady 存在");
ok(CharArt && typeof CharArt.draw === "function", "CharArt.draw 存在");

/* WEAPONS 的 key 集合（与 index.html 的 WEAPONS 对应，这里是判据不是数据源） */
const WEAPON_KEYS = ["short", "dagger", "sword", "axe", "hammer", "spear", "bow", "rock", "blade", "jar", "bell"];
/* bell 复用 jar 的出招姿态（上层兜底），不要求自己的 atk 图 */
const ATK_KEYS = WEAPON_KEYS.filter((k) => k !== "bell");
const HIT_MATS = ["jade", "bronze", "blunt", "airy"];

console.log("=== 1. 数据块覆盖 ===");
console.log(
  "ANIM_HOLD %d 键 / WEAPON_ATTACK %d 键 / WEAPON_ATTACK_CLIP %d 键 / WEAPON_FX %d 键 / HIT_MATERIAL %d 键",
  Object.keys(HOLD).length, Object.keys(ATK).length, Object.keys(ATKC).length,
  Object.keys(WFX).length, Object.keys(HITM).length
);

const missHold = WEAPON_KEYS.filter((k) => !HOLD[k]);
const missAtk = ATK_KEYS.filter((k) => !ATK[k] && !ATKC[k]);
const missFxc = WEAPON_KEYS.filter((k) => !WFX[k]);
const missHit = HIT_MATS.filter((k) => !HITM[k]);

ok(!missHold.length, "每把武器都有站立帧（缺：" + missHold.join(",") + "）");
ok(!missAtk.length, "每把武器都有出招姿态或出招序列（缺：" + missAtk.join(",") + "）");
ok(!missFxc.length, "每把武器都有专属特效（缺：" + missFxc.join(",") + "）");
ok(!missHit.length, "四种打击材质都有图（缺：" + missHit.join(",") + "）");

/* 出招序列的字段约束：4 帧共用画布与 scaleFix，anchorX 逐帧给 */
console.log("=== 1b. 出招序列字段 ===");
for (const k of ATK_KEYS) {
  const c = ATKC[k];
  if (!c) continue;
  const n = (c.files || []).length;
  ok(c.frames === n, k + " frames 与 files 长度一致（" + c.frames + " vs " + n + "）");
  ok(typeof c.w === "number" && c.w > 0 && typeof c.h === "number" && c.h > 0,
     k + " 有画布 w/h");
  ok(typeof c.scaleFix === "number", k + " 有 scaleFix（序列共用一个数）");
  ok(Array.isArray(c.anchorX) && c.anchorX.length === n,
     k + " anchorX 是逐帧数组且长度 = 帧数");
  if (Array.isArray(c.anchorX)) {
    for (let i = 0; i < c.anchorX.length; i++) {
      ok(typeof c.anchorX[i] === "number" && c.anchorX[i] > 0 && c.anchorX[i] < 1,
         k + " anchorX[" + i + "] 在 (0,1) 内");
    }
  }
}
console.log("  序列键：" + Object.keys(ATKC).join(", "));

console.log("=== 2. 素材文件落盘 ===");
console.log(row("key", "hold", "atk") + pad("序列帧", 26) + pad("fx", 26));
for (const k of WEAPON_KEYS) {
  const h = HOLD[k] && HOLD[k].file;
  const a = ATK[k] && ATK[k].file;
  const f = WFX[k] && WFX[k].file;
  const hOk = h ? onDisk(h) : false;
  const aOk = a ? onDisk(a) : false;
  const fOk = f ? onDisk(f) : false;
  const c = ATKC[k];
  const cfiles = c ? c.files : [];
  const cOk = cfiles.length ? cfiles.every(onDisk) : false;
  const cTxt = cfiles.length ? (cOk ? "ok ×" + cfiles.length : "MISSING") : "-";
  console.log(row(
    k,
    h ? (hOk ? "ok" : "MISSING " + h) : "(复用 idle)",
    a ? (aOk ? "ok" : "MISSING " + a) : "(复用 attack 族)"
  ) + pad(cTxt, 26) + pad(f ? (fOk ? "ok" : "MISSING " + f) : "-", 26));
  if (h && !hOk) ok(false, k + " 站立帧文件不存在：" + h);
  if (a && !aOk) ok(false, k + " 出招帧文件不存在：" + a);
  if (cfiles.length && !cOk) ok(false, k + " 出招序列有帧图不存在");
  if (f && !fOk) ok(false, k + " 专属特效文件不存在：" + f);
}
for (const m of HIT_MATS) {
  const file = HITM[m];
  if (file && !onDisk(file)) ok(false, "打击材质 " + m + " 的文件不存在：" + file);
}

console.log("=== 3. 角色绘制分流 ===");
function player(over) {
  const base = {
    x: 640, y: 600, vx: 0, vy: 0, onGround: true, facing: 1,
    inv: 0, dead: false, hurtT: 0, whirlT: 0, throwT: 0, pickupT: 0,
    swingT: 0, swingDur: 0, swingIdx: 0, walk: 0,
    weapon: { key: "sword", type: "melee", dmg: 4, dur: 22, reach: 205, swing: 0.24 },
    padTag: "p1", bag: [], bagIdx: 0, __alphaMul: 1
  };
  return Object.assign(base, over || {});
}

/* 站定：应画 hold-<key> */
for (const k of ["short", "sword", "axe", "bow"]) {
  clear();
  const wp = { key: k, type: k === "bow" ? "bow" : "melee" };
  let err = null;
  try { CharArt.draw(makeCtx(), player({ weapon: wp }), 1.0); } catch (e) { err = e; }
  ok(!err, k + " 站定不抛异常 (" + (err && err.message) + ")");
  const hit = drawnPng("hold-" + k);
  ok(!!hit, k + " 站定应画 hold-" + k);
  rows.push(["stand", k, hit ? "hold-" + k : "-"]);
}

/* 挥砍：优先 WEAPON_CLIP[key].attack（每把武器一套独立动作），
   其次旧的 atk-<key>-<i> 序列，最后 atk-<key> 单帧。三者都算通过，但必须有一个 */
for (const k of ATK_KEYS) {
  const wc = (S.window.WEAPON_CLIP || {})[k];
  const hasNew = !!(wc && wc.attack && wc.attack.files && wc.attack.files.length);
  if (!ATK[k] && !ATKC[k] && !hasNew) continue;
  clear();
  const wp = { key: k, type: "melee", swing: 0.3 };
  let err = null;
  try {
    CharArt.draw(makeCtx(), player({ weapon: wp, swingT: 0.22, swingDur: 0.3, swingIdx: 0 }), 2.0);
  } catch (e) { err = e; }
  ok(!err, k + " 挥砍不抛异常 (" + (err && err.message) + ")");

  const neo = drawnPng(new RegExp("attack-" + k + "-\\d\\.webp$"));
  const seq = drawnPng(new RegExp("atk-" + k + "-\\d\\.webp$"));
  const one = drawnPng(new RegExp("atk-" + k + "\\.webp$"));
  ok(!!(neo || seq || one), k + " 挥砍应画出专属出招图（attack / atk 序列 / atk 单帧）");
  if (hasNew) ok(!!neo, k + " 有 WEAPON_CLIP.attack 时应画 attack-" + k + "-<i>");
  ok(!drawnPng("hold-" + k + ".webp"), k + " 挥砍不该再画站立帧");
  rows.push(["swing", k, neo ? "attack-" + k + "-N" : (seq ? "atk-" + k + "-N" : (one ? "atk-" + k : "-"))]);
}

/* 连击三段：帧号应随 swingT 推进。
   现在优先 WEAPON_CLIP.attack（attack-<k>-<i>），没有才看旧的 atk 序列。 */
{
  const WC = S.window.WEAPON_CLIP || {};
  const k = Object.keys(WC).find(x => WC[x] && WC[x].attack) || Object.keys(ATKC)[0];
  if (k) {
    const hasNew = !!(WC[k] && WC[k].attack);
    const n = hasNew ? WC[k].attack.files.length : ATKC[k].files.length;
    const seen = new Set();
    for (const prog of [0.05, 0.35, 0.65, 0.95]) {
      clear();
      const dur = 0.3;
      CharArt.draw(makeCtx(), player({
        weapon: { key: k, type: "melee" },
        swingT: dur * (1 - prog), swingDur: dur, swingIdx: 0
      }), 2.0 + prog);
      const c = hasNew
        ? drawnPng(new RegExp("attack-" + k + "-(\\d)\\.webp$"))
        : drawnPng(new RegExp("atk-" + k + "-(\\d)\\.webp$"));
      if (c) seen.add(String(c.src).match(/-(\d)\.webp$/)[1]);
    }
    ok(seen.size >= 2, k + " 挥砍过程中应播到至少 2 个不同帧（实际 " + [...seen].join(",") + "，共 " + n + " 帧）");
    console.log("  " + pad(k, 8) + " 连击中播到帧：" + [...seen].sort().join(",") + "（共 " + n + " 帧）");
  }
}

/* 走路：三级优先序 —— 行走序列 → 行走静帧 → 通用 walk clip。
   历史：先是「走路一律画 walk 帧」，结果拿锤子迈步时空手（武器凭空消失）；
   中途加过程序化浮沉，看着像在抖；现在正解是专属 4 帧序列。
   本测试**按数据驱动**：WEAPON_WALK_CLIP 里有这把武器就断言序列，
   没有就断言落到持械静帧 —— 素材没到位时也不该变成空手。
   padTag 用 p2：着色图按玩家配色缓存，上面站定测试已经缓存过 p1。 */
const WALK = S.window.WEAPON_WALK_CLIP || {};
const WC_ALL = S.window.WEAPON_CLIP || {};
const hasWalkClip = !!(WC_ALL.axe && WC_ALL.axe.walk)
                 || !!(WALK.axe && WALK.axe.files && WALK.axe.files.length);

clear();
CharArt.draw(makeCtx(), player({ vx: 200, padTag: "p2", walk: 1.7, weapon: { key: "axe", type: "melee" } }), 3.0);
if (process.env.SELFTEST_DEBUG) {
  console.log("DEBUG drawCalls:", JSON.stringify(drawCalls.map(c => c.src ? String(c.src) : null)));
}
if (hasWalkClip) {
  const walkSeq = drawnPng(/walk-axe-\d\.webp$/);
  ok(!!walkSeq, "走路应画持械行走序列 walk-axe-<i>");
  ok(!drawnPng(/^assets\/anim\/walk-\d\.webp$/), "有行走序列时不该画通用 walk 帧");
  rows.push(["walk", "axe", walkSeq ? "walk-axe-N" : "-"]);

  /* 帧号必须随位移推进：p.walk 变了才换帧 */
  const seen = new Set();
  for (const ph of [0, 0.6, 1.2, 1.8, 2.4]) {
    clear();
    CharArt.draw(makeCtx(), player({ vx: 200, padTag: "p2", walk: ph, weapon: { key: "axe", type: "melee" } }), 3.0);
    const c = drawnPng(/walk-axe-(\d)\.webp$/);
    if (c) seen.add(String(c.src).match(/-(\d)\.webp$/)[1]);
  }
  ok(seen.size >= 2, "行走帧号随 p.walk 推进（实际播到 " + [...seen].sort().join(",") + "）");
  console.log("  axe 行走播到帧：" + [...seen].sort().join(","));
} else {
  ok(!!drawnPng("hold-axe.webp"), "无行走序列时应落回持械静帧，而不是空手 walk");
  ok(!drawnPng(/^assets\/anim\/walk-\d\.webp$/), "有持械静帧时不该画通用 walk 帧");
  rows.push(["walk", "axe", drawnPng("hold-axe.webp") ? "hold-*" : "-"]);
  console.log("  WEAPON_WALK_CLIP 无 axe → 走路落回持械静帧（符合预期）");
}

/* 没有 hold 帧的武器（如 fist 空手）：走路必须回落到 walk 帧 */
clear();
CharArt.draw(makeCtx(), player({ vx: 200, weapon: { key: "fist", type: "fist" } }), 3.0);
if (process.env.SELFTEST_DEBUG) {
  console.log("DEBUG fist drawCalls:", JSON.stringify(drawCalls.map(c => c.src ? String(c.src) : null)));
}
ok(!drawnPng("hold-"), "空手走路不该画任何持械帧");
ok(!!drawnPng(/^assets\/anim\/walk-\d\.webp$/), "空手走路应画通用 walk 帧");

/* 旋风斩：不该画 atk-*（旋风有自己的 clip） */
clear();
CharArt.draw(makeCtx(), player({
  whirlT: 1.0, swingT: 0.2, swingDur: 0.3,
  weapon: { key: "hammer", type: "melee" }
}), 4.0);
ok(!drawnPng("atk-hammer.webp"), "旋风斩不该画武器出招姿态");

/* 受击：不该画 atk-* */
clear();
CharArt.draw(makeCtx(), player({
  hurtT: 0.2, swingT: 0.2, swingDur: 0.3,
  weapon: { key: "spear", type: "melee" }
}), 5.0);
ok(!drawnPng("atk-spear.webp"), "受击不该画武器出招姿态");

console.log(row("状态", "武器", "实际画出"));
for (const r of rows) console.log(row(r[0], r[1], r[2]));

/* ---------------------------------------------------------------- 4. 缺键降级 */
console.log("=== 4. 缺键逐级落回 ===");

/* 4a. 删掉某把武器的出招姿态与序列 → 回到 attack 族 clip，不抛异常 */
{
  /* 缺键回落：把三个通道全删掉，才真能测到"回落到公共 attack 族"。
     只删旧的 ATK/ATKC 已经不够了 —— WEAPON_CLIP 现在是第一优先级，
     不删它的话永远走新通道，测不到降级路径。 */
  const WC = S.window.WEAPON_CLIP;
  const savedNew = WC && WC.dagger;
  const savedAtk = ATK.dagger;
  const savedClip = ATKC.dagger;
  if (WC) delete WC.dagger;
  delete ATK.dagger;
  delete ATKC.dagger;
  clear();
  let err = null;
  try {
    CharArt.draw(makeCtx(), player({
      weapon: { key: "dagger", type: "melee" },
      swingT: 0.2, swingDur: 0.3, __forceClip: "attack-thrust"
    }), 6.0);
  } catch (e) { err = e; }
  ok(!err, "缺出招姿态时不抛异常 (" + (err && err.message) + ")");
  const fb = drawnPng("attack-thrust-") || drawnPng(/^assets\/anim\/attack-\d\.webp$/) || drawnPng(/^assets\/anim\/attack-/);
  ok(!!fb, "缺出招姿态应回落攻击 clip");
  console.log("  dagger 无任何专属出招 → 画 " + (fb ? "公共 attack 族" : "无"));
  if (WC && savedNew) WC.dagger = savedNew;
  if (savedAtk) ATK.dagger = savedAtk;
  if (savedClip) ATKC.dagger = savedClip;
}

/* 4a2. 新通道删掉、旧序列也删掉 → 应回落到单帧 atk-sword，而不是公共 attack 族 */
{
  const WC = S.window.WEAPON_CLIP;
  const savedNew = WC && WC.sword;
  const savedClip = ATKC.sword;
  if (WC) delete WC.sword;
  delete ATKC.sword;
  clear();
  let err = null;
  try {
    CharArt.draw(makeCtx(), player({
      weapon: { key: "sword", type: "melee" },
      swingT: 0.2, swingDur: 0.3
    }), 6.5);
  } catch (e) { err = e; }
  ok(!err, "缺序列时不抛异常 (" + (err && err.message) + ")");
  const one = drawnPng(new RegExp("atk-sword\\.webp$"));
  ok(!!one, "缺新通道与序列时应回落到单帧 atk-sword");
  console.log("  sword 只剩单帧 → 画 " + (one ? "单帧 atk-sword" : "无"));
  if (WC && savedNew) WC.sword = savedNew;
  if (savedClip) ATKC.sword = savedClip;
}

/* 4b. 武器 key 完全未知 → 不抛异常，走动画 */
{
  clear();
  let err = null;
  try {
    CharArt.draw(makeCtx(), player({ weapon: { key: "__nope", type: "melee" }, swingT: 0.2, swingDur: 0.3 }), 7.0);
  } catch (e) { err = e; }
  ok(!err, "未知武器 key 不抛异常 (" + (err && err.message) + ")");
  console.log("  未知 key → 未抛异常");
}

/* 4c. 空手 → 走动画，不画 hold/atk */
{
  clear();
  let err = null;
  try { CharArt.draw(makeCtx(), player({ weapon: { key: "fist", type: "fist" } }), 8.0); } catch (e) { err = e; }
  ok(!err, "空手不抛异常 (" + (err && err.message) + ")");
  ok(!drawnPng("hold-fist"), "空手没有站立帧（应为空）");
  console.log("  空手 → 未抛异常，无 hold-fist");
}

/* ---------------------------------------------------------------- 5. 特效分流 */
console.log("=== 5. 刀光 / 火花 / 弹道分流 ===");

/* fxImg 第一帧建图返回 null，第二帧才可用 —— 所以每种都跑两次 */
function slashTwice(s) {
  const c = makeCtx();
  FX.drawSlash(c, s);
  clear();
  FX.drawSlash(makeCtx(), s);
  return drawCalls.slice();
}

for (const k of ["short", "sword", "axe", "spear"]) {
  if (!WFX[k]) continue;
  clear();
  FX.drawSlash(makeCtx(), { x: 0, y: 0, facing: 1, life: 0.1, max: 0.19, seg: 1, wkey: k });
  clear();
  FX.drawSlash(makeCtx(), { x: 0, y: 0, facing: 1, life: 0.1, max: 0.19, seg: 1, wkey: k });
  const hit = drawnPng("wp-slash-" + k);
  ok(!!hit, k + " 专属刀光应被画出来");
  console.log("  " + pad(k, 8) + " 专属刀光 " + (hit ? "ok" : "未画"));
}

/* 弓与投掷物不出手上弧光 */
for (const k of ["bow", "rock", "jar", "bell", "blade"]) {
  clear();
  FX.drawSlash(makeCtx(), { x: 0, y: 0, facing: 1, life: 0.1, max: 0.19, seg: 1, wkey: k });
  ok(drawCalls.length === 0, k + " 不该出手上弧光（NO_ARC）");
}

/* 不给 wkey → 回到通用 slash-1 档 */
clear();
FX.drawSlash(makeCtx(), { x: 0, y: 0, facing: 1, life: 0.1, max: 0.19, seg: 1 });
{
  const generic = drawnPng(GENERIC_SLASH);
  ok(!!generic, "无 wkey 时回落通用刀光");
  console.log("  无 wkey → " + (generic ? "通用 slash-*" : "未画"));
}

/* 打击火花：材质图 + 材质芯色 */
clear();
FX.drawHit(makeCtx(), { x: 0, y: 0, life: 0.1, max: 0.24, big: false, mid: false, mat: "bronze" });
clear();
FX.drawHit(makeCtx(), { x: 0, y: 0, life: 0.1, max: 0.24, big: false, mid: false, mat: "bronze" });
{
  const hit = drawnPng("hit-bronze");
  ok(!!hit, "青铜材质打击火花应被画出来");
  console.log("  mat=bronze → " + (hit ? "hit-bronze" : "未画"));
}

/* 弹道痕：箭与投掷物各走各的 */
for (const k of ["bow", "rock", "jar"]) {
  clear();
  FX.drawProjFx(makeCtx(), { x: 0, y: 0, vx: 900, vy: -200, kind: k, spin: 0.3, alpha: 1 });
  clear();
  const drew = FX.drawProjFx(makeCtx(), { x: 0, y: 0, vx: 900, vy: -200, kind: k, spin: 0.3, alpha: 1 });
  const hit = drawnPng("wp-slash-");
  ok(!!drew, k + " 弹道痕应返回 true");
  ok(!!hit, k + " 弹道痕应画专属特效图");
  console.log("  " + pad(k, 5) + " 弹道痕 " + (hit ? "ok" : "未画"));
}

/* 未知 kind 的弹道：安全返回 false */
{
  const r = FX.drawProjFx(makeCtx(), { x: 0, y: 0, vx: 1, vy: 0, kind: "__nope", spin: 0, alpha: 1 });
  ok(r === false, "未知弹道 kind 应返回 false");
}

/* ---------------------------------------------------------------- 汇总 */

console.log("");
if (fails) {
  console.error("selftest_weapons: " + fails + " 项失败");
  process.exit(1);
}
console.log("selftest_weapons: 0 失败");

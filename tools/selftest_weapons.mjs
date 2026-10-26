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
      /* canvas 记住自己画过的源图（src），这样「屏幕上画的是哪一帧」能被断言。
         没有它，着色缓存（tintedFrame）在第二次命中时只是复用旧 canvas，
         drawImage 拿不到任何 src —— 帧号断言全部失明。 */
      const cv = {
        tag, width: 1, height: 1, src: "",
        getContext() {
          const c = makeCtx();
          const orig = c.drawImage;
          c.drawImage = (img, ...rest) => {
            if (img && img.src) cv.src = img.src;
            orig(img, ...rest);
          };
          return c;
        }
      };
      return cv;
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
/* WEAPON_ATTACK / WEAPON_ATTACK_CLIP 两条旧通道已于 2026-10-25 废弃（数据块与
   atk-*.webp 全删）。这里**故意仍然读**它们：一旦有人跑 --with-atk 把它们补回来，
   下面所有断言自动恢复生效；两者缺席时相关小节整体跳过，不报假失败。 */
const ATK = S.window.WEAPON_ATTACK || {};
const ATKC = S.window.WEAPON_ATTACK_CLIP || {};
const WCLIP = S.window.WEAPON_CLIP || {};
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
/* 出招的三条通道按优先级：WEAPON_CLIP[key].attack → WEAPON_ATTACK_CLIP → WEAPON_ATTACK。
   2026-10-25 起只有第一条有素材（后两条已删，只留函数挂点），所以「每把武器都要有
   出招」这条断言改成按渠道判定，不再强制要求 atk-*。 */
const ATK_KEYS = WEAPON_KEYS.filter((k) => k !== "bell");
const HIT_MATS = ["jade", "bronze", "blunt", "airy"];
const hasAtk = (k) => !!(WCLIP[k] && WCLIP[k].attack && (WCLIP[k].attack.files || []).length)
                      || !!ATKC[k] || !!ATK[k];

console.log("=== 1. 数据块覆盖 ===");
console.log(
  "ANIM_HOLD %d 键 / WEAPON_CLIP %d 键（含 attack %d）/ 旧 WEAPON_ATTACK %d 键 / 旧 WEAPON_ATTACK_CLIP %d 键 / WEAPON_FX %d 键 / HIT_MATERIAL %d 键",
  Object.keys(HOLD).length,
  Object.keys(WCLIP).length,
  WEAPON_KEYS.filter((k) => WCLIP[k] && WCLIP[k].attack).length,
  Object.keys(ATK).length, Object.keys(ATKC).length,
  Object.keys(WFX).length, Object.keys(HITM).length
);

const missHold = WEAPON_KEYS.filter((k) => !HOLD[k]);
const missAtk = ATK_KEYS.filter((k) => !hasAtk(k));
const missFxc = WEAPON_KEYS.filter((k) => !WFX[k]);
const missHit = HIT_MATS.filter((k) => !HITM[k]);

ok(!missHold.length, "每把武器都有站立帧（缺：" + missHold.join(",") + "）");
ok(!missAtk.length, "每把武器都有出招图（WEAPON_CLIP.attack / 序列 / 单帧，缺：" + missAtk.join(",") + "）");
ok(!missFxc.length, "每把武器都有专属特效（缺：" + missFxc.join(",") + "）");
ok(!missHit.length, "四种打击材质都有图（缺：" + missHit.join(",") + "）");

/* 出招序列的字段约束：4 帧共用画布与 scaleFix，anchorX 逐帧给。
   仅在 WEAPON_ATTACK_CLIP 存在时校验（当前已废弃、数据块已删）。 */
console.log("=== 1b. 出招序列字段 ===");
if (!Object.keys(ATKC).length) {
  console.log("  WEAPON_ATTACK_CLIP 缺席（2026-10-25 已废弃，见 anim-data.js 注释）→ 跳过");
} else {
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
}

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
  const wc = WCLIP[k] && WCLIP[k].attack;
  const wcOk = wc && (wc.files || []).length ? wc.files.every(onDisk) : false;
  console.log(row(
    k,
    h ? (hOk ? "ok" : "MISSING " + h) : "(复用 idle)",
    wc ? ("clip×" + wc.files.length + (wcOk ? "" : " MISSING"))
       : (a ? (aOk ? "ok" : "MISSING " + a) : "(无)")
  ) + pad(cTxt, 26) + pad(f ? (fOk ? "ok" : "MISSING " + f) : "-", 26));
  if (h && !hOk) ok(false, k + " 站立帧文件不存在：" + h);
  if (wc && (wc.files || []).length && !wcOk) ok(false, k + " WEAPON_CLIP.attack 有帧图不存在");
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
    padTag: "p1", __alphaMul: 1
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

/* 挥砍：WEAPON_CLIP[key].attack 是唯一有素材的通道（每把武器一套独立动作）。
   旧的 atk-<key>-<i> 序列与 atk-<key> 单帧已于 2026-10-25 删除 ——
   这里仍允许它们通过，是为了「用 --with-atk 把素材补回来」时断言不用改。 */
for (const k of ATK_KEYS) {
  const wc = WCLIP[k];
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
  ok(!!(neo || seq || one), k + " 挥砍应画出专属出招图（WEAPON_CLIP.attack / atk 序列 / atk 单帧）");
  if (hasNew) ok(!!neo, k + " 有 WEAPON_CLIP.attack 时应画 attack-" + k + "-<i>");
  ok(!drawnPng("hold-" + k + ".webp"), k + " 挥砍不该再画站立帧");
  rows.push(["swing", k, neo ? "attack-" + k + "-N" : (seq ? "atk-" + k + "-N" : (one ? "atk-" + k : "-"))]);
}

/* 连击三段：帧号应随 swingT 推进。当前只有 WEAPON_CLIP.attack 这一条通道有素材。 */
{
  const k = Object.keys(WEAPON_KEYS.reduce((o, x) => (WCLIP[x] && WCLIP[x].attack ? (o[x] = 1, o) : o), {}))[0]
         || Object.keys(ATKC)[0];
  if (k) {
    const hasNew = !!(WCLIP[k] && WCLIP[k].attack);
    const n = hasNew ? WCLIP[k].attack.files.length : ATKC[k].files.length;
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

/* 行走必须真的循环起来。
   回归坑：stateFrame 的 walk 分支原来只把帧号夹到 n-1、没有取模，
   而 p.walk 是只增的累计位移（index.html 里 += |vx|*dt*0.024）——
   走完一轮（cycle = WALK_CYCLE * n/4）后帧号永久停在最后一帧，
   画面读成「滑步 + 僵直」。素材是齐的，是播放逻辑掐死了循环。
   断言：整整一轮位移内必须把每一帧都播到，且末帧之后必须回到前面的帧。 */
console.log("=== 3b. 行走循环（取模）===");
{
  const keys = Object.keys(WC_ALL).filter((k) => WC_ALL[k] && WC_ALL[k].walk
    && WC_ALL[k].walk.files && WC_ALL[k].walk.files.length);
  ok(keys.length > 0, "WEAPON_CLIP 里至少有武器带 walk 序列");
  for (const k of keys) {
    const n = WC_ALL[k].walk.files.length;
    const cycle = 3.6 * n / 4;                    // 与 char-rig 的 WALK_CYCLE 口径一致
    const seen = new Set();
    const STEPS = 40;
    for (let i = 0; i < STEPS; i++) {
      const ph = (i / STEPS) * cycle;              // 刚好走满一轮
      clear();
      CharArt.draw(makeCtx(), player({ vx: 200, padTag: "p2", walk: ph, weapon: { key: k, type: "melee" } }), 9.0);
      const c = drawnPng(new RegExp("walk-" + k + "-(\\d)\\.webp$"));
      if (c) seen.add(Number(String(c.src).match(/-(\d)\.webp$/)[1]));
    }
    ok(seen.size === n, k + " 走满一轮应播到全部 " + n + " 帧（实际 " + [...seen].sort((a, b) => a - b).join(",") + "）");

    /* 再走半轮：帧号必须回绕，不能钉在末帧 */
    clear();
    CharArt.draw(makeCtx(), player({ vx: 200, padTag: "p2", walk: cycle + cycle / 2, weapon: { key: k, type: "melee" } }), 9.5);
    const mid = drawnPng(new RegExp("walk-" + k + "-(\\d)\\.webp$"));
    const midIdx = mid ? Number(String(mid.src).match(/-(\d)\.webp$/)[1]) : -1;
    ok(midIdx >= 0 && midIdx < n - 1,
       k + " 走过一轮半后应回绕到前面的帧，不能钉在末帧（实际帧 " + midIdx + "，共 " + n + " 帧）");
    console.log("  " + pad(k, 8) + " 一轮播到 " + [...seen].sort((a, b) => a - b).join(",")
      + " / 共 " + n + " 帧；一轮半后落在第 " + midIdx + " 帧");
  }
}

/* 没有 hold 帧的武器（如 fist 空手）：走路必须回落到 walk 帧 */
clear();
CharArt.draw(makeCtx(), player({ vx: 200, weapon: { key: "fist", type: "fist" } }), 3.0);
if (process.env.SELFTEST_DEBUG) {
  console.log("DEBUG fist drawCalls:", JSON.stringify(drawCalls.map(c => c.src ? String(c.src) : null)));
}
ok(!drawnPng("hold-"), "空手走路不该画任何持械帧");
ok(!!drawnPng(/^assets\/anim\/walk-\d\.webp$/), "空手走路应画通用 walk 帧");

/* 旋风斩：不该走任何出招通道（旋风有自己的 clip）。
   判据写「任何挥砍图」而不是具体某个 atk-* 文件名 —— 后者在 2026-10-25 删素材后
   会永远通过（没人会画一个不存在的文件），断言就白写了。 */
const ANY_SWING = /(attack-|atk-).*\.webp$/;
clear();
CharArt.draw(makeCtx(), player({
  whirlT: 1.0, swingT: 0.2, swingDur: 0.3,
  weapon: { key: "hammer", type: "melee" }
}), 4.0);
ok(!drawnPng(ANY_SWING), "旋风斩不该画任何武器出招姿态");

/* 受击：同理，不该走任何出招通道 */
clear();
CharArt.draw(makeCtx(), player({
  hurtT: 0.2, swingT: 0.2, swingDur: 0.3,
  weapon: { key: "spear", type: "melee" }
}), 5.0);
ok(!drawnPng(ANY_SWING), "受击不该画任何武器出招姿态");

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

/* 4a2. 旧通道（WEAPON_ATTACK / WEAPON_ATTACK_CLIP）缺席时：
   应回落到公共 attack 族，且**不许画出任何 atk-* 路径** —— 那 50 张已于
   2026-10-25 删除，画出路径就说明代码还指着不存在的文件（悬空引用）。
   原断言是「回落到单帧 atk-sword」，素材删掉后该前提不成立，改成守悬空引用。 */
{
  const WC = S.window.WEAPON_CLIP;
  const savedNew = WC && WC.sword;
  const savedClip = ATKC.sword;
  const savedAtk = ATK.sword;
  if (WC) delete WC.sword;
  delete ATKC.sword;
  delete ATK.sword;
  clear();
  let err = null;
  try {
    CharArt.draw(makeCtx(), player({
      weapon: { key: "sword", type: "melee" },
      swingT: 0.2, swingDur: 0.3
    }), 6.5);
  } catch (e) { err = e; }
  ok(!err, "缺序列时不抛异常 (" + (err && err.message) + ")");
  const fb = drawnPng(/^assets\/anim\/attack-/) || drawnPng("attack-");
  ok(!!fb, "旧通道缺席时应回落公共 attack 族");
  const ghost = drawnPng(/atk-.*\.webp$/);
  ok(!ghost, "旧通道素材已删，不许画出 atk-* 路径（实际：" + (ghost && ghost.src) + "）");
  console.log("  sword 三通道全缺 → 画 " + (fb ? "公共 attack 族" : "无") + "，atk-* 悬空引用 " + (ghost ? "有" : "无"));
  if (WC && savedNew) WC.sword = savedNew;
  if (savedClip) ATKC.sword = savedClip;
  if (savedAtk) ATK.sword = savedAtk;
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

/* ---------------------------------------------------------------- 5b. 刀光朝向 */
/* 维护者 2026-10-25 定：**凸背朝人面向的方向**。
   源画凸背朝左（实测，见 .agents/notes/依据-半月斩素材左右不对称.md），
   所以面朝右要镜像、面朝左用原样 —— 与「朝左才镜像」的常规写法相反。
   旧代码正是常规写法，两个朝向都把凸背送进了人背后。

   这里断言三件事（全部是参数级，不需要读像素）：
     1. FX.mirrors() 的方向契约；
     2. 变换后「源画 -x 轴」在设备空间的指向 = facing 方向（即凸背朝前）；
     3. 两个朝向逐点左右对称 —— 否则「朝左反了」会以另一种形式复发。

   为什么必须用矩阵：mock ctx 的 scale 本来是空函数，光看 drawImage 的
   参数看不出翻没翻。这里自带一个记录 CTM 的 ctx，把目标矩形真正变换出去。 */
console.log("=== 5b. 刀光朝向 ===");

/* 记录 CTM 的 ctx：a,b,c,d,e,f —— x' = a·x + c·y + e，y' = b·x + d·y + f
   save/restore 必须连**绘制状态**一起存（尤其 globalCompositeOperation）：
   真实 canvas 就是这样。只存矩阵的话，暖光层设的 "lighter" 会漏给后面的
   主体绘制，主图就被误判成叠加层了。 */
function makeMatrixCtx() {
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const images = [];   // { src, rect, a, comp }
  const arcs = [];     // { x, y, r, a0, a1 }
  const c = {
    canvas: { width: 1600, height: 900 },
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1,
    lineCap: "butt", lineJoin: "miter", font: "10px sans-serif",
    save() {
      stack.push({
        m: m.slice(),
        comp: c.globalCompositeOperation,
        alpha: c.globalAlpha,
        fill: c.fillStyle,
        stroke: c.strokeStyle,
        lw: c.lineWidth,
        cap: c.lineCap
      });
    },
    restore() {
      const s = stack.pop();
      if (!s) return;
      m = s.m;
      c.globalCompositeOperation = s.comp;
      c.globalAlpha = s.alpha;
      c.fillStyle = s.fill;
      c.strokeStyle = s.stroke;
      c.lineWidth = s.lw;
      c.lineCap = s.cap;
    },
    translate(tx, ty) {
      m[4] += m[0] * tx + m[2] * ty;
      m[5] += m[1] * tx + m[3] * ty;
    },
    scale(sx, sy) { m[0] *= sx; m[1] *= sx; m[2] *= sy; m[3] *= sy; },
    rotate(a) {
      const cs = Math.cos(a), sn = Math.sin(a);
      const a0 = m[0], b0 = m[1], c0 = m[2], d0 = m[3];
      m[0] = a0 * cs + c0 * sn;
      m[1] = b0 * cs + d0 * sn;
      m[2] = -a0 * sn + c0 * cs;
      m[3] = -b0 * sn + d0 * cs;
    },
    setTransform() {}, transform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, arcTo() {}, ellipse() {},
    rect() {}, fill() {}, stroke() {}, clip() {},
    fillRect() {}, strokeRect() {}, clearRect() {},
    createLinearGradient: () => gradient(),
    createRadialGradient: () => gradient(),
    createPattern: () => gradient(),
    setLineDash() {}, getLineDash: () => [],
    measureText: () => ({ width: 8 }),
    fillText() {}, strokeText() {}, putImageData() {},
    arc(x, y, r, a0, a1) { arcs.push({ x, y, r, a0, a1 }); },
    drawImage(img) {
      const rest = Array.prototype.slice.call(arguments, 1);
      if (rest.length < 4) return;
      const [ox, oy, dw, dh] = rest;
      const pts = [[ox, oy], [ox + dw, oy], [ox + dw, oy + dh], [ox, oy + dh]]
        .map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
      images.push({
        src: img && img.src ? String(img.src) : "",
        rect: pts,
        a: m[0],
        comp: c.globalCompositeOperation
      });
    }
  };
  c.__images = images;
  c.__arcs = arcs;
  return c;
}

/* 出图两次：武器专属刀的 fxImg 第一次只建 Image，第二次才可用 */
function captureSlash(s) {
  FX.drawSlash(makeCtx(), s);
  const c = makeMatrixCtx();
  FX.drawSlash(c, s);
  return c;
}

ok(FX.artConvex() === -1, "源画凸背朝左（ART_CONVEX === -1）");
ok(FX.mirrors(1) === true, "面朝右必须镜像（凸背才朝右）");
ok(FX.mirrors(-1) === false, "面朝左用原样（凸背本来就朝左）");

/* 通用三档：seg1 → slash-1，seg2 → slash-2，big → slash-3 */
const GENERIC_CASES = [
  { name: "slash-1", s: { seg: 1, big: false } },
  { name: "slash-2", s: { seg: 2, big: false } },
  { name: "slash-3", s: { seg: 1, big: true } }
];
const WEAPON_CASES = ["short", "sword", "axe", "spear"];

function caseOf(kind, name) {
  if (kind === "generic") {
    const g = GENERIC_CASES.find((x) => x.name === name);
    return Object.assign({ x: 0, y: 0, life: 0.1, max: 0.19 }, g.s);
  }
  return { x: 0, y: 0, life: 0.1, max: 0.19, seg: 1, wkey: name };
}

function mainImageOf(c) {
  /* 取第一张 source-over 的 drawImage：那就是月牙本体，
     后面两张是 lighter 提亮层（同样受 CTM 影响，但不代表本体位置）。 */
  const im = c.__images.filter((r) => r.comp === "source-over" && r.src);
  return im.length ? im[0] : null;
}

const orientRows = [];
for (const kind of ["generic", "weapon"]) {
  const names = kind === "generic" ? GENERIC_CASES.map((x) => x.name) : WEAPON_CASES;
  for (const name of names) {
    const plus = captureSlash(Object.assign(caseOf(kind, name), { facing: 1 }));
    const minus = captureSlash(Object.assign(caseOf(kind, name), { facing: -1 }));
    const ip = mainImageOf(plus), im2 = mainImageOf(minus);
    ok(!!ip, name + " facing=+1 应画出月牙本体");
    ok(!!im2, name + " facing=-1 应画出月牙本体");
    if (!ip || !im2) continue;

    /* 源画的 -x 轴就是凸背方向。CTM 的 a 分量把源画 +x 映到设备 x，
       所以凸背的设备 x 符号 = -a。它必须与 facing 同号。 */
    const backP = -ip.a, backM = -im2.a;
    ok(Math.sign(backP) === 1,
       name + " 面朝右时凸背应朝右（实际 " + backP.toFixed(3) + "）");
    ok(Math.sign(backM) === -1,
       name + " 面朝左时凸背应朝左（实际 " + backM.toFixed(3) + "）");

    /* 左右对称：两个朝向的目标矩形互为 x 取反 */
    const rp = ip.rect, rm = im2.rect;
    let symErr = 0;
    for (let i = 0; i < 4; i++) {
      symErr = Math.max(symErr, Math.abs(rp[i][0] + rm[i][0]));
      symErr = Math.max(symErr, Math.abs(rp[i][1] - rm[i][1]));
    }
    ok(symErr < 0.01, name + " 两个朝向应逐点左右对称（最大偏差 " + symErr.toFixed(4) + "）");

    orientRows.push([name, backP > 0 ? "右 ✓" : "左 ✗", backM < 0 ? "左 ✓" : "右 ✗",
      symErr < 0.01 ? "对称" : "偏差 " + symErr.toFixed(2)]);
  }
}
console.log("  " + pad("素材", 10) + pad("面朝右凸背", 14) + pad("面朝左凸背", 14) + "左右对称");
for (const r of orientRows) {
  console.log("  " + pad(r[0], 10) + pad(r[1], 14) + pad(r[2], 14) + r[3]);
}

/* 5c. 刃口高光必须贴住实测脊线，不能悬在月牙外 */
/* 旧代码在原点画 r≈pick.r 的弧：实测脊线圆心在 +0.65~1.03 画布宽、
   半径 0.41~0.87 画布宽，两者差 40px 以上，高光整根飘在图外。
   这里断言高光的圆心与半径都来自实测表（而不是原点 + 拍脑袋的半径）。 */
console.log("=== 5c. 刃口高光锚定 ===");
const ARC_FIXTURE = {
  slash1: { cx: 1.0272, cy: 0.4811, r: 0.8725 },
  slash2: { cx: 0.8573, cy: 0.4862, r: 0.6604 },
  slash3: { cx: 0.6553, cy: 0.4860, r: 0.4070 },
  short:  { cx: 0.7213, cy: 0.4915, r: 0.5124 },
  dagger: { cx: 0.8169, cy: 0.4940, r: 0.6128 },
  sword:  { cx: 1.0197, cy: 0.4948, r: 0.8622 },
  axe:    { cx: 0.8999, cy: 0.4853, r: 0.5706 },
  hammer: { cx: 0.5178, cy: 0.4998, r: 0.3270 },
  spear:  { cx: 0.6284, cy: 0.4983, r: 0.1502 }
};
for (const k of Object.keys(ARC_FIXTURE)) {
  const got = FX.arcOf(k);
  ok(!!got, k + " 应有实测锚定数据");
  if (!got) continue;
  const f = ARC_FIXTURE[k];
  ok(Math.abs(got.cx - f.cx) < 1e-4 && Math.abs(got.cy - f.cy) < 1e-4
     && Math.abs(got.r - f.r) < 1e-4,
     k + " 锚定表应与实测一致（重跑 tools/measure_slash.py 后再改这里）");
}

/* 画出来的高光弧：圆心 = (ox + dw·cx, oy + dh·cy)，半径 = dw·r。
   变换里只有 translate / rotate / scale(±1)（没有缩放），
   所以设备空间量的边长就等于局部 dw / dh，可以直接反推期望值。 */
for (const name of WEAPON_CASES.concat(GENERIC_CASES.map((x) => x.name))) {
  const f = ARC_FIXTURE[name];
  if (!f) continue;
  const c = captureSlash(Object.assign(caseOf(
    WEAPON_CASES.includes(name) ? "weapon" : "generic", name), { facing: 1 }));
  const im = mainImageOf(c);
  if (!im) continue;

  const dw = Math.hypot(im.rect[1][0] - im.rect[0][0], im.rect[1][1] - im.rect[0][1]);
  const dh = Math.hypot(im.rect[3][0] - im.rect[0][0], im.rect[3][1] - im.rect[0][1]);
  const expR = Math.max(2, dw * f.r);
  const expX = dw * (f.cx - 0.42);          // ox = -dw·0.42
  const expY = dh * (f.cy - 0.50);          // oy = -dh·0.50

  /* 找半径对得上的那条弧（其余 arc 调用来自光晕 / 降级弧） */
  const cand = c.__arcs.filter((a) => Math.abs(a.r - expR) < 0.6);
  ok(cand.length > 0,
     name + " 刃口高光半径应 = 弧宽 × 实测 R（期望 " + expR.toFixed(1) + "）");
  if (cand.length) {
    const a = cand[0];
    const dxErr = Math.abs(a.x - expX);
    const dyErr = Math.abs(a.y - expY);
    ok(dxErr < 0.6 && dyErr < 0.6,
       name + " 刃口高光圆心应落在实测弧心（偏差 " + dxErr.toFixed(2)
       + "," + dyErr.toFixed(2) + "）");
    /* 回归防线：旧代码在原点画弧。原点 = 玩家位置，高光飘在月牙外。 */
    ok(Math.hypot(a.x, a.y) > 0.5,
       name + " 刃口高光不该画在原点（那是旧 bug）");
  }
}
console.log("  9 张素材的锚定表与高光半径已按实测校验");


if (fails) {
  console.error("selftest_weapons: " + fails + " 项失败");
  process.exit(1);
}
console.log("selftest_weapons: 0 失败");

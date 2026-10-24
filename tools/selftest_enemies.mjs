/* node + mock canvas 自检：不启浏览器，不碰共享 Playwright。
 * 用法：node tools/selftest_enemies.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]+$/, "");
const animSrc = fs.readFileSync(ROOT + "/js/anim-data.js", "utf8");
const enemySrc = fs.readFileSync(ROOT + "/js/enemies-assets.js", "utf8");

const METHODS = [
  "save", "restore", "translate", "scale", "rotate", "setTransform", "transform",
  "beginPath", "closePath", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo",
  "arc", "arcTo", "ellipse", "rect", "fill", "stroke", "clip",
  "fillRect", "strokeRect", "clearRect", "drawImage",
  "createLinearGradient", "createRadialGradient", "createPattern",
  "setLineDash", "getLineDash", "measureText", "fillText", "strokeText", "putImageData"
];

function gradient() {
  return { addColorStop() {} };
}

function makeCanvas(tag) {
  const c = {
    tag,
    width: 1,
    height: 1,
    getContext() { return makeCtx(); }
  };
  return c;
}

let drawCalls = [];
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
        drawCalls.push({ src: img && img.src, args: rest, comp: ctx.globalCompositeOperation, alpha: ctx.globalAlpha });
      };
    } else {
      ctx[m] = () => {};
    }
  }
  ctx.__marks = [];
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
      return makeCanvas(tag);
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
  /* 降级路径需要的底图 */
  ctx.IMG = {};
  for (const k of ["maskRelief", "potteryJar", "brazier", "jadeTablet", "bellCluster", "ivoryTusk"]) {
    ctx.IMG[k] = { complete: true, naturalWidth: 256, naturalHeight: 256, src: k };
  }
  vm.createContext(ctx);
  return { ctx, stats };
}

function load(withAnim) {
  const { ctx, stats } = makeSandbox();
  if (withAnim) {
    vm.runInContext(animSrc, ctx);
  } else {
    /* 不跑 anim-data.js：window.ENEMY_ANIM 压根不存在（vm 上下文里 delete 传不出去） */
    vm.runInContext("window.__noAnim = true;", ctx);
  }
  vm.runInContext(enemySrc, ctx);
  return { ctx, stats, art: ctx.window.EnemyArt };
}

const DEFS = {};
{
  const { ctx } = load(true);
  Object.assign(DEFS, ctx.ENEMY_ANIM);
}

function enemy(kind, over) {
  const base = {
    kind,
    x: 640,
    y: 600,
    w: kind === "boss" ? 143.5 : (kind === "brute" ? 89.6 : (kind === "fast" ? 57.4 : 70)),
    h: kind === "boss" ? 328 : (kind === "brute" ? 204.8 : (kind === "fast" ? 131.2 : 160)),
    facing: -1,
    state: "walk",
    walk: 1.2,
    hp: 2,
    maxHp: 2,
    hurtT: 0,
    deadT: 0
  };
  return Object.assign(base, over || {});
}

let fails = 0;
function ok(cond, msg) {
  if (!cond) { fails++; console.error("  FAIL " + msg); }
}

/* ---------------------------------------------------------------- 1. 帧动画路径 */
/* 记录每条 fill 路径的 bbox：roundRect 走的是 path，不是 fillRect */
function pathProbe(ctx) {
  const st = { box: null, fills: [] };
  const b = () => { if (!st.box) st.box = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; return st.box; };
  const add = (x, y) => {
    const q = b();
    if (x < q.x0) q.x0 = x;
    if (x > q.x1) q.x1 = x;
    if (y < q.y0) q.y0 = y;
    if (y > q.y1) q.y1 = y;
  };
  ctx.beginPath = () => { st.box = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; };
  ctx.moveTo = add;
  ctx.lineTo = add;
  ctx.quadraticCurveTo = (cx, cy, x, y) => { add(cx, cy); add(x, y); };
  ctx.bezierCurveTo = (a, bb, cx, cy, x, y) => { add(a, bb); add(cx, cy); add(x, y); };
  ctx.fill = () => { if (st.box && st.box.x1 > -1e8) st.fills.push(st.box); };
  ctx.stroke = () => {};
  return st;
}

const A = load(true);
ok(A.art && typeof A.art.draw === "function" && typeof A.art.ready === "function", "对外契约 {draw, ready}");
ok(A.art.ready() === true, "ready() 在帧图就绪时返回 true");

const states = ["walk", "windup", "strike", "recover", "hurt", "dead"];
const kinds = ["walker", "fast", "brute", "boss"];
const rows = [];

for (const kind of kinds) {
  const d = DEFS[kind];
  for (const st of states) {
    drawCalls = [];
    const e = enemy(kind, {
      state: st,
      hurtT: st === "hurt" ? 0.15 : 0,
      deadT: st === "dead" ? 0.4 : 0
    });
    let err = null;
    try { A.art.draw(makeCtx(), e, 1.75); } catch (ex) { err = ex; }
    ok(!err, `${kind}/${st} 不抛异常 (${err && err.message})`);
    const frameDraw = drawCalls.find(c => c.src && String(c.src).indexOf("enemy-" + kind) >= 0);
    ok(!!frameDraw, `${kind}/${st} 走了帧图`);
    if (!frameDraw) continue;

    const [dx, dy, dw, dh] = frameDraw.args;
    const H = e.h;
    const targetH = kind === "boss" ? H * 1.6 : H;
    ok(Math.abs(dh - targetH) < 1e-6, `${kind}/${st} 目标高度=${targetH.toFixed(2)} 实际 ${dh.toFixed(2)}`);
    ok(Math.abs(dw / dh - d.w / d.h) < 1e-6, `${kind}/${st} 保持原始宽高比`);

    /* 水平中心 = anchorX；脚底贴 e.y */
    const cx = dx + d.anchorX * dw;
    ok(Math.abs(cx) < 1e-6, `${kind}/${st} 水平对齐 anchorX (cx=${cx.toFixed(3)})`);
    const bottom = dy + dh;
    if (kind === "boss") ok(Math.abs(bottom) <= H * 0.02 + 1e-6, `${kind}/${st} BOSS 悬浮幅度 <= 2%H (${bottom.toFixed(2)})`);
    else ok(Math.abs(bottom) < 1e-6, `${kind}/${st} 脚底对齐 e.y (bottom=${bottom.toFixed(3)})`);

    const idx = Number((frameDraw.src.match(/-(\d+)\.webp$/) || [])[1]);
    const last = d.frames - 1;
    if (st === "windup" || st === "recover") ok(idx === 0, `${kind}/windup|recover 停在第 0 帧 (got ${idx})`);
    if (st === "strike") ok(idx === last, `${kind}/strike 停在最后一帧 (got ${idx})`);
    if (st === "walk") ok(idx >= 0 && idx <= last, `${kind}/walk 帧号合法 (got ${idx})`);

    rows.push({ kind, st, idx, dw: dw.toFixed(1), dh: dh.toFixed(1), H: H.toFixed(1) });
  }
}

/* ---------------------------------------------------------------- 2. 循环 / 定格 */
{
  const d = DEFS.walker;
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    drawCalls = [];
    A.art.draw(makeCtx(), enemy("walker", { state: "walk", x: 300 }), i * 0.05);
    const c = drawCalls.find(x => x.src && x.src.includes("enemy-walker"));
    if (c) seen.add(c.src);
  }
  ok(seen.size === d.frames, `walker 循环覆盖全部 ${d.frames} 帧 (覆盖 ${seen.size})`);
}
{
  /* hurt 定格：先走一段记下当前帧，再切 hurt，帧号必须不变 */
  const e = enemy("walker", { state: "walk" });
  let idxWalk = -1;
  for (let i = 0; i < 10; i++) {
    drawCalls = [];
    A.art.draw(makeCtx(), e, 1.0 + i * 0.013);
    const c = drawCalls.find(x => x.src && x.src.includes("enemy-walker"));
    if (c) idxWalk = Number(c.src.match(/-(\d+)\.webp$/)[1]);
  }
  e.state = "hurt";
  e.hurtT = 0.2;
  drawCalls = [];
  A.art.draw(makeCtx(), e, 5.9);
  const c2 = drawCalls.find(x => x.src && x.src.includes("enemy-walker"));
  const idxHurt = Number(c2.src.match(/-(\d+)\.webp$/)[1]);
  ok(idxHurt === idxWalk, `hurt 停在当前帧 (walk ${idxWalk} -> hurt ${idxHurt})`);
  ok(drawCalls.some(x => x.comp === "lighter"), "hurt 用 lighter 叠加闪白");
}

/* ---------------------------------------------------------------- 3. 缓存 */
{
  const imgs0 = A.stats.images;
  const canv0 = A.stats.canvases;
  for (let i = 0; i < 120; i++) {
    A.art.draw(makeCtx(), enemy(kinds[i % 4], {
      state: i % 2 ? "hurt" : "walk",
      hurtT: i % 2 ? 0.1 : 0
    }), i * 0.016);
  }
  ok(A.stats.images === imgs0, `draw 热路径不 new Image (新增 ${A.stats.images - imgs0})`);
  ok(A.stats.canvases - canv0 <= 8, `tint 缓存有界 (新增 canvas ${A.stats.canvases - canv0})`);
  const total = Object.values(DEFS).reduce((n, d) => n + d.frames, 0);
  ok(imgs0 === total, `Image 总数 = 帧总数 ${total} (实际 ${imgs0})`);
  ok(A.art.ready() === true, "ready() 稳定 true");
}

/* ---------------------------------------------------------------- 4. 血条 / 死亡 */
{
  /* 普通敌人：血条外框在 e.y - e.h - 22 附近（roundRect 外扩 2.5） */
  const ctx = makeCtx();
  const pr = pathProbe(ctx);
  const e = enemy("brute", { maxHp: 5, hp: 3, state: "walk" });
  A.art.draw(ctx, e, 0.9);
  const want = -e.h - 22 - 2.5;
  const bar = pr.fills.find(f => Math.abs(f.y0 - want) < 0.6 && (f.y1 - f.y0) < 24);
  ok(!!bar, `血条外框顶边在 e.y-e.h-22 (期望 ${want.toFixed(1)}, 实测 ${pr.fills.map(f => f.y0.toFixed(1)).join("/") || "无"})`);
}
{
  /* maxHp <= 1 不画血条 */
  const ctx = makeCtx();
  const pr = pathProbe(ctx);
  const e = enemy("fast", { maxHp: 1, hp: 1 });
  A.art.draw(ctx, e, 0.5);
  ok(!pr.fills.some(f => f.y0 < -e.h * 0.9 && f.y0 > -e.h * 1.3 && (f.y1 - f.y0) < 24), "maxHp <= 1 时不画血条");
}
{
  /* BOSS 血条要抬到 1.6H 图形头顶，不能压穿面具 */
  const ctx = makeCtx();
  const pr = pathProbe(ctx);
  const e = enemy("boss", { maxHp: 26, hp: 20, state: "walk" });
  A.art.draw(ctx, e, 1.0);
  const want = -e.h * 1.6 - 22 - 2.5;
  const bar = pr.fills.find(f => Math.abs(f.y0 - want) < 0.6 && (f.y1 - f.y0) < 26);
  ok(!!bar, `BOSS 血条抬到 1.6H 头顶 (期望 ${want.toFixed(1)}, 实测 ${pr.fills.map(f => f.y0.toFixed(1)).join("/") || "无"})`);
}
{
  drawCalls = [];
  const e = enemy("walker", { state: "dead", deadT: 0.3 });
  A.art.draw(makeCtx(), e, 2.0);
  ok(drawCalls.some(c => c.alpha < 1 && c.alpha > 0), "dead 淡出（globalAlpha < 1）");
}

/* ---------------------------------------------------------------- 5. 降级路径 */
{
  const B = load(false);
  ok(B.ctx.window.ENEMY_ANIM === undefined, "降级场景：ENEMY_ANIM 缺失");
  ok(B.art.ready() === true, "降级场景：IMG 就绪时 ready() 仍为 true");
  let calls = 0;
  for (const kind of kinds) {
    for (const st of states) {
      const ctx = makeCtx();
      const rec = { n: 0 };
      const of = ctx.fill;
      ctx.fill = () => { rec.n++; of(); };
      const os = ctx.stroke;
      ctx.stroke = () => { rec.n++; os(); };
      const e = enemy(kind, { state: st, deadT: st === "dead" ? 0.3 : 0, hurtT: st === "hurt" ? 0.1 : 0 });
      let err = null;
      try { B.art.draw(ctx, e, 1.0); } catch (ex) { err = ex; }
      ok(!err, `降级 ${kind}/${st} 不抛异常 (${err && err.message})`);
      ok(rec.n > 0, `降级 ${kind}/${st} 确实画了东西 (${rec.n} 次 fill/stroke)`);
      calls += rec.n;
    }
  }
  ok(B.stats.images === 0, `降级路径不 new Image (${B.stats.images})`);
  console.log("\n降级路径 fill/stroke 总计 " + calls);
}

/* ---------------------------------------------------------------- 6. 朝向 */
{
  for (const face of [1, -1]) {
    const ctx = makeCtx();
    const scales = [];
    ctx.scale = (x, y) => scales.push([x, y]);
    A.art.draw(ctx, enemy("walker", { state: "walk", facing: face }), 0.4);
    ok(scales.some(s => s[0] === face && s[1] === 1), `facing=${face} -> scale(${face},1)`);
  }
}

/* ---------------------------------------------------------------- 报表 */
console.log("\nkind    state    帧  dw      dh      e.h");
console.log("-".repeat(46));
for (const r of rows) {
  console.log(
    r.kind.padEnd(7) + r.st.padEnd(9) + String(r.idx).padEnd(3) +
    r.dw.padEnd(8) + r.dh.padEnd(8) + r.H
  );
}
console.log("-".repeat(46));
console.log(fails === 0 ? "自检通过，0 失败" : "自检失败 " + fails + " 项");
process.exit(fails === 0 ? 0 : 1);

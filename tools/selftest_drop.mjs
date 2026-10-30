/* node 自检：掉落池的阵次规则（不起浏览器）
 * 用法：node tools/selftest_drop.mjs
 *
 * 只证明五件事，不证明数值好不好玩：
 *   1. 每件武器的解锁 / 退场阵次都能算出非空池子（0..20 阵全试）；
 *   2. 玉璋刃 / 骨牙匕只在前两阵出现，第三阵起一个不漏地退场；
 *   3. 其余 9 件武器在各自解锁阵次起真的抽得到（累计覆盖 = 全部 11 键）；
 *   4. heavyMul 只放大非基础件 —— 第一阵基础档全是 from:0，倍率 1 与 2 同分布；
 *   5. 池内均匀：同一件武器在池里的出现次数只由 heavyMul 决定，不带其它权重。
 *
 * 池子结构是「均匀随机、不用加权表」这个决定的唯一防线 ——
 * 谁把权重表请回来，第 5 条会当场失败。
 */
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]+$/, "");
const html = fs.readFileSync(ROOT + "/index.html", "utf8");

/* ---- 从内联脚本里抽出 DROP_POOL 与 pickDropKey ----
   只取这两段，不跑整份内联脚本（它要 DOM / canvas）。 */
function sliceBlock(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error("找不到：" + startMarker);
  const j = src.indexOf(endMarker, i);
  if (j < 0) throw new Error("找不到结束标记：" + endMarker);
  return src.slice(i, j + endMarker.length);
}

const poolSrc = sliceBlock(html, "var DROP_POOL = [", "\n];");
const fnStart = html.indexOf("function pickDropKey(");
if (fnStart < 0) throw new Error("找不到 pickDropKey");
/* 函数体按大括号配平截取 */
let depth = 0,
  k = html.indexOf("{", fnStart),
  fnEnd = -1;
for (let p = k; p < html.length; p++) {
  if (html[p] === "{") depth++;
  else if (html[p] === "}") {
    depth--;
    if (depth === 0) {
      fnEnd = p + 1;
      break;
    }
  }
}
const fnSrc = html.slice(fnStart, fnEnd);

const mod = { exports: {} };
const sandbox = { module: mod, Math, console };
vm.createContext(sandbox);
vm.runInContext(
  poolSrc + "\n" + fnSrc + "\nmodule.exports = { DROP_POOL, pickDropKey };",
  sandbox,
  { filename: "index.html#DROP_POOL" }
);
const { DROP_POOL, pickDropKey } = mod.exports;

/* ---------------- 断言框架 ---------------- */

let fail = 0;
function ok(cond, label, extra) {
  if (cond) {
    console.log("  ok   " + label);
  } else {
    fail++;
    console.log("  FAIL " + label + (extra ? "  ← " + extra : ""));
  }
}

const WEAK = ["short", "dagger"];
const BASE = DROP_POOL.filter((e) => e.from === 0).map((e) => e.k);
const ALL = DROP_POOL.map((e) => e.k);

/* 用固定序列代替 Math.random，才能断言「池内均匀」而不是靠运气 */
function tally(wave, heavyMul, samples = 20000) {
  const real = Math.random;
  let seed = 12345;
  Math.random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const t = {};
  try {
    for (let i = 0; i < samples; i++) {
      const key = pickDropKey(wave, heavyMul);
      t[key] = (t[key] || 0) + 1;
    }
  } finally {
    Math.random = real;
  }
  return t;
}

console.log("=== 1. 每个阵次都抽得出武器 ===");
for (let w = 0; w <= 20; w++) {
  const t = tally(w, 1, 400);
  const keys = Object.keys(t);
  ok(keys.length > 0, `第 ${w} 阵（waveIdx=${w}）池子非空，抽到 ${keys.length} 种`);
}

console.log("\n=== 2. 弱件只在前两阵 ===");
for (const key of WEAK) {
  const at = tally(0, 1).hasOwnProperty(key);
  const at1 = tally(1, 1).hasOwnProperty(key);
  ok(at, `第一阵能抽到 ${key}`);
  ok(at1, `第二阵能抽到 ${key}`);
  for (let w = 2; w <= 5; w++) {
    ok(!tally(w, 1).hasOwnProperty(key), `第三阵起（waveIdx=${w}）不再抽到 ${key}`);
  }
}

console.log("\n=== 3. 全部 11 件在各自解锁阵次起可达 ===");
const seen = new Set();
for (let w = 0; w <= 5; w++) for (const key of Object.keys(tally(w, 1, 4000))) seen.add(key);
for (const key of ALL) ok(seen.has(key), `${key} 在 0..5 阵内抽得到`);
ok(ALL.length === 11, `武器总数 11 件`, "实际 " + ALL.length);
ok(seen.size === ALL.length, `可达集合覆盖全表`, `可达 ${seen.size} / 表 ${ALL.length}`);

console.log("\n=== 4. heavyMul 只放大非基础件 ===");
{
  /* 注意：heavyMul=1 现在没有生产调用方 —— 小兵不掉武器，宝箱固定传 2。
     这里保留 1 vs 2 的对照，是因为 pickDropKey 的契约仍然是「按阵次 + 倍率取池」，
     哪天要开回小兵掉落，这条对照就是它的验收。 */
  const enemy = tally(0, 1, 8000);
  const chest = tally(0, 2, 8000);
  /* 第一阵池里全是 from:0，加倍前后每一项都应落在同一比例上（±4%） */
  let sameShape = true;
  const totalE = Object.values(enemy).reduce((a, b) => a + b, 0);
  const totalC = Object.values(chest).reduce((a, b) => a + b, 0);
  for (const key of BASE) {
    const pe = (enemy[key] || 0) / totalE;
    const pc = (chest[key] || 0) / totalC;
    if (Math.abs(pe - pc) > 0.04) sameShape = false;
  }
  ok(sameShape, "第一阵：倍率 1 与倍率 2 同分布（基础档不吃加成）");

  /* 第二阵起：非基础件在倍率 2 下应明显更多 */
  const e2 = tally(1, 1, 8000);
  const c2 = tally(1, 2, 8000);
  const baseShare = (t) => BASE.filter((k) => (t[k] || 0) > 0).reduce((s, k) => s + t[k], 0) / Object.values(t).reduce((a, b) => a + b, 0);
  ok(baseShare(c2) < baseShare(e2), "第二阵起：倍率 2 下基础件占比更低",
    `倍率2 ${(baseShare(c2) * 100).toFixed(1)}% vs 倍率1 ${(baseShare(e2) * 100).toFixed(1)}%`);
}

console.log("\n=== 5. 池内均匀，不带额外权重 ===");
{
  /* 直接从源码里数池子条目：每个 key 的出现次数只由 heavyMul 决定 */
  const expected = (wave, heavyMul) => {
    const m = {};
    for (const e of DROP_POOL) {
      if (wave < e.from) continue;
      if (e.until !== undefined && wave >= e.until) continue;
      const mul = e.from > 0 ? heavyMul || 1 : 1;
      m[e.k] = mul;
    }
    return m;
  };
  let allOk = true;
  for (const [wave, mul] of [[0, 1], [1, 1], [2, 1], [5, 1], [1, 2], [3, 2]]) {
    const exp = expected(wave, mul);
    const got = tally(wave, mul, 30000);
    const total = Object.values(exp).reduce((a, b) => a + b, 0);
    const totalGot = Object.values(got).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(exp)) {
      const want = exp[key] / total;
      const have = (got[key] || 0) / totalGot;
      if (Math.abs(want - have) > 0.02) {
        allOk = false;
        console.log(`       偏差 ${key} wave=${wave} mul=${mul}: 期望 ${(want * 100).toFixed(1)}% 实测 ${(have * 100).toFixed(1)}%`);
      }
    }
    for (const key of Object.keys(got)) {
      if (!exp[key]) {
        allOk = false;
        console.log(`       多余 ${key} wave=${wave} mul=${mul}`);
      }
    }
  }
  ok(allOk, "6 组阵次 × heavyMul 的实际分布与「条目数即权重」一致（±2%）");
}

console.log("\n--- 6. 后三阵各有一件新武器入池 ---");
{
  /* 不让第三阵一次开满、第四第五阵原样重复。 */
  const firstAt = {};
  for (const e of DROP_POOL) if (firstAt[e.from] === undefined) firstAt[e.from] = [];
  for (const e of DROP_POOL) firstAt[e.from].push(e.k);
  for (const wave of [2, 3, 4]) {
    ok((firstAt[wave] || []).length > 0, `第 ${wave + 1} 阵有武器首次入池`,
      "实际 " + ((firstAt[wave] || []).join(",") || "无"));
  }
}

console.log("\n--- 7. 平均伤害只升不降、池子从不缩水 ---");
{
  /* 这是「越往后越不掉低伤武器」这条设计意图的唯一机器判据。
     调 DROP_POOL 时如果把它调成「后一池比前一池弱」，这里当场红。 */
  const DMG = { fist: 1, short: 2, dagger: 2.5, sword: 4, bow: 4, spear: 5, blade: 5, axe: 6, rock: 7, hammer: 8, bell: 9, jar: 12 };
  const WAVES = 6;                     /* 六阵 */
  const avg = (wave) => {
    const t = tally(wave, 1, 30000);
    const keys = Object.keys(t);
    return keys.reduce((s, k) => s + DMG[k], 0) / keys.length;
  };
  const size = (wave) => Object.keys(tally(wave, 1, 30000)).length;

  let monoAvg = true,
    monoSize = true;
  const rows = [];
  for (let w = 0; w < WAVES; w++) {
    rows.push({ w, avg: avg(w), size: size(w) });
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].avg < rows[i - 1].avg - 1e-9) monoAvg = false;
    if (rows[i].size < rows[i - 1].size) monoSize = false;
  }
  for (const r of rows) {
    console.log(
      `       第 ${r.w + 1} 阵  池 ${r.size} 件  平均伤害 ${r.avg.toFixed(2)}`
    );
  }
  ok(monoAvg, "平均伤害随阵次单调不减");
  ok(monoSize, "池子件数随阵次不缩水");
  /* 末阵不比第五阵弱：BOSS 自己必掉三件套，小兵池只要不倒退就行 */
  ok(rows[WAVES - 1].avg >= rows[WAVES - 2].avg - 1e-9, "末阵池子不比第五阵弱");
}

console.log("\n----------------------------------------------");
if (fail === 0) {
  console.log("selftest_drop: 0 失败");
  process.exit(0);
} else {
  console.log(`selftest_drop: ${fail} 失败`);
  process.exit(1);
}

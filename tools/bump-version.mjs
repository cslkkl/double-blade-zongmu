#!/usr/bin/env node
/* 站点缓存版本号（`?v=`）的唯一执行入口：读 → 校验 → 计算 → 写回。

   用法
     node tools/bump-version.mjs --check            只校验，不写盘（收工验证链跑这个）
     node tools/bump-version.mjs --note "说明"       递增一次，并把说明写进 index.html 注释块

   口径的唯一 home 是 docs/DEPLOY.md「四、缓存版本号」。本文件只实现，不定义规则。

   格式：<YYYYMMDD><字母>，例 20261030a
     - 日期段 = **这次改动的日期**，不是系列起点。跨天必须换日期段并从 a 重排。
     - 字母段 = 当天第几次 bump，a/b/c…（超过 z 进 aa/ab，用前请看 docs/DEPLOY.md 的提醒）。
     - 全站共用**一个**令牌：index.html / hub.html / showcase.html / mobile.html 的
       `?v=` 必须完全相同。它们引用同一批 `assets/icon/*`，两个令牌就是两套缓存键。
*/
import fs from "node:fs";

/* 带 `?v=` 的四个页面。顺序即报错时的输出顺序。 */
const FILES = ["index.html", "hub.html", "showcase.html", "mobile.html"];
/* 只认「8 位日期 + 小写字母」这种形状，避免误伤注释里出现的 `?v=` 散文。 */
const RE = /\?v=(\d{8}[a-z]+)/g;
/* 版本说明注释块只住在 index.html。 */
const COMMENT_FILE = "index.html";

/* ---- 字母段：双射 26 进制，0→a、25→z、26→aa ---- */
function letters(n) {
  let s = "";
  let m = n + 1;
  while (m > 0) {
    const r = (m - 1) % 26;
    s = String.fromCharCode(97 + r) + s;
    m = Math.floor((m - 1) / 26);
  }
  return s;
}
function letterIndex(s) {
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 97 + 1);
  return n - 1;
}

/* ---- 今天的日期段：按本机时区，与提交时间的显示口径一致 ---- */
function today() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/* ---- 读盘：收集每个文件里的全部令牌 ---- */
function scan() {
  const perFile = new Map();
  for (const f of FILES) {
    const txt = fs.readFileSync(f, "utf8");
    const toks = [...txt.matchAll(RE)].map((m) => m[1]);
    perFile.set(f, toks);
  }
  return perFile;
}

const mode = process.argv.includes("--check") ? "check" : "bump";
const noteAt = process.argv.indexOf("--note");
const note = noteAt > -1 ? process.argv[noteAt + 1] : null;

const perFile = scan();
const all = [...perFile.values()].flat();
if (all.length === 0) {
  console.error("没找到任何 `?v=<8 位日期><字母>` —— 版本号是不是被整批删掉了？");
  process.exit(1);
}

const distinct = [...new Set(all)].sort();
const counts = distinct.map((t) => `${t}×${all.filter((x) => x === t).length}`).join("  ");

/* ================= --check：只校验，不写盘 ================= */
if (mode === "check") {
  if (distinct.length > 1) {
    console.error("版本号不一致：", counts);
    for (const [f, toks] of perFile) {
      const u = [...new Set(toks)];
      if (u.length) console.error(`  ${f}: ${u.join(", ")}  (${toks.length} 处)`);
    }
    console.error("全站必须共用一个令牌 —— 跑 node tools/bump-version.mjs --note \"说明\" 统一。");
    process.exit(1);
  }
  const t = distinct[0];
  const date = t.slice(0, 8);
  const stale = date !== today();
  console.log(`版本号一致：${t}（${all.length} 处 / ${FILES.length} 个文件）`);
  if (stale) {
    console.log(`  注意：日期段 ${date} 不是今天 ${today()} —— 若这次动过 js/ 或素材，应当 bump。`);
  }
  process.exit(0);
}

/* ================= bump：算新令牌 → 全站写回 ================= */
const cur = distinct[distinct.length - 1]; // 漂移时以最新（字典序最大）为基准
const curDate = cur.slice(0, 8);
const curLetter = cur.slice(8);
const d = today();

/* 跨天从 a 重排；同一天才在字母上递增。这一步就是原来漏掉的规则。 */
const next = d === curDate ? `${d}${letters(letterIndex(curLetter) + 1)}` : `${d}a`;

console.log(`版本号 ${cur} → ${next}`);
if (distinct.length > 1) {
  console.log(`  顺带统一了漂移：${counts}`);
}
if (d !== curDate) {
  console.log(`  日期段 ${curDate} → ${d}（跨天，字母从 a 重排）`);
}
if (next.length > cur.length + 1) {
  console.log(`  注意：字母段已到 ${next.slice(8)}，同一天 bump 太多次，考虑看 docs/DEPLOY.md 的提醒。`);
}

/* 1) 四个页面的 `?v=` 全量替换 */
let total = 0;
for (const f of FILES) {
  const txt = fs.readFileSync(f, "utf8");
  const out = txt.replace(RE, (_, tok) => (tok === next ? _ : `?v=${next}`));
  const n = [...txt.matchAll(RE)].length;
  if (out !== txt) {
    fs.writeFileSync(f, out);
    total += n;
    console.log(`  ${f}: ${n} 处`);
  } else {
    console.log(`  ${f}: ${n} 处（已是目标值，未写盘）`);
  }
}

/* 2) index.html 注释块：把旧的「当前版本」降为「上一次」，新值插在最前 */
if (note) {
  const txt = fs.readFileSync(COMMENT_FILE, "utf8");
  const oldHead = `     当前版本：${curDate}-${curLetter}`;
  if (!txt.includes(oldHead)) {
    console.error(`注释块没找到「${oldHead.trim()}」—— 先人工对齐，别让脚本瞎猜。`);
    process.exit(1);
  }
  const head = [
    `     当前版本：${d}-${next.slice(8)}`,
    `       ${next.slice(8)} = ${note}`,
    `     上一次：${curDate}-${curLetter}`,
  ].join("\n");
  fs.writeFileSync(COMMENT_FILE, txt.replace(oldHead, head));
  console.log(`  ${COMMENT_FILE}: 注释块已更新（${d}-${next.slice(8)}）`);
} else {
  const txt = fs.readFileSync(COMMENT_FILE, "utf8");
  const oldHead = `     当前版本：${curDate}-${curLetter}`;
  if (txt.includes(oldHead)) {
    fs.writeFileSync(
      COMMENT_FILE,
      txt.replace(oldHead, `     当前版本：${d}-${next.slice(8)}`),
    );
    console.error("  警告：没给 --note，注释块里「当前版本」的日期改了但说明还是旧的，请手动补。");
  }
}

console.log(`共 ${total} 处。接着跑：node tools/check-inline.mjs`);

#!/usr/bin/env node
/* =====================================================================
   serve-showcase.mjs — 素材总览页的本地静态服务
   ---------------------------------------------------------------------
   为什么不用 file:// 直开：
     canvas 会因为跨源图片被标记污染，任何 getImageData 都会抛
     SecurityError；部分浏览器还会限制本地目录的并行请求。
     走 http://127.0.0.1:PORT/ 就完全没有这些限制。
     （游戏本体 index.html 仍然坚持 file:// 直开，这里是唯一例外。）

   用法：
     node serve-showcase.mjs
     node serve-showcase.mjs --port 8801
     node serve-showcase.mjs --no-open
   零依赖，只用 node 内置模块。
   ===================================================================== */

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf("--" + name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  return fallback;
}
const PORT = Number(arg("port", process.env.PORT || 8801));
/* 谁来开浏览器：仍然由本进程开（双击 启动展示页.bat 时，node 就在那个窗口前台跑，
   不会再另起一个控制台）。判定「默认处理器是不是 IE」只在 bat 里做一次：
   不是 IE 就不传 --browser，这里走 `start "" <url>` 用默认浏览器；
   是 IE 才传 --browser <Chromium 绝对路径>。两处端口默认都是 8801。 */
const OPEN = !argv.includes("--no-open");
/* 指定用哪个浏览器打开（可选）。win32 上默认走 `start "" <url>`，即系统默认程序；
   双击 启动展示页.bat 时，bat 只在「默认处理器是 IE」时才传 --browser <Chromium 路径>，
   避免把展示页交给 IE（getImageData 直接抛错）。传空或平台非 win32 时忽略。 */
const BROWSER = process.platform === "win32" ? arg("browser", "") : "";
const ENTRY = "/showcase.html";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function safeJoin(root, urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const target = path.normalize(path.join(root, clean));
  if (!target.startsWith(root)) return null;       // 挡掉 ../
  return target;
}

const server = http.createServer(async (req, res) => {
  let urlPath = req.url || "/";
  if (urlPath === "/") urlPath = ENTRY;

  const file = safeJoin(ROOT, urlPath);
  if (!file) {
    res.writeHead(403).end("403");
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
       .end("404 " + urlPath);
    return;
  }

  if (stat.isDirectory()) {
    res.writeHead(302, { location: urlPath.replace(/\/?$/, "/") + "index.html" }).end();
    return;
  }

  const etag = `W/"${stat.size}-${stat.mtimeMs}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304).end();
    return;
  }

  res.writeHead(200, {
    "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
    "content-length": stat.size,
    "cache-control": "no-cache",
    "etag": etag
  });

  if (req.method === "HEAD") { res.end(); return; }
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}${ENTRY}`;
  console.log("");
  console.log("  素材总览已启动");
  console.log("  " + url);
  console.log("  Ctrl+C 停止");
  console.log("");

  if (!OPEN) return;
  if (process.platform === "win32") {
    if (BROWSER) {
      spawn(BROWSER, [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    }
  } else if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  端口 ${PORT} 已被占用。换一个：node serve-showcase.mjs --port 8802\n`);
    process.exit(1);
  }
  throw err;
});

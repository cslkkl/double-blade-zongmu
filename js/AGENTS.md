# js/ — 规则层

继承根规则，见 [../AGENTS.md](../AGENTS.md)；文件职责与改哪儿波及谁见 [README.md](README.md)。

本目录特有约束：
- 只写 IIFE + `window.*`，禁 `import` / `export` / `type="module"`，`file://` 下会被 CORS 拦。
- 每个模块必须自带纯代码降级；`draw()` 热路径禁 `new Image()`、禁建 canvas。
- 契约（导出名、参数序、字段名）改动，同一次改动内更新 [README.md](README.md) 与 [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)。
- 动 `enemies-assets.js` 后必跑 `node tools/selftest_enemies.mjs`；动任何 js 后必跑 `node tools/check-inline.mjs`。

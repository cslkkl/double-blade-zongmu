# tools/ — 规则层

继承根规则，见 [../AGENTS.md](../AGENTS.md)；每个脚本做什么、输入输出、幂等性见 [README.md](README.md)。

本目录特有约束：
- 脚本只读源图、只写 `assets/` 与 `js/anim-data.js`；不许写 `index.html` 或其它 `js/*.js`。
- `SRC` 常量是硬编码绝对路径，改路径只改脚本顶部，不许散落到函数里。
- 生成物写完必须 `node --check js/anim-data.js`；改敌人相关必跑 `node tools/selftest_enemies.mjs`。
- 跑 `slice_anim.py` 前先确认敌人帧可重出：它会清空 `assets/anim/` 全部 `.webp`。
- 自检脚本一律 node + mock canvas，不启浏览器、不接共享 Playwright。

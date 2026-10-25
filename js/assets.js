/* =====================================================================
   资源加载器
   用法：Assets.load().then(() => start())

   ⚠️ 加键之前先搜一遍消费方：`IMG.<键名>`。
   MANIFEST 里每多一个键，每次启动就多读一张图（file:// 下没有缓存协商，
   实打实读盘）。2026-10-25 清掉 11 个无消费方的键，省了 293 KB 启动白加载。
   ===================================================================== */
(function () {
  "use strict";

  var MANIFEST = {
    bgFar:       "assets/bg-far.jpg",
    bgMid:       "assets/bg-mid.webp",
    ground:      "assets/ground.webp",
    sacredTree:  "assets/props/sacred-tree.webp",
    maskRelief:  "assets/props/mask-relief.webp",
    brazier:     "assets/props/brazier.webp",
    potteryJar:  "assets/props/pottery-jar.webp",
    banner:      "assets/props/banner.webp",
    bellCluster: "assets/props/bell-cluster.webp",
    jadeTablet:  "assets/props/jade-tablet.webp",
    ivoryTusk:   "assets/props/ivory-tusk.webp",
    slash1:      "assets/slash-1.webp",
    slash2:      "assets/slash-2.webp",
    slash3:      "assets/slash-3.webp",
    hit1:        "assets/hit-1.webp",
    hit2:        "assets/hit-2.webp",
    hit3:        "assets/hit-3.webp",
    whirlRing:   "assets/whirl-ring.webp",
    projRock:    "assets/proj-rock.webp",
    chestClosed:  "assets/interact/chest-closed.webp",
    chestOpen:    "assets/interact/chest-open.webp",
    mechanismOff: "assets/interact/mechanism-off.webp",
    mechanismOn:  "assets/interact/mechanism-on.webp",
    pickupCowrie: "assets/interact/pickup-cowrie.webp",
    pickupJade:   "assets/interact/pickup-jade.webp",
    /* HUD 玩家卡片：青铜底板 + 纵目面具头像（index.html 的 CSS 直接引用
       同一路径，这里登记只为预热浏览器缓存；图挂了 CSS 天然退回渐变/透明，
       加载器本身失败不阻塞，别破坏这条设计）。 */
    hudCard:      "assets/ui/hud-card.webp",
    portraitP1:   "assets/ui/portrait-p1.webp",
    /* 标题页 / 通关页全屏场景（ov-title / ov-win 的 CSS 背景同上，仅预热缓存） */
    titleScene:   "assets/ui/title-scene.webp",
    winScene:     "assets/ui/win-scene.webp",
    /* 拾取图标：统一画布，避免忽大忽小。
       short 与 dagger 共用同一张图（真值由 index.html 的 ICON 表按武器 key 取），
       rock 与道具共用 it-rock —— 同路径只加载一次，见下面的 byPath 去重。 */
    wpShort:     "assets/icons/wp-dagger.webp",
    wpDagger:    "assets/icons/wp-dagger.webp",
    wpSword:     "assets/icons/wp-sword.webp",
    wpAxe:       "assets/icons/wp-axe.webp",
    wpHammer:    "assets/icons/wp-mace.webp",
    wpSpear:     "assets/icons/wp-spear.webp",
    wpBow:       "assets/icons/wp-bow.webp",
    wpRock:      "assets/icons/it-rock.webp",
    itJade:      "assets/icons/it-jade.webp",
    itBell:      "assets/icons/it-bell.webp",
    itJar:       "assets/icons/it-jar.webp",
    /* 角色降级底图：ANIM 缺失或帧图全不可用时才走。pose-0 是主用，
       其余站姿帧（pose-1 / front / side / back）无消费方，已删。 */
    pose0:       "assets/char/pose-0.webp"
  };

  window.IMG = {};
  var pending = 0, done = 0, failed = [];

  function load() {
    return new Promise(function (resolve) {
      var keys = Object.keys(MANIFEST);

      /* 同一路径只建一个 Image。wpShort / wpDagger 都指向 wp-dagger.webp，
         各建一个就是白读一次盘；多键共用同一个实例，window.IMG 每个键都有值。 */
      var waiters = {};                     // src -> [键名...]
      keys.forEach(function (k) {
        var src = MANIFEST[k];
        (waiters[src] || (waiters[src] = [])).push(k);
      });

      var paths = Object.keys(waiters);
      pending = paths.length;               // ⚠️ 计的是「不同路径数」，不是键数

      paths.forEach(function (src) {
        var ks = waiters[src];
        var im = new Image();
        im.onload = function () {
          done++; pending--;
          if (pending <= 0) finish(resolve);
        };
        im.onerror = function () {
          ks.forEach(function (k) { failed.push(k); });
          pending--;
          if (pending <= 0) finish(resolve);
        };
        im.src = src;
        /* 先占用：键必须立刻存在（调用方一律用 imgReady() 判就绪，
           不看键在不在）。加载失败时它留在 window.IMG 里是未就绪实例。 */
        ks.forEach(function (k) { window.IMG[k] = im; });
      });

      if (paths.length === 0) resolve();
    });
  }

  function finish(resolve) {
    if (failed.length) {
      console.warn("[Assets] 加载失败:", failed.join(", "));
    }
    resolve({ loaded: done, failed: failed });
  }

  window.Assets = { load: load, MANIFEST: MANIFEST };
})();

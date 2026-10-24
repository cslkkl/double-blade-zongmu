/* =====================================================================
   资源加载器
   用法：Assets.load().then(() => start())
   ===================================================================== */
(function () {
  "use strict";

  var MANIFEST = {
    bgFar:       "assets/bg-far.jpg",
    bgMid:       "assets/bg-mid.webp",
    bgFg:        "assets/bg-fg.webp",
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
    pose0:       "assets/char/pose-0.webp",
    pose1:       "assets/char/pose-1.webp",
    charFront:   "assets/char/front.webp",
    charSide:    "assets/char/side.webp",
    charBack:    "assets/char/back.webp"
  };

  window.IMG = {};
  var pending = 0, done = 0, failed = [];

  function load() {
    return new Promise(function (resolve) {
      var keys = Object.keys(MANIFEST);
      pending = keys.length;

      keys.forEach(function (k) {
        var im = new Image();
        im.onload = function () {
          done++; pending--;
          if (pending <= 0) finish(resolve);
        };
        im.onerror = function () {
          failed.push(k);
          pending--;
          if (pending <= 0) finish(resolve);
        };
        im.src = MANIFEST[k];
        window.IMG[k] = im;
      });

      if (keys.length === 0) resolve();
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

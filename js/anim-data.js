window.ANIM = {
  idle:   { frames: 4, fps: 6,  loop: true,  w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.00,
            files: ["assets/anim/idle-0.webp", "assets/anim/idle-1.webp", "assets/anim/idle-2.webp", "assets/anim/idle-3.webp"] },
  walk:   { frames: 6, fps: 12, loop: true,  w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.49,
            files: ["assets/anim/walk-0.webp", "assets/anim/walk-1.webp", "assets/anim/walk-2.webp",
                    "assets/anim/walk-3.webp", "assets/anim/walk-4.webp", "assets/anim/walk-5.webp"] },
  attack: { frames: 4, fps: 16, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.16,
            files: ["assets/anim/attack-0.webp", "assets/anim/attack-1.webp", "assets/anim/attack-2.webp", "assets/anim/attack-3.webp"] },
  jump:   { frames: 3, fps: 10, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 0.96,
            files: ["assets/anim/jump-0.webp", "assets/anim/jump-1.webp", "assets/anim/jump-2.webp"] },
  hurt:   { frames: 2, fps: 14, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 0.78,
            files: ["assets/anim/hurt-0.webp", "assets/anim/hurt-1.webp"] },
  whirl:  { frames: 4, fps: 18, loop: true,  w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.27,
            files: ["assets/anim/whirl-0.webp", "assets/anim/whirl-1.webp", "assets/anim/whirl-2.webp", "assets/anim/whirl-3.webp"] },
  throw:  { frames: 3, fps: 14, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 0.94,
            files: ["assets/anim/throw-0.webp", "assets/anim/throw-1.webp", "assets/anim/throw-2.webp"] },
  bow:    { frames: 3, fps: 12, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 0.85,
            files: ["assets/anim/bow-0.webp", "assets/anim/bow-1.webp", "assets/anim/bow-2.webp"] },
  dead:   { frames: 3, fps: 8,  loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.04,
            files: ["assets/anim/dead-0.webp", "assets/anim/dead-1.webp", "assets/anim/dead-2.webp"] },
  pickup:        { frames: 3, fps: 10, loop: false, w: 459, h: 560, anchorX: 0.4227, footY: 1.0, scaleFix: 0.914,
            files: ["assets/anim/pickup-0.webp", "assets/anim/pickup-1.webp", "assets/anim/pickup-2.webp"] },
  "attack-heavy":{ frames: 4, fps: 14, loop: false, w: 421, h: 560, anchorX: 0.4763, footY: 1.0, scaleFix: 0.867,
            files: ["assets/anim/attack-heavy-0.webp", "assets/anim/attack-heavy-1.webp", "assets/anim/attack-heavy-2.webp", "assets/anim/attack-heavy-3.webp"] },
  "attack-thrust":{ frames: 4, fps: 16, loop: false, w: 498, h: 403, anchorX: 0.3705, footY: 1.0, scaleFix: 0.754,
            files: ["assets/anim/attack-thrust-0.webp", "assets/anim/attack-thrust-1.webp", "assets/anim/attack-thrust-2.webp", "assets/anim/attack-thrust-3.webp"] },
};

/* 敌人动画（脚步已放慢：walker 7fps / fast 10fps / brute 6fps） */
window.ENEMY_ANIM = {
  walker: { frames: 4, fps: 7,  loop: true, w: 365, h: 378, anchorX: 0.4452, footY: 1.0,
            files: ["assets/anim/enemy-walker-0.webp", "assets/anim/enemy-walker-1.webp",
                    "assets/anim/enemy-walker-2.webp", "assets/anim/enemy-walker-3.webp"] },
  fast:   { frames: 4, fps: 10, loop: true, w: 400, h: 332, anchorX: 0.5000, footY: 1.0,
            files: ["assets/anim/enemy-fast-0.webp", "assets/anim/enemy-fast-1.webp",
                    "assets/anim/enemy-fast-2.webp", "assets/anim/enemy-fast-3.webp"] },
  brute:  { frames: 4, fps: 6,  loop: true, w: 400, h: 341, anchorX: 0.4939, footY: 1.0,
            files: ["assets/anim/enemy-brute-0.webp", "assets/anim/enemy-brute-1.webp",
                    "assets/anim/enemy-brute-2.webp", "assets/anim/enemy-brute-3.webp"] },
  boss:   { frames: 2, fps: 3,  loop: true, w: 400, h: 270, anchorX: 0.5162, footY: 1.0,
            files: ["assets/anim/enemy-boss-0.webp", "assets/anim/enemy-boss-1.webp"] }
};

/* 手持不同武器的站立姿态：换武器时替换 idle 帧。
   scaleFix 已按 idle 的内容高反算，屏幕身高一致，不会跳变。 */
window.ANIM_HOLD = {
axe     : { w: 543, h: 560, anchorX: 0.5212, footY: 1.0, scaleFix: 0.708,
            file: "assets/anim/hold-axe.webp" },
  hammer  : { w: 545, h: 560, anchorX: 0.4376, footY: 1.0, scaleFix: 0.709,
            file: "assets/anim/hold-hammer.webp" },
  sword   : { w: 435, h: 560, anchorX: 0.4057, footY: 1.0, scaleFix: 0.71,
            file: "assets/anim/hold-sword.webp" },
  dagger  : { w: 465, h: 560, anchorX: 0.5527, footY: 1.0, scaleFix: 0.71,
            file: "assets/anim/hold-dagger.webp" },
  spear   : { w: 348, h: 560, anchorX: 0.5029, footY: 1.0, scaleFix: 0.708,
            file: "assets/anim/hold-spear.webp" },
  bow     : { w: 560, h: 545, anchorX: 0.6357, footY: 1.0, scaleFix: 0.709,
            file: "assets/anim/hold-bow.webp" },
  rock    : { w: 558, h: 560, anchorX: 0.457, footY: 1.0, scaleFix: 0.709,
            file: "assets/anim/hold-rock.webp" },
  short   : { w: 380, h: 560, anchorX: 0.5868, footY: 1.0, scaleFix: 0.711,
            file: "assets/anim/hold-short.webp" },
  blade   : { w: 365, h: 560, anchorX: 0.5767, footY: 1.0, scaleFix: 0.708,
            file: "assets/anim/hold-blade.webp" },
  jar     : { w: 363, h: 560, anchorX: 0.6129, footY: 1.0, scaleFix: 0.708,
            file: "assets/anim/hold-jar.webp" },
  bell    : { w: 425, h: 560, anchorX: 0.5394, footY: 1.0, scaleFix: 0.709,
            file: "assets/anim/hold-bell.webp" }
};

/* >>> slice_weapon_assets: WEAPON_ATTACK >>> */
/* 攻击姿态帧：键集合固定，bell 不在其中（沿用 jar 姿态，由上层兜底）。
   scaleFix 按「头冠顶 → 脚底」反算：身体高度的屏幕长度与 idle 一致。
   武器举过头顶的格（axe/hammer）画布会高很多，scaleFix 因此偏大，属正常。 */
window.WEAPON_ATTACK = {
  short   : { w: 477, h: 479, anchorX: 0.6567, footY: 1.0, scaleFix: 0.723,
            file: "assets/anim/atk-short.webp" },
  dagger  : { w: 560, h: 452, anchorX: 0.5687, footY: 1.0, scaleFix: 0.723,
            file: "assets/anim/atk-dagger.webp" },
  sword   : { w: 560, h: 538, anchorX: 0.4696, footY: 1.0, scaleFix: 0.752,
            file: "assets/anim/atk-sword.webp" },
  axe     : { w: 363, h: 560, anchorX: 0.5096, footY: 1.0, scaleFix: 1.078,
            file: "assets/anim/atk-axe.webp" },
  hammer  : { w: 560, h: 481, anchorX: 0.5411, footY: 1.0, scaleFix: 0.72,
            file: "assets/anim/atk-hammer.webp" },
  spear   : { w: 560, h: 446, anchorX: 0.3241, footY: 1.0, scaleFix: 0.724,
            file: "assets/anim/atk-spear.webp" },
  bow     : { w: 386, h: 552, anchorX: 0.4197, footY: 1.0, scaleFix: 0.784,
            file: "assets/anim/atk-bow.webp" },
  rock    : { w: 392, h: 503, anchorX: 0.5319, footY: 1.0, scaleFix: 0.717,
            file: "assets/anim/atk-rock.webp" },
  blade   : { w: 537, h: 503, anchorX: 0.5121, footY: 1.0, scaleFix: 0.717,
            file: "assets/anim/atk-blade.webp" },
  jar     : { w: 357, h: 552, anchorX: 0.5658, footY: 1.0, scaleFix: 0.793,
            file: "assets/anim/atk-jar.webp" }
};
/* <<< slice_weapon_assets: WEAPON_ATTACK <<< */


/* >>> slice_weapon_assets: WEAPON_FX >>> */
/* 武器刀光：r 为建议半径，arc 为挥砍弧张开角度（弧度）。
   bell 与 jar 共用 burst 那张爆炸环。 */
window.WEAPON_FX = {
  short   : { file: "assets/fx/wp-slash-short.webp", scale: 1.0, r: 98, arc: 1.15 },
  dagger  : { file: "assets/fx/wp-slash-dagger.webp", scale: 1.0, r: 84, arc: 0.75 },
  sword   : { file: "assets/fx/wp-slash-sword.webp", scale: 1.0, r: 112, arc: 1.45 },
  axe     : { file: "assets/fx/wp-slash-axe.webp", scale: 1.0, r: 126, arc: 1.85 },
  hammer  : { file: "assets/fx/wp-slash-hammer.webp", scale: 1.0, r: 132, arc: 1.95 },
  spear   : { file: "assets/fx/wp-slash-spear.webp", scale: 1.0, r: 130, arc: 0.45 },
  bow     : { file: "assets/fx/wp-slash-bow.webp", scale: 1.0, r: 100, arc: 0.9 },
  rock    : { file: "assets/fx/wp-slash-rock.webp", scale: 1.0, r: 92, arc: 1.0 },
  blade   : { file: "assets/fx/wp-slash-burst.webp", scale: 1.0, r: 96, arc: 1.3 },
  jar     : { file: "assets/fx/wp-slash-burst.webp", scale: 1.0, r: 112, arc: 1.05 },
  bell    : { file: "assets/fx/wp-slash-burst.webp", scale: 1.0, r: 108, arc: 1.2 }
};
/* <<< slice_weapon_assets: WEAPON_FX <<< */


/* >>> slice_weapon_assets: HIT_MATERIAL >>> */
/* 打击火花四张：按材质选图。 */
window.HIT_MATERIAL = {
  jade   : "assets/fx/hit-jade.webp",
  bronze : "assets/fx/hit-bronze.webp",
  blunt  : "assets/fx/hit-blunt.webp",
  airy   : "assets/fx/hit-airy.webp"
};
/* <<< slice_weapon_assets: HIT_MATERIAL <<< */

/* >>> slice_weapon_assets: WEAPON_ATTACK_CLIP >>> */
/* 4 帧出招序列。与 WEAPON_ATTACK（单帧降级）并存。
   同一把武器的 4 帧共用同一画布 w/h 与同一个 scaleFix（否则播放会跳）。
   anchorX 逐帧一个：身体轴线随姿势前后移，逐帧取才不漂。 */
window.WEAPON_ATTACK_CLIP = {
  short   : { frames: 4, w: 347, h: 560, scaleFix: 0.997, footY: 1.0,
            anchorX: [0.6268, 0.6268, 0.6268, 0.6268],
            files: ["assets/anim/atk-short-0.webp", "assets/anim/atk-short-1.webp", "assets/anim/atk-short-2.webp", "assets/anim/atk-short-3.webp"] },
  dagger  : { frames: 4, w: 547, h: 526, scaleFix: 0.715, footY: 1.0,
            anchorX: [0.5622, 0.5622, 0.5622, 0.5622],
            files: ["assets/anim/atk-dagger-0.webp", "assets/anim/atk-dagger-1.webp", "assets/anim/atk-dagger-2.webp", "assets/anim/atk-dagger-3.webp"] },
  sword   : { frames: 4, w: 365, h: 560, scaleFix: 0.926, footY: 1.0,
            anchorX: [0.5699, 0.5699, 0.5699, 0.5699],
            files: ["assets/anim/atk-sword-0.webp", "assets/anim/atk-sword-1.webp", "assets/anim/atk-sword-2.webp", "assets/anim/atk-sword-3.webp"] },
  axe     : { frames: 4, w: 327, h: 560, scaleFix: 0.951, footY: 1.0,
            anchorX: [0.5, 0.5, 0.5107, 0.5],
            files: ["assets/anim/atk-axe-0.webp", "assets/anim/atk-axe-1.webp", "assets/anim/atk-axe-2.webp", "assets/anim/atk-axe-3.webp"] },
  hammer  : { frames: 4, w: 284, h: 560, scaleFix: 0.97, footY: 1.0,
            anchorX: [0.4701, 0.4701, 0.4701, 0.4701],
            files: ["assets/anim/atk-hammer-0.webp", "assets/anim/atk-hammer-1.webp", "assets/anim/atk-hammer-2.webp", "assets/anim/atk-hammer-3.webp"] },
  spear   : { frames: 4, w: 559, h: 405, scaleFix: 0.718, footY: 1.0,
            anchorX: [0.4548, 0.4658, 0.4658, 0.4767],
            files: ["assets/anim/atk-spear-0.webp", "assets/anim/atk-spear-1.webp", "assets/anim/atk-spear-2.webp", "assets/anim/atk-spear-3.webp"] },
  bow     : { frames: 4, w: 391, h: 560, scaleFix: 0.796, footY: 1.0,
            anchorX: [0.4316, 0.4357, 0.4357, 0.4399],
            files: ["assets/anim/atk-bow-0.webp", "assets/anim/atk-bow-1.webp", "assets/anim/atk-bow-2.webp", "assets/anim/atk-bow-3.webp"] },
  rock    : { frames: 4, w: 407, h: 560, scaleFix: 0.724, footY: 1.0,
            anchorX: [0.5461, 0.4969, 0.5215, 0.5215],
            files: ["assets/anim/atk-rock-0.webp", "assets/anim/atk-rock-1.webp", "assets/anim/atk-rock-2.webp", "assets/anim/atk-rock-3.webp"] },
  blade   : { frames: 4, w: 429, h: 559, scaleFix: 0.722, footY: 1.0,
            anchorX: [0.5746, 0.5408, 0.5577, 0.5577],
            files: ["assets/anim/atk-blade-0.webp", "assets/anim/atk-blade-1.webp", "assets/anim/atk-blade-2.webp", "assets/anim/atk-blade-3.webp"] },
  jar     : { frames: 4, w: 378, h: 530, scaleFix: 0.745, footY: 1.0,
            anchorX: [0.629, 0.5909, 0.5529, 0.5909],
            files: ["assets/anim/atk-jar-0.webp", "assets/anim/atk-jar-1.webp", "assets/anim/atk-jar-2.webp", "assets/anim/atk-jar-3.webp"] }
};
/* <<< slice_weapon_assets: WEAPON_ATTACK_CLIP <<< */

/* >>> slice_weapon_assets: WEAPON_CLIP >>> */
/* 每把武器一套独立动作。查不到某个 state 时，渲染层逐级回落到
   公共 clip（见 char-rig.js 的 weaponClipDef / drawWeaponState）。
   - 同一把武器同一 state 的所有帧共用画布 w/h 与一个 scaleFix
   - anchorX 逐帧一个：身体轴线随姿势前后移，逐帧才不漂
   - walk 是循环（帧号跟 p.walk 位移走）；attack 跟 swingT；
     jump / hurt / pickup 是单次播放
   生成方式：图生图，参考 _refs/hold-png/ref-hold-<key>.png，
   保证 11 把武器之间画风一致。 */
window.WEAPON_CLIP = {
  short:   {
    walk:    { frames: 4, loop: true, fps: 10, w: 260, h: 560, scaleFix: 0.71,
              footY: 1.0, anchorX: [0.5163, 0.5981, 0.5317, 0.5894],
              files: ["assets/anim/walk-short-0.webp", "assets/anim/walk-short-1.webp", "assets/anim/walk-short-2.webp", "assets/anim/walk-short-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 439, h: 560, scaleFix: 0.756,
              footY: 1.0, anchorX: [0.8827, 0.7694],
              files: ["assets/anim/jump-short-0.webp", "assets/anim/jump-short-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 399, h: 560, scaleFix: 0.819,
              footY: 1.0, anchorX: [0.5338, 0.5526, 0.5526, 0.5714],
              files: ["assets/anim/attack-short-0.webp", "assets/anim/attack-short-1.webp", "assets/anim/attack-short-2.webp", "assets/anim/attack-short-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 368, h: 560, scaleFix: 0.857,
              footY: 1.0, anchorX: [0.5238],
              files: ["assets/anim/hurt-short.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 368, h: 560, scaleFix: 0.857,
              footY: 1.0, anchorX: [0.5238],
              files: ["assets/anim/pickup-short.webp"] }
  },
  dagger:  {
    walk:    { frames: 4, loop: true, fps: 10, w: 299, h: 560, scaleFix: 0.707,
              footY: 1.0, anchorX: [0.3658, 0.3658, 0.3658, 0.3658],
              files: ["assets/anim/walk-dagger-0.webp", "assets/anim/walk-dagger-1.webp", "assets/anim/walk-dagger-2.webp", "assets/anim/walk-dagger-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 521, h: 560, scaleFix: 0.742,
              footY: 1.0, anchorX: [0.8263, 0.786],
              files: ["assets/anim/jump-dagger-0.webp", "assets/anim/jump-dagger-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 390, h: 560, scaleFix: 0.801,
              footY: 1.0, anchorX: [0.4846, 0.4846, 0.4846, 0.4846],
              files: ["assets/anim/attack-dagger-0.webp", "assets/anim/attack-dagger-1.webp", "assets/anim/attack-dagger-2.webp", "assets/anim/attack-dagger-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 398, h: 560, scaleFix: 0.851,
              footY: 1.0, anchorX: [0.4987],
              files: ["assets/anim/hurt-dagger.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 398, h: 560, scaleFix: 0.851,
              footY: 1.0, anchorX: [0.4987],
              files: ["assets/anim/pickup-dagger.webp"] }
  },
  sword:   {
    walk:    { frames: 4, loop: true, fps: 10, w: 301, h: 560, scaleFix: 0.705,
              footY: 1.0, anchorX: [0.6063, 0.6611, 0.6204, 0.6611],
              files: ["assets/anim/walk-sword-0.webp", "assets/anim/walk-sword-1.webp", "assets/anim/walk-sword-2.webp", "assets/anim/walk-sword-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 482, h: 560, scaleFix: 0.753,
              footY: 1.0, anchorX: [0.8242, 0.8423],
              files: ["assets/anim/jump-sword-0.webp", "assets/anim/jump-sword-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 445, h: 560, scaleFix: 0.813,
              footY: 1.0, anchorX: [0.482, 0.5292, 0.5056, 0.5056],
              files: ["assets/anim/attack-sword-0.webp", "assets/anim/attack-sword-1.webp", "assets/anim/attack-sword-2.webp", "assets/anim/attack-sword-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 543, h: 560, scaleFix: 0.793,
              footY: 1.0, anchorX: [0.4926],
              files: ["assets/anim/hurt-sword.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 543, h: 560, scaleFix: 0.793,
              footY: 1.0, anchorX: [0.4622],
              files: ["assets/anim/pickup-sword.webp"] }
  },
  axe:     {
    walk:    { frames: 4, loop: true, fps: 10, w: 308, h: 560, scaleFix: 0.708,
              footY: 1.0, anchorX: [0.6473, 0.6526, 0.6453, 0.6494],
              files: ["assets/anim/walk-axe-0.webp", "assets/anim/walk-axe-1.webp", "assets/anim/walk-axe-2.webp", "assets/anim/walk-axe-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 457, h: 560, scaleFix: 0.749,
              footY: 1.0, anchorX: [0.3736, 0.3736],
              files: ["assets/anim/jump-axe-0.webp", "assets/anim/jump-axe-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 374, h: 560, scaleFix: 0.815,
              footY: 1.0, anchorX: [0.6718, 0.6718, 0.6718, 0.6718],
              files: ["assets/anim/attack-axe-0.webp", "assets/anim/attack-axe-1.webp", "assets/anim/attack-axe-2.webp", "assets/anim/attack-axe-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 362, h: 560, scaleFix: 0.785,
              footY: 1.0, anchorX: [0.4779],
              files: ["assets/anim/hurt-axe.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 362, h: 560, scaleFix: 0.785,
              footY: 1.0, anchorX: [0.4779],
              files: ["assets/anim/pickup-axe.webp"] }
  },
  hammer:  {
    walk:    { frames: 4, loop: true, fps: 10, w: 276, h: 560, scaleFix: 0.706,
              footY: 1.0, anchorX: [0.4846, 0.5181, 0.5145, 0.5109],
              files: ["assets/anim/walk-hammer-0.webp", "assets/anim/walk-hammer-1.webp", "assets/anim/walk-hammer-2.webp", "assets/anim/walk-hammer-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 410, h: 560, scaleFix: 0.772,
              footY: 1.0, anchorX: [0.8829, 0.8317],
              files: ["assets/anim/jump-hammer-0.webp", "assets/anim/jump-hammer-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 426, h: 560, scaleFix: 0.86,
              footY: 1.0, anchorX: [0.5962, 0.6315, 0.561, 0.5962],
              files: ["assets/anim/attack-hammer-0.webp", "assets/anim/attack-hammer-1.webp", "assets/anim/attack-hammer-2.webp", "assets/anim/attack-hammer-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 329, h: 560, scaleFix: 1.105,
              footY: 1.0, anchorX: [0.3495],
              files: ["assets/anim/hurt-hammer.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 329, h: 560, scaleFix: 1.105,
              footY: 1.0, anchorX: [0.3495],
              files: ["assets/anim/pickup-hammer.webp"] }
  },
  spear:   {
    walk:    { frames: 4, loop: true, fps: 10, w: 257, h: 560, scaleFix: 0.822,
              footY: 1.0, anchorX: [0.4295, 0.4295, 0.4295, 0.4295],
              files: ["assets/anim/walk-spear-0.webp", "assets/anim/walk-spear-1.webp", "assets/anim/walk-spear-2.webp", "assets/anim/walk-spear-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 330, h: 560, scaleFix: 0.935,
              footY: 1.0, anchorX: [0.4288, 0.4652],
              files: ["assets/anim/jump-spear-0.webp", "assets/anim/jump-spear-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 408, h: 560, scaleFix: 0.913,
              footY: 1.0, anchorX: [0.576, 0.5662, 0.5711, 0.5711],
              files: ["assets/anim/attack-spear-0.webp", "assets/anim/attack-spear-1.webp", "assets/anim/attack-spear-2.webp", "assets/anim/attack-spear-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 291, h: 560, scaleFix: 0.945,
              footY: 1.0, anchorX: [0.3729],
              files: ["assets/anim/hurt-spear.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 291, h: 560, scaleFix: 0.945,
              footY: 1.0, anchorX: [0.3729],
              files: ["assets/anim/pickup-spear.webp"] }
  },
  bow:     {
    walk:    { frames: 4, loop: true, fps: 10, w: 312, h: 560, scaleFix: 0.709,
              footY: 1.0, anchorX: [0.4551, 0.4551, 0.4551, 0.4551],
              files: ["assets/anim/walk-bow-0.webp", "assets/anim/walk-bow-1.webp", "assets/anim/walk-bow-2.webp", "assets/anim/walk-bow-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 487, h: 560, scaleFix: 0.817,
              footY: 1.0, anchorX: [0.3984, 0.3922],
              files: ["assets/anim/jump-bow-0.webp", "assets/anim/jump-bow-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 479, h: 548, scaleFix: 0.709,
              footY: 1.0, anchorX: [0.4645, 0.453, 0.4744, 0.4843],
              files: ["assets/anim/attack-bow-0.webp", "assets/anim/attack-bow-1.webp", "assets/anim/attack-bow-2.webp", "assets/anim/attack-bow-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 393, h: 560, scaleFix: 0.839,
              footY: 1.0, anchorX: [0.6011],
              files: ["assets/anim/hurt-bow.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 393, h: 560, scaleFix: 0.839,
              footY: 1.0, anchorX: [0.6011],
              files: ["assets/anim/pickup-bow.webp"] }
  },
  rock:    {
    walk:    { frames: 4, loop: true, fps: 10, w: 309, h: 560, scaleFix: 0.709,
              footY: 1.0, anchorX: [0.5057, 0.4782, 0.466, 0.4895],
              files: ["assets/anim/walk-rock-0.webp", "assets/anim/walk-rock-1.webp", "assets/anim/walk-rock-2.webp", "assets/anim/walk-rock-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 447, h: 560, scaleFix: 0.771,
              footY: 1.0, anchorX: [0.6007, 0.5291],
              files: ["assets/anim/jump-rock-0.webp", "assets/anim/jump-rock-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 370, h: 560, scaleFix: 0.738,
              footY: 1.0, anchorX: [0.5581, 0.5777, 0.5973, 0.5777],
              files: ["assets/anim/attack-rock-0.webp", "assets/anim/attack-rock-1.webp", "assets/anim/attack-rock-2.webp", "assets/anim/attack-rock-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 388, h: 560, scaleFix: 0.815,
              footY: 1.0, anchorX: [0.5206],
              files: ["assets/anim/hurt-rock.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 388, h: 560, scaleFix: 0.815,
              footY: 1.0, anchorX: [0.5206],
              files: ["assets/anim/pickup-rock.webp"] }
  },
  blade:   {
    walk:    { frames: 4, loop: true, fps: 10, w: 257, h: 560, scaleFix: 0.708,
              footY: 1.0, anchorX: [0.5389, 0.6012, 0.5545, 0.6109],
              files: ["assets/anim/walk-blade-0.webp", "assets/anim/walk-blade-1.webp", "assets/anim/walk-blade-2.webp", "assets/anim/walk-blade-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 427, h: 560, scaleFix: 0.759,
              footY: 1.0, anchorX: [0.8735, 0.7857],
              files: ["assets/anim/jump-blade-0.webp", "assets/anim/jump-blade-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 367, h: 560, scaleFix: 0.741,
              footY: 1.0, anchorX: [0.6076, 0.579, 0.579, 0.5504],
              files: ["assets/anim/attack-blade-0.webp", "assets/anim/attack-blade-1.webp", "assets/anim/attack-blade-2.webp", "assets/anim/attack-blade-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 414, h: 560, scaleFix: 0.878,
              footY: 1.0, anchorX: [0.5211],
              files: ["assets/anim/hurt-blade.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 414, h: 560, scaleFix: 0.878,
              footY: 1.0, anchorX: [0.5211],
              files: ["assets/anim/pickup-blade.webp"] }
  },
  jar:     {
    walk:    { frames: 4, loop: true, fps: 10, w: 263, h: 560, scaleFix: 0.709,
              footY: 1.0, anchorX: [0.5627, 0.5637, 0.576, 0.5684],
              files: ["assets/anim/walk-jar-0.webp", "assets/anim/walk-jar-1.webp", "assets/anim/walk-jar-2.webp", "assets/anim/walk-jar-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 259, h: 560, scaleFix: 0.752,
              footY: 1.0, anchorX: [0.7625, 0.7027],
              files: ["assets/anim/jump-jar-0.webp", "assets/anim/jump-jar-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 402, h: 560, scaleFix: 0.704,
              footY: 1.0, anchorX: [0.5239, 0.5239, 0.5239, 0.5239],
              files: ["assets/anim/attack-jar-0.webp", "assets/anim/attack-jar-1.webp", "assets/anim/attack-jar-2.webp", "assets/anim/attack-jar-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 402, h: 560, scaleFix: 0.885,
              footY: 1.0, anchorX: [0.4863],
              files: ["assets/anim/hurt-jar.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 402, h: 560, scaleFix: 0.885,
              footY: 1.0, anchorX: [0.4863],
              files: ["assets/anim/pickup-jar.webp"] }
  },
  bell:    {
    walk:    { frames: 4, loop: true, fps: 10, w: 275, h: 560, scaleFix: 0.705,
              footY: 1.0, anchorX: [0.5709, 0.6436, 0.5555, 0.6364],
              files: ["assets/anim/walk-bell-0.webp", "assets/anim/walk-bell-1.webp", "assets/anim/walk-bell-2.webp", "assets/anim/walk-bell-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 439, h: 560, scaleFix: 0.774,
              footY: 1.0, anchorX: [0.8007, 0.8007],
              files: ["assets/anim/jump-bell-0.webp", "assets/anim/jump-bell-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 478, h: 560, scaleFix: 0.711,
              footY: 1.0, anchorX: [0.5005, 0.5005, 0.5005, 0.5005],
              files: ["assets/anim/attack-bell-0.webp", "assets/anim/attack-bell-1.webp", "assets/anim/attack-bell-2.webp", "assets/anim/attack-bell-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 466, h: 560, scaleFix: 0.838,
              footY: 1.0, anchorX: [0.4796],
              files: ["assets/anim/hurt-bell.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 466, h: 560, scaleFix: 0.838,
              footY: 1.0, anchorX: [0.4796],
              files: ["assets/anim/pickup-bell.webp"] }
  }
};
/* <<< slice_weapon_assets: WEAPON_CLIP <<< */

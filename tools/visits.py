#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/visits.py — Caddy JSON 访问日志的只读报表。

只读：不开连接、不写文件、不改 Caddy。口径与判据见 docs/DEPLOY.md「五、访问统计」。

为什么 PV 算 200 与 304、不算别的 3xx：
`/zongmu/play`（无斜杠）会 308 跳到 `/zongmu/play/`，一次访问产生 2 条日志（308 + 200），
全算会让 PV 翻倍；而 304 是浏览器带缓存重新验证后「页面还是那一页」，属于真实浏览。
所以只排除 301/302/307/308，保留 200 与 304。

为什么日志里还有素材请求：本机 Caddy 2.6.2 没有 skip_log（2.7 才有），
`log` 也不吃路径匹配器，所以 webp / js / mp3 都会入日志。
本脚本按「以 / 结尾或以 .html 结尾」判页面，其余一律当资源，不计入访问。

用法
    python3 tools/visits.py                        # 今天，按页面
    python3 tools/visits.py --detail               # 每个页面 × 每个 IP：时间 / 次数
    python3 tools/visits.py --days 7               # 最近 7 天
    python3 tools/visits.py --by day               # 按天
    python3 tools/visits.py --by hour --days 1     # 今天几点有人
    python3 tools/visits.py --by host              # IP 访问 vs 域名访问
    python3 tools/visits.py --tail 20              # 最近 20 条原始请求（干净表格）
    python3 tools/visits.py --all --days 30        # 连其它站点一起看
    python3 tools/visits.py access.log             # 直接给文件（可多个 / 可给目录）
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timedelta

DEFAULT_DIR = "/var/log/caddy"

# Windows 控制台默认 GBK，中文会成乱码。Linux 上这段是空操作。
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (OSError, ValueError):
            pass

# 纵目相关页面的中文名。未列出的页面原样显示路径。
LABELS = {
    "/": "站点根",
    "/index.html": "站点根",
    "/zongmu/": "纵目 · 索引页（hub）",
    "/zongmu/index.html": "纵目 · 索引页（hub）",
    "/zongmu/play/": "纵目 · 游戏本体",
    "/zongmu/play/index.html": "纵目 · 游戏本体",
    "/zongmu/play/mobile.html": "纵目 · 手机入口",
    "/zongmu/showcase/": "纵目 · 素材展示页",
    "/zongmu/showcase/index.html": "纵目 · 素材展示页",
}
GAME_ROOT = "/zongmu"
LOCAL_IPS = {"127.0.0.1", "::1", "localhost"}

# UA 粗分。只做三档，够回答「手机还是电脑、是不是爬虫 / 我自己在测」。
BOT_HINTS = ("bot", "crawler", "spider", "headless", "curl", "wget", "python-requests")
MOBILE_HINTS = ("mobile", "android", "iphone", "ipad", "ipod")


# ---------- 排版：CJK 占两格，不按 len() 对齐 ----------
def width(s: str) -> int:
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)


def pad(s: str, n: int) -> str:
    return s + " " * max(0, n - width(s))


def table(headers, rows, indent="  "):
    cols = [width(h) for h in headers]
    for r in rows:
        for i, c in enumerate(r):
            cols[i] = max(cols[i], width(str(c)))
    print(indent + "  ".join(pad(h, cols[i]) for i, h in enumerate(headers)).rstrip())
    print(indent + "  ".join("-" * cols[i] for i in range(len(headers))))
    for r in rows:
        print(indent + "  ".join(pad(str(c), cols[i]) for i, c in enumerate(r)).rstrip())


# ---------- 读日志 ----------
def resolve_sources(args) -> list[str]:
    if args.paths:
        out = []
        for p in args.paths:
            if os.path.isdir(p):
                out.extend(sorted(glob.glob(os.path.join(p, "*.log"))))
            else:
                out.extend(sorted(glob.glob(p)) or [p])
        return out
    return sorted(glob.glob(os.path.join(DEFAULT_DIR, "*.log")))


def iter_records(files):
    for fp in files:
        try:
            fh = open(fp, encoding="utf-8", errors="replace")
        except OSError as e:
            print(f"跳过 {fp}：{e}", file=sys.stderr)
            continue
        with fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                # 只吃访问日志，不误收 Caddy 自己的运行日志
                if not str(rec.get("logger", "")).startswith("http.log.access"):
                    continue
                yield rec


def is_page(path: str) -> bool:
    """页面 = 以 / 结尾（目录索引）或以 .html 结尾。其余都算静态资源。"""
    return path.endswith("/") or path.endswith(".html")


def device_of(ua: str) -> str:
    low = ua.lower()
    if any(h in low for h in BOT_HINTS):
        return "脚本"
    if any(h in low for h in MOBILE_HINTS):
        return "手机"
    return "桌面"


def tail_label(path: str, status) -> str:
    """--tail 的「路径」列：页面显示路径；补斜杠跳转也显示路径；素材只显示类型。"""
    if is_page(path):
        return path
    if isinstance(status, int) and 300 <= status < 400:
        return path                      # /zongmu/play → /zongmu/play/ 的 308
    seg = path.rsplit("/", 1)[-1]
    if "." in seg:
        return "（素材）." + seg.rsplit(".", 1)[-1]
    return "（素材）" + (seg or "/")


def within(rec, start, end) -> bool:
    ts = rec.get("ts")
    if not isinstance(ts, (int, float)):
        return False
    try:
        dt = datetime.fromtimestamp(ts)
    except (OverflowError, OSError, ValueError):
        return False
    return start <= dt <= end


def main() -> int:
    ap = argparse.ArgumentParser(description="Caddy JSON 访问日志的只读报表")
    ap.add_argument("paths", nargs="*", help=f"日志文件或目录（默认 {DEFAULT_DIR}）")
    ap.add_argument("--days", type=int, help="最近 N 天（含今天）")
    ap.add_argument("--since", help="起始日期 YYYY-MM-DD（含）")
    ap.add_argument("--until", help="结束日期 YYYY-MM-DD（含）")
    ap.add_argument("--by", default="page",
                    choices=["page", "day", "hour", "status", "ip", "device", "host"],
                    help="主表按什么分组（默认 page）")
    ap.add_argument("--top", type=int, default=5, help="IP / 状态码只列前 N 条（默认 5）")
    ap.add_argument("--all", action="store_true", help="连其它站点的页面一起看")
    ap.add_argument("--assets", action="store_true", help="把静态资源请求也算进分组")
    ap.add_argument("--tail", type=int, metavar="N", help="列出最近 N 条原始请求")
    ap.add_argument("--detail", action="store_true", help="每页 × 每 IP：时间 / 次数")
    ap.add_argument("--exclude-local", action="store_true", help="剔除 127.0.0.1（自己 curl 测试用）")
    args = ap.parse_args()

    now = datetime.now()
    if args.since:
        start = datetime.strptime(args.since, "%Y-%m-%d")
    elif args.days:
        start = (now - timedelta(days=args.days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if args.until:
        end = datetime.strptime(args.until, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    else:
        end = now

    files = resolve_sources(args)
    if not files:
        print(f"没找到日志文件（找的是 {DEFAULT_DIR}/*.log）。Caddyfile 里配了 log 吗？", file=sys.stderr)
        return 1

    # ---------- 一次遍历，全部计数 ----------
    total = 0
    n_page = n_asset = n_redir = n_err = n_notmod = 0
    other_site_pages = 0
    pv = Counter()                                # 页面 -> 200 + 304 次数
    uv = defaultdict(set)                         # 页面 -> 独立 IP
    by_day = defaultdict(lambda: [0, set()])      # 'YYYY-MM-DD' -> [PV, IP 集]
    by_hour = Counter()
    by_status = Counter()
    by_ip = Counter()
    by_device = Counter()
    by_host = Counter()
    detail = defaultdict(lambda: [0, None, None])  # (页面, IP) -> [次数, 首次, 末次]
    touch_hits = 0
    recent = []

    for rec in iter_records(files):
        if not within(rec, start, end):
            continue
        req = rec.get("request") or {}
        ip = req.get("remote_ip") or "-"
        if args.exclude_local and ip in LOCAL_IPS:
            continue
        total += 1
        uri = req.get("uri") or ""
        path = uri.split("?", 1)[0]
        query = uri.partition("?")[2]
        status = rec.get("status")
        ua = " ".join((req.get("headers") or {}).get("User-Agent") or [])
        dt = datetime.fromtimestamp(rec["ts"])
        kind = device_of(ua)

        by_status[status] += 1
        by_ip[ip] += 1
        by_device[kind] += 1
        by_host[req.get("host") or "-"] += 1
        if "touch=1" in query:
            touch_hits += 1

        if args.tail:
            recent.append([
                dt.strftime("%m-%d %H:%M:%S"), ip, req.get("method") or "-",
                tail_label(path, status), status, rec.get("size") or 0, kind,
            ])
            if len(recent) > args.tail:
                recent.pop(0)

        if not is_page(path) and not args.assets:
            n_asset += 1
            continue
        # 304 = 浏览器带着缓存重新验证后「页面还是那一页」，是真实浏览，要算 PV。
        # 其余 3xx（301 / 302 / 307 / 308）是地址跳转，算了会让 PV 翻倍。
        if status == 304:
            n_notmod += 1
        elif isinstance(status, int) and 300 <= status < 400:
            n_redir += 1
            continue
        elif isinstance(status, int) and status >= 400:
            n_err += 1
            continue
        elif status != 200:
            continue

        is_game = path == GAME_ROOT or path.startswith(GAME_ROOT + "/")
        if not is_game and not args.all:
            other_site_pages += 1
            continue

        n_page += 1
        label = LABELS.get(path, path)
        pv[label] += 1
        uv[label].add(ip)
        by_day[dt.strftime("%Y-%m-%d")][0] += 1
        by_day[dt.strftime("%Y-%m-%d")][1].add(ip)
        by_hour[dt.strftime("%H:00")] += 1
        if args.detail:
            slot = detail[(label, ip)]
            slot[0] += 1
            slot[1] = dt if slot[1] is None else min(slot[1], dt)
            slot[2] = dt if slot[2] is None else max(slot[2], dt)

    # ---------- 输出 ----------
    print()
    print(f"时间范围  {start:%Y-%m-%d %H:%M} ~ {end:%Y-%m-%d %H:%M}（本机时区）")
    print(f"日志来源  {', '.join(os.path.basename(f) for f in files)}")
    print()
    print(f"总请求    {total}")
    print(f"页面 PV   {n_page}          ← 算 200 与 304（缓存重验证也是真实浏览），跳转不计")
    print(f"资源请求  {n_asset}         ← webp / js / mp3 / css，不算访问")
    print(f"3xx 跳转  {n_redir}         ← /x → /x/ 的补斜杠")
    print(f"3xx 缓存  {n_notmod}         ← 304，已计入上面的 PV")
    print(f"4xx/5xx   {n_err}")
    if other_site_pages:
        print(f"其它站点  {other_site_pages} 次页面请求（--all 一起看）")

    if args.by == "page":
        print("\n按页面")
        table(["页面", "PV", "UV"],
              [[k, v, len(uv[k])] for k, v in pv.most_common()] or [["（这段时间没有页面访问）", 0, 0]])
    elif args.by == "day":
        print("\n按天")
        table(["日期", "PV", "UV"],
              [[d, v[0], len(v[1])] for d, v in sorted(by_day.items())] or [["（无）", 0, 0]])
    elif args.by == "hour":
        print("\n按小时")
        table(["时段", "PV"], [[h, c] for h, c in sorted(by_hour.items())] or [["（无）", 0]])
    elif args.by == "status":
        print("\n按状态码")
        table(["状态码", "次数"], [[s, c] for s, c in by_status.most_common(args.top)])
    elif args.by == "ip":
        print("\n按来源 IP")
        table(["IP", "请求数"], [[i, c] for i, c in by_ip.most_common(args.top)])
    elif args.by == "device":
        print("\n按设备（UA 粗分）")
        table(["类型", "请求数", "占比"],
              [[d, c, f"{c * 100 / total:.1f}%"] for d, c in by_device.most_common()])
    elif args.by == "host":
        print("\n按 Host（IP 访问 vs 域名）")
        table(["Host", "请求数"], [[h, c] for h, c in by_host.most_common(args.top)])

    # 补充块：主表以外的固定几节，避免每次都要换 --by
    if args.by != "page" and pv:
        print("\n按页面")
        table(["页面", "PV", "UV"], [[k, v, len(uv[k])] for k, v in pv.most_common()])
    if args.by != "device" and total:
        print("\n按设备（UA 粗分）")
        table(["类型", "请求数", "占比"],
              [[d, c, f"{c * 100 / total:.1f}%"] for d, c in by_device.most_common()])
    if by_ip:
        print(f"\n来源 IP Top {args.top}")
        table(["IP", "请求数"], [[i, c] for i, c in by_ip.most_common(args.top)])
    if st := by_status.most_common(args.top):
        print("\n状态码 Top")
        table(["状态码", "次数"], [[s, c] for s, c in st])
    if touch_hits:
        print(f"\n带 ?touch=1 的请求  {touch_hits}（手机强制档）")

    if args.detail:
        print("\n每页 × 每 IP")
        rows = []
        for (label, ip), (n, first, last) in sorted(detail.items(), key=lambda x: (x[1][1], x[0][0])):
            span = f"{first:%m-%d %H:%M:%S}"
            if first != last:
                span = f"{first:%H:%M:%S}~{last:%H:%M:%S}"
            rows.append([label, span, ip, n])
        table(["页面", "时间", "IP", "次数"], rows)

    if args.tail:
        print(f"\n最近 {len(recent)} 条请求")
        table(["时间", "IP", "方法", "路径", "状态", "字节", "设备"], recent)

    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())

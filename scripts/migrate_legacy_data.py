#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
旧数据迁移脚本：把 WorkBuddy 云表导出的 ledger.json / salary.json 灌入 Cloudflare KV。

用法：
  python3 migrate_legacy_data.py --base http://127.0.0.1:8788 \
      --ledger ../backups/ledger.json --salary ../backups/salary.json \
      --user 村长 --password admin123

部署到线上后，把 --base 换成线上地址（如 https://data-workspace.pages.dev）即可。
脚本可安全重复执行：按业务键去重，已存在的记录不会重复灌。
"""
import argparse
import json
import os
import sys
import urllib.request
import urllib.error


def call_once(base, method, path, token=None, payload=None):
    url = base.rstrip("/") + path
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    # Cloudflare 边缘 WAF 会拦截 Python-urllib 默认 UA，必须伪装成浏览器
    req.add_header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                                 "AppleWebKit/537.36 (KHTML, like Gecko) "
                                 "Chrome/126.0.0.0 Safari/537.36")
    req.add_header("Accept", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8") or "{}")
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"_error": str(e)}


def call(base, method, path, token=None, payload=None, retries=4):
    # 高频写 KV 时偶发网络超时 / 边缘 429/5xx，自动退避重试，避免单条失败拖垮整批
    import time
    last = (0, {})
    for i in range(retries):
        st, resp = call_once(base, method, path, token=token, payload=payload)
        last = (st, resp)
        # 明确的业务响应（2xx / 4xx 且带 ok/msg）不重试；网络错误(0) 与 429/5xx 才重试
        if st == 0 or st == 429 or st >= 500:
            time.sleep(1.5 * (i + 1))
            continue
        return st, resp
    return last


def load_records(path):
    with open(path, "r", encoding="utf-8") as f:
        d = json.load(f)
    if isinstance(d, list):
        return d
    return d.get("records") or d.get("data") or d.get("rows") or []


def conv_date(v):
    # 云表日期形如 2026-06-25T00:00:00Z，取前 10 位得 YYYY-MM-DD；已是短格式则原样
    s = str(v or "")
    return s[:10] if len(s) >= 10 else s


def transform_ledger(rows):
    out = []
    for r in rows:
        rec = {k: v for k, v in r.items() if k != "record_id"}
        if "交易时间" in rec:
            rec["交易时间"] = conv_date(rec["交易时间"])
        out.append(rec)
    return out


def transform_salary(rows):
    return [{k: v for k, v in r.items() if k != "record_id"} for r in rows]


def ledger_key(r):
    return (str(r.get("交易时间", "")), str(r.get("摘要", "")),
            str(r.get("金额", "")), str(r.get("收支类型", "")))


def salary_key(r):
    return str(r.get("月份", ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8788")
    ap.add_argument("--ledger", default="../backups/ledger.json")
    ap.add_argument("--salary", default="../backups/salary.json")
    ap.add_argument("--user", default="村长")
    ap.add_argument("--password", default="admin123")
    ap.add_argument("--dry-run", action="store_true", help="只转换不写入")
    args = ap.parse_args()

    print("目标：%s" % args.base)

    # 0. 若库为空则先初始化村长账号（幂等：已有用户返回 409，忽略）
    call(args.base, "POST", "/api/admin/bootstrap",
         payload={"password": args.password})

    # 1. 登录
    st, resp = call(args.base, "POST", "/api/auth/login",
                    payload={"name": args.user, "password": args.password})
    if st != 200 or not resp.get("token"):
        print("登录失败（HTTP %s）：%s" % (st, resp))
        sys.exit(1)
    token = resp["token"]
    print("登录成功：%s（admin=%s）" % (args.user, resp.get("user", {}).get("admin")))

    # 2. 读取并转换
    led = transform_ledger(load_records(args.ledger)) if os.path.exists(args.ledger) else []
    sal = transform_salary(load_records(args.salary)) if os.path.exists(args.salary) else []
    print("待迁移：流水 %d 条，工资 %d 条" % (len(led), len(sal)))

    if args.dry_run:
        print("[dry-run] 流水样例：%s" % json.dumps(led[0] if led else {}, ensure_ascii=False)[:200])
        print("[dry-run] 工资样例：%s" % json.dumps(sal[0] if sal else {}, ensure_ascii=False)[:200])
        return

    # 3. 拉取现有数据，按业务键去重
    _, exist_led = call(args.base, "GET", "/api/ledger", token=token)
    _, exist_sal = call(args.base, "GET", "/api/salary", token=token)
    old_led_keys = {ledger_key(r) for r in (exist_led.get("data") or [])}
    old_sal_keys = {salary_key(r) for r in (exist_sal.get("data") or [])}

    new_led = [r for r in led if ledger_key(r) not in old_led_keys]
    new_sal = [r for r in sal if salary_key(r) not in old_sal_keys]
    print("去重后需新增：流水 %d 条，工资 %d 条" % (len(new_led), len(new_sal)))

    # 4. 逐条灌入
    ok_l = 0
    for r in new_led:
        st, resp = call(args.base, "POST", "/api/ledger", token=token, payload=r)
        if st == 200 and resp.get("ok"):
            ok_l += 1
        else:
            print("  流水写入失败：%s -> %s" % (ledger_key(r), resp))
    ok_s = 0
    for r in new_sal:
        st, resp = call(args.base, "POST", "/api/salary", token=token, payload=r)
        if st == 200 and resp.get("ok"):
            ok_s += 1
        else:
            print("  工资写入失败：%s -> %s" % (salary_key(r), resp))

    # 5. 校验
    _, fin_led = call(args.base, "GET", "/api/ledger", token=token)
    _, fin_sal = call(args.base, "GET", "/api/salary", token=token)
    nl = len(fin_led.get("data") or [])
    ns = len(fin_sal.get("data") or [])
    print("\n迁移完成：本次写入流水 %d、工资 %d" % (ok_l, ok_s))
    print("线上现有：流水 %d 条，工资 %d 条" % (nl, ns))
    if nl < len(led) or ns < len(sal):
        print("⚠️ 线上条数少于旧数据，可能有写入失败，请检查上面日志")
    else:
        print("✓ 条数校验通过，旧数据已全部就位")


if __name__ == "__main__":
    main()

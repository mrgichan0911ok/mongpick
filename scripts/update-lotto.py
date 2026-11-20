#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""회차별 당첨번호를 받아 lotto-results.json을 갱신한다.

깃허브 액션(토요일 20:45 KST)에서 그대로 돌린다.
- 새 회차가 아직 안 올라왔으면 MONG_PICK_WAIT(초) 만큼 기다렸다 다시 본다.
- 네트워크 실패는 파일을 건드리지 않고 조용히 끝낸다(워크플로를 실패로 만들지 않음).
"""
import json, os, sys, time, urllib.request

ENDPOINT = "https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Referer": "https://www.dhlottery.co.kr/lt645/result",
    "Accept": "application/json",
}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lotto-results.json")
KEEP = 30


def fetch(round_no):
    url = f"{ENDPOINT}?srchDir=center&srchLtEpsd={round_no}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        j = json.load(r)
    rows = ((j or {}).get("data") or {}).get("list") or []
    return [to_draw(x) for x in rows if to_draw(x)]


def to_draw(row):
    if not row:
        return None
    nums = [row.get(f"tm{i}WnNo") for i in range(1, 7)]
    try:
        nums = [int(n) for n in nums]
        bonus = int(row.get("bnsWnNo"))
        rnd = int(row.get("ltEpsd"))
    except (TypeError, ValueError):
        return None
    if len([n for n in nums if 1 <= n <= 45]) != 6 or not 1 <= bonus <= 45 or not rnd:
        return None
    ymd = str(row.get("ltRflYmd") or "")
    date = f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:]}" if len(ymd) == 8 else ""
    return {"round": rnd, "date": date, "numbers": sorted(nums), "bonus": bonus}


def load():
    try:
        with open(OUT, encoding="utf-8") as f:
            j = json.load(f)
        if isinstance(j.get("draws"), dict):
            return j
    except (OSError, ValueError):
        pass
    return {"version": 1, "updated": "", "latest": 0, "draws": {}}


def save(doc):
    doc["draws"] = {k: doc["draws"][k] for k in sorted(doc["draws"], key=lambda x: int(x))}
    while len(doc["draws"]) > KEEP:
        doc["draws"].pop(next(iter(doc["draws"])))
    doc["latest"] = max(int(k) for k in doc["draws"])
    doc["updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    doc = load()
    latest = int(doc.get("latest") or 0)
    if not latest:
        print("lotto-results.json에 기준 회차가 없습니다.", file=sys.stderr)
        return 0
    wait = int(os.environ.get("MONG_PICK_WAIT") or 0)
    tries = max(1, int(os.environ.get("MONG_PICK_TRIES") or 1))
    added = 0
    for attempt in range(tries):
        rnd = latest + 1
        try:
            got = fetch(rnd)
        except Exception as e:                      # 네트워크 실패 — 파일을 건드리지 않는다
            print(f"{rnd}회 조회 실패: {e}", file=sys.stderr)
            return 0
        if got and any(d["round"] == rnd for d in got):
            for d in got:
                key = str(d["round"])
                if key not in doc["draws"]:
                    doc["draws"][key] = d
                    added += 1
            latest = rnd
            continue                                 # 다음 회차도 확인
        if attempt < tries - 1:
            print(f"{rnd}회 아직 없음 — {wait}초 뒤 다시 확인")
            time.sleep(wait)
            continue
        break
    if added:
        save(doc)
        print(f"{added}개 회차 추가 → 최신 {doc['latest']}회")
    else:
        print("새 회차 없음")
    return 0


if __name__ == "__main__":
    sys.exit(main())

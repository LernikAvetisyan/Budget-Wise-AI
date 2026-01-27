import argparse
import hashlib
import json
import os
import re
import sys
import time
from contextlib import contextmanager
from typing import Any, Dict, List, Optional


HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
DEFAULT_DB_PATH = os.path.join(DATA_DIR, "merchant_category_model.json")
LOCK_PATH = os.path.join(DATA_DIR, "merchant_category_model.lock")


def _ensure_dirs(path: str) -> None:
  os.makedirs(os.path.dirname(path), exist_ok=True)


def normalize_merchant(merchant: str) -> str:
  s = (merchant or "").strip().lower()
  s = s.replace("&", " and ")
  s = re.sub(r"[^a-z0-9\s]", " ", s)
  s = re.sub(r"\s+", " ", s).strip()
  return s


def _safe_read_json(path: str) -> Dict[str, Any]:
  if not os.path.exists(path):
    return {}
  try:
    with open(path, "r", encoding="utf-8") as f:
      raw = f.read().strip()
      if not raw:
        return {}
      v = json.loads(raw)
      return v if isinstance(v, dict) else {}
  except Exception:
    return {}


def _atomic_write_json(path: str, obj: Dict[str, Any]) -> None:
  tmp = f"{path}.tmp.{os.getpid()}.{int(time.time() * 1000)}"
  data = json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True)
  with open(tmp, "w", encoding="utf-8", newline="\n") as f:
    f.write(data)
    f.flush()
    os.fsync(f.fileno())
  os.replace(tmp, path)


@contextmanager
def _file_lock(lock_path: str, timeout_s: float = 2.5, poll_s: float = 0.05):
  _ensure_dirs(lock_path)
  start = time.time()
  fd = None

  while True:
    try:
      fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
      break
    except Exception:
      if time.time() - start >= timeout_s:
        raise TimeoutError("Could not open lock file")
      time.sleep(poll_s)

  try:
    if os.name == "nt":
      import msvcrt
      while True:
        try:
          msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
          break
        except OSError:
          if time.time() - start >= timeout_s:
            raise TimeoutError("Lock timeout")
          time.sleep(poll_s)
    else:
      import fcntl
      while True:
        try:
          fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
          break
        except BlockingIOError:
          if time.time() - start >= timeout_s:
            raise TimeoutError("Lock timeout")
          time.sleep(poll_s)

    yield
  finally:
    try:
      if os.name == "nt":
        import msvcrt
        try:
          msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
        except Exception:
          pass
      else:
        import fcntl
        try:
          fcntl.flock(fd, fcntl.LOCK_UN)
        except Exception:
          pass
    finally:
      try:
        os.close(fd)
      except Exception:
        pass


def _user_key(username: str) -> str:
  u = (username or "").strip()
  if not u:
    return ""
  return hashlib.sha256(u.encode("utf-8")).hexdigest()[:24]


def _init_model(raw: Dict[str, Any]) -> Dict[str, Any]:
  if not isinstance(raw, dict):
    raw = {}
  if raw.get("v") != 1:
    raw["v"] = 1
  if "merchants" not in raw or not isinstance(raw.get("merchants"), dict):
    raw["merchants"] = {}
  return raw


def _ensure_db_exists(db_path: str) -> None:
  _ensure_dirs(db_path)
  if os.path.exists(db_path):
    return
  _atomic_write_json(db_path, {"v": 1, "merchants": {}})


def _get_entry(model: Dict[str, Any], mk: str) -> Dict[str, Any]:
  merchants = model["merchants"]
  if mk not in merchants or not isinstance(merchants.get(mk), dict):
    merchants[mk] = {"total": 0, "categories": {}, "users": {}}
  e = merchants[mk]
  if "categories" not in e or not isinstance(e.get("categories"), dict):
    e["categories"] = {}
  if "users" not in e or not isinstance(e.get("users"), dict):
    e["users"] = {}
  e["total"] = len(e["users"]) if isinstance(e["users"], dict) else 0
  return e


def suggest_category(merchant: str, db_path: str = DEFAULT_DB_PATH) -> Dict[str, Any]:
  mk = normalize_merchant(merchant)
  _ensure_db_exists(db_path)

  if not mk:
    return {"merchant": merchant, "merchantKey": mk, "found": False, "category": None, "confidence": 0.0, "total": 0, "breakdown": []}

  with _file_lock(LOCK_PATH):
    model = _init_model(_safe_read_json(db_path))
    entry = _get_entry(model, mk)
    cats = entry.get("categories", {})
    total = entry.get("total", 0)

  if not isinstance(cats, dict) or not isinstance(total, int) or total <= 0:
    return {"merchant": merchant, "merchantKey": mk, "found": False, "category": None, "confidence": 0.0, "total": 0, "breakdown": []}

  items = []
  for c, n in cats.items():
    if isinstance(c, str) and c.strip() and isinstance(n, int) and n > 0:
      items.append((c.strip(), n))
  if not items:
    return {"merchant": merchant, "merchantKey": mk, "found": False, "category": None, "confidence": 0.0, "total": total, "breakdown": []}

  items.sort(key=lambda x: x[1], reverse=True)
  best_cat, best_n = items[0]
  conf = float(best_n) / float(total) if total > 0 else 0.0

  breakdown = []
  for c, n in items[:5]:
    breakdown.append({"category": c, "count": int(n), "pct": float(n) / float(total) if total > 0 else 0.0})

  return {"merchant": merchant, "merchantKey": mk, "found": True, "category": best_cat, "confidence": conf, "total": total, "breakdown": breakdown}


def learn_category(username: str, merchant: str, category: str, db_path: str = DEFAULT_DB_PATH) -> Dict[str, Any]:
  _ensure_db_exists(db_path)

  mk = normalize_merchant(merchant)
  cat = (category or "").strip()
  uk = _user_key(username)

  if not uk:
    return {"ok": False, "status": "username_required"}
  if not mk:
    return {"ok": False, "status": "merchant_required"}
  if not cat:
    return {"ok": False, "status": "category_required"}

  with _file_lock(LOCK_PATH):
    model = _init_model(_safe_read_json(db_path))
    entry = _get_entry(model, mk)

    users = entry["users"]
    cats = entry["categories"]

    prev = users.get(uk)
    if isinstance(prev, str) and prev.strip().lower() == cat.lower():
      return {"ok": True, "status": "unchanged"}

    if isinstance(prev, str) and prev.strip():
      prev_cat = prev.strip()
      prev_n = cats.get(prev_cat, 0)
      if isinstance(prev_n, int) and prev_n > 0:
        cats[prev_cat] = prev_n - 1
        if cats[prev_cat] <= 0:
          cats.pop(prev_cat, None)

    users[uk] = cat
    cats[cat] = int(cats.get(cat, 0) or 0) + 1
    entry["total"] = len(users)

    _atomic_write_json(db_path, model)

  return {"ok": True, "status": "created" if not prev else "updated"}


def bulk_import(pairs: List[Dict[str, Any]], db_path: str = DEFAULT_DB_PATH) -> Dict[str, Any]:
  _ensure_db_exists(db_path)

  applied = 0
  skipped = 0

  with _file_lock(LOCK_PATH):
    model = _init_model(_safe_read_json(db_path))

    for item in pairs:
      username = str(item.get("username") or "").strip()
      merchant = str(item.get("merchant") or "").strip()
      category = str(item.get("category") or "").strip()

      uk = _user_key(username)
      mk = normalize_merchant(merchant)
      cat = category

      if not uk or not mk or not cat:
        skipped += 1
        continue

      entry = _get_entry(model, mk)
      users = entry["users"]
      cats = entry["categories"]

      prev = users.get(uk)
      if isinstance(prev, str) and prev.strip().lower() == cat.lower():
        skipped += 1
        continue

      if isinstance(prev, str) and prev.strip():
        prev_cat = prev.strip()
        prev_n = cats.get(prev_cat, 0)
        if isinstance(prev_n, int) and prev_n > 0:
          cats[prev_cat] = prev_n - 1
          if cats[prev_cat] <= 0:
            cats.pop(prev_cat, None)

      users[uk] = cat
      cats[cat] = int(cats.get(cat, 0) or 0) + 1
      entry["total"] = len(users)
      applied += 1

    _atomic_write_json(db_path, model)

  return {"ok": True, "applied": applied, "skipped": skipped}


def _cli() -> int:
  p = argparse.ArgumentParser()
  p.add_argument("--db", default=DEFAULT_DB_PATH)
  sub = p.add_subparsers(dest="cmd", required=True)

  s = sub.add_parser("suggest")
  s.add_argument("merchant")

  l = sub.add_parser("learn")
  l.add_argument("username")
  l.add_argument("merchant")
  l.add_argument("category")

  b = sub.add_parser("bulk_import")

  args = p.parse_args()
  db_path = args.db

  if args.cmd == "suggest":
    print(json.dumps(suggest_category(args.merchant, db_path), ensure_ascii=False))
    return 0

  if args.cmd == "learn":
    print(json.dumps(learn_category(args.username, args.merchant, args.category, db_path), ensure_ascii=False))
    return 0

  if args.cmd == "bulk_import":
    raw = sys.stdin.read().strip()
    if not raw:
      print(json.dumps({"ok": True, "applied": 0, "skipped": 0}, ensure_ascii=False))
      return 0
    try:
      payload = json.loads(raw)
      if not isinstance(payload, list):
        print(json.dumps({"ok": False, "error": "payload_must_be_array"}, ensure_ascii=False))
        return 2
      print(json.dumps(bulk_import(payload, db_path), ensure_ascii=False))
      return 0
    except Exception:
      print(json.dumps({"ok": False, "error": "invalid_json"}, ensure_ascii=False))
      return 2

  return 2


if __name__ == "__main__":
  raise SystemExit(_cli())

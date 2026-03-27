"""
스마트팜 플랫폼 — 구역 데이터 프록시 서버
────────────────────────────────────────────────────
설치:  pip install fastapi uvicorn requests
실행:  uvicorn mock_data_server:app --host 127.0.0.1 --port 8000

역할:
  - 브라우저 → /api/zone/{id}/controller → 실제 제어기 API 프록시
  - 브라우저 → /api/zone/{id}/nutrient  → 실제 양액기 API 프록시
  - 구역 설정(URL)은 zone_config.json에 서버 측 저장
  - 대시보드 설정(레이아웃·위젯·배너)은 dashboard_settings.json에 저장
  - KPI 데이터는 data_log.db(SQLite)에 5분 간격으로 자동 기록
────────────────────────────────────────────────────
"""

import json
import asyncio
import sqlite3
import csv
import io
import os
import sys
import time
import fcntl
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from fastapi import Request

# ── 단일 인스턴스 잠금 (중복 서비스 기동 방지) ────────────────────────────
_LOCK_PATH = Path(__file__).parent / ".server.lock"
_lock_fh: object = None

def _acquire_instance_lock():
    global _lock_fh
    try:
        _lock_fh = open(_LOCK_PATH, "w")
        fcntl.flock(_lock_fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        _lock_fh.write(str(os.getpid()))
        _lock_fh.flush()
        print(f"[lock] dashboard-api 단일 인스턴스 잠금 획득 — PID {os.getpid()}")
    except (IOError, BlockingIOError):
        print("[lock] 이미 실행 중인 dashboard-api 인스턴스가 있습니다. 종료합니다.")
        sys.exit(0)

_acquire_instance_lock()

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse
    from pydantic import BaseModel
    import uvicorn
except ImportError:
    print("패키지를 설치해주세요: pip install fastapi uvicorn")
    raise

try:
    import httpx as _httpx
except ImportError:
    _httpx = None


# ══════════════════════════════════════════════════════════
# App 초기화 및 CORS 설정
# ══════════════════════════════════════════════════════════
app = FastAPI(
    title="Smartfarm Zone Proxy Server",
    description="구역별 실제 API 프록시 서버",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════
# 구역 설정 파일 I/O
# ══════════════════════════════════════════════════════════

ZONE_CONFIG_PATH     = Path(__file__).parent / "zone_config.json"
SETTINGS_PATH        = Path(__file__).parent / "dashboard_settings.json"
GUIDELINES_PATH      = Path(__file__).parent / "guidelines.json"
DB_PATH              = Path(__file__).parent / "data_log.db"
LOG_INTERVAL_SECONDS = 300   # 5분
ALERT_INTERVAL_SEC   = 60    # 1분


def _load_zone_config() -> dict:
    if ZONE_CONFIG_PATH.exists():
        try:
            return json.loads(ZONE_CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"zones": {}}


def _save_zone_config(config: dict):
    ZONE_CONFIG_PATH.write_text(
        json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ── 프록시 캐시 (URL → (data, err, fetched_at)) ────────────────────────────
PROXY_CACHE_TTL = 15          # 초 — 동일 URL 15초 이내 재요청은 캐시 반환
_proxy_cache: dict = {}

# ── 인메모리 롤링 버퍼 (zone → 최근 30분, 1분 해상도) ─────────────────────
BUFFER_MINUTES = 30
_zone_buffer: dict[str, deque] = {}


def _push_to_buffer(zone_id: str, raw_fields: dict):
    """현재 시각 기준 zone 데이터를 버퍼에 추가."""
    if zone_id not in _zone_buffer:
        _zone_buffer[zone_id] = deque(maxlen=BUFFER_MINUTES)
    entry = {
        "ts": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "fields": {k.lower(): v for k, v in raw_fields.items()
                   if v is not None and v != "" and not isinstance(v, dict)},
    }
    _zone_buffer[zone_id].append(entry)


async def _fetch_url(url: str, timeout: int = 10, nocache: bool = False):
    """비동기 HTTP GET + 프록시 캐시.
    nocache=True 이면 캐시를 건너뛰고 항상 새 요청 (admin 테스트용).
    """
    if _httpx is None:
        return None, "httpx 패키지가 설치되지 않았습니다. pip install httpx"

    now = time.time()
    if not nocache:
        cached = _proxy_cache.get(url)
        if cached and now - cached[2] < PROXY_CACHE_TTL:
            return cached[0], cached[1]

    try:
        async with _httpx.AsyncClient(verify=False, timeout=timeout) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            _proxy_cache[url] = (data, None, now)
            return data, None
    except Exception as e:
        err = str(e)
        _proxy_cache[url] = (None, err, now)   # 오류도 캐시 (연속 실패 방지)
        return None, err


def _extract_fields(data: dict, skip: set) -> list:
    raw = {}
    if isinstance(data, dict):
        if data.get("fields") and isinstance(data["fields"], list) and data["fields"]:
            raw = data["fields"][0]
        elif data.get("data") and isinstance(data["data"], list) and data["data"]:
            raw = data["data"][0]
        else:
            raw = data

    return [
        k.strip().lower() for k, v in raw.items()
        if k.strip().lower() not in skip
        and v is not None and v != ""
        and not isinstance(v, dict)
    ]


# ══════════════════════════════════════════════════════════
# 대시보드 설정 파일 I/O
# ══════════════════════════════════════════════════════════

def _load_settings() -> dict:
    if SETTINGS_PATH.exists():
        try:
            return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_settings(patch: dict):
    """기존 설정과 병합 후 저장 (키 단위 덮어쓰기)."""
    current = _load_settings()
    current.update(patch)
    SETTINGS_PATH.write_text(
        json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ══════════════════════════════════════════════════════════
# 가이드라인 기본값 (CSV → Python dict, 12개월 × 24시간)
# ══════════════════════════════════════════════════════════

DEFAULT_GUIDELINES = {
    "1": [
        {"hour": 0, "temp_min": 12.6, "temp_max": 14.6, "hum_min": 83.1, "hum_max": 94.7, "co2": 502.0},
        {"hour": 1, "temp_min": 12.6, "temp_max": 14.6, "hum_min": 82.7, "hum_max": 94.6, "co2": 521.0},
        {"hour": 2, "temp_min": 12.6, "temp_max": 14.6, "hum_min": 82.6, "hum_max": 94.6, "co2": 528.0},
        {"hour": 3, "temp_min": 12.6, "temp_max": 14.6, "hum_min": 82.5, "hum_max": 94.5, "co2": 534.0},
        {"hour": 4, "temp_min": 12.6, "temp_max": 14.8, "hum_min": 82.7, "hum_max": 94.5, "co2": 548.0},
        {"hour": 5, "temp_min": 12.7, "temp_max": 14.9, "hum_min": 82.7, "hum_max": 94.3, "co2": 553.0},
        {"hour": 6, "temp_min": 12.8, "temp_max": 15.0, "hum_min": 82.6, "hum_max": 94.0, "co2": 559.0},
        {"hour": 7, "temp_min": 13.2, "temp_max": 15.7, "hum_min": 82.9, "hum_max": 94.0, "co2": 574.0},
        {"hour": 8, "temp_min": 13.4, "temp_max": 16.1, "hum_min": 83.8, "hum_max": 94.0, "co2": 569.0},
        {"hour": 9, "temp_min": 13.6, "temp_max": 16.5, "hum_min": 84.7, "hum_max": 94.0, "co2": 565.0},
        {"hour": 10, "temp_min": 16.7, "temp_max": 20.5, "hum_min": 76.2, "hum_max": 91.5, "co2": 458.0},
        {"hour": 11, "temp_min": 18.3, "temp_max": 22.2, "hum_min": 71.6, "hum_max": 90.1, "co2": 433.0},
        {"hour": 12, "temp_min": 19.8, "temp_max": 23.9, "hum_min": 66.9, "hum_max": 88.7, "co2": 409.0},
        {"hour": 13, "temp_min": 20.6, "temp_max": 24.8, "hum_min": 67.5, "hum_max": 88.9, "co2": 392.0},
        {"hour": 14, "temp_min": 20.2, "temp_max": 24.4, "hum_min": 70.3, "hum_max": 89.4, "co2": 381.0},
        {"hour": 15, "temp_min": 19.8, "temp_max": 23.9, "hum_min": 73.0, "hum_max": 89.8, "co2": 369.0},
        {"hour": 16, "temp_min": 16.0, "temp_max": 20.5, "hum_min": 81.0, "hum_max": 94.6, "co2": 368.0},
        {"hour": 17, "temp_min": 14.9, "temp_max": 18.4, "hum_min": 84.0, "hum_max": 95.3, "co2": 378.0},
        {"hour": 18, "temp_min": 14.2, "temp_max": 17.5, "hum_min": 84.1, "hum_max": 95.4, "co2": 390.0},
        {"hour": 19, "temp_min": 13.7, "temp_max": 16.7, "hum_min": 83.5, "hum_max": 95.2, "co2": 412.0},
        {"hour": 20, "temp_min": 13.3, "temp_max": 16.1, "hum_min": 83.1, "hum_max": 95.1, "co2": 430.0},
        {"hour": 21, "temp_min": 13.1, "temp_max": 15.8, "hum_min": 82.8, "hum_max": 94.9, "co2": 448.0},
        {"hour": 22, "temp_min": 12.9, "temp_max": 15.5, "hum_min": 82.8, "hum_max": 94.9, "co2": 466.0},
        {"hour": 23, "temp_min": 12.7, "temp_max": 15.1, "hum_min": 82.9, "hum_max": 94.8, "co2": 484.0},
    ],
    "2": [
        {"hour": 0, "temp_min": 12.8, "temp_max": 14.8, "hum_min": 82.5, "hum_max": 94.2, "co2": 498.0},
        {"hour": 1, "temp_min": 12.8, "temp_max": 14.8, "hum_min": 82.1, "hum_max": 94.1, "co2": 516.0},
        {"hour": 2, "temp_min": 12.8, "temp_max": 14.8, "hum_min": 82.0, "hum_max": 94.1, "co2": 523.0},
        {"hour": 3, "temp_min": 12.8, "temp_max": 14.8, "hum_min": 81.9, "hum_max": 94.0, "co2": 530.0},
        {"hour": 4, "temp_min": 12.8, "temp_max": 15.0, "hum_min": 82.1, "hum_max": 94.0, "co2": 543.0},
        {"hour": 5, "temp_min": 12.9, "temp_max": 15.1, "hum_min": 82.1, "hum_max": 93.8, "co2": 548.0},
        {"hour": 6, "temp_min": 13.0, "temp_max": 15.2, "hum_min": 82.0, "hum_max": 93.5, "co2": 554.0},
        {"hour": 7, "temp_min": 13.4, "temp_max": 15.9, "hum_min": 82.3, "hum_max": 93.5, "co2": 568.0},
        {"hour": 8, "temp_min": 13.7, "temp_max": 16.4, "hum_min": 83.1, "hum_max": 93.5, "co2": 563.0},
        {"hour": 9, "temp_min": 14.0, "temp_max": 16.9, "hum_min": 84.0, "hum_max": 93.5, "co2": 558.0},
        {"hour": 10, "temp_min": 17.3, "temp_max": 21.1, "hum_min": 74.7, "hum_max": 90.5, "co2": 450.0},
        {"hour": 11, "temp_min": 19.1, "temp_max": 23.1, "hum_min": 69.7, "hum_max": 89.0, "co2": 424.0},
        {"hour": 12, "temp_min": 20.6, "temp_max": 24.8, "hum_min": 64.9, "hum_max": 87.5, "co2": 398.0},
        {"hour": 13, "temp_min": 21.4, "temp_max": 25.8, "hum_min": 65.5, "hum_max": 87.7, "co2": 381.0},
        {"hour": 14, "temp_min": 21.0, "temp_max": 25.3, "hum_min": 68.4, "hum_max": 88.2, "co2": 370.0},
        {"hour": 15, "temp_min": 20.6, "temp_max": 24.8, "hum_min": 71.1, "hum_max": 88.6, "co2": 358.0},
        {"hour": 16, "temp_min": 16.6, "temp_max": 21.3, "hum_min": 79.6, "hum_max": 94.0, "co2": 357.0},
        {"hour": 17, "temp_min": 15.4, "temp_max": 19.1, "hum_min": 82.8, "hum_max": 94.8, "co2": 367.0},
        {"hour": 18, "temp_min": 14.6, "temp_max": 18.0, "hum_min": 83.0, "hum_max": 94.9, "co2": 379.0},
        {"hour": 19, "temp_min": 14.0, "temp_max": 17.2, "hum_min": 82.4, "hum_max": 94.7, "co2": 401.0},
        {"hour": 20, "temp_min": 13.6, "temp_max": 16.6, "hum_min": 82.0, "hum_max": 94.6, "co2": 419.0},
        {"hour": 21, "temp_min": 13.4, "temp_max": 16.3, "hum_min": 81.7, "hum_max": 94.4, "co2": 437.0},
        {"hour": 22, "temp_min": 13.2, "temp_max": 16.0, "hum_min": 81.7, "hum_max": 94.4, "co2": 455.0},
        {"hour": 23, "temp_min": 13.0, "temp_max": 15.6, "hum_min": 81.8, "hum_max": 94.3, "co2": 473.0},
    ],
    "3": [
        {"hour": 0, "temp_min": 13.3, "temp_max": 15.5, "hum_min": 81.3, "hum_max": 93.2, "co2": 488.0},
        {"hour": 1, "temp_min": 13.3, "temp_max": 15.5, "hum_min": 80.9, "hum_max": 93.1, "co2": 505.0},
        {"hour": 2, "temp_min": 13.3, "temp_max": 15.5, "hum_min": 80.8, "hum_max": 93.1, "co2": 512.0},
        {"hour": 3, "temp_min": 13.3, "temp_max": 15.5, "hum_min": 80.7, "hum_max": 93.0, "co2": 518.0},
        {"hour": 4, "temp_min": 13.3, "temp_max": 15.7, "hum_min": 80.9, "hum_max": 93.0, "co2": 531.0},
        {"hour": 5, "temp_min": 13.4, "temp_max": 15.8, "hum_min": 80.9, "hum_max": 92.8, "co2": 535.0},
        {"hour": 6, "temp_min": 13.5, "temp_max": 15.9, "hum_min": 80.8, "hum_max": 92.5, "co2": 540.0},
        {"hour": 7, "temp_min": 14.0, "temp_max": 16.7, "hum_min": 81.0, "hum_max": 92.5, "co2": 553.0},
        {"hour": 8, "temp_min": 14.4, "temp_max": 17.3, "hum_min": 81.6, "hum_max": 92.5, "co2": 547.0},
        {"hour": 9, "temp_min": 14.8, "temp_max": 17.9, "hum_min": 82.2, "hum_max": 92.5, "co2": 540.0},
        {"hour": 10, "temp_min": 18.5, "temp_max": 22.6, "hum_min": 71.9, "hum_max": 88.9, "co2": 430.0},
        {"hour": 11, "temp_min": 20.6, "temp_max": 25.1, "hum_min": 66.3, "hum_max": 87.2, "co2": 402.0},
        {"hour": 12, "temp_min": 22.4, "temp_max": 27.1, "hum_min": 61.0, "hum_max": 85.5, "co2": 374.0},
        {"hour": 13, "temp_min": 23.3, "temp_max": 28.2, "hum_min": 61.6, "hum_max": 85.6, "co2": 356.0},
        {"hour": 14, "temp_min": 22.9, "temp_max": 27.7, "hum_min": 64.7, "hum_max": 86.1, "co2": 344.0},
        {"hour": 15, "temp_min": 22.4, "temp_max": 27.1, "hum_min": 67.5, "hum_max": 86.5, "co2": 332.0},
        {"hour": 16, "temp_min": 17.8, "temp_max": 22.9, "hum_min": 77.2, "hum_max": 92.8, "co2": 330.0},
        {"hour": 17, "temp_min": 16.5, "temp_max": 20.5, "hum_min": 80.6, "hum_max": 93.7, "co2": 340.0},
        {"hour": 18, "temp_min": 15.6, "temp_max": 19.3, "hum_min": 80.9, "hum_max": 93.8, "co2": 352.0},
        {"hour": 19, "temp_min": 14.9, "temp_max": 18.3, "hum_min": 80.3, "hum_max": 93.6, "co2": 374.0},
        {"hour": 20, "temp_min": 14.5, "temp_max": 17.7, "hum_min": 79.9, "hum_max": 93.5, "co2": 392.0},
        {"hour": 21, "temp_min": 14.2, "temp_max": 17.4, "hum_min": 79.6, "hum_max": 93.3, "co2": 410.0},
        {"hour": 22, "temp_min": 14.0, "temp_max": 17.1, "hum_min": 79.6, "hum_max": 93.3, "co2": 428.0},
        {"hour": 23, "temp_min": 13.7, "temp_max": 16.6, "hum_min": 79.7, "hum_max": 93.2, "co2": 446.0},
    ],
    "4": [
        {"hour": 0, "temp_min": 14.1, "temp_max": 16.5, "hum_min": 79.4, "hum_max": 91.6, "co2": 471.0},
        {"hour": 1, "temp_min": 14.1, "temp_max": 16.5, "hum_min": 79.0, "hum_max": 91.5, "co2": 488.0},
        {"hour": 2, "temp_min": 14.1, "temp_max": 16.5, "hum_min": 78.9, "hum_max": 91.5, "co2": 494.0},
        {"hour": 3, "temp_min": 14.1, "temp_max": 16.5, "hum_min": 78.8, "hum_max": 91.4, "co2": 500.0},
        {"hour": 4, "temp_min": 14.1, "temp_max": 16.7, "hum_min": 79.0, "hum_max": 91.4, "co2": 513.0},
        {"hour": 5, "temp_min": 14.2, "temp_max": 16.8, "hum_min": 79.0, "hum_max": 91.2, "co2": 517.0},
        {"hour": 6, "temp_min": 14.3, "temp_max": 16.9, "hum_min": 78.9, "hum_max": 90.9, "co2": 522.0},
        {"hour": 7, "temp_min": 14.9, "temp_max": 17.8, "hum_min": 79.1, "hum_max": 90.9, "co2": 534.0},
        {"hour": 8, "temp_min": 15.4, "temp_max": 18.5, "hum_min": 79.7, "hum_max": 90.9, "co2": 528.0},
        {"hour": 9, "temp_min": 15.9, "temp_max": 19.2, "hum_min": 80.2, "hum_max": 90.9, "co2": 521.0},
        {"hour": 10, "temp_min": 20.0, "temp_max": 24.5, "hum_min": 69.0, "hum_max": 87.0, "co2": 408.0},
        {"hour": 11, "temp_min": 22.4, "temp_max": 27.4, "hum_min": 62.9, "hum_max": 85.1, "co2": 378.0},
        {"hour": 12, "temp_min": 24.5, "temp_max": 29.8, "hum_min": 57.5, "hum_max": 83.2, "co2": 348.0},
        {"hour": 13, "temp_min": 25.6, "temp_max": 31.1, "hum_min": 57.9, "hum_max": 83.3, "co2": 329.0},
        {"hour": 14, "temp_min": 25.2, "temp_max": 30.6, "hum_min": 61.3, "hum_max": 83.8, "co2": 317.0},
        {"hour": 15, "temp_min": 24.5, "temp_max": 29.8, "hum_min": 64.4, "hum_max": 84.3, "co2": 305.0},
        {"hour": 16, "temp_min": 19.3, "temp_max": 24.9, "hum_min": 74.9, "hum_max": 91.5, "co2": 302.0},
        {"hour": 17, "temp_min": 17.9, "temp_max": 22.3, "hum_min": 78.5, "hum_max": 92.5, "co2": 312.0},
        {"hour": 18, "temp_min": 16.9, "temp_max": 21.0, "hum_min": 78.9, "hum_max": 92.6, "co2": 325.0},
        {"hour": 19, "temp_min": 16.1, "temp_max": 19.9, "hum_min": 78.2, "hum_max": 92.3, "co2": 348.0},
        {"hour": 20, "temp_min": 15.6, "temp_max": 19.2, "hum_min": 77.8, "hum_max": 92.2, "co2": 366.0},
        {"hour": 21, "temp_min": 15.3, "temp_max": 18.8, "hum_min": 77.5, "hum_max": 92.0, "co2": 384.0},
        {"hour": 22, "temp_min": 15.0, "temp_max": 18.5, "hum_min": 77.5, "hum_max": 92.0, "co2": 402.0},
        {"hour": 23, "temp_min": 14.7, "temp_max": 18.0, "hum_min": 77.6, "hum_max": 91.9, "co2": 421.0},
    ],
    "5": [
        {"hour": 0, "temp_min": 15.3, "temp_max": 17.9, "hum_min": 76.7, "hum_max": 89.4, "co2": 449.0},
        {"hour": 1, "temp_min": 15.3, "temp_max": 17.9, "hum_min": 76.3, "hum_max": 89.3, "co2": 465.0},
        {"hour": 2, "temp_min": 15.3, "temp_max": 17.9, "hum_min": 76.2, "hum_max": 89.3, "co2": 471.0},
        {"hour": 3, "temp_min": 15.3, "temp_max": 17.9, "hum_min": 76.1, "hum_max": 89.2, "co2": 477.0},
        {"hour": 4, "temp_min": 15.3, "temp_max": 18.1, "hum_min": 76.3, "hum_max": 89.2, "co2": 489.0},
        {"hour": 5, "temp_min": 15.4, "temp_max": 18.2, "hum_min": 76.3, "hum_max": 89.0, "co2": 493.0},
        {"hour": 6, "temp_min": 15.5, "temp_max": 18.3, "hum_min": 76.2, "hum_max": 88.7, "co2": 498.0},
        {"hour": 7, "temp_min": 16.2, "temp_max": 19.4, "hum_min": 76.3, "hum_max": 88.7, "co2": 509.0},
        {"hour": 8, "temp_min": 16.8, "temp_max": 20.3, "hum_min": 76.8, "hum_max": 88.7, "co2": 504.0},
        {"hour": 9, "temp_min": 17.4, "temp_max": 21.1, "hum_min": 77.3, "hum_max": 88.7, "co2": 498.0},
        {"hour": 10, "temp_min": 22.2, "temp_max": 27.2, "hum_min": 64.8, "hum_max": 84.5, "co2": 382.0},
        {"hour": 11, "temp_min": 25.0, "temp_max": 30.7, "hum_min": 58.3, "hum_max": 82.5, "co2": 350.0},
        {"hour": 12, "temp_min": 27.4, "temp_max": 33.8, "hum_min": 52.4, "hum_max": 80.4, "co2": 317.0},
        {"hour": 13, "temp_min": 28.7, "temp_max": 35.4, "hum_min": 52.7, "hum_max": 80.4, "co2": 297.0},
        {"hour": 14, "temp_min": 28.3, "temp_max": 34.9, "hum_min": 56.3, "hum_max": 81.0, "co2": 285.0},
        {"hour": 15, "temp_min": 27.4, "temp_max": 33.8, "hum_min": 59.7, "hum_max": 81.5, "co2": 273.0},
        {"hour": 16, "temp_min": 21.5, "temp_max": 27.8, "hum_min": 71.5, "hum_max": 90.0, "co2": 269.0},
        {"hour": 17, "temp_min": 19.9, "temp_max": 24.9, "hum_min": 75.4, "hum_max": 91.1, "co2": 279.0},
        {"hour": 18, "temp_min": 18.8, "temp_max": 23.4, "hum_min": 75.9, "hum_max": 91.3, "co2": 292.0},
        {"hour": 19, "temp_min": 17.9, "temp_max": 22.2, "hum_min": 75.2, "hum_max": 91.0, "co2": 316.0},
        {"hour": 20, "temp_min": 17.3, "temp_max": 21.5, "hum_min": 74.8, "hum_max": 90.9, "co2": 335.0},
        {"hour": 21, "temp_min": 17.0, "temp_max": 21.1, "hum_min": 74.5, "hum_max": 90.7, "co2": 353.0},
        {"hour": 22, "temp_min": 16.7, "temp_max": 20.8, "hum_min": 74.4, "hum_max": 90.6, "co2": 371.0},
        {"hour": 23, "temp_min": 16.3, "temp_max": 20.3, "hum_min": 74.6, "hum_max": 90.6, "co2": 390.0},
    ],
    "6": [
        {"hour": 0, "temp_min": 16.9, "temp_max": 19.8, "hum_min": 73.4, "hum_max": 86.5, "co2": 420.0},
        {"hour": 1, "temp_min": 16.9, "temp_max": 19.8, "hum_min": 73.0, "hum_max": 86.4, "co2": 435.0},
        {"hour": 2, "temp_min": 16.9, "temp_max": 19.8, "hum_min": 72.9, "hum_max": 86.4, "co2": 441.0},
        {"hour": 3, "temp_min": 16.9, "temp_max": 19.8, "hum_min": 72.8, "hum_max": 86.3, "co2": 447.0},
        {"hour": 4, "temp_min": 16.9, "temp_max": 20.0, "hum_min": 73.0, "hum_max": 86.3, "co2": 458.0},
        {"hour": 5, "temp_min": 17.0, "temp_max": 20.1, "hum_min": 73.0, "hum_max": 86.1, "co2": 462.0},
        {"hour": 6, "temp_min": 17.1, "temp_max": 20.2, "hum_min": 72.9, "hum_max": 85.8, "co2": 467.0},
        {"hour": 7, "temp_min": 17.9, "temp_max": 21.5, "hum_min": 73.0, "hum_max": 85.8, "co2": 477.0},
        {"hour": 8, "temp_min": 18.6, "temp_max": 22.5, "hum_min": 73.4, "hum_max": 85.8, "co2": 471.0},
        {"hour": 9, "temp_min": 19.3, "temp_max": 23.4, "hum_min": 73.8, "hum_max": 85.8, "co2": 465.0},
        {"hour": 10, "temp_min": 24.7, "temp_max": 30.3, "hum_min": 59.7, "hum_max": 81.0, "co2": 346.0},
        {"hour": 11, "temp_min": 27.9, "temp_max": 34.4, "hum_min": 52.7, "hum_max": 78.7, "co2": 312.0},
        {"hour": 12, "temp_min": 30.8, "temp_max": 38.2, "hum_min": 46.4, "hum_max": 76.4, "co2": 278.0},
        {"hour": 13, "temp_min": 32.3, "temp_max": 40.2, "hum_min": 46.7, "hum_max": 76.3, "co2": 257.0},
        {"hour": 14, "temp_min": 31.8, "temp_max": 39.6, "hum_min": 50.5, "hum_max": 77.0, "co2": 244.0},
        {"hour": 15, "temp_min": 30.8, "temp_max": 38.2, "hum_min": 54.0, "hum_max": 77.6, "co2": 231.0},
        {"hour": 16, "temp_min": 24.0, "temp_max": 31.2, "hum_min": 67.2, "hum_max": 87.8, "co2": 227.0},
        {"hour": 17, "temp_min": 22.3, "temp_max": 28.1, "hum_min": 71.4, "hum_max": 89.0, "co2": 237.0},
        {"hour": 18, "temp_min": 21.0, "temp_max": 26.4, "hum_min": 72.1, "hum_max": 89.2, "co2": 251.0},
        {"hour": 19, "temp_min": 20.1, "temp_max": 25.0, "hum_min": 71.4, "hum_max": 88.8, "co2": 275.0},
        {"hour": 20, "temp_min": 19.5, "temp_max": 24.3, "hum_min": 70.9, "hum_max": 88.7, "co2": 294.0},
        {"hour": 21, "temp_min": 19.1, "temp_max": 23.8, "hum_min": 70.6, "hum_max": 88.5, "co2": 313.0},
        {"hour": 22, "temp_min": 18.8, "temp_max": 23.4, "hum_min": 70.6, "hum_max": 88.5, "co2": 331.0},
        {"hour": 23, "temp_min": 18.4, "temp_max": 22.8, "hum_min": 70.8, "hum_max": 88.4, "co2": 350.0},
    ],
    "7": [
        {"hour": 0, "temp_min": 18.5, "temp_max": 21.7, "hum_min": 69.9, "hum_max": 83.4, "co2": 390.0},
        {"hour": 1, "temp_min": 18.5, "temp_max": 21.7, "hum_min": 69.5, "hum_max": 83.3, "co2": 404.0},
        {"hour": 2, "temp_min": 18.5, "temp_max": 21.7, "hum_min": 69.4, "hum_max": 83.3, "co2": 410.0},
        {"hour": 3, "temp_min": 18.5, "temp_max": 21.7, "hum_min": 69.3, "hum_max": 83.2, "co2": 416.0},
        {"hour": 4, "temp_min": 18.5, "temp_max": 21.9, "hum_min": 69.5, "hum_max": 83.2, "co2": 427.0},
        {"hour": 5, "temp_min": 18.6, "temp_max": 22.0, "hum_min": 69.5, "hum_max": 83.0, "co2": 430.0},
        {"hour": 6, "temp_min": 18.7, "temp_max": 22.1, "hum_min": 69.4, "hum_max": 82.7, "co2": 435.0},
        {"hour": 7, "temp_min": 19.7, "temp_max": 23.6, "hum_min": 69.5, "hum_max": 82.7, "co2": 444.0},
        {"hour": 8, "temp_min": 20.6, "temp_max": 24.9, "hum_min": 69.8, "hum_max": 82.7, "co2": 438.0},
        {"hour": 9, "temp_min": 21.5, "temp_max": 26.1, "hum_min": 70.2, "hum_max": 82.7, "co2": 432.0},
        {"hour": 10, "temp_min": 27.7, "temp_max": 34.1, "hum_min": 55.2, "hum_max": 77.1, "co2": 308.0},
        {"hour": 11, "temp_min": 31.4, "temp_max": 38.9, "hum_min": 47.7, "hum_max": 74.5, "co2": 271.0},
        {"hour": 12, "temp_min": 34.8, "temp_max": 43.6, "hum_min": 41.1, "hum_max": 71.8, "co2": 233.0},
        {"hour": 13, "temp_min": 36.6, "temp_max": 45.9, "hum_min": 41.3, "hum_max": 71.7, "co2": 210.0},
        {"hour": 14, "temp_min": 36.1, "temp_max": 45.2, "hum_min": 45.3, "hum_max": 72.4, "co2": 196.0},
        {"hour": 15, "temp_min": 34.8, "temp_max": 43.6, "hum_min": 49.0, "hum_max": 73.1, "co2": 183.0},
        {"hour": 16, "temp_min": 27.0, "temp_max": 35.2, "hum_min": 63.2, "hum_max": 85.6, "co2": 178.0},
        {"hour": 17, "temp_min": 25.1, "temp_max": 31.8, "hum_min": 67.6, "hum_max": 86.9, "co2": 188.0},
        {"hour": 18, "temp_min": 23.7, "temp_max": 29.9, "hum_min": 68.5, "hum_max": 87.2, "co2": 202.0},
        {"hour": 19, "temp_min": 22.7, "temp_max": 28.4, "hum_min": 67.7, "hum_max": 86.7, "co2": 226.0},
        {"hour": 20, "temp_min": 22.0, "temp_max": 27.5, "hum_min": 67.2, "hum_max": 86.6, "co2": 246.0},
        {"hour": 21, "temp_min": 21.6, "temp_max": 27.0, "hum_min": 66.9, "hum_max": 86.4, "co2": 265.0},
        {"hour": 22, "temp_min": 21.2, "temp_max": 26.5, "hum_min": 66.9, "hum_max": 86.3, "co2": 284.0},
        {"hour": 23, "temp_min": 20.8, "temp_max": 25.9, "hum_min": 67.1, "hum_max": 86.3, "co2": 303.0},
    ],
    "8": [
        {"hour": 0, "temp_min": 19.9, "temp_max": 23.4, "hum_min": 66.4, "hum_max": 80.2, "co2": 361.0},
        {"hour": 1, "temp_min": 19.9, "temp_max": 23.4, "hum_min": 66.0, "hum_max": 80.1, "co2": 375.0},
        {"hour": 2, "temp_min": 19.9, "temp_max": 23.4, "hum_min": 65.9, "hum_max": 80.1, "co2": 381.0},
        {"hour": 3, "temp_min": 19.9, "temp_max": 23.4, "hum_min": 65.8, "hum_max": 80.0, "co2": 387.0},
        {"hour": 4, "temp_min": 19.9, "temp_max": 23.6, "hum_min": 66.0, "hum_max": 80.0, "co2": 398.0},
        {"hour": 5, "temp_min": 20.0, "temp_max": 23.7, "hum_min": 66.0, "hum_max": 79.8, "co2": 401.0},
        {"hour": 6, "temp_min": 20.1, "temp_max": 23.8, "hum_min": 65.9, "hum_max": 79.5, "co2": 406.0},
        {"hour": 7, "temp_min": 21.2, "temp_max": 25.6, "hum_min": 66.0, "hum_max": 79.5, "co2": 414.0},
        {"hour": 8, "temp_min": 22.3, "temp_max": 27.1, "hum_min": 66.2, "hum_max": 79.5, "co2": 408.0},
        {"hour": 9, "temp_min": 23.3, "temp_max": 28.5, "hum_min": 66.5, "hum_max": 79.5, "co2": 401.0},
        {"hour": 10, "temp_min": 30.1, "temp_max": 37.3, "hum_min": 50.3, "hum_max": 73.5, "co2": 275.0},
        {"hour": 11, "temp_min": 34.3, "temp_max": 42.8, "hum_min": 42.4, "hum_max": 70.5, "co2": 235.0},
        {"hour": 12, "temp_min": 38.1, "temp_max": 48.2, "hum_min": 35.4, "hum_max": 67.4, "co2": 194.0},
        {"hour": 13, "temp_min": 40.2, "temp_max": 51.0, "hum_min": 35.6, "hum_max": 67.3, "co2": 170.0},
        {"hour": 14, "temp_min": 39.7, "temp_max": 50.3, "hum_min": 39.8, "hum_max": 68.1, "co2": 155.0},
        {"hour": 15, "temp_min": 38.1, "temp_max": 48.2, "hum_min": 43.8, "hum_max": 68.9, "co2": 141.0},
        {"hour": 16, "temp_min": 29.4, "temp_max": 38.6, "hum_min": 59.0, "hum_max": 83.5, "co2": 135.0},
        {"hour": 17, "temp_min": 27.3, "temp_max": 34.9, "hum_min": 63.7, "hum_max": 84.9, "co2": 145.0},
        {"hour": 18, "temp_min": 25.8, "temp_max": 33.0, "hum_min": 64.7, "hum_max": 85.2, "co2": 160.0},
        {"hour": 19, "temp_min": 24.8, "temp_max": 31.3, "hum_min": 63.9, "hum_max": 84.7, "co2": 184.0},
        {"hour": 20, "temp_min": 24.0, "temp_max": 30.4, "hum_min": 63.4, "hum_max": 84.6, "co2": 204.0},
        {"hour": 21, "temp_min": 23.6, "temp_max": 29.9, "hum_min": 63.1, "hum_max": 84.4, "co2": 224.0},
        {"hour": 22, "temp_min": 23.2, "temp_max": 29.3, "hum_min": 63.0, "hum_max": 84.3, "co2": 243.0},
        {"hour": 23, "temp_min": 22.7, "temp_max": 28.6, "hum_min": 63.2, "hum_max": 84.2, "co2": 263.0},
    ],
    "9": [
        {"hour": 0, "temp_min": 18.7, "temp_max": 22.0, "hum_min": 69.5, "hum_max": 83.1, "co2": 403.0},
        {"hour": 1, "temp_min": 18.7, "temp_max": 22.0, "hum_min": 69.1, "hum_max": 83.0, "co2": 418.0},
        {"hour": 2, "temp_min": 18.7, "temp_max": 22.0, "hum_min": 69.0, "hum_max": 83.0, "co2": 424.0},
        {"hour": 3, "temp_min": 18.7, "temp_max": 22.0, "hum_min": 68.9, "hum_max": 82.9, "co2": 430.0},
        {"hour": 4, "temp_min": 18.7, "temp_max": 22.2, "hum_min": 69.1, "hum_max": 82.9, "co2": 442.0},
        {"hour": 5, "temp_min": 18.8, "temp_max": 22.3, "hum_min": 69.1, "hum_max": 82.7, "co2": 446.0},
        {"hour": 6, "temp_min": 18.9, "temp_max": 22.4, "hum_min": 69.0, "hum_max": 82.4, "co2": 451.0},
        {"hour": 7, "temp_min": 19.8, "temp_max": 23.8, "hum_min": 69.1, "hum_max": 82.4, "co2": 460.0},
        {"hour": 8, "temp_min": 20.7, "temp_max": 25.1, "hum_min": 69.4, "hum_max": 82.4, "co2": 454.0},
        {"hour": 9, "temp_min": 21.6, "temp_max": 26.3, "hum_min": 69.8, "hum_max": 82.4, "co2": 448.0},
        {"hour": 10, "temp_min": 27.9, "temp_max": 34.4, "hum_min": 54.7, "hum_max": 76.9, "co2": 319.0},
        {"hour": 11, "temp_min": 31.6, "temp_max": 39.2, "hum_min": 47.1, "hum_max": 74.3, "co2": 281.0},
        {"hour": 12, "temp_min": 35.2, "temp_max": 44.2, "hum_min": 40.3, "hum_max": 71.5, "co2": 242.0},
        {"hour": 13, "temp_min": 37.0, "temp_max": 46.5, "hum_min": 40.5, "hum_max": 71.4, "co2": 219.0},
        {"hour": 14, "temp_min": 36.5, "temp_max": 45.9, "hum_min": 44.6, "hum_max": 72.2, "co2": 205.0},
        {"hour": 15, "temp_min": 35.2, "temp_max": 44.2, "hum_min": 48.5, "hum_max": 72.9, "co2": 191.0},
        {"hour": 16, "temp_min": 27.2, "temp_max": 35.5, "hum_min": 62.8, "hum_max": 85.3, "co2": 186.0},
        {"hour": 17, "temp_min": 25.2, "temp_max": 32.0, "hum_min": 67.3, "hum_max": 86.7, "co2": 196.0},
        {"hour": 18, "temp_min": 23.8, "temp_max": 30.2, "hum_min": 68.2, "hum_max": 87.0, "co2": 211.0},
        {"hour": 19, "temp_min": 22.8, "temp_max": 28.7, "hum_min": 67.4, "hum_max": 86.5, "co2": 236.0},
        {"hour": 20, "temp_min": 22.1, "temp_max": 27.8, "hum_min": 66.9, "hum_max": 86.4, "co2": 256.0},
        {"hour": 21, "temp_min": 21.7, "temp_max": 27.3, "hum_min": 66.6, "hum_max": 86.2, "co2": 275.0},
        {"hour": 22, "temp_min": 21.3, "temp_max": 26.7, "hum_min": 66.5, "hum_max": 86.1, "co2": 295.0},
        {"hour": 23, "temp_min": 20.9, "temp_max": 26.1, "hum_min": 66.8, "hum_max": 86.1, "co2": 315.0},
    ],
    "10": [
        {"hour": 0, "temp_min": 16.8, "temp_max": 19.7, "hum_min": 74.3, "hum_max": 87.5, "co2": 447.0},
        {"hour": 1, "temp_min": 16.8, "temp_max": 19.7, "hum_min": 73.9, "hum_max": 87.4, "co2": 463.0},
        {"hour": 2, "temp_min": 16.8, "temp_max": 19.7, "hum_min": 73.8, "hum_max": 87.4, "co2": 469.0},
        {"hour": 3, "temp_min": 16.8, "temp_max": 19.7, "hum_min": 73.7, "hum_max": 87.3, "co2": 476.0},
        {"hour": 4, "temp_min": 16.8, "temp_max": 19.9, "hum_min": 73.9, "hum_max": 87.3, "co2": 488.0},
        {"hour": 5, "temp_min": 16.9, "temp_max": 20.0, "hum_min": 73.9, "hum_max": 87.1, "co2": 492.0},
        {"hour": 6, "temp_min": 17.0, "temp_max": 20.1, "hum_min": 73.8, "hum_max": 86.8, "co2": 497.0},
        {"hour": 7, "temp_min": 17.8, "temp_max": 21.3, "hum_min": 73.9, "hum_max": 86.8, "co2": 507.0},
        {"hour": 8, "temp_min": 18.5, "temp_max": 22.4, "hum_min": 74.4, "hum_max": 86.8, "co2": 501.0},
        {"hour": 9, "temp_min": 19.2, "temp_max": 23.3, "hum_min": 74.8, "hum_max": 86.8, "co2": 495.0},
        {"hour": 10, "temp_min": 24.6, "temp_max": 30.1, "hum_min": 60.6, "hum_max": 81.3, "co2": 367.0},
        {"hour": 11, "temp_min": 27.7, "temp_max": 34.2, "hum_min": 53.6, "hum_max": 79.0, "co2": 332.0},
        {"hour": 12, "temp_min": 30.6, "temp_max": 38.0, "hum_min": 46.4, "hum_max": 76.6, "co2": 297.0},
        {"hour": 13, "temp_min": 32.1, "temp_max": 39.9, "hum_min": 46.7, "hum_max": 76.5, "co2": 274.0},
        {"hour": 14, "temp_min": 31.6, "temp_max": 39.3, "hum_min": 50.6, "hum_max": 77.2, "co2": 261.0},
        {"hour": 15, "temp_min": 30.6, "temp_max": 38.0, "hum_min": 54.2, "hum_max": 77.8, "co2": 248.0},
        {"hour": 16, "temp_min": 23.8, "temp_max": 31.1, "hum_min": 67.7, "hum_max": 88.0, "co2": 243.0},
        {"hour": 17, "temp_min": 22.1, "temp_max": 27.9, "hum_min": 72.2, "hum_max": 89.2, "co2": 254.0},
        {"hour": 18, "temp_min": 20.9, "temp_max": 26.2, "hum_min": 72.9, "hum_max": 89.5, "co2": 267.0},
        {"hour": 19, "temp_min": 20.0, "temp_max": 24.9, "hum_min": 72.1, "hum_max": 89.1, "co2": 292.0},
        {"hour": 20, "temp_min": 19.4, "temp_max": 24.1, "hum_min": 71.6, "hum_max": 89.0, "co2": 311.0},
        {"hour": 21, "temp_min": 19.0, "temp_max": 23.6, "hum_min": 71.3, "hum_max": 88.8, "co2": 330.0},
        {"hour": 22, "temp_min": 18.6, "temp_max": 23.1, "hum_min": 71.3, "hum_max": 88.8, "co2": 350.0},
        {"hour": 23, "temp_min": 18.2, "temp_max": 22.5, "hum_min": 71.5, "hum_max": 88.7, "co2": 370.0},
    ],
    "11": [
        {"hour": 0, "temp_min": 14.6, "temp_max": 17.1, "hum_min": 79.9, "hum_max": 92.1, "co2": 490.0},
        {"hour": 1, "temp_min": 14.6, "temp_max": 17.1, "hum_min": 79.5, "hum_max": 92.0, "co2": 507.0},
        {"hour": 2, "temp_min": 14.6, "temp_max": 17.1, "hum_min": 79.4, "hum_max": 92.0, "co2": 513.0},
        {"hour": 3, "temp_min": 14.6, "temp_max": 17.1, "hum_min": 79.3, "hum_max": 91.9, "co2": 520.0},
        {"hour": 4, "temp_min": 14.6, "temp_max": 17.3, "hum_min": 79.5, "hum_max": 91.9, "co2": 533.0},
        {"hour": 5, "temp_min": 14.7, "temp_max": 17.4, "hum_min": 79.5, "hum_max": 91.7, "co2": 537.0},
        {"hour": 6, "temp_min": 14.8, "temp_max": 17.5, "hum_min": 79.4, "hum_max": 91.4, "co2": 542.0},
        {"hour": 7, "temp_min": 15.4, "temp_max": 18.3, "hum_min": 79.6, "hum_max": 91.4, "co2": 553.0},
        {"hour": 8, "temp_min": 15.9, "temp_max": 19.0, "hum_min": 80.2, "hum_max": 91.4, "co2": 547.0},
        {"hour": 9, "temp_min": 16.4, "temp_max": 19.8, "hum_min": 80.7, "hum_max": 91.4, "co2": 541.0},
        {"hour": 10, "temp_min": 20.8, "temp_max": 25.4, "hum_min": 68.9, "hum_max": 86.7, "co2": 417.0},
        {"hour": 11, "temp_min": 23.3, "temp_max": 28.6, "hum_min": 63.0, "hum_max": 84.8, "co2": 387.0},
        {"hour": 12, "temp_min": 25.7, "temp_max": 31.7, "hum_min": 57.2, "hum_max": 82.9, "co2": 357.0},
        {"hour": 13, "temp_min": 26.9, "temp_max": 33.2, "hum_min": 57.5, "hum_max": 83.0, "co2": 337.0},
        {"hour": 14, "temp_min": 26.5, "temp_max": 32.7, "hum_min": 61.0, "hum_max": 83.5, "co2": 325.0},
        {"hour": 15, "temp_min": 25.7, "temp_max": 31.7, "hum_min": 64.3, "hum_max": 84.0, "co2": 313.0},
        {"hour": 16, "temp_min": 20.1, "temp_max": 26.1, "hum_min": 75.2, "hum_max": 91.6, "co2": 309.0},
        {"hour": 17, "temp_min": 18.7, "temp_max": 23.3, "hum_min": 79.0, "hum_max": 92.7, "co2": 319.0},
        {"hour": 18, "temp_min": 17.6, "temp_max": 21.9, "hum_min": 79.5, "hum_max": 92.9, "co2": 333.0},
        {"hour": 19, "temp_min": 16.8, "temp_max": 20.8, "hum_min": 78.7, "hum_max": 92.5, "co2": 358.0},
        {"hour": 20, "temp_min": 16.3, "temp_max": 20.2, "hum_min": 78.2, "hum_max": 92.4, "co2": 377.0},
        {"hour": 21, "temp_min": 16.0, "temp_max": 19.8, "hum_min": 77.9, "hum_max": 92.2, "co2": 396.0},
        {"hour": 22, "temp_min": 15.7, "temp_max": 19.4, "hum_min": 77.9, "hum_max": 92.2, "co2": 415.0},
        {"hour": 23, "temp_min": 15.4, "temp_max": 19.0, "hum_min": 78.1, "hum_max": 92.1, "co2": 435.0},
    ],
    "12": [
        {"hour": 0, "temp_min": 13.0, "temp_max": 15.2, "hum_min": 82.2, "hum_max": 93.9, "co2": 499.0},
        {"hour": 1, "temp_min": 13.0, "temp_max": 15.2, "hum_min": 81.8, "hum_max": 93.8, "co2": 517.0},
        {"hour": 2, "temp_min": 13.0, "temp_max": 15.2, "hum_min": 81.7, "hum_max": 93.8, "co2": 523.0},
        {"hour": 3, "temp_min": 13.0, "temp_max": 15.2, "hum_min": 81.6, "hum_max": 93.7, "co2": 530.0},
        {"hour": 4, "temp_min": 13.0, "temp_max": 15.4, "hum_min": 81.8, "hum_max": 93.7, "co2": 543.0},
        {"hour": 5, "temp_min": 13.1, "temp_max": 15.5, "hum_min": 81.8, "hum_max": 93.5, "co2": 547.0},
        {"hour": 6, "temp_min": 13.2, "temp_max": 15.6, "hum_min": 81.7, "hum_max": 93.2, "co2": 552.0},
        {"hour": 7, "temp_min": 13.7, "temp_max": 16.3, "hum_min": 82.0, "hum_max": 93.2, "co2": 563.0},
        {"hour": 8, "temp_min": 14.0, "temp_max": 16.8, "hum_min": 82.9, "hum_max": 93.2, "co2": 558.0},
        {"hour": 9, "temp_min": 14.3, "temp_max": 17.2, "hum_min": 83.8, "hum_max": 93.2, "co2": 553.0},
        {"hour": 10, "temp_min": 17.9, "temp_max": 21.9, "hum_min": 74.3, "hum_max": 89.8, "co2": 433.0},
        {"hour": 11, "temp_min": 19.9, "temp_max": 24.2, "hum_min": 69.1, "hum_max": 88.2, "co2": 406.0},
        {"hour": 12, "temp_min": 21.7, "temp_max": 26.4, "hum_min": 64.1, "hum_max": 86.6, "co2": 379.0},
        {"hour": 13, "temp_min": 22.6, "temp_max": 27.5, "hum_min": 64.7, "hum_max": 86.7, "co2": 360.0},
        {"hour": 14, "temp_min": 22.2, "temp_max": 27.0, "hum_min": 67.7, "hum_max": 87.2, "co2": 348.0},
        {"hour": 15, "temp_min": 21.7, "temp_max": 26.4, "hum_min": 70.5, "hum_max": 87.7, "co2": 336.0},
        {"hour": 16, "temp_min": 17.1, "temp_max": 22.0, "hum_min": 79.5, "hum_max": 93.9, "co2": 334.0},
        {"hour": 17, "temp_min": 15.9, "temp_max": 19.7, "hum_min": 82.7, "hum_max": 94.9, "co2": 344.0},
        {"hour": 18, "temp_min": 15.1, "temp_max": 18.7, "hum_min": 82.8, "hum_max": 95.0, "co2": 358.0},
        {"hour": 19, "temp_min": 14.5, "temp_max": 17.9, "hum_min": 82.1, "hum_max": 94.7, "co2": 381.0},
        {"hour": 20, "temp_min": 14.0, "temp_max": 17.3, "hum_min": 81.7, "hum_max": 94.6, "co2": 400.0},
        {"hour": 21, "temp_min": 13.8, "temp_max": 17.0, "hum_min": 81.4, "hum_max": 94.4, "co2": 419.0},
        {"hour": 22, "temp_min": 13.5, "temp_max": 16.6, "hum_min": 81.3, "hum_max": 94.3, "co2": 438.0},
        {"hour": 23, "temp_min": 13.3, "temp_max": 16.3, "hum_min": 81.5, "hum_max": 94.3, "co2": 457.0},
    ],
}

DEFAULT_ALERT_CONFIG = {
    "temp":       {"enabled": True, "delay_min": 10, "deviation_pct": 0},
    "humidity":   {"enabled": True, "delay_min": 10, "deviation_pct": 0},
    "co2":        {"enabled": True, "delay_min": 10, "deviation_pct": 10},
    "webhookUrl": "",
}


# ══════════════════════════════════════════════════════════
# 가이드라인 파일 I/O
# ══════════════════════════════════════════════════════════

def _load_guidelines() -> dict:
    if GUIDELINES_PATH.exists():
        try:
            d = json.loads(GUIDELINES_PATH.read_text(encoding="utf-8"))
            if "data" in d and "alert_config" in d:
                return d
        except Exception:
            pass
    return {"data": DEFAULT_GUIDELINES, "alert_config": DEFAULT_ALERT_CONFIG}


def _save_guidelines(payload: dict):
    GUIDELINES_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ══════════════════════════════════════════════════════════
# 알림 상태 및 저장
# ══════════════════════════════════════════════════════════

_alert_state: dict = {}  # { "zone_id:field": {"out_since": datetime|None, "alerted": bool} }


def _save_alert(zone_id: str, field: str, value: float, range_min: float, range_max: float, ts: datetime):
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute(
        "INSERT INTO alerts (ts, zone_id, field, value, range_min, range_max) VALUES (?,?,?,?,?,?)",
        (ts.isoformat() + "Z", zone_id, field, value, range_min, range_max),
    )
    conn.commit()
    conn.close()
    print(f"[alert] {ts.isoformat()} zone={zone_id} field={field} val={value:.1f} range=[{range_min:.1f},{range_max:.1f}]")


async def _send_teams_alert(webhook_url: str, zone_id: str, field: str, value: float, lo: float, hi: float, ts: datetime):
    """Teams Incoming Webhook으로 가이드라인 이탈 알림 전송."""
    label_map = {"xintemp1": "내부 온도", "xinhum1": "습도", "xco2": "CO₂"}
    unit_map  = {"xintemp1": "°C",      "xinhum1": "%",   "xco2": "ppm"}
    label = label_map.get(field, field)
    unit  = unit_map.get(field, "")
    payload = {
        "@type":    "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "FF4136",
        "summary":  f"[스마트팜] {zone_id} {label} 범위 이탈",
        "sections": [{
            "activityTitle": f"⚠️ {zone_id} — {label} 범위 이탈",
            "activityText": (
                f"현재값: **{value:.1f}{unit}**  \n"
                f"허용 범위: {lo:.1f} ~ {hi:.1f}{unit}  \n"
                f"감지 시각: {ts.strftime('%Y-%m-%d %H:%M')} UTC"
            ),
        }],
    }
    try:
        if _httpx:
            async with _httpx.AsyncClient(timeout=10) as client:
                r = await client.post(webhook_url, json=payload)
                print(f"[teams] {zone_id}/{field} → HTTP {r.status_code}")
        else:
            import requests as _req
            _req.post(webhook_url, json=payload, timeout=10)
            print(f"[teams] {zone_id}/{field} → sent (sync fallback)")
    except Exception as e:
        print(f"[teams] 발송 실패: {e}")


async def _check_zone_alert(zone_id: str, zone: dict, row: dict, cfg: dict, now: datetime):
    """단일 구역 알림 체크 + 버퍼 push (asyncio.gather로 병렬 호출)."""
    ctrl_url = zone.get("controllerUrl")
    if not ctrl_url:
        return
    data, _ = await _fetch_url(ctrl_url)
    if not data:
        return
    raw = _extract_raw(data)

    # 양액기 데이터를 버퍼에 merge
    merged = dict(raw)
    nut_url = zone.get("nutrientUrl")
    if nut_url:
        nut_data, _ = await _fetch_url(nut_url)
        if nut_data is not None:
            nut_raw = _extract_raw(nut_data)
            merged.update({k: v for k, v in nut_raw.items() if v not in (None, "")})

    # 버퍼에 현재값 추가 (제어기 + 양액기 merge, 스파크라인 즉시성 개선)
    _push_to_buffer(zone_id, merged)

    def _fval(key):
        v = raw.get(key) or raw.get(key.lower())
        try:
            return float(v) if v not in (None, "") else None
        except (ValueError, TypeError):
            return None

    co2_ref = row["co2"]
    dev     = cfg["co2"].get("deviation_pct", 10) / 100
    webhook = cfg.get("webhookUrl", "")
    checks  = [
        ("xintemp1", _fval("xintemp1"), row["temp_min"], row["temp_max"],             cfg["temp"]),
        ("xinhum1",  _fval("xinhum1"),  row["hum_min"],  row["hum_max"],              cfg["humidity"]),
        ("xco2",     _fval("xco2"),     co2_ref * (1 - dev), co2_ref * (1 + dev),     cfg["co2"]),
    ]
    for field, val, lo, hi, acfg in checks:
        if not acfg.get("enabled", True) or val is None:
            continue
        key   = f"{zone_id}:{field}"
        out   = val < lo or val > hi
        state = _alert_state.get(key, {"out_since": None, "alerted": False})
        if out:
            if state["out_since"] is None:
                _alert_state[key] = {"out_since": now, "alerted": False}
            elif not state["alerted"]:
                elapsed_min = (now - state["out_since"]).total_seconds() / 60
                if elapsed_min >= acfg.get("delay_min", 10):
                    _save_alert(zone_id, field, val, lo, hi, now)
                    _alert_state[key]["alerted"] = True
                    if webhook:
                        await _send_teams_alert(webhook, zone_id, field, val, lo, hi, now)
        else:
            _alert_state[key] = {"out_since": None, "alerted": False}


async def _alert_check_loop():
    """백그라운드: 1분마다 가이드라인 이탈 여부를 체크 + 버퍼 갱신 (전 구역 병렬)."""
    while True:
        await asyncio.sleep(ALERT_INTERVAL_SEC)
        try:
            now   = datetime.utcnow()
            month = str(now.month)
            hour  = now.hour
            gl    = _load_guidelines()
            rows  = gl["data"].get(month, [])
            row   = next((r for r in rows if r["hour"] == hour), None)
            if row is None:
                continue
            cfg    = gl["alert_config"]
            config = _load_zone_config()
            await asyncio.gather(
                *[_check_zone_alert(zid, z, row, cfg, now)
                  for zid, z in config.get("zones", {}).items()],
                return_exceptions=True,
            )
        except Exception as e:
            print(f"[alert_check] 오류: {e}")


# ══════════════════════════════════════════════════════════
# SQLite 데이터 로깅
# ══════════════════════════════════════════════════════════

def _init_db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS kpi_log (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            ts       TEXT NOT NULL,
            zone_id  TEXT NOT NULL,
            field    TEXT NOT NULL,
            value    REAL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ts    ON kpi_log(ts)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_zone  ON kpi_log(zone_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_field ON kpi_log(field)")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            ts        TEXT NOT NULL,
            zone_id   TEXT NOT NULL,
            field     TEXT NOT NULL,
            value     REAL,
            range_min REAL,
            range_max REAL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_alert_ts ON alerts(ts)")
    conn.commit()
    conn.close()


def _extract_raw(data: dict) -> dict:
    """API 응답에서 필드:값 dict 추출."""
    if not isinstance(data, dict):
        return {}
    if data.get("fields") and isinstance(data["fields"], list) and data["fields"]:
        return data["fields"][0]
    if data.get("data") and isinstance(data["data"], list) and data["data"]:
        return data["data"][0]
    return data


async def _log_single_zone(zone_id: str, zone: dict, ts: str, skip: set) -> list:
    """단일 구역 데이터를 비동기로 fetch해 (ts, zone_id, field, value) rows 반환."""
    ctrl_url = zone.get("controllerUrl")
    if not ctrl_url:
        return []
    data, _ = await _fetch_url(ctrl_url)
    if data is None:
        return []
    raw  = _extract_raw(data)
    rows = []
    for k, v in raw.items():
        k_lower = k.strip().lower()
        if k_lower in skip:
            continue
        try:
            val = float(v) if v not in (None, "") else None
            if val is not None:
                rows.append((ts, zone_id, k_lower, val))
        except (ValueError, TypeError):
            pass

    # 양액기 데이터 추가 (nutrientUrl)
    nut_url = zone.get("nutrientUrl")
    if nut_url:
        nut_data, _ = await _fetch_url(nut_url)
        if nut_data is not None:
            nut_raw = _extract_raw(nut_data)
            for k, v in nut_raw.items():
                k_lower = k.strip().lower()
                if k_lower in skip:
                    continue
                try:
                    val = float(v) if v not in (None, "") else None
                    if val is not None:
                        rows.append((ts, zone_id, k_lower, val))
                except (ValueError, TypeError):
                    pass

    return rows


async def _log_zone_data_loop():
    """백그라운드: 5분마다 등록된 구역 제어기 데이터를 SQLite에 저장 (전 구역 병렬)."""
    skip = {"xdatetime", "save_dt"}
    while True:
        try:
            config = _load_zone_config()
            zones  = config.get("zones", {})
            ts     = datetime.utcnow().isoformat(timespec="seconds") + "Z"

            results = await asyncio.gather(
                *[_log_single_zone(zid, z, ts, skip) for zid, z in zones.items()],
                return_exceptions=True,
            )
            rows = [r for batch in results if isinstance(batch, list) for r in batch]

            if rows:
                conn = sqlite3.connect(DB_PATH, timeout=30)
                conn.executemany(
                    "INSERT INTO kpi_log (ts, zone_id, field, value) VALUES (?,?,?,?)",
                    rows,
                )
                conn.commit()
                conn.close()
                print(f"[kpi_log] {ts} — {len(rows)}개 저장")
        except Exception as e:
            print(f"[kpi_log] 오류: {e}")

        await asyncio.sleep(LOG_INTERVAL_SECONDS)


@app.on_event("startup")
async def startup_event():
    _init_db()
    asyncio.create_task(_log_zone_data_loop())
    asyncio.create_task(_alert_check_loop())


# ══════════════════════════════════════════════════════════
# 기본 엔드포인트
# ══════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {"status": "ok", "message": "Smartfarm Zone Proxy Server v3"}


@app.get("/api/status")
def status():
    config = _load_zone_config()
    zones  = list(config.get("zones", {}).keys())
    return {
        "status":      "ok",
        "server_time": datetime.now().isoformat(),
        "zones":       zones,
    }


@app.get("/api/capabilities")
def get_capabilities():
    config    = _load_zone_config()
    zones_cfg = config.get("zones", {})
    available = {
        zid: zdata.get("availableFields", [])
        for zid, zdata in zones_cfg.items()
    }
    return {
        "available": available,
        "zones":     list(zones_cfg.keys()),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


# ══════════════════════════════════════════════════════════
# 대시보드 설정 저장 / 불러오기
# ══════════════════════════════════════════════════════════

@app.get("/api/settings")
def get_settings():
    """대시보드 설정(레이아웃·위젯·배너 슬롯) 반환."""
    return _load_settings()


@app.post("/api/settings")
async def post_settings(request: Request):
    """대시보드 설정 저장 (기존 키와 병합)."""
    body = await request.json()
    _save_settings(body if isinstance(body, dict) else {})
    return {"success": True}


# ══════════════════════════════════════════════════════════
# KPI 로그 조회 / CSV 다운로드
# ══════════════════════════════════════════════════════════

@app.get("/api/logs/fields")
def get_log_fields(zone_id: Optional[str] = None):
    """kpi_log에 실제 저장된 field 목록 반환."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    q, params = "SELECT DISTINCT field FROM kpi_log WHERE 1=1", []
    if zone_id:
        q += " AND zone_id=?"; params.append(zone_id)
    q += " ORDER BY field"
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [r[0] for r in rows]


@app.get("/api/logs")
def get_logs(
    zone_id:  Optional[str] = None,
    field:    Optional[str] = None,
    from_ts:  Optional[str] = None,
    to_ts:    Optional[str] = None,
    limit:    int = 1000,
):
    """KPI 로그 JSON 조회."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    q, params = "SELECT ts, zone_id, field, value FROM kpi_log WHERE 1=1", []
    if zone_id: q += " AND zone_id=?";  params.append(zone_id)
    if field:   q += " AND field=?";    params.append(field)
    if from_ts: q += " AND ts>=?";      params.append(from_ts)
    if to_ts:   q += " AND ts<=?";      params.append(to_ts)
    q += " ORDER BY ts DESC LIMIT ?";   params.append(limit)
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [{"ts": r[0], "zone_id": r[1], "field": r[2], "value": r[3]} for r in rows]


_FIELD_KO = {
    # 환경 센서
    "xintemp1": "내부 온도",        "xinhum1": "내부 습도",        "xco2": "CO2 농도",
    "xinsunvol": "내부 일사량",     "xinsunadd": "누적 일사량",    "xventtemp1": "환기 온도",
    "xheattemp1": "난방 온도",      "xhumlack": "수분부족분",      "xabhum": "절대 습도",
    "xdhum": "이슬점",              "xgndtemp": "지온",            "xwinddirec": "외부 풍향",
    "xwindsp": "외부 풍속",         "xsunvol": "외부 일사량",      "xouttemp": "외부 온도",
    "xsupplytemp1": "난방 공급온도","xreturntemp1": "난방 회수온도","xco2set": "CO2 설정값",
    # 양액
    "now_ec": "급액 EC",            "now_ph": "급액 pH",           "water_con": "함수율",
    "medium_ec": "배지 EC",         "medium_temp": "배지 온도",    "pi_ec": "배액 EC",
    # 창 개도
    "xwinvol1_1": "창1좌 개도",     "xwinvol1_2": "창1우 개도",
    "xwinvol2_1": "창2좌 개도",     "xwinvol2_2": "창2우 개도",
    "xwinvol3_1": "창3좌 개도",     "xwinvol3_2": "창3우 개도",
    "xwinvol4_1": "창4좌 개도",     "xwinvol4_2": "창4우 개도",
    "xwinvol5_1": "창5좌 개도",     "xwinvol5_2": "창5우 개도",
    "xwinvol6_1": "창6좌 개도",     "xwinvol6_2": "창6우 개도",
    # 커튼 개도
    "xcur1vol": "커튼1 개도",       "xcur2vol": "커튼2 개도",      "xcur3vol": "커튼3 개도",
    "xcur4vol": "커튼4 개도",       "xcur5vol": "커튼5 개도",
    # 3Way 밸브
    "x3way1vol": "3Way밸브1 개도",  "x3way2vol": "3Way밸브2 개도",
    # 창 자수동
    "xwin1auto": "창1좌 자수동",    "xwin1auto2": "창1우 자수동",
    "xwin2auto": "창2좌 자수동",    "xwin2auto2": "창2우 자수동",
    "xwin3auto": "창3좌 자수동",    "xwin3auto2": "창3우 자수동",
    "xwin4auto": "창4좌 자수동",    "xwin4auto2": "창4우 자수동",
    "xwin5auto": "창5좌 자수동",    "xwin5auto2": "창5우 자수동",
    "xwin6auto": "창6좌 자수동",    "xwin6auto2": "창6우 자수동",
    # 커튼 자수동
    "xcur1auto": "커튼1 자수동",    "xcur2auto": "커튼2 자수동",   "xcur3auto": "커튼3 자수동",
    "xcur4auto": "커튼4 자수동",    "xcur5auto": "커튼5 자수동",
    # 장치 자수동/작동
    "xco2auto": "CO2 자수동",       "xco2run": "CO2 작동",
    "xlightauto": "보광등 자수동",  "xlightrun": "보광등 작동",
    "xhunauto": "훈증기 자수동",    "xhunrun": "훈증기 작동",
    "xboauto": "보일러 자수동",     "xborun": "보일러 작동",
    "xpumpauto": "순환펌프 자수동", "xpumprun1": "순환펌프1 작동", "xpumprun2": "순환펌프2 작동",
    # 보조기기
    "xass1auto": "보조기기1 자수동","xass1run": "보조기기1 작동",
    "xass2auto": "보조기기2 자수동","xass2run": "보조기기2 작동",
    "xass3auto": "보조기기3 자수동","xass3run": "보조기기3 작동",
    "xass4auto": "보조기기4 자수동","xass4run": "보조기기4 작동",
    "xass5auto": "보조기기5 자수동","xass5run": "보조기기5 작동",
    "xass6auto": "보조기기6 자수동","xass6run": "보조기기6 작동",
    # 냉난방기
    "xheatandcool1auto": "냉난방기1 자수동","xheatandcool1run": "냉난방기1 작동",
    "xheatandcool2auto": "냉난방기2 자수동","xheatandcool2run": "냉난방기2 작동",
    "xheatandcool3auto": "냉난방기3 자수동","xheatandcool3run": "냉난방기3 작동",
    "xheatandcool4auto": "냉난방기4 자수동","xheatandcool4run": "냉난방기4 작동",
    "xheatandcool5auto": "냉난방기5 자수동","xheatandcool5run": "냉난방기5 작동",
}

@app.get("/api/logs/download")
def download_logs(
    zone_id:  Optional[str] = None,
    field:    Optional[str] = None,
    from_ts:  Optional[str] = None,
    to_ts:    Optional[str] = None,
):
    """KPI 로그 CSV 다운로드."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    q, params = "SELECT ts, zone_id, field, value FROM kpi_log WHERE 1=1", []
    if zone_id: q += " AND zone_id=?";  params.append(zone_id)
    if field:   q += " AND field=?";    params.append(field)
    if from_ts: q += " AND ts>=?";      params.append(from_ts)
    if to_ts:   q += " AND ts<=?";      params.append(to_ts)
    q += " ORDER BY ts ASC"
    rows = conn.execute(q, params).fetchall()
    conn.close()

    buf = io.StringIO()
    w   = csv.writer(buf)
    w.writerow(["시각", "구역", "항목", "값"])
    for ts, zid, f, val in rows:
        w.writerow([ts, zid, _FIELD_KO.get(f.lower(), f), val])
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": "attachment; filename=kpi_log.csv"},
    )


# ══════════════════════════════════════════════════════════
# 가이드라인 API
# ══════════════════════════════════════════════════════════

@app.get("/api/guidelines")
def get_guidelines():
    """현재 가이드라인 전체 반환."""
    return _load_guidelines()


@app.post("/api/guidelines")
async def post_guidelines(request: Request):
    """가이드라인 + alert_config 저장."""
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="invalid body")
    current = _load_guidelines()
    if "data" in body:
        current["data"] = body["data"]
    if "alert_config" in body:
        current["alert_config"] = body["alert_config"]
    _save_guidelines(current)
    return {"success": True}


@app.post("/api/guidelines/reset")
def reset_guidelines():
    """DEFAULT_GUIDELINES로 초기화."""
    _save_guidelines({"data": DEFAULT_GUIDELINES, "alert_config": DEFAULT_ALERT_CONFIG})
    return {"success": True}


@app.get("/api/alerts")
def get_alerts(
    zone_id: Optional[str] = None,
    limit:   int = 50,
):
    """가이드라인 이탈 알림 이력 조회."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    q, params = "SELECT ts, zone_id, field, value, range_min, range_max FROM alerts WHERE 1=1", []
    if zone_id:
        q += " AND zone_id=?"; params.append(zone_id)
    q += " ORDER BY ts DESC LIMIT ?"; params.append(limit)
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [
        {"ts": r[0], "zone_id": r[1], "field": r[2], "value": r[3], "range_min": r[4], "range_max": r[5]}
        for r in rows
    ]


# ══════════════════════════════════════════════════════════
# 구역별 데이터 프록시
# ══════════════════════════════════════════════════════════

@app.get("/api/zone/{zone_id}/controller")
async def zone_controller(zone_id: str):
    config   = _load_zone_config()
    zone     = config.get("zones", {}).get(zone_id, {})
    ctrl_url = zone.get("controllerUrl")
    if not ctrl_url:
        raise HTTPException(status_code=404, detail=f"구역 '{zone_id}'의 제어기 URL이 등록되지 않았습니다.")
    data, err = await _fetch_url(ctrl_url)
    if data is not None:
        return data
    return {"error": f"제어기 연결 실패: {err}", "zone_id": zone_id}


@app.get("/api/zone/{zone_id}/nutrient")
async def zone_nutrient(zone_id: str):
    config  = _load_zone_config()
    zone    = config.get("zones", {}).get(zone_id, {})
    nut_url = zone.get("nutrientUrl")
    if not nut_url:
        return {"fields": []}
    data, err = await _fetch_url(nut_url, timeout=4)   # 클라이언트 5s abort보다 짧게
    if data is not None:
        if isinstance(data, dict) and "fields" in data:
            return data
        raw = _extract_raw(data)
        return {"fields": [raw] if raw else [{}]}
    return {"fields": [], "error": f"양액기 연결 실패: {err}", "zone_id": zone_id}


@app.get("/api/zone/{zone_id}/recent")
def zone_recent(zone_id: str, field: Optional[str] = None, limit: int = BUFFER_MINUTES):
    """인메모리 버퍼에서 최근 N분 데이터 즉시 반환 (SQLite 조회 없음).
    field 지정 시 해당 필드만 [{ts, value}] 형태로, 미지정 시 전체 반환.
    """
    buf = list(_zone_buffer.get(zone_id, deque()))[-limit:]
    if field:
        f = field.lower()
        return [{"ts": d["ts"], "value": d["fields"].get(f)}
                for d in buf if d["fields"].get(f) is not None]
    return buf


# ══════════════════════════════════════════════════════════
# 어드민: 구역 설정 CRUD
# ══════════════════════════════════════════════════════════

class ZoneTestRequest(BaseModel):
    controllerUrl: str
    nutrientUrl:   Optional[str] = None


class ZoneConfigRequest(BaseModel):
    zoneId:          str
    name:            str
    controllerUrl:   Optional[str]       = None
    nutrientUrl:     Optional[str]       = None
    availableFields: Optional[List[str]] = None


@app.post("/api/admin/zone/test")
async def admin_zone_test(req: ZoneTestRequest):
    result = {"controller": None, "nutrient": None}
    skip   = {"save_dt", "xdatetime"}

    # nocache=True: 테스트는 항상 신선한 데이터 확인
    data, err = await _fetch_url(req.controllerUrl, nocache=True)
    if data is not None:
        available = _extract_fields(data, skip)
        result["controller"] = {"success": True, "fieldCount": len(available), "fields": available}
    else:
        result["controller"] = {"success": False, "error": err}

    if req.nutrientUrl:
        data, err = await _fetch_url(req.nutrientUrl, nocache=True)
        if data is not None:
            available = _extract_fields(data, skip)
            result["nutrient"] = {"success": True, "fieldCount": len(available), "fields": available}
        else:
            result["nutrient"] = {"success": False, "error": err}

    return result


@app.get("/api/admin/zones")
def admin_get_zones():
    return _load_zone_config()


@app.post("/api/admin/zone")
def admin_save_zone(zone: ZoneConfigRequest):
    config = _load_zone_config()
    config.setdefault("zones", {})[zone.zoneId] = {
        "name":            zone.name,
        "controllerUrl":   zone.controllerUrl,
        "nutrientUrl":     zone.nutrientUrl,
        "availableFields": zone.availableFields or [],
    }
    _save_zone_config(config)
    return {"success": True, "zoneId": zone.zoneId}


@app.post("/api/admin/zone/{zone_id}/rediscover")
async def admin_zone_rediscover(zone_id: str):
    """구역의 제어기+양액기 API를 재호출해 availableFields를 갱신한다."""
    config = _load_zone_config()
    zone   = config.get("zones", {}).get(zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="zone not found")
    ctrl_url = zone.get("controllerUrl")
    nut_url  = zone.get("nutrientUrl")
    if not ctrl_url:
        raise HTTPException(status_code=400, detail="no controllerUrl configured")
    skip = {"save_dt", "xdatetime"}
    all_fields: list = []
    data, _ = await _fetch_url(ctrl_url, nocache=True)
    if data:
        all_fields += _extract_fields(data, skip)
    if nut_url:
        data, _ = await _fetch_url(nut_url, nocache=True)
        if data:
            all_fields += _extract_fields(data, skip)
    fields = list(dict.fromkeys(all_fields))   # 중복 제거, 순서 유지
    config["zones"][zone_id]["availableFields"] = fields
    _save_zone_config(config)
    return {"success": True, "fields": fields}


@app.delete("/api/admin/zone/{zone_id}")
def admin_delete_zone(zone_id: str):
    config = _load_zone_config()
    zones  = config.get("zones", {})
    if zone_id in zones:
        del zones[zone_id]
        _save_zone_config(config)
    return {"success": True}


# ══════════════════════════════════════════════════════════
# 실행 진입점
# ══════════════════════════════════════════════════════════

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")

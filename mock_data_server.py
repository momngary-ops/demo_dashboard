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
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from fastapi import Request

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
    import requests as _requests
except ImportError:
    _requests = None


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
DB_PATH              = Path(__file__).parent / "data_log.db"
LOG_INTERVAL_SECONDS = 300   # 5분


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


def _fetch_real_url(url: str, timeout: int = 10):
    if _requests is None:
        return None, "requests 패키지가 설치되지 않았습니다."
    try:
        resp = _requests.get(url, timeout=timeout, verify=False)
        resp.raise_for_status()
        return resp.json(), None
    except Exception as e:
        return None, str(e)


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
# SQLite 데이터 로깅
# ══════════════════════════════════════════════════════════

def _init_db():
    conn = sqlite3.connect(DB_PATH)
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


async def _log_zone_data_loop():
    """백그라운드: 5분마다 등록된 구역 제어기 데이터를 SQLite에 저장."""
    skip = {"xdatetime", "save_dt"}
    while True:
        try:
            config = _load_zone_config()
            zones  = config.get("zones", {})
            ts     = datetime.utcnow().isoformat(timespec="seconds") + "Z"
            rows   = []

            for zone_id, zone in zones.items():
                ctrl_url = zone.get("controllerUrl")
                if not ctrl_url:
                    continue
                data, err = _fetch_real_url(ctrl_url)
                if data is None:
                    continue
                raw = _extract_raw(data)
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

            if rows:
                conn = sqlite3.connect(DB_PATH)
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

@app.get("/api/logs")
def get_logs(
    zone_id:  Optional[str] = None,
    field:    Optional[str] = None,
    from_ts:  Optional[str] = None,
    to_ts:    Optional[str] = None,
    limit:    int = 1000,
):
    """KPI 로그 JSON 조회."""
    conn = sqlite3.connect(DB_PATH)
    q, params = "SELECT ts, zone_id, field, value FROM kpi_log WHERE 1=1", []
    if zone_id: q += " AND zone_id=?";  params.append(zone_id)
    if field:   q += " AND field=?";    params.append(field)
    if from_ts: q += " AND ts>=?";      params.append(from_ts)
    if to_ts:   q += " AND ts<=?";      params.append(to_ts)
    q += " ORDER BY ts DESC LIMIT ?";   params.append(limit)
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [{"ts": r[0], "zone_id": r[1], "field": r[2], "value": r[3]} for r in rows]


@app.get("/api/logs/download")
def download_logs(
    zone_id:  Optional[str] = None,
    field:    Optional[str] = None,
    from_ts:  Optional[str] = None,
    to_ts:    Optional[str] = None,
):
    """KPI 로그 CSV 다운로드."""
    conn = sqlite3.connect(DB_PATH)
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
    w.writerow(["ts", "zone_id", "field", "value"])
    w.writerows(rows)
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=kpi_log.csv"},
    )


# ══════════════════════════════════════════════════════════
# 구역별 데이터 프록시
# ══════════════════════════════════════════════════════════

@app.get("/api/zone/{zone_id}/controller")
def zone_controller(zone_id: str):
    config   = _load_zone_config()
    zone     = config.get("zones", {}).get(zone_id, {})
    ctrl_url = zone.get("controllerUrl")
    if not ctrl_url:
        raise HTTPException(status_code=404, detail=f"구역 '{zone_id}'의 제어기 URL이 등록되지 않았습니다.")
    data, err = _fetch_real_url(ctrl_url)
    if data is not None:
        return data
    return {"error": f"제어기 연결 실패: {err}", "zone_id": zone_id}


@app.get("/api/zone/{zone_id}/nutrient")
def zone_nutrient(zone_id: str):
    config  = _load_zone_config()
    zone    = config.get("zones", {}).get(zone_id, {})
    nut_url = zone.get("nutrientUrl")
    if not nut_url:
        return {"fields": []}
    data, err = _fetch_real_url(nut_url)
    if data is not None:
        if isinstance(data, dict) and "fields" in data:
            return data
        skip = {"xdatetime", "save_dt"}
        raw  = _extract_raw(data)
        return {"fields": [raw] if raw else [{}]}
    return {"fields": [], "error": f"양액기 연결 실패: {err}", "zone_id": zone_id}


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
def admin_zone_test(req: ZoneTestRequest):
    result = {"controller": None, "nutrient": None}
    skip   = {"save_dt", "xdatetime"}

    data, err = _fetch_real_url(req.controllerUrl)
    if data is not None:
        available = _extract_fields(data, skip)
        result["controller"] = {"success": True, "fieldCount": len(available), "fields": available}
    else:
        result["controller"] = {"success": False, "error": err}

    if req.nutrientUrl:
        data, err = _fetch_real_url(req.nutrientUrl)
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

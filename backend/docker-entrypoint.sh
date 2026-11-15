#!/usr/bin/env bash
set -e

echo "[entrypoint] waiting for database…"
python - <<'PY'
import time, sys
from sqlalchemy import create_engine, text
from app.core.config import settings
url = settings.resolved_database_url
for i in range(30):
    try:
        create_engine(url).connect().execute(text("SELECT 1"))
        print("[entrypoint] database is up")
        sys.exit(0)
    except Exception as e:
        print(f"[entrypoint] db not ready ({i}): {e}")
        time.sleep(2)
sys.exit("database never became ready")
PY

echo "[entrypoint] running migrations…"
alembic upgrade head

echo "[entrypoint] checking whether to seed demo data…"
python - <<'PY'
from app.core.config import settings
from app.db.base import SessionLocal
from app.models.core import Fund
if not settings.should_seed_demo:
    reason = "SEED_DEMO_DATA=false" if settings.seed_demo_data is False else "ENVIRONMENT=production"
    print(f"[entrypoint] {reason}: skipping demo seed; the workspace starts empty")
else:
    db = SessionLocal()
    try:
        if db.query(Fund).count() == 0:
            from app.seed.seed import run_seed
            print("[entrypoint] seeding…", run_seed(force=True))
        else:
            print("[entrypoint] data already present, skipping seed")
    finally:
        db.close()
PY

echo "[entrypoint] starting: $*"
exec "$@"

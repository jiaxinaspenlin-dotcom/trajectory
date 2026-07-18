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

echo "[entrypoint] seeding demo data if empty…"
python - <<'PY'
from app.db.base import SessionLocal
from app.models.core import Fund
db = SessionLocal()
if db.query(Fund).count() == 0:
    from app.seed.seed import run_seed
    print("[entrypoint] seeding…", run_seed())
else:
    print("[entrypoint] data already present, skipping seed")
db.close()
PY

echo "[entrypoint] starting: $*"
exec "$@"

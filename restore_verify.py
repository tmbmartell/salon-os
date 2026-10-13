#!/usr/bin/env python3
import gzip, sqlite3, shutil, tempfile, json, sys
from pathlib import Path
from datetime import datetime, timezone

ROOT=Path("/srv/margot/salon-os")
BACKUPS=ROOT/"backups"
STATUS=ROOT/"data/restore-verify.json"

def main():
    files=sorted(BACKUPS.glob("salon-*.sqlite.gz"),key=lambda p:p.stat().st_mtime,reverse=True)
    if not files:
        raise RuntimeError("no_backup_found")
    src=files[0]
    with tempfile.NamedTemporaryFile(prefix="salon-restore-",suffix=".sqlite",delete=False) as f:
        tmp=Path(f.name)
    try:
        with gzip.open(src,"rb") as gz,open(tmp,"wb") as out:
            shutil.copyfileobj(gz,out)
        db=sqlite3.connect(tmp)
        integrity=db.execute("pragma integrity_check").fetchone()[0]
        tables={r[0] for r in db.execute("select name from sqlite_master where type='table'")}
        required={"tenants","users","clients","appointments","financial_entries","products","audit_log"}
        missing=sorted(required-tables)
        counts={}
        for t in ["clients","appointments","checkout_records","financial_entries","products","agent_tasks"]:
            counts[t]=db.execute(f"select count(*) from {t}").fetchone()[0] if t in tables else None
        db.close()
        ok=integrity=="ok" and not missing
        data={"ok":ok,"checked_at":datetime.now(timezone.utc).isoformat(),"backup":src.name,"integrity":integrity,"missing_tables":missing,"counts":counts}
        STATUS.write_text(json.dumps(data,ensure_ascii=False,indent=2))
        print(json.dumps(data,ensure_ascii=False))
        if not ok: raise RuntimeError("restore_verification_failed")
    finally:
        tmp.unlink(missing_ok=True)

if __name__=="__main__":
    try: main()
    except Exception as e:
        data={"ok":False,"checked_at":datetime.now(timezone.utc).isoformat(),"error":f"{type(e).__name__}: {e}"}
        STATUS.write_text(json.dumps(data,ensure_ascii=False,indent=2))
        print(json.dumps(data),file=sys.stderr)
        raise

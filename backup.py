#!/usr/bin/env python3
import sqlite3, gzip, shutil, os, sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT=Path("/srv/margot/salon-os")
DB=ROOT/"data/salon.sqlite"
OUT=ROOT/"backups"
KEEP_DAYS=30

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    ts=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    tmp=OUT/f".salon-{ts}.sqlite"
    final=OUT/f"salon-{ts}.sqlite.gz"

    src=sqlite3.connect(f"file:{DB}?mode=ro",uri=True,timeout=10)
    dst=sqlite3.connect(tmp)
    try:
        src.backup(dst)
        check=dst.execute("pragma integrity_check").fetchone()[0]
        if check!="ok":
            raise RuntimeError(f"integrity_check={check}")
        dst.commit()
    finally:
        dst.close();src.close()

    with open(tmp,"rb") as fsrc,gzip.open(final,"wb",compresslevel=6) as fdst:
        shutil.copyfileobj(fsrc,fdst)
    tmp.unlink(missing_ok=True)
    os.chmod(final,0o600)

    cutoff=datetime.now(timezone.utc)-timedelta(days=KEEP_DAYS)
    removed=0
    for p in OUT.glob("salon-*.sqlite.gz"):
        try:
            if datetime.fromtimestamp(p.stat().st_mtime,timezone.utc)<cutoff:
                p.unlink();removed+=1
        except FileNotFoundError:
            pass
    print(f"backup_ok path={final} bytes={final.stat().st_size} removed={removed}")

if __name__=="__main__":
    try: main()
    except Exception as e:
        print(f"backup_failed {type(e).__name__}: {e}",file=sys.stderr)
        raise

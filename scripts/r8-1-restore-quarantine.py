#!/usr/bin/env python3
"""R8.1 — restaura agendamentos movidos para a quarentena pela limpeza.

Uso:
  python3 scripts/r8-1-restore-quarantine.py --db data/estetica.sqlite --table appointments_quarantine_20261103T000000Z
"""
import argparse, json, sqlite3, sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--table", required=True)
    args = ap.parse_args()
    if not args.table.startswith("appointments_quarantine_"):
        sys.exit("tabela inválida")

    con = sqlite3.connect(args.db)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    found = cur.execute("select name from sqlite_master where type='table' and name=?", (args.table,)).fetchone()
    if not found:
        sys.exit("tabela de quarentena não encontrada")

    rows = cur.execute(f"select * from {args.table}").fetchall()
    if not rows:
        print("nada a restaurar")
        return
    restored = 0
    try:
        cur.execute("begin immediate")
        for r in rows:
            appt = json.loads(r["payload"])
            items = json.loads(r["items"])
            if cur.execute("select 1 from appointments where id=?", (appt["id"],)).fetchone():
                continue
            cols = ",".join(appt.keys())
            marks = ",".join("?" for _ in appt)
            cur.execute(f"insert into appointments({cols}) values({marks})", list(appt.values()))
            for it in items:
                icols = ",".join(it.keys())
                imarks = ",".join("?" for _ in it)
                cur.execute(f"insert into appointment_items({icols}) values({imarks})", list(it.values()))
            restored += 1
        cur.execute("commit")
    except Exception as exc:  # noqa: BLE001
        cur.execute("rollback")
        sys.exit("falhou, nada restaurado: %s" % exc)
    print(f"restaurados {restored} de {len(rows)} registros de {args.table}")


if __name__ == "__main__":
    main()

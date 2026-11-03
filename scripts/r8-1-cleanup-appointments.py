#!/usr/bin/env python3
"""R8.1 — limpeza reversível de agendamentos de teste (dry-run por padrão).

Regras:
- Só remove agendamento classificado como "registro de teste" no relatório da auditoria.
- Nunca remove registro com checkout, comissão, movimento de estoque ou ficha técnica.
- Antes de apagar, copia a linha inteira (e os itens) para
  `appointments_quarantine_<timestamp>`; a restauração é feita a partir dessa tabela.
- Trabalha em transação única: ou tudo é movido, ou nada muda.

Uso:
  python3 scripts/r8-1-cleanup-appointments.py --db data/estetica.sqlite \
      --report /tmp/r8-1/agendamentos-inconsistentes.json            # dry-run
  ... --apply --confirm "AUTORIZADO PELA PROPRIETARIA"               # executa
"""
import argparse, json, os, sqlite3, sys
from datetime import datetime, timezone

CONFIRM_PHRASE = "AUTORIZADO PELA PROPRIETARIA"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--report", required=True, help="JSON gerado por r8-1-audit-appointments.py")
    ap.add_argument("--ids", default="", help="lista de IDs separada por vírgula (opcional)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--confirm", default="")
    args = ap.parse_args()

    data = json.load(open(args.report))
    findings = {f["id"]: f for f in data.get("achados", [])}
    wanted = [x.strip() for x in args.ids.split(",") if x.strip()] or [
        f["id"] for f in findings.values() if f.get("seguro_para_remover")
    ]

    con = sqlite3.connect(args.db)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    selected, blocked = [], []
    for aid in wanted:
        f = findings.get(aid)
        row = cur.execute("select * from appointments where id=?", (aid,)).fetchone()
        if not row:
            blocked.append((aid, "não existe"))
            continue
        if not f or not f.get("seguro_para_remover"):
            blocked.append((aid, "não classificado como seguro (teste sem vínculo)"))
            continue
        links = cur.execute("""
          select (select count(*) from checkout_records where appointment_id=?),
                 (select count(*) from commissions where appointment_id=?),
                 (select count(*) from stock_movements where appointment_id=?),
                 (select count(*) from technical_records where appointment_id=?)
        """, (aid, aid, aid, aid)).fetchone()
        if sum(links):
            blocked.append((aid, "possui vínculo: %s" % dict(zip(
                ["checkouts", "comissoes", "estoque", "fichas"], links))))
            continue
        selected.append((aid, row))

    print(f"selecionados: {len(selected)} | bloqueados: {len(blocked)}")
    for aid, reason in blocked:
        print(f"  BLOQUEADO {aid[:8]}: {reason}")
    for aid, row in selected:
        print(f"  OK {aid[:8]} {row['start_at']} status={row['status']} source={row['source']}")

    if not args.apply:
        print("\nDRY-RUN: nada foi alterado. Use --apply --confirm \"%s\" após autorização." % CONFIRM_PHRASE)
        return
    if args.confirm != CONFIRM_PHRASE:
        sys.exit("confirmação ausente/errada; nada foi alterado")
    if not selected:
        sys.exit("nada a remover")

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    qtable = f"appointments_quarantine_{ts}"
    try:
        cur.execute("begin immediate")
        cur.execute(f"""create table {qtable}(
          id text primary key, payload text not null, items text not null,
          reason text not null, removed_at text not null)""")
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        for aid, row in selected:
            items = [dict(x) for x in cur.execute(
                "select * from appointment_items where appointment_id=?", (aid,)).fetchall()]
            cur.execute(f"insert into {qtable}(id,payload,items,reason,removed_at) values(?,?,?,?,?)",
                        (aid, json.dumps(dict(row), ensure_ascii=False, default=str),
                         json.dumps(items, ensure_ascii=False, default=str),
                         "agendamento de teste sem vínculo (R8.1)", now))
            cur.execute("delete from appointment_items where appointment_id=?", (aid,))
            cur.execute("delete from appointments where id=?", (aid,))
        cur.execute("commit")
    except Exception as exc:  # noqa: BLE001
        cur.execute("rollback")
        sys.exit("falhou, nada foi alterado: %s" % exc)

    with open(os.path.join(os.path.dirname(args.report), f"quarentena-{ts}.json"), "w") as fh:
        json.dump({"tabela": qtable, "ids": [a for a, _ in selected]}, fh, indent=1)
    print(f"removidos {len(selected)}; backup em {qtable}; para restaurar use scripts/r8-1-restore-quarantine.py")


if __name__ == "__main__":
    main()

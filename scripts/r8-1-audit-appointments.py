#!/usr/bin/env python3
"""R8.1 — auditoria somente-leitura de agendamentos potencialmente inconsistentes.

Não altera nada: abre o SQLite em modo read-only e escreve um relatório
(markdown + JSON) com ID, data local, situação, motivo e vínculos.

Uso:
  python3 scripts/r8-1-audit-appointments.py --db data/estetica.sqlite --out /tmp/r8-1
"""
import argparse, json, os, sqlite3, sys
from datetime import datetime, timezone, timedelta

TZ = "America/Porto_Velho"  # UTC-4, sem horário de verão desde 2019
OFFSET = timedelta(hours=-4)


def local(iso):
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt.astimezone(timezone(OFFSET))


def stamp(iso):
    d = local(iso)
    return d.strftime("%d/%m/%Y %H:%M") if d else (iso or "")


def minutes(iso):
    d = local(iso)
    return d.hour * 60 + d.minute if d else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    if not os.path.exists(args.db):
        sys.exit("banco não encontrado: " + args.db)
    con = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    c = con.cursor()

    now = datetime.now(timezone.utc)
    rows = c.execute("""
      select a.id, a.tenant_id, a.client_id, a.professional_id, a.service_id,
             a.start_at, a.end_at, a.status, a.source, a.created_at,
             c.name client_name, c.tags client_tags,
             p.name professional_name, p.work_start, p.work_end,
             s.name service_name,
             (select count(*) from appointment_items ai where ai.appointment_id=a.id) item_count,
             (select count(*) from checkout_records cr where cr.appointment_id=a.id) checkout_count,
             (select count(*) from commissions cm where cm.appointment_id=a.id) commission_count,
             (select count(*) from stock_movements sm where sm.appointment_id=a.id) stock_count,
             (select count(*) from technical_records tr where tr.appointment_id=a.id) technical_count
      from appointments a
      left join clients c on c.id=a.client_id
      left join professionals p on p.id=a.professional_id
      left join services s on s.id=a.service_id
      order by a.start_at
    """).fetchall()

    findings = []
    for r in rows:
        reasons = []
        start = local(r["start_at"])
        end = local(r["end_at"])
        if not start:
            reasons.append("data inválida")
        else:
            if r["status"] in ("scheduled", "confirmed", "arrived") and start < now.astimezone(timezone(OFFSET)):
                reasons.append("no passado e ainda ativo")
            off = c.execute("""
              select id, type, start_date, end_date from staff_time_off
              where tenant_id=? and professional_id=? and status='approved'
                and date(?) between date(start_date) and date(end_date) limit 1
            """, (r["tenant_id"], r["professional_id"], start.strftime("%Y-%m-%d"))).fetchone()
            if off:
                reasons.append("em folga/afastamento aprovado")
            ws, we = r["work_start"] or "09:00", r["work_end"] or "18:00"
            try:
                wsm = int(ws[:2]) * 60 + int(ws[3:5])
                wem = int(we[:2]) * 60 + int(we[3:5])
                sm = start.hour * 60 + start.minute
                if end is None:
                    reasons.append("fim inválido")
                em = end.hour * 60 + end.minute if end else sm
                if end is not None and (start.date() != end.date() or sm < wsm or em > wem):
                    reasons.append(f"fora da jornada cadastrada ({ws}–{we})")
            except (TypeError, ValueError):
                pass
            # Padrão do bug antigo de fuso: hora local redonda e cedo demais (06:00–07:59).
            if 6 <= start.hour < 8:
                reasons.append("provável conversão antiga de fuso (madrugada local)")
        if r["item_count"] == 0:
            reasons.append("sem itens de atendimento")
        tags = (r["client_tags"] or "").lower()
        name = (r["client_name"] or "").lower()
        is_test = ("qa" in name or "teste" in name or "teste" in tags or "qa" in tags
                   or r["source"] in ("seed", "qa-test"))
        links = {
            "checkouts": r["checkout_count"],
            "comissoes": r["commission_count"],
            "movimentos_estoque": r["stock_count"],
            "fichas_tecnicas": r["technical_count"],
        }
        if not reasons:
            continue
        findings.append({
            "id": r["id"],
            "inicio_local": stamp(r["start_at"]),
            "fim_local": stamp(r["end_at"]),
            "status": r["status"],
            "profissional": r["professional_name"],
            "servico": r["service_name"],
            "cliente_ref": (r["client_id"] or "")[:8],
            "classificacao": "registro de teste" if is_test else "histórico legítimo (revisar)",
            "motivos": reasons,
            "vinculos": links,
            "seguro_para_remover": (is_test and sum(links.values()) == 0),
        })

    resumo = {
        "gerado_em": now.isoformat(timespec="seconds"),
        "fuso": TZ,
        "total_agendamentos": len(rows),
        "total_com_inconsistencia": len(findings),
        "seguros_para_remover": sum(1 for f in findings if f["seguro_para_remover"]),
        "com_vinculo_financeiro": sum(1 for f in findings if f["vinculos"]["checkouts"] or f["vinculos"]["comissoes"]),
    }

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "agendamentos-inconsistentes.json"), "w") as fh:
        json.dump({"resumo": resumo, "achados": findings}, fh, ensure_ascii=False, indent=1)

    lines = [
        "# R8.1 — auditoria de agendamentos inconsistentes",
        "",
        f"Gerado em {resumo['gerado_em']} (fuso de exibição {TZ}). Somente leitura: nada foi alterado.",
        "",
        f"- Agendamentos analisados: **{resumo['total_agendamentos']}**",
        f"- Com alguma inconsistência: **{resumo['total_com_inconsistencia']}**",
        f"- Seguros para remoção (teste e sem vínculo): **{resumo['seguros_para_remover']}**",
        f"- Com vínculo financeiro (não remover sem análise): **{resumo['com_vinculo_financeiro']}**",
        "",
        "| ID | Início local | Status | Profissional | Classificação | Motivos | Vínculos |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for f in findings:
        v = f["vinculos"]
        links = ", ".join(f"{k}={n}" for k, n in v.items() if n) or "nenhum"
        lines.append("| `{id}` | {inicio} | {status} | {prof} | {cls} | {motivos} | {links} |".format(
            id=f["id"][:8], inicio=f["inicio_local"], status=f["status"],
            prof=f["profissional"] or "—", cls=f["classificacao"],
            motivos="; ".join(f["motivos"]), links=links))
    lines += ["", "Nenhum registro foi apagado ou corrigido. A limpeza exige autorização da proprietária.", ""]
    with open(os.path.join(args.out, "agendamentos-inconsistentes.md"), "w") as fh:
        fh.write("\n".join(lines))

    print(json.dumps(resumo, ensure_ascii=False, indent=1))
    print("relatórios em", args.out)


if __name__ == "__main__":
    main()

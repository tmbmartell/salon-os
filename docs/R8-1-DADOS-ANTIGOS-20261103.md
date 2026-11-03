# R8.1 — auditoria de agendamentos inconsistentes (produção, somente leitura)

Executado com `scripts/r8-1-audit-appointments.py` apontando para o banco de produção em modo
`mode=ro`. Nenhum registro foi alterado. A limpeza é feita por
`scripts/r8-1-cleanup-appointments.py` (dry-run por padrão, quarentena reversível) e **só pode
rodar com autorização explícita da proprietária**.

## Como ler a classificação
- **registro de teste**: cliente com marca QA/Teste (dados fictícios do piloto).
- **histórico legítimo (revisar)**: cliente real; não remover sem conferência.
- **seguro para remoção**: teste + sem checkout, comissão, movimento de estoque ou ficha técnica.


Gerado em 2026-11-03T17:05:16+00:00 (fuso de exibição America/Porto_Velho). Somente leitura: nada foi alterado.

- Agendamentos analisados: **15**
- Com alguma inconsistência: **10**
- Seguros para remoção (teste e sem vínculo): **6**
- Com vínculo financeiro (não remover sem análise): **2**

| ID | Início local | Status | Profissional | Classificação | Motivos | Vínculos |
| --- | --- | --- | --- | --- | --- | --- |
| `a50a14f7` | 01/10/2026 06:00 | scheduled | Camila Profissional QA | registro de teste | no passado e ainda ativo; fora da jornada cadastrada (09:00–18:00); provável conversão antiga de fuso (madrugada local) | nenhum |
| `59d1d3ab` | 01/10/2026 06:00 | scheduled | Dra. Camila Rocha (Teste) | registro de teste | no passado e ainda ativo; fora da jornada cadastrada (09:00–18:00); provável conversão antiga de fuso (madrugada local) | nenhum |
| `95026a00` | 20/10/2026 06:00 | in_service | Dra. Camila Rocha (Teste) | registro de teste | fora da jornada cadastrada (09:00–18:00); provável conversão antiga de fuso (madrugada local) | fichas_tecnicas=1 |
| `6b148b76` | 28/10/2026 12:00 | scheduled | Dra. Camila Rocha (Teste) | histórico legítimo (revisar) | no passado e ainda ativo | nenhum |
| `0a723a09` | 03/11/2026 08:00 | completed | Camila Profissional QA | registro de teste | fora da jornada cadastrada (09:00–18:00) | checkouts=1, comissoes=1, movimentos_estoque=1 |
| `4372b012` | 03/11/2026 18:00 | completed | Camila Profissional QA | registro de teste | fora da jornada cadastrada (09:00–18:00) | checkouts=1, comissoes=1, movimentos_estoque=1 |
| `b8a65bdd` | 03/11/2026 19:00 | scheduled | Dra. Camila Rocha (Teste) | registro de teste | fora da jornada cadastrada (09:00–18:00) | nenhum |
| `dd5ba54b` | 04/11/2026 06:00 | scheduled | Camila Profissional QA | registro de teste | fora da jornada cadastrada (09:00–18:00); provável conversão antiga de fuso (madrugada local) | nenhum |
| `3270900e` | 05/11/2026 06:00 | scheduled | Dra. Camila Rocha (Teste) | registro de teste | fora da jornada cadastrada (09:00–18:00); provável conversão antiga de fuso (madrugada local) | nenhum |
| `714eafb9` | 05/11/2026 10:00 | scheduled | Camila Profissional QA | registro de teste | em folga/afastamento aprovado | nenhum |

## Procedimento de limpeza (não executado)

```bash
# 1) gerar o relatório atualizado (somente leitura)
python3 scripts/r8-1-audit-appointments.py \
  --db /srv/margot/novagente-estetica-whatsapp-pilot/data/estetica.sqlite --out /tmp/r8-1

# 2) dry-run: mostra o que sairia
python3 scripts/r8-1-cleanup-appointments.py \
  --db /srv/margot/novagente-estetica-whatsapp-pilot/data/estetica.sqlite \
  --report /tmp/r8-1/agendamentos-inconsistentes.json

# 3) execução (somente após autorização) — move para quarentena antes de apagar
python3 scripts/r8-1-cleanup-appointments.py ... --apply --confirm "AUTORIZADO PELA PROPRIETARIA"

# 4) reverter, se necessário
python3 scripts/r8-1-restore-quarantine.py --db ... --table appointments_quarantine_<timestamp>
```

O script recusa qualquer registro com vínculo financeiro, de estoque ou ficha técnica. A remoção
move a linha inteira e os itens para `appointments_quarantine_<timestamp>` dentro da mesma
transação; a restauração usa essa tabela.

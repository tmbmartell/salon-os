// NOVAGENTE Estética — indicadores auditáveis do Olho do Dono.
// A fonte de "Entradas" e "Saídas" é financial_entries status=paid;
// checkout_records é contado separadamente, sem somá-lo às entradas.
const DAY=86400000;
const one=(db,q,a=[])=>db.prepare(q).get(...a);
const all=(db,q,a=[])=>db.prepare(q).all(...a);
const formatters=new Map();
function localDate(value,timeZone){
  let fmt=formatters.get(timeZone);
  if(!fmt){fmt=new Intl.DateTimeFormat("en-GB",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"});formatters.set(timeZone,fmt)}
  const parts=Object.fromEntries(fmt.formatToParts(new Date(value)).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return parts.year+"-"+parts.month+"-"+parts.day;
}
function dayShift(dateKey,offset){
  const day=new Date(dateKey+"T12:00:00Z");
  day.setUTCDate(day.getUTCDate()+offset);
  return day.toISOString().slice(0,10);
}
const round=n=>Math.round(Number(n)*100)/100;
const pct=(current,previous)=>previous>0?round((current-previous)*100/previous):null;
export function makeOwnerEyeSnapshot(db,tenant,{now=new Date()}={}){
  const asOf=new Date(now);
  if(Number.isNaN(asOf.valueOf()))throw new Error("invalid_clock");
  const stored=one(db,"select timezone from tenants where id=?",[tenant])?.timezone||"America/Porto_Velho";
  let timezone=stored;
  try{new Intl.DateTimeFormat("pt-BR",{timeZone:timezone})}catch{timezone="America/Porto_Velho"}
  const today=localDate(asOf,timezone);
  const from=dayShift(today,-29),previousFrom=dayShift(today,-59),previousTo=dayShift(today,-30);
  const nowISO=asOf.toISOString(),lowerUTC=new Date(asOf.getTime()-62*DAY).toISOString();
  const financial=all(db,`select kind,amount_cents,paid_at from financial_entries
    where tenant_id=? and status='paid' and paid_at>=? and paid_at<=? and kind in ('income','expense')`,[tenant,lowerUTC,nowISO]);
  const income={current:0,previous:0},expense={current:0,previous:0},daily=new Map();
  for(const row of financial){
    if(!row.paid_at)continue;
    const date=localDate(row.paid_at,timezone);
    const bucket=date>=from&&date<=today?"current":date>=previousFrom&&date<=previousTo?"previous":null;
    if(!bucket)continue;
    const money=Number(row.amount_cents||0);
    if(!Number.isSafeInteger(money)||money<0)continue;
    const target=row.kind==="income"?income:expense;
    target[bucket]+=money;
    if(bucket==="current"&&date>=dayShift(today,-13)){
      const item=daily.get(date)||{date,income:0,expense:0};
      item[row.kind]+=money;daily.set(date,item);
    }
  }
  const revenue=round(income.current/100),spent=round(expense.current/100);
  const cashNet=round((income.current-expense.current)/100);
  const trend14=Array.from({length:14},(_,i)=>{
    const date=dayShift(today,i-13),row=daily.get(date)||{income:0,expense:0};
    return {date,income:round(row.income/100),expense:round(row.expense/100)};
  });
  const checkouts=all(db,`select cr.created_at,cr.total_cents,a.client_id,a.professional_id,a.service_id,
      p.name professional_name,s.name service_name from checkout_records cr
    join appointments a on a.id=cr.appointment_id and a.tenant_id=cr.tenant_id
    left join professionals p on p.id=a.professional_id and p.tenant_id=cr.tenant_id
    left join services s on s.id=a.service_id and s.tenant_id=cr.tenant_id
    where cr.tenant_id=? and cr.created_at>=? and cr.created_at<=?`,[tenant,lowerUTC,nowISO]);
  const recentCheckouts=checkouts.filter(x=>localDate(x.created_at,timezone)>=from);
  const volumes=recentCheckouts.reduce((total,x)=>total+Number(x.total_cents||0),0);
  const visits=recentCheckouts.length;
  const byProfessional=new Map(),byService=new Map();
  for(const row of recentCheckouts){
    const amount=Number(row.total_cents||0);
    const proId=row.professional_id||"none",serviceId=row.service_id||"none";
    const pro=byProfessional.get(proId)||{id:proId,name:row.professional_name||"Sem profissional",count:0,volume_cents:0};
    pro.count++;pro.volume_cents+=amount;byProfessional.set(proId,pro);
    const service=byService.get(serviceId)||{id:serviceId,name:row.service_name||"Serviço não encontrado",count:0,volume_cents:0};
    service.count++;service.volume_cents+=amount;byService.set(serviceId,service);
  }
  const top=list=>[...list.values()].map(x=>({id:x.id,name:x.name,count:x.count,volume:round(x.volume_cents/100)})).sort((a,b)=>b.volume-a.volume).slice(0,8);
  const repurchase=one(db,`select count(*) with_purchase,coalesce(sum(case when n>=2 then 1 else 0 end),0) repeat_clients
      from (select a.client_id,count(*) n from checkout_records cr
        join appointments a on a.id=cr.appointment_id and a.tenant_id=cr.tenant_id
        where cr.tenant_id=? group by a.client_id)`,[tenant])||{};
  const repeatBase=Number(repurchase.with_purchase||0),repeatClients=Number(repurchase.repeat_clients||0);
  const stock=all(db,`select id,name,unit,stock_qty,min_qty,ideal_qty from products
    where tenant_id=? and active=1 and stock_qty<=min_qty order by stock_qty-min_qty limit 30`,[tenant]);
  const lateBills=one(db,`select count(*) count,coalesce(sum(amount_cents),0) total from financial_entries
    where tenant_id=? and kind='expense' and status='pending' and due_date is not null and due_date<>'' and due_date<?`,[tenant,today])||{};
  const lateFollowups=one(db,`select count(*) count from engagement_tasks
    where tenant_id=? and status='pending' and due_at<?`,[tenant,nowISO])||{};
  const recentAppts=all(db,`select status,start_at from appointments where tenant_id=? and start_at>=? and start_at<=?`,[tenant,lowerUTC,nowISO])
    .filter(x=>localDate(x.start_at,timezone)>=from);
  const ended=recentAppts.filter(x=>["completed","no_show"].includes(x.status));
  const noShows=ended.filter(x=>x.status==="no_show").length;
  const noShowPct=ended.length?round(noShows/ended.length*100):null;
  const alerts=[];
  if(stock.length)alerts.push({id:"stock",severity:"critical",label:stock.length+" produtos em estoque crítico",
    detail:"A quantidade está no mínimo ou abaixo dele.",view:"inventory"});
  if(Number(lateBills.count)>0)alerts.push({id:"bills",severity:"warning",label:lateBills.count+" contas vencidas",
    detail:"Pendências financeiras anteriores a hoje.",view:"finance"});
  if(Number(lateFollowups.count)>0)alerts.push({id:"retention",severity:"warning",label:lateFollowups.count+" tarefas de relacionamento atrasadas",
    detail:"Mensagens não enviadas automaticamente.",view:"retention"});
  if(noShowPct!==null&&ended.length>=5&&noShowPct>=10)alerts.push({id:"attendance",severity:"warning",label:"Faltas em "+noShowPct.toFixed(1)+"% dos atendimentos",
    detail:"Faltas sobre atendimentos concluídos ou não comparecidos nos últimos 30 dias.",view:"agenda"});
  return {
    period:{from,to:today,previous_from:previousFrom,previous_to:previousTo,time_zone:timezone,as_of:nowISO},
    money:{income:revenue,income_previous:round(income.previous/100),income_change_pct:pct(income.current,income.previous),
      expenses:spent,expenses_previous:round(expense.previous/100),cash_net:cashNet,
      cash_net_previous:round((income.previous-expense.previous)/100)},
    operations:{completed_services:visits,checkout_volume:round(volumes/100),average_checkout:visits?round(volumes/visits/100):0,
      repeat_rate:repeatBase?round(repeatClients/repeatBase*100):null,repeat_clients:repeatClients,clients_with_checkout:repeatBase,
      no_show_rate:noShowPct,absence_count:noShows},
    attention:{critical_stock:stock.length,overdue_bills:Number(lateBills.count||0),overdue_bills_total:round(Number(lateBills.total||0)/100),
      overdue_followups:Number(lateFollowups.count||0)},
    charts:{cashflow14:trend14},
    lists:{professionals:top(byProfessional),services:top(byService),stock:stock.map(x=>({id:x.id,name:x.name,unit:x.unit,
      stock_qty:Number(x.stock_qty),min_qty:Number(x.min_qty),ideal_qty:Number(x.ideal_qty)}))},
    alerts,
    definitions:{income:"Entradas efetivamente pagas, por data de pagamento; não soma vendas do checkout outra vez.",
      net:"Entradas pagas menos despesas pagas; não representa lucro contábil.",
      checkout:"Número e valor nominal dos checkouts encerrados no período, incluindo pacotes usados; não equivale ao dinheiro recebido.",
      repeat:"Clientes com dois ou mais checkouts sobre todos os clientes com pelo menos um checkout, histórico total.",
      no_show:"Não comparecimentos entre atendimentos concluídos ou não comparecidos, nos 30 dias.",
      services:"Ranking pelo serviço principal do agendamento; combinações exigem relatório por item para rateio preciso."}
  };
}
export async function handleOwnerEyeApi({req,res,url,db,user,tenant,send,requirePermission}){
  if(url.pathname!=="/api/owner-eye/summary")return false;
  requirePermission(user,"analytics.read");
  if(!["owner","manager"].includes(user.role))return send(res,403,{error:"owner_view_forbidden"});
  if(req.method!=="GET")return send(res,405,{error:"method_not_allowed"});
  return send(res,200,makeOwnerEyeSnapshot(db,tenant));
}

import { localTimeToUtc, localStamp } from "./slot-time.mjs";
const all=(db,s,p=[])=>db.prepare(s).all(...p);
const one=(db,s,p=[])=>db.prepare(s).get(...p);
const txt=(v,n=120)=>String(v??"").trim().slice(0,n);

export function installPhase11(db){}

function esc(v){
  const s=String(v??"").replace(/\r?\n/g," ");
  return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function csv(headers,rows){
  return "\ufeff"+[headers.map(esc).join(";"),...rows.map(r=>r.map(esc).join(";"))].join("\r\n")+"\r\n";
}
// O período é informado em datas locais do salão; o banco grava UTC.
function range(url,zone="America/Porto_Velho"){
  const from=txt(url.searchParams.get("from")||"",10),to=txt(url.searchParams.get("to")||"",10);
  const valid=x=>/^\d{4}-\d{2}-\d{2}$/.test(x);
  let start,end;
  try{
    start=valid(from)?localTimeToUtc(from,"00:00",zone):new Date(Date.now()-30*86400000).toISOString();
    end=valid(to)?new Date(new Date(localTimeToUtc(to,"23:59",zone)).getTime()+59999).toISOString():new Date().toISOString();
    if(start>end)[start,end]=[end,start];
  }catch{
    start=new Date(Date.now()-30*86400000).toISOString();end=new Date().toISOString();
  }
  return {from:start,to:end};
}
function summary(db,tenant,from,to){
  const services=one(db,"select count(*) n,coalesce(sum(case when payment_method<>'package' then total_cents else 0 end),0) cash_revenue,coalesce(sum(case when payment_method='package' then total_cents else 0 end),0) package_consumption from checkout_records where tenant_id=? and created_at between ? and ?",[tenant,from,to])||{};
  const retail=one(db,"select count(*) n,coalesce(sum(total_cents),0) revenue from retail_sales where tenant_id=? and created_at between ? and ?",[tenant,from,to])||{};
  const packages=one(db,"select count(*) n,coalesce(sum(amount_cents),0) revenue from client_packages where tenant_id=? and created_at between ? and ?",[tenant,from,to])||{};
  const income=one(db,"select coalesce(sum(amount_cents),0) total from financial_entries where tenant_id=? and kind='income' and status='paid' and created_at between ? and ?",[tenant,from,to])||{};
  const expenses=one(db,"select coalesce(sum(amount_cents),0) total from financial_entries where tenant_id=? and kind='expense' and status='paid' and created_at between ? and ?",[tenant,from,to])||{};
  const commissions=one(db,"select coalesce(sum(amount_cents),0) total from commissions where tenant_id=? and created_at between ? and ?",[tenant,from,to])||{};
  const retailComm=one(db,"select coalesce(sum(amount_cents),0) total from retail_commissions where tenant_id=? and created_at between ? and ?",[tenant,from,to])||{};
  const realIncome=Number(income.total||0),expense=Number(expenses.total||0);
  return {
    services:{count:Number(services.n||0),revenue:Number(services.cash_revenue||0)/100,package_consumption:Number(services.package_consumption||0)/100},
    retail:{count:Number(retail.n||0),revenue:Number(retail.revenue||0)/100},
    packages:{count:Number(packages.n||0),revenue:Number(packages.revenue||0)/100},
    income:realIncome/100,expenses:expense/100,net:(realIncome-expense)/100,
    commissions:(Number(commissions.total||0)+Number(retailComm.total||0))/100
  };
}
function reportData(db,tenant,type,from,to,zone="America/Porto_Velho"){
  const stamp=v=>localStamp(v,zone);
  if(type==="finance"){
    const rows=all(db,"select kind,category,description,amount_cents,payment_method,status,due_date,paid_at,created_at,reference_type,reference_id from financial_entries where tenant_id=? and created_at between ? and ? order by created_at desc",[tenant,from,to]);
    // Lançamentos antigos de comissão guardam o código no texto; o CSV deriva o
    // nome legível do vínculo, sem reescrever o histórico financeiro.
    const label=x=>{
      if(x.category!=="commissions"||!x.reference_id)return x.description||"";
      try{
        const r=x.reference_type==="retail_commission"
          ?one(db,"select p.name professional,coalesce(cl.name,'Venda balcão') client from retail_commissions rc join retail_sales rs on rs.id=rc.retail_sale_id left join clients cl on cl.id=rs.client_id join professionals p on p.id=rc.professional_id where rc.id=? and rc.tenant_id=?",[x.reference_id,tenant])
          :one(db,"select p.name professional,cl.name client from commissions c join professionals p on p.id=c.professional_id join appointments a on a.id=c.appointment_id join clients cl on cl.id=a.client_id where c.id=? and c.tenant_id=?",[x.reference_id,tenant]);
        if(!r)return x.description||"";
        return (x.reference_type==="retail_commission"?"Comissão de revenda":"Comissão de serviço")+" · "+(r.professional||"Profissional")+(r.client?" · "+r.client:"");
      }catch{return x.description||""}
    };
    return {name:"financeiro",headers:["Tipo","Categoria","Descrição","Valor","Forma","Status","Vencimento","Pago em","Criado em"],rows:rows.map(x=>[x.kind,x.category,label(x),(Number(x.amount_cents||0)/100).toFixed(2),x.payment_method||"",x.status,x.due_date||"",stamp(x.paid_at),stamp(x.created_at)])};
  }
  if(type==="clients"){
    const rows=all(db,"select name,phone,email,birthday,tags,source,created_at from clients where tenant_id=? order by name",[tenant]);
    return {name:"clientes",headers:["Nome","Telefone","E-mail","Nascimento","Tags","Origem","Cadastro"],rows:rows.map(x=>[x.name,x.phone||"",x.email||"",x.birthday||"",x.tags||"",x.source||"",stamp(x.created_at)])};
  }
  if(type==="appointments"){
    const rows=all(db,"select a.start_at,a.end_at,a.status,c.name client_name,p.name professional_name,s.name service_name,a.source,a.notes from appointments a join clients c on c.id=a.client_id join professionals p on p.id=a.professional_id join services s on s.id=a.service_id where a.tenant_id=? and a.start_at between ? and ? order by a.start_at",[tenant,from,to]);
    return {name:"agenda",headers:["Início","Fim","Status","Cliente","Profissional","Serviço","Origem","Observações"],rows:rows.map(x=>[stamp(x.start_at),stamp(x.end_at),x.status,x.client_name,x.professional_name,x.service_name,x.source||"",x.notes||""])};
  }
  if(type==="stock"){
    const rows=all(db,"select p.name,p.sku,p.unit,p.stock_qty,p.min_qty,p.ideal_qty,p.avg_cost_cents,s.name supplier_name from products p left join suppliers s on s.id=p.supplier_id where p.tenant_id=? order by p.name",[tenant]);
    return {name:"estoque",headers:["Produto","SKU","Unidade","Estoque","Mínimo","Ideal","Custo médio","Fornecedor"],rows:rows.map(x=>[x.name,x.sku||"",x.unit,x.stock_qty,x.min_qty,x.ideal_qty,(Number(x.avg_cost_cents||0)/100).toFixed(4),x.supplier_name||""])};
  }
  if(type==="commissions"){
    // Incluir comissões tanto de serviços como de vendas de produtos, sem duplicá-las.
    const rows=all(db,`select c.created_at,c.status,p.name professional_name,s.name service_name,
        c.gross_cents,c.pct,c.amount_cents
      from commissions c join professionals p on p.id=c.professional_id and p.tenant_id=c.tenant_id
      join services s on s.id=c.service_id and s.tenant_id=c.tenant_id
      where c.tenant_id=? and c.created_at between ? and ?
      union all
      select rc.created_at,rc.status,p.name professional_name,'Venda de produtos' service_name,
        null gross_cents,null pct,rc.amount_cents
      from retail_commissions rc join professionals p on p.id=rc.professional_id and p.tenant_id=rc.tenant_id
      where rc.tenant_id=? and rc.created_at between ? and ?
      order by 1 desc`,[tenant,from,to,tenant,from,to]);
    return {name:"comissoes",headers:["Data","Status","Profissional","Serviço / Origem","Base","Percentual","Comissão"],rows:rows.map(x=>[stamp(x.created_at),x.status,x.professional_name,x.service_name,x.gross_cents==null?"":(Number(x.gross_cents)/100).toFixed(2),x.pct==null?"":x.pct,(Number(x.amount_cents||0)/100).toFixed(2)])};
  }
  if(type==="staff"){
    const period=from.slice(0,7);
    const rows=all(db,"select p.name,p.role,g.target_revenue_cents,g.target_appointments,g.target_avg_ticket_cents,g.target_no_show_pct from professionals p left join staff_goals g on g.professional_id=p.id and g.tenant_id=p.tenant_id and g.period=? where p.tenant_id=? and p.active=1 order by p.name",[period,tenant]);
    return {name:"equipe",headers:["Profissional","Função","Meta receita","Meta atendimentos","Meta ticket","No-show máximo"],rows:rows.map(x=>[x.name,x.role,(Number(x.target_revenue_cents||0)/100).toFixed(2),x.target_appointments||0,(Number(x.target_avg_ticket_cents||0)/100).toFixed(2),x.target_no_show_pct||0])};
  }
  if(type==="retail"){
    const rows=all(db,"select r.created_at,r.total_cents,r.payment_method,c.name client_name,p.name professional_name from retail_sales r left join clients c on c.id=r.client_id left join professionals p on p.id=r.professional_id where r.tenant_id=? and r.created_at between ? and ? order by r.created_at desc",[tenant,from,to]);
    return {name:"vendas-produtos",headers:["Data","Total","Pagamento","Cliente","Profissional"],rows:rows.map(x=>[stamp(x.created_at),(Number(x.total_cents||0)/100).toFixed(2),x.payment_method,x.client_name||"",x.professional_name||""])};
  }
  return null;
}

export async function handlePhase11Api({req,res,url,db,user,tenant,send,requirePermission}){
  const guard=p=>requirePermission(user,p);
  const zone=one(db,"select timezone from tenants where id=?",[tenant])?.timezone||"America/Porto_Velho";
  if(req.method==="GET"&&url.pathname==="/api/reports/summary"){
    guard("reports.read");const r=range(url,zone);return send(res,200,{range:r,...summary(db,tenant,r.from,r.to)});
  }
  if(req.method==="GET"&&url.pathname==="/api/reports/export"){
    guard("reports.export");const r=range(url,zone),type=txt(url.searchParams.get("type")||"",32),data=reportData(db,tenant,type,r.from,r.to,zone);
    if(!data)return send(res,400,{error:"invalid_report_type"});
    const body=csv(data.headers,data.rows),stamp=new Date().toISOString().slice(0,10);
    return send(res,200,body,{"content-type":"text/csv; charset=utf-8","content-disposition":'attachment; filename="'+data.name+"-"+stamp+'.csv"'});
  }
  return false;
}

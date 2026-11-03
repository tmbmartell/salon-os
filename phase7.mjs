import crypto from "node:crypto";

const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const one=(db,s,p=[])=>db.prepare(s).get(...p);
const all=(db,s,p=[])=>db.prepare(s).all(...p);
const run=(db,s,p=[])=>db.prepare(s).run(...p);
const txt=(v,n=1000)=>String(v??"").trim().slice(0,n);

export function installPhase7(db){
  db.exec([
    "CREATE TABLE IF NOT EXISTS technical_records(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,client_id TEXT NOT NULL,appointment_id TEXT,professional_id TEXT,service_id TEXT,title TEXT NOT NULL,formula TEXT NOT NULL DEFAULT '',observations TEXT NOT NULL DEFAULT '',allergies_snapshot TEXT NOT NULL DEFAULT '',data TEXT NOT NULL DEFAULT '{}',created_by TEXT,created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_technical_client ON technical_records(tenant_id,client_id,created_at)"
  ].join(";"));
}

function rows(db,tenant,clientId){
  const sql="select r.*,p.name professional_name,s.name service_name from technical_records r left join professionals p on p.id=r.professional_id and p.tenant_id=r.tenant_id left join services s on s.id=r.service_id and s.tenant_id=r.tenant_id where r.tenant_id=? and r.client_id=? order by r.created_at desc";
  return all(db,sql,[tenant,clientId]).map(x=>({...x,data:JSON.parse(x.data||"{}")}));
}

export async function handlePhase7Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit}){
  const guard=p=>requirePermission(user,p);
  const m=url.pathname.match(/^\/api\/clients\/([^/]+)\/technical$/);
  if(m&&req.method==="GET"){
    guard("technical.read");
    const cid=decodeURIComponent(m[1]);
    if(!one(db,"select id from clients where id=? and tenant_id=?",[cid,tenant]))return send(res,404,{error:"client_not_found"});
    return send(res,200,rows(db,tenant,cid));
  }
  if(m&&req.method==="POST"){
    guard("technical.write");
    const cid=decodeURIComponent(m[1]),client=one(db,"select * from clients where id=? and tenant_id=?",[cid,tenant]);
    if(!client)return send(res,404,{error:"client_not_found"});
    const b=await parseBody(req),title=txt(b.title||"Registro técnico",180);
    if(!title)return send(res,400,{error:"title_required"});
    const appointmentId=txt(b.appointment_id,64)||null;
    const appointment=appointmentId?one(db,"select id,client_id,professional_id,service_id from appointments where id=? and tenant_id=? and client_id=?",[appointmentId,tenant,cid]):null;
    if(appointmentId&&!appointment)return send(res,400,{error:"invalid_appointment_reference"});
    const proId=txt(b.professional_id||appointment?.professional_id,64)||null;
    const serviceId=txt(b.service_id||appointment?.service_id,64)||null;
    const professional=proId?one(db,"select id from professionals where id=? and tenant_id=?",[proId,tenant]):null;
    const service=serviceId?one(db,"select id from services where id=? and tenant_id=?",[serviceId,tenant]):null;
    if((proId&&!professional)||(serviceId&&!service))return send(res,400,{error:"invalid_reference"});
    if(appointment && ((proId&&proId!==appointment.professional_id)||(serviceId&&serviceId!==appointment.service_id))){
      const item=one(db,"select id from appointment_items where appointment_id=? and tenant_id=? and service_id=? and professional_id=?",[appointment.id,tenant,serviceId,proId]);
      if(!item)return send(res,400,{error:"appointment_service_mismatch"});
    }
    const id=uid();
    run(db,"insert into technical_records(id,tenant_id,client_id,appointment_id,professional_id,service_id,title,formula,observations,allergies_snapshot,data,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [id,tenant,cid,appointmentId,professional?.id||null,service?.id||null,title,txt(b.formula,5000),txt(b.observations,5000),txt(client.allergies,2000),JSON.stringify(b.data&&typeof b.data==="object"?b.data:{}),user.id,now()]);
    audit(db,user,"technical.create","technical_record",id,{client_id:cid});
    return send(res,201,{id,client_id:cid,title});
  }
  return false;
}

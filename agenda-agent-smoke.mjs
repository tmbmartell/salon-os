import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {installPhase4,generateAgentTasks,handlePhase4Api} from "./phase4.mjs";
const f="/tmp/agenda-agent-smoke.sqlite";try{fs.unlinkSync(f)}catch{}
const db=new DatabaseSync(f);
db.exec([
"create table tenants(id text primary key,name text,timezone text)",
"create table clients(id text primary key,tenant_id text,name text,phone text)",
"create table professionals(id text primary key,tenant_id text,name text)",
"create table services(id text primary key,tenant_id text,name text)",
"create table appointments(id text primary key,tenant_id text,client_id text,professional_id text,service_id text,start_at text,end_at text,status text)",
"create table waitlist(id text primary key,tenant_id text,client_id text,service_id text,professional_id text,preferred_date text,period text,status text,created_at text,updated_at text)",
"create table recovery_actions(id text primary key,tenant_id text,client_id text,status text,created_at text)",
"create table engagement_tasks(id text primary key,tenant_id text,client_id text,status text,due_at text,kind text,title text,message text)",
"create table financial_entries(id text primary key,tenant_id text,kind text,status text,due_date text,description text,amount_cents integer,created_at text)",
"create table suppliers(id text primary key,tenant_id text,name text,lead_days integer)",
"create table products(id text primary key,tenant_id text,name text,stock_qty real,min_qty real,ideal_qty real,supplier_id text,active integer)",
"create table checkout_records(id text primary key,tenant_id text,appointment_id text,total_cents integer,created_at text)"
].join(";"));
installPhase4(db);
const t="t";db.prepare("insert into tenants values(?,?,?)").run(t,"Teste","America/Porto_Velho");
db.prepare("insert into clients values(?,?,?,?)").run("c1",t,"Cliente Um","69000000001");
db.prepare("insert into clients values(?,?,?,?)").run("c2",t,"Cliente Fila","69000000002");
db.prepare("insert into professionals values(?,?,?)").run("p1",t,"Ana");
db.prepare("insert into services values(?,?,?)").run("s1",t,"Corte");
const iso=h=>new Date(Date.now()+h*3600000).toISOString();
db.prepare("insert into appointments values(?,?,?,?,?,?,?,?)").run("a-confirm",t,"c1","p1","s1",iso(20),iso(21),"scheduled");
db.prepare("insert into appointments values(?,?,?,?,?,?,?,?)").run("a-remind",t,"c1","p1","s1",iso(2),iso(3),"confirmed");
db.prepare("insert into appointments values(?,?,?,?,?,?,?,?)").run("a-cancel",t,"c1","p1","s1",iso(24),iso(25),"cancelled");
db.prepare("insert into waitlist values(?,?,?,?,?,?,?,?,?,?)").run("w1",t,"c2","s1",null,null,"any","waiting",new Date().toISOString(),new Date().toISOString());
const gen=generateAgentTasks(db,t,"u");
const tasks=db.prepare("select id,title,action_type,entity_type,entity_id,payload,status,requires_approval from agent_tasks where tenant_id=? order by created_at").all(t).map(x=>({...x,payload:JSON.parse(x.payload)}));
const kinds=tasks.map(x=>({title:x.title,entity_type:x.entity_type,payload:x.payload}));
const wait=tasks.find(x=>x.entity_type==="waitlist");
const send=(_r,status,data)=>({status,data}),user={id:"u",tenantId:t,role:"owner"},perm=()=>{},audit=()=>{};
let approve=null,execute=null;
if(wait){
  approve=await handlePhase4Api({req:{method:"POST"},res:{},url:new URL("http://x/api/agents/tasks/"+wait.id+"/approve"),db,user,tenant:t,send,parseBody:async()=>({}),requirePermission:perm,audit,sendText:async()=>({messageId:"m1"}),routeAmbiguous:null});
  execute=await handlePhase4Api({req:{method:"POST"},res:{},url:new URL("http://x/api/agents/tasks/"+wait.id+"/execute"),db,user,tenant:t,send,parseBody:async()=>({}),requirePermission:perm,audit,sendText:async()=>({messageId:"m1"}),routeAmbiguous:null});
}
console.log(JSON.stringify({generated:gen.items,kinds,waitlist_status:db.prepare("select status from waitlist where id='w1'").get().status,approve:approve?.status,execute:execute?.status}));
db.close();try{fs.unlinkSync(f)}catch{}

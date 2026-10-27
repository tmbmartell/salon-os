#!/usr/bin/env node
import {fileURLToPath} from "node:url";
import path from "node:path";
// Verificação SOMENTE-LEITURA da futura prévia gratuita do Render.
// Não inicia deploy, não cadastra dados e não imprime senhas/tokens.
export function previewUrl(raw){
  let url;
  try{url=new URL(String(raw||""))}catch{throw Error("preview_url_required")}
  if(url.protocol!=="https:"||!url.hostname.endsWith(".onrender.com")||
     url.hostname===".onrender.com"||url.hostname==="onrender.com"||
     url.username||url.password||url.search||url.hash||url.pathname!=="/"||url.port)
    throw Error("preview_https_onrender_required");
  return url.origin;
}
export function checkPublicPreview({health,state,html}){
  const checks=[
    {name:"app_health",ok:health?.ok===true&&health?.service==="NOVAGENTE Estética"},
    {name:"disposable_only",ok:health?.disposable_demo===true&&health?.mode==="free_preview_disposable"},
    {name:"no_real_whatsapp",ok:health?.optional_integrations?.whatsapp?.connected===false},
    {name:"db_available",ok:health?.database?.connected===true},
    {name:"owner_provisioned",ok:state?.claimed===true},
    {name:"warning_visible_in_html",ok:typeof html==="string"&&html.includes('id="freePreviewNotice"')}
  ];
  return {checks,passed:checks.every(x=>x.ok)};
}
async function request(base,route,init={}){
  const res=await fetch(base+route,{...init,redirect:"error",signal:AbortSignal.timeout(120000)});
  if(!res.ok)throw Error("demo_http_"+res.status+"_"+route);
  return res;
}
export async function auditPreview(base,{email,password,fetchFn}={}){
  const url=previewUrl(base);
  const fetcher=fetchFn||request;
  const [healthRes,stateRes,htmlRes]=await Promise.all([
    fetcher(url,"/api/health"),fetcher(url,"/api/auth/state"),fetcher(url,"/")]);
  const [health,state,html]=await Promise.all([healthRes.json(),stateRes.json(),htmlRes.text()]);
  const report=checkPublicPreview({health,state,html});
  if(!report.passed)return {...report,login_checked:false};
  if(!email||!password)return {...report,login_checked:false};
  // Confere o aviso e o modo descartável ANTES de enviar credenciais para a URL.
  const loginRes=await fetcher(url,"/api/auth/login",{
    method:"POST",headers:{"content-type":"application/json","origin":url},
    body:JSON.stringify({email,password})
  });
  const cookie=(loginRes.headers.get("set-cookie")||"").split(";")[0];
  if(!cookie.startsWith("salon_session="))throw Error("demo_cookie_missing");
  const data=await loginRes.json();
  if(data.user?.role!=="owner")throw Error("demo_owner_role_missing");
  const [bootstrap,clients]=await Promise.all([
    fetcher(url,"/api/bootstrap",{headers:{cookie}}),
    fetcher(url,"/api/clients",{headers:{cookie}})
  ]);
  const boot=await bootstrap.json(),list=await clients.json();
  if(boot.user?.role!=="owner"||!Array.isArray(list))throw Error("demo_client_read_failed");
  return {...report,login_checked:true,owner_access:true,modules_readable:true,
    // Nunca expor dados, telefones, credenciais ou nomes no relatório público.
    demo_login_verified:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const report=await auditPreview(process.env.NOVAGENTE_PREVIEW_URL,{
      email:process.env.NOVAGENTE_DEMO_OWNER_EMAIL,
      password:process.env.NOVAGENTE_DEMO_OWNER_PASSWORD});
    console.log(JSON.stringify(report,null,2));
    if(!report.passed||!report.login_checked)process.exitCode=1;
  }catch(error){
    console.error(JSON.stringify({ok:false,error:error.message}));
    process.exitCode=1;
  }
}

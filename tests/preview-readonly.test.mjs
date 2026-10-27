import test from "node:test";
import assert from "node:assert/strict";
import {previewUrl,checkPublicPreview,auditPreview} from "../scripts/verify-free-preview-url.mjs";

const url="https://novagente-estetica-demo.onrender.com";
function fixture(overrides={}){
  const health={ok:true,service:"NOVAGENTE Estética",disposable_demo:true,
    mode:"free_preview_disposable",database:{connected:true},
    optional_integrations:{whatsapp:{connected:false}}};
  const state={claimed:true};
  return {health:{...health,...overrides},state,html:'<div id="freePreviewNotice" hidden>Somente fictícios</div>'};
}
function apiMock(value,mutations){
  return async(base,route,opts={})=>{
    assert.equal(base,url);
    if(opts.method==="POST")mutations.push({route,body:opts.body,origin:opts.headers.origin});
    if(route==="/api/health")return {json:async()=>value.health};
    if(route==="/api/auth/state")return {json:async()=>value.state};
    if(route==="/")return {text:async()=>value.html};
    if(route==="/api/auth/login")return {headers:{get:()=>"salon_session=simulated-token; HttpOnly"},json:async()=>({user:{role:"owner"}})};
    if(route==="/api/bootstrap")return {json:async()=>({user:{role:"owner"}})};
    if(route==="/api/clients")return {json:async()=>[{name:"Cliente 100% fictícia"}]};
    throw Error("unexpected_route");
  };
}
test("URL de verificação não aceita host externo, http nem senhas no link",()=>{
  assert.equal(previewUrl(url+"/"),url);
  for(const invalid of ["http://example.onrender.com","https://evil.example",
    "https://onrender.com","https://tenant.onrender.com.evil.test",
    "https://user:password@tenant.onrender.com","https://tenant.onrender.com/admin",
    "https://tenant.onrender.com?token=foo","http://127.0.0.1:3000",""]){
    assert.throws(()=>previewUrl(invalid),/preview_/);
  }
});
test("um serviço sem modo descartável nunca recebe senha de teste",async()=>{
  const mutations=[];
  const result=await auditPreview(url,{
    email:"qa@example.invalid",password:"senha-so-ficticia-123456",
    fetchFn:apiMock(fixture({disposable_demo:false}),mutations)});
  assert.equal(result.passed,false);
  assert.equal(result.login_checked,false);
  assert.equal(mutations.length,0);
});
test("validação lê dados fictícios em modo livre e não altera estado do banco",async()=>{
  const mutations=[];
  const noCreds=await auditPreview(url,{fetchFn:apiMock(fixture(),mutations)});
  assert.equal(noCreds.passed,true);
  assert.equal(noCreds.login_checked,false);
  assert.equal(mutations.length,0);
  const withCreds=await auditPreview(url,{email:"qa@example.invalid",
    password:"senha-ficticia-muito-forte",fetchFn:apiMock(fixture(),mutations)});
  assert.equal(withCreds.passed,true);
  assert.equal(withCreds.login_checked,true);
  assert.equal(withCreds.modules_readable,true);
  assert.deepEqual(mutations.map(x=>x.route),["/api/auth/login"]);
  assert.equal(mutations[0].origin,url);
  const safe=JSON.stringify(withCreds);
  assert.equal(safe.includes("senha-ficticia"),false);
  assert.equal(safe.includes("Cliente 100%"),false);
});
test("prévia incompleta bloqueia o gate mesmo se os demais itens estiverem válidos",()=>{
  const f=fixture();
  f.state.claimed=false;
  const status=checkPublicPreview(f);
  assert.equal(status.passed,false);
  assert.ok(status.checks.some(c=>c.name==="owner_provisioned"&&!c.ok));
});

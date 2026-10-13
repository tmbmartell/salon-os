import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const KEY_FILE=path.join(process.cwd(),"data","llm-secrets.key");
const PROVIDERS=new Set(["internal","openai","deepseek","openrouter","anthropic","gemini"]);

function now(){return new Date().toISOString()}
function ensureKey(){
  fs.mkdirSync(path.dirname(KEY_FILE),{recursive:true});
  if(!fs.existsSync(KEY_FILE)){
    fs.writeFileSync(KEY_FILE,crypto.randomBytes(32),{mode:0o600});
  }
  try{fs.chmodSync(KEY_FILE,0o600)}catch{}
  const key=fs.readFileSync(KEY_FILE);
  if(key.length!==32)throw new Error("invalid_llm_secret_key");
  return key;
}
function enc(value){
  if(!value)return "";
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",ensureKey(),iv);
  const data=Buffer.concat([cipher.update(String(value),"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();
  return ["v1",iv.toString("base64url"),tag.toString("base64url"),data.toString("base64url")].join(".");
}
function dec(value){
  if(!value)return "";
  const parts=String(value).split(".");
  if(parts.length!==4||parts[0]!=="v1")throw new Error("invalid_encrypted_secret");
  const decipher=crypto.createDecipheriv("aes-256-gcm",ensureKey(),Buffer.from(parts[1],"base64url"));
  decipher.setAuthTag(Buffer.from(parts[2],"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[3],"base64url")),decipher.final()]).toString("utf8");
}
export function installLlmConfig(db){
  ensureKey();
  db.exec("CREATE TABLE IF NOT EXISTS llm_configs(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL UNIQUE,provider TEXT NOT NULL DEFAULT 'internal',model TEXT NOT NULL DEFAULT '',api_key_enc TEXT NOT NULL DEFAULT '',enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)");
}
export function getLlmConfig(db,tenantId,{includeSecret=false}={}){
  const row=db.prepare("select * from llm_configs where tenant_id=?").get(tenantId);
  if(!row)return {provider:"internal",model:"",enabled:true,has_api_key:false};
  return {
    provider:PROVIDERS.has(row.provider)?row.provider:"internal",
    model:String(row.model||""),
    enabled:Number(row.enabled)!==0,
    has_api_key:!!row.api_key_enc,
    api_key:includeSecret&&row.api_key_enc?dec(row.api_key_enc):""
  };
}
export function saveLlmConfig(db,tenantId,input={}){
  const provider=PROVIDERS.has(String(input.provider||""))?String(input.provider):"internal";
  const model=String(input.model||"").trim().slice(0,160);
  const enabled=input.enabled===undefined?true:!!input.enabled;
  const current=db.prepare("select * from llm_configs where tenant_id=?").get(tenantId);
  let apiKeyEnc=current?.api_key_enc||"";
  if(input.clear_api_key)apiKeyEnc="";
  if(typeof input.api_key==="string"&&input.api_key.trim())apiKeyEnc=enc(input.api_key.trim());
  if(provider!=="internal"&&!apiKeyEnc)throw Object.assign(new Error("api_key_required"),{status:400});
  if(provider!=="internal"&&!model)throw Object.assign(new Error("model_required"),{status:400});
  const ts=now();
  if(current){
    db.prepare("update llm_configs set provider=?,model=?,api_key_enc=?,enabled=?,updated_at=? where tenant_id=?").run(provider,model,apiKeyEnc,enabled?1:0,ts,tenantId);
  }else{
    db.prepare("insert into llm_configs(id,tenant_id,provider,model,api_key_enc,enabled,created_at,updated_at) values(?,?,?,?,?,?,?,?)").run(crypto.randomUUID(),tenantId,provider,model,apiKeyEnc,enabled?1:0,ts,ts);
  }
  return getLlmConfig(db,tenantId);
}
function extractOpenAI(data){
  if(typeof data?.output_text==="string"&&data.output_text.trim())return data.output_text.trim();
  const out=[];
  for(const item of Array.isArray(data?.output)?data.output:[]){
    for(const c of Array.isArray(item?.content)?item.content:[])if(c?.type==="output_text"&&c.text)out.push(c.text);
  }
  return out.join("\n").trim();
}
function extractChat(data){return String(data?.choices?.[0]?.message?.content||"").trim()}
async function fetchJson(url,options,timeoutMs=40000){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const r=await fetch(url,{...options,signal:ctrl.signal});
    const data=await r.json().catch(()=>({}));
    if(!r.ok){
      const detail=String(data?.error?.message||data?.error?.type||data?.message||("HTTP "+r.status)).slice(0,260);
      throw Object.assign(new Error(detail),{status:r.status});
    }
    return data;
  }finally{clearTimeout(timer)}
}
export async function callConfiguredLlm(db,tenantId,prompt,{maxTokens=800}={}){
  const cfg=getLlmConfig(db,tenantId,{includeSecret:true});
  if(!cfg.enabled)throw new Error("llm_disabled");
  if(cfg.provider==="internal")throw new Error("llm_internal_provider");
  const key=cfg.api_key,model=cfg.model;
  if(cfg.provider==="openai"){
    const data=await fetchJson("https://api.openai.com/v1/responses",{
      method:"POST",headers:{"authorization":"Bearer "+key,"content-type":"application/json"},
      body:JSON.stringify({model,input:prompt,store:false,max_output_tokens:maxTokens})
    });
    return {text:extractOpenAI(data),provider:"openai",model:data.model||model,id:data.id||null};
  }
  if(cfg.provider==="deepseek"){
    const data=await fetchJson("https://api.deepseek.com/chat/completions",{
      method:"POST",headers:{"authorization":"Bearer "+key,"content-type":"application/json"},
      body:JSON.stringify({model,messages:[{role:"user",content:prompt}],max_tokens:maxTokens,temperature:0.4})
    });
    return {text:extractChat(data),provider:"deepseek",model,id:data.id||null};
  }
  if(cfg.provider==="openrouter"){
    const data=await fetchJson("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST",headers:{"authorization":"Bearer "+key,"content-type":"application/json","x-title":"Salon OS"},
      body:JSON.stringify({model,messages:[{role:"user",content:prompt}],max_tokens:maxTokens,temperature:0.4})
    });
    return {text:extractChat(data),provider:"openrouter",model,id:data.id||null};
  }
  if(cfg.provider==="anthropic"){
    const data=await fetchJson("https://api.anthropic.com/v1/messages",{
      method:"POST",headers:{"x-api-key":key,"anthropic-version":"2023-06-01","content-type":"application/json"},
      body:JSON.stringify({model,max_tokens:maxTokens,messages:[{role:"user",content:prompt}]})
    });
    const text=(Array.isArray(data?.content)?data.content:[]).filter(x=>x?.type==="text").map(x=>x.text).join("\n").trim();
    return {text,provider:"anthropic",model,id:data.id||null};
  }
  if(cfg.provider==="gemini"){
    const data=await fetchJson("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
      method:"POST",headers:{"x-goog-api-key":key,"content-type":"application/json"},
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:maxTokens,temperature:0.4}})
    });
    const text=(data?.candidates?.[0]?.content?.parts||[]).map(x=>x?.text||"").join("\n").trim();
    return {text,provider:"gemini",model,id:null};
  }
  throw new Error("unsupported_provider");
}
export async function testLlmConfig(db,tenantId,input={}){
  const current=getLlmConfig(db,tenantId,{includeSecret:true});
  const provider=PROVIDERS.has(String(input.provider||""))?String(input.provider):current.provider;
  const model=String(input.model||current.model||"").trim();
  const apiKey=String(input.api_key||current.api_key||"").trim();
  if(provider==="internal")return {ok:true,provider:"internal",model:model||"Margot/OpenCLAW",message:"Provedor interno selecionado"};
  const fakeDb={
    prepare(sql){
      if(sql.startsWith("select * from llm_configs"))return {get(){return {provider,model,api_key_enc:"",enabled:1}}};
      throw new Error("unexpected_query");
    }
  };
  const cfg={provider,model,enabled:true,has_api_key:!!apiKey,api_key:apiKey};
  if(!model)throw Object.assign(new Error("model_required"),{status:400});
  if(!apiKey)throw Object.assign(new Error("api_key_required"),{status:400});
  let result;
  if(provider==="openai"){
    const data=await fetchJson("https://api.openai.com/v1/responses",{method:"POST",headers:{"authorization":"Bearer "+apiKey,"content-type":"application/json"},body:JSON.stringify({model,input:"Responda apenas: OK",store:false,max_output_tokens:12})},20000);
    result={text:extractOpenAI(data)};
  }else if(provider==="deepseek"){
    const data=await fetchJson("https://api.deepseek.com/chat/completions",{method:"POST",headers:{"authorization":"Bearer "+apiKey,"content-type":"application/json"},body:JSON.stringify({model,messages:[{role:"user",content:"Responda apenas: OK"}],max_tokens:12})},20000);
    result={text:extractChat(data)};
  }else if(provider==="openrouter"){
    const data=await fetchJson("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"authorization":"Bearer "+apiKey,"content-type":"application/json"},body:JSON.stringify({model,messages:[{role:"user",content:"Responda apenas: OK"}],max_tokens:12})},20000);
    result={text:extractChat(data)};
  }else if(provider==="anthropic"){
    const data=await fetchJson("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":apiKey,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify({model,max_tokens:12,messages:[{role:"user",content:"Responda apenas: OK"}]})},20000);
    result={text:(data?.content||[]).map(x=>x?.text||"").join("")};
  }else if(provider==="gemini"){
    const data=await fetchJson("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{method:"POST",headers:{"x-goog-api-key":apiKey,"content-type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:"Responda apenas: OK"}]}],generationConfig:{maxOutputTokens:12}})},20000);
    result={text:(data?.candidates?.[0]?.content?.parts||[]).map(x=>x?.text||"").join("")};
  }else throw new Error("unsupported_provider");
  return {ok:true,provider,model,message:"Conexão validada",sample:String(result.text||"").slice(0,40)};
}

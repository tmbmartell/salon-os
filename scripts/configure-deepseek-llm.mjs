#!/usr/bin/env node
// NOVAGENTE Estética: provisão segura de DeepSeek por arquivo privado.
// Não aceita chave pela linha de comando, não expõe a chave nos logs e não
// envia dados de clientes no teste de conectividade.
// Uso: node scripts/configure-deepseek-llm.mjs --db=/absoluto/estetica.sqlite
//      --key-file=/absoluto/deepseek.key --model=deepseek-flash
import fs from "node:fs";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {installLlmConfig,saveLlmConfig,testLlmConfig,getLlmConfig} from "../llm_config.mjs";
const args=process.argv.slice(2);
const field=name=>args.find(x=>x.startsWith("--"+name+"="))?.slice(name.length+3)||"";
const dbPath=field("db"),keyPath=field("key-file"),model=field("model")||"deepseek-flash",tenant=field("tenant");
if(!path.isAbsolute(dbPath)||!path.isAbsolute(keyPath))
  throw new Error("Use caminhos absolutos em --db e --key-file.");
if(!["deepseek-flash","deepseek-v4-pro"].includes(model))
  throw new Error("Modelo DeepSeek não liberado no piloto.");
const f=fs.openSync(keyPath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
let key="";
try{
  const st=fs.fstatSync(f);
  if(!st.isFile()||(st.mode&0o077)!==0||st.size>512||st.size<24)
    throw new Error("O arquivo da chave deve ser privado (chmod 600), regular e pequeno.");
  key=fs.readFileSync(f,{encoding:"utf8"}).trim();
}finally{fs.closeSync(f)}
if(!/^sk-[A-Za-z0-9_-]{20,}$/.test(key))throw new Error("Formato da chave DeepSeek inválido.");
const db=new DatabaseSync(dbPath);
try{
  installLlmConfig(db);
  const tenants=db.prepare("select id from tenants order by id").all();
  const tenantId=tenant||(tenants.length===1?tenants[0].id:"");
  if(!tenantId||!tenants.some(x=>x.id===tenantId))
    throw new Error("Selecione o salão exato com --tenant antes de configurar.");
  const result=await testLlmConfig(db,tenantId,{provider:"deepseek",model,api_key:key});
  if(!result.ok)throw new Error("Falha ao validar a chave DeepSeek.");
  const cfg=saveLlmConfig(db,tenantId,{provider:"deepseek",model,api_key:key,enabled:true});
  console.log("DEEPSEEK_CONFIGURED",JSON.stringify({
    model:cfg.model,provider:cfg.provider,enabled:cfg.enabled,encrypted:cfg.has_api_key,
    tenant_configured:true
  }));
}finally{
  key="";
  db.close();
}

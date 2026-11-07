#!/usr/bin/env node
// Instala uma chave OpenAI criptografada para um único salão após teste real.
// Entrada padrão: ciphertext RSA-OAEP SHA-256 em base64. Não lê chave em argumentos
// nem imprime chave da API. A chave privada RSA temporária permanece no host.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {installLlmConfig,saveLlmConfig,testLlmConfig,getLlmConfig} from "../llm_config.mjs";

const args=process.argv.slice(2);
function option(key){return args.find(x=>x.startsWith("--"+key+"="))?.slice(key.length+3)||""}
const dbPath=option("db"),pemPath=option("private-key"),model=option("model")||"gpt-6-luna";
if(!args.includes("--apply")||!path.isAbsolute(dbPath)||!path.isAbsolute(pemPath))
  throw new Error("usage: --apply --db=/absolute.sqlite --private-key=/absolute.pem [--model=gpt-6-luna]");
if(!["gpt-6-luna","gpt-5.6-luna"].includes(model))throw new Error("model_not_approved_for_pilot");
const encrypted=fs.readFileSync(0,"utf8").trim();
if(!/^[a-zA-Z0-9+/=\-_]{200,2000}$/.test(encrypted))throw new Error("encrypted_key_invalid");
const privatePem=fs.readFileSync(pemPath);
let key="";
try{
  key=crypto.privateDecrypt({
    key:privatePem,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256"
  },Buffer.from(encrypted,"base64")).toString("utf8");
  if(!/^sk-[A-Za-z0-9_-]{24,}$/.test(key))throw new Error("decrypted_key_invalid");
  const db=new DatabaseSync(dbPath);
  try{
    const tenants=db.prepare("select id from tenants order by id").all();
    if(tenants.length!==1)throw new Error("select_explicit_tenant_before_configuring_shared_database");
    const tenantId=tenants[0].id;
    // A verificação realiza uma requisição mínima e não envolve dados de clientes.
    const test=await testLlmConfig(db,tenantId,{provider:"openai",model,api_key:key});
    if(!test?.ok)throw new Error("provider_test_unsuccessful");
    const saved=saveLlmConfig(db,tenantId,{provider:"openai",model,enabled:true,api_key:key});
    if(!saved.has_api_key||saved.provider!=="openai")throw new Error("encrypted_store_failed");
    console.log("LLM_CONFIGURED",JSON.stringify({provider:saved.provider,model:saved.model,enabled:saved.enabled,encrypted:true}));
  }finally{db.close()}
}finally{
  key=""; // Não imprimir nem persistir a chave sem criptografia.
}

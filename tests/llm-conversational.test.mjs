import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {
  installLlmConfig,saveLlmConfig,getLlmConfig,callConfiguredLlm,getLlmUsageToday
} from "../llm_config.mjs";
import {buildReceptionistPrompt} from "../receptionist_brain.mjs";

const sample={
  reply:"Claro! Posso te ajudar. Qual serviço você gostaria de conhecer?",
  intent:"service",handoff:false,reason:"Perguntou sobre atendimento",confidence:0.94,
  entities:{service:"",date:"",time:"",professional:""}
};

test("OpenAI é configurado com chave criptografada e saída JSON estruturada, sem armazenar histórico na API",async()=>{
  const db=new DatabaseSync(":memory:");
  installLlmConfig(db);
  const oldFetch=globalThis.fetch;
  const oldQuota=process.env.NOVAGENTE_LLM_DAILY_LIMIT;
  let calls=0;
  process.env.NOVAGENTE_LLM_DAILY_LIMIT="2";
  globalThis.fetch=async(url,options)=>{
    calls++;
    assert.equal(url,"https://api.openai.com/v1/responses");
    assert.equal(options.method,"POST");
    assert.equal(options.headers.authorization,"Bearer QA-only-not-a-real-key");
    const body=JSON.parse(options.body);
    assert.equal(body.model,"gpt-6-luna");
    assert.equal(body.store,false);
    assert.equal(body.reasoning.effort,"none");
    assert.equal(body.text.format.type,"json_schema");
    assert.equal(body.text.format.strict,true);
    const schema=body.text.format.schema;
    assert.ok(schema.required.includes("reply"));
    assert.equal(schema.additionalProperties,false);
    assert.equal(schema.properties.entities.additionalProperties,false);
    return new Response(JSON.stringify({
      model:"gpt-6-luna",id:"response-qa",
      output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(sample)}]}],
      usage:{input_tokens:300,output_tokens:80}
    }),{status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const cfg=saveLlmConfig(db,"salon-a",{provider:"openai",model:"gpt-6-luna",api_key:"QA-only-not-a-real-key"});
    assert.equal(cfg.has_api_key,true);
    assert.equal(cfg.api_key,"");
    const stored=db.prepare("select api_key_enc from llm_configs where tenant_id=?").get("salon-a");
    assert.notEqual(stored.api_key_enc,"QA-only-not-a-real-key");
    assert.doesNotMatch(stored.api_key_enc,/QA-only/);
    const out=await callConfiguredLlm(db,"salon-a","Retorne JSON para atendente");
    assert.deepEqual(JSON.parse(out.text),sample);
    assert.equal(out.provider,"openai");
    await callConfiguredLlm(db,"salon-a","Outra mensagem");
    const usage=getLlmUsageToday(db,"salon-a");
    assert.equal(usage.requests,2);assert.equal(usage.input_tokens,600);assert.equal(usage.output_tokens,160);
    await assert.rejects(callConfiguredLlm(db,"salon-a","Cota atingida"),/llm_daily_limit_reached/);
    assert.equal(calls,2);
    assert.equal(getLlmUsageToday(db,"salon-b").requests,0,"cota de outro salão isolada");
    assert.throws(()=>saveLlmConfig(db,"salon-a",{provider:"deepseek",model:"deepseek-chat"}),/api_key_required/);
  }finally{
    globalThis.fetch=oldFetch;
    if(oldQuota===undefined)delete process.env.NOVAGENTE_LLM_DAILY_LIMIT;
    else process.env.NOVAGENTE_LLM_DAILY_LIMIT=oldQuota;
    db.close();
  }
});

test("falhas no provedor entram na auditoria de uso sem mostrar a chave",async()=>{
  const db=new DatabaseSync(":memory:");installLlmConfig(db);
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:"Permissão insuficiente"}}),
    {status:403,headers:{"content-type":"application/json"}});
  try{
    saveLlmConfig(db,"salon-x",{provider:"openai",model:"gpt-6-luna",api_key:"QA-test-secret"});
    await assert.rejects(callConfiguredLlm(db,"salon-x","oi"),/Permissão insuficiente/);
    const u=getLlmUsageToday(db,"salon-x");
    assert.equal(u.requests,1);assert.equal(u.failures,1);
  }finally{globalThis.fetch=oldFetch;db.close()}
});

test("prompt minimiza documentos, telefone, aniversário, notas de saúde e e-mail da cliente",()=>{
  const history=[
    {direction:"in",sender_type:"client",body:"Meu número é 69 99999-1234, e-mail ana@example.com e CPF 123.456.789-09",created_at:"2026-11-07T10:00:00.000Z"},
    {direction:"out",sender_type:"assistant",body:"Olá Ana, qual dia prefere?",created_at:"2026-11-07T10:01:00.000Z"}
  ];
  const db={prepare(sql){
    return {all(){
      if(sql.includes("from messages"))return history;
      if(sql.includes("from services"))return [{name:"Limpeza de Pele Profunda",category:"Facial",duration_min:60,price_cents:15900}];
      return [];
    }};
  }};
  const prompt=buildReceptionistPrompt({db,tenantId:"salon-qa",client:{
    name:"Ana Sobrenome",phone:"69999991234",birthday:"1980-01-01",
    notes:"Detalhes privados da ficha",allergies:"Alergia confidencial",tags:"[]"
  },conversation:{id:"conversation-qa"},text:"Pode me chamar no 69 99999-1234?",cfg:{}});
  assert.match(prompt,/Ana/);
  assert.doesNotMatch(prompt,/Ana Sobrenome/);
  assert.doesNotMatch(prompt,/1980-01-01|Alergia confidencial|Detalhes privados da ficha/);
  assert.doesNotMatch(prompt,/69999991234|99999-1234|ana@example\.com|123\.456\.789-09/);
  assert.match(prompt,/\[telefone omitido\]/);
  assert.match(prompt,/\[e-mail omitido\]/);
  assert.match(prompt,/Limpeza de Pele Profunda/);
  assert.match(prompt,/assistente virtual/);
});

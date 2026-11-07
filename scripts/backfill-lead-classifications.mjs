#!/usr/bin/env node
// Migração única opcional: só reorganiza histórico se explicitamente --apply.
// Jamais envia mensagens, não mexe em categorias já alteradas nem loga dados pessoais.
import {DatabaseSync} from "node:sqlite";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {installCommercialAutomation} from "../commercial-automation.mjs";
import {installLeadClassification,classifyIncomingLead,inferLeadClassification} from "../lead-classification.mjs";

const args=process.argv.slice(2),apply=args.includes("--apply"),dbArg=args.find(x=>x.startsWith("--db="));
if(!dbArg)throw new Error("Use --db=/caminho/estetica.sqlite [--apply]");
const file=dbArg.slice(5);
if(!path.isAbsolute(file))throw new Error("DB precisa ser caminho absoluto");
const db=new DatabaseSync(file,{readOnly:!apply});
try{
 if(apply){installCommercialAutomation(db);installLeadClassification(db)}
 else {
   const fields=db.prepare("pragma table_info(conversations)").all().map(x=>x.name);
   if(!fields.includes("classification_source"))console.log("INFO_SCHEMA_NOT_INSTALLED: atualização de código necessária antes de --apply");
 }
 const eligible=db.prepare(`select co.id conversation_id,co.tenant_id,co.client_id,
    m.id internal_id,m.external_message_id,m.body,m.message_type,m.metadata,m.created_at
   from conversations co
   join messages m on m.conversation_id=co.id and m.tenant_id=co.tenant_id
   where co.channel='whatsapp' and co.category='general' and co.priority='normal'
     and m.direction='in' and m.created_at=(
       select max(m2.created_at) from messages m2
       where m2.conversation_id=co.id and m2.tenant_id=co.tenant_id and m2.direction='in')
   order by co.tenant_id,co.id`).all();
 const stats={evaluated:0,proposed:0,applied:0,preserved:0,failed:0};
 for(const row of eligible){
   stats.evaluated++;
   let intent=null;
   try{intent=JSON.parse(row.metadata||"{}").intent||null}catch{}
   const prediction=inferLeadClassification(row.body,{intent,hasMedia:row.message_type==="media"});
   if(prediction.category!=="general"&&prediction.confidence>=.8)stats.proposed++;
   if(!apply)continue;
   const messageId=row.external_message_id||row.internal_id;
   try{
    const result=classifyIncomingLead(db,{tenantId:row.tenant_id,conversationId:row.conversation_id,
      clientId:row.client_id,messageId,text:row.body,intent,hasMedia:row.message_type==="media",
      at:row.created_at});
    if(result.applied)stats.applied++;else stats.preserved++;
   }catch(e){stats.failed++;console.error("CLASSIFICATION_BACKFILL_ERROR",String(e.message||e).slice(0,100))}
 }
 console.log(JSON.stringify({mode:apply?"APPLY":"DRY_RUN",...stats,external_messages_sent:0}));
 if(stats.failed)process.exitCode=2;
}finally{db.close()}

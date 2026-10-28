import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  installWhatsApp,registerTenantSession,ingestWahaEvent,
  listConversations,conversationMessages,markConversationRead
} from "../whatsapp.mjs";

function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE clients(
      id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT,phone TEXT,
      email TEXT,birthday TEXT,tags TEXT,source TEXT,notes TEXT,created_at TEXT,updated_at TEXT
    );
    CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT);
    CREATE TABLE conversations(
      id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,client_id TEXT,
      channel TEXT NOT NULL DEFAULT 'whatsapp',external_id TEXT,status TEXT NOT NULL DEFAULT 'open',
      assigned_user_id TEXT,last_message_at TEXT,created_at TEXT NOT NULL
    );
  `);
  installWhatsApp(db);
  registerTenantSession(db,"salon-a","sessao-teste");
  return db;
}

test("mensagem recebida cria contato, conversa e contexto de CRM uma única vez",async()=>{
  const db=fixture();
  try{
    const event={
      session:"sessao-teste",event:"message",
      payload:{id:"wa-msg-1",from:"5569999990011@c.us",fromMe:false,body:"Quero marcar uma coloração",pushName:"Juliana"}
    };
    const first=await ingestWahaEvent({db,tenantId:"salon-a",event,defaultHandlingMode:"human",allowAi:false});
    assert.equal(first.accepted,true);
    assert.equal(first.type,"message");
    assert.equal(first.handlingMode,"human");
    const client=db.prepare("select * from clients where tenant_id=?").get("salon-a");
    assert.equal(client.name,"Juliana");
    assert.equal(client.phone,"5569999990011");
    const co=listConversations(db,"salon-a");
    assert.equal(co.length,1);
    assert.equal(co[0].client_id,client.id);
    assert.equal(co[0].last_message_direction,"in");
    assert.equal(co[0].unread_count,1);
    assert.equal(co[0].last_message,"Quero marcar uma coloração");
    const duplicate=await ingestWahaEvent({db,tenantId:"salon-a",event,allowAi:false});
    assert.equal(duplicate.type,"duplicate");
    assert.equal(conversationMessages(db,"salon-a",first.conversationId).length,1);
    markConversationRead(db,"salon-a",first.conversationId);
    assert.equal(listConversations(db,"salon-a")[0].unread_count,0);
    const second=await ingestWahaEvent({
      db,tenantId:"salon-a",allowAi:false,
      event:{...event,payload:{...event.payload,id:"wa-msg-2",body:"Posso ir amanhã?"}}
    });
    assert.equal(second.clientId,first.clientId);
    assert.equal(second.conversationId,first.conversationId);
    assert.equal(db.prepare("select count(*) n from clients where tenant_id=?").get("salon-a").n,1);
    assert.equal(db.prepare("select count(*) n from messages where tenant_id=?").get("salon-a").n,2);
    assert.equal(listConversations(db,"salon-a")[0].unread_count,1);
  }finally{db.close()}
});

test("webhook de sessão diferente não contamina o CRM",async()=>{
  const db=fixture();
  try{
    const res=await ingestWahaEvent({db,tenantId:"salon-a",allowAi:false,
      event:{session:"sessao-de-outra-empresa",event:"message",payload:{id:"x",from:"556999991111@c.us",body:"Olá"}}});
    assert.equal(res.accepted,false);
    assert.equal(db.prepare("select count(*) n from clients").get().n,0);
  }finally{db.close()}
});

test("Modo automático responde apenas à próxima mensagem; conversas de atendimento humano manual continuam humanas",async()=>{
  const db=fixture();let sends=0;
  try{
    const make=(id,body)=>({session:"sessao-teste",event:"message",payload:{
      id,from:"5569999990022@c.us",fromMe:false,body,pushName:"Cliente Teste"}});
    const human=await ingestWahaEvent({db,tenantId:"salon-a",event:make("auto-1","Oi"),allowAi:false});
    assert.equal(human.handlingMode,"human");
    assert.equal(sends,0);
    const automatic=await ingestWahaEvent({db,tenantId:"salon-a",event:make("auto-2","Tem horário amanhã?"),
      allowAi:true,defaultHandlingMode:"ai",
      autoReply:async()=>({text:"Me conta qual serviço você quer fazer para eu consultar a agenda."}),
      deliverText:async()=>{sends++;return {messageId:"mock-out-auto-1"};}});
    assert.equal(automatic.handlingMode,"ai");
    assert.equal(automatic.automaticReply,true);
    assert.equal(sends,1);
    const duplicate=await ingestWahaEvent({db,tenantId:"salon-a",event:make("auto-2","Tem horário amanhã?"),
      allowAi:true,defaultHandlingMode:"ai",autoReply:async()=>({text:"Não deve repetir"}),deliverText:async()=>{sends++;return {messageId:"mock-out-auto-2"};}});
    assert.equal(duplicate.type,"duplicate");
    assert.equal(sends,1);
    db.prepare("update conversations set handling_mode='human',handling_mode_source='manual' where id=?").run(automatic.conversationId);
    const manual=await ingestWahaEvent({db,tenantId:"salon-a",event:make("auto-3","Quero falar com a equipe"),
      allowAi:true,defaultHandlingMode:"ai",autoReply:async()=>({text:"Não deve responder"}),
      deliverText:async()=>{sends++;return {messageId:"mock-out-auto-3"};}});
    assert.equal(manual.handlingMode,"human");
    assert.equal(sends,1);
  }finally{db.close()}
});
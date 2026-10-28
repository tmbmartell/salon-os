#!/usr/bin/env node
// One-time, server-local administrative bootstrap for a new persistent pilot.
// Runs ONLY on the VPS by an operator with filesystem access. Never prints secrets.
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const env=Object.fromEntries(fs.readFileSync(path.join(root,".env.runtime"),"utf8")
  .split("\n").filter(l=>l&&l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
const access=JSON.parse(fs.readFileSync(path.join(root,".operator-access.json"),"utf8"));
const token=env.NOVAGENTE_SETUP_TOKEN;
if(!token||token.length<32||!access.email||!access.password||access.password.length<14){
 console.error("Acesso inicial seguro não configurado.");process.exit(1);
}
const host="http://127.0.0.1:19333";
const stateResponse=await fetch(host+"/api/auth/state");
if(!stateResponse.ok)throw Error("Aplicação local indisponível: "+stateResponse.status);
const state=await stateResponse.json();
if(state.claimed){
 console.log("A conta proprietária já foi configurada. Nenhuma senha foi alterada.");
}else{
 const setup=await fetch(host+"/api/auth/setup",{
  method:"POST",
  headers:{"content-type":"application/json","x-novagente-setup-token":token},
  body:JSON.stringify({email:access.email,password:access.password,name:"Administradora NOVAGENTE Estética"})
 });
 if(!setup.ok){
  console.error("Não foi possível concluir o setup. HTTP",setup.status);
  process.exit(2);
 }
 console.log("Conta administrativa inicial criada.");
}
const login=await fetch(host+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(access)});
if(login.status!==200){
 console.error("O teste de autenticação falhou: HTTP",login.status);
 process.exit(3);
}
console.log("Login validado.");
console.log("Usuário:",access.email);
console.log("Consulte a senha localmente em .operator-access.json; nunca compartilhe esse arquivo.");
console.log("No navegador: Atendimento > Conexão WhatsApp > Mostrar QR Code.");
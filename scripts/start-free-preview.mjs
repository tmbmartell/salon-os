#!/usr/bin/env node
// Render Free: banco descartável novo a cada inicialização. Jamais apontar
// para SQLite de cliente. Os acessos são configurados somente via Render env.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {verifyFreePreviewEnvironment} from "../free-preview.mjs";

if(process.env.SALON_DB)throw Error("free_preview_rejects_existing_database_path");
if(process.env.NOVAGENTE_FREE_PREVIEW!=="yes"||process.env.NODE_ENV!=="production")
  throw Error("free_preview_explicit_mode_required");

const directory=fs.mkdtempSync(path.join(os.tmpdir(),"novagente-free-preview-"));
const env={...process.env,
  SALON_DB:path.join(directory,"salon.sqlite"),
  NOVAGENTE_FREE_PREVIEW_ACTIVE:"true",
  NOVAGENTE_ENABLE_RECEPTIONIST_AI:"false",
  NOVAGENTE_ENABLE_WHATSAPP_AI:"false"
};
try{
  verifyFreePreviewEnvironment(env);
}catch(e){
  fs.rmSync(directory,{recursive:true,force:true});
  throw e;
}
const server=spawn(process.execPath,["server.mjs"],{cwd:path.resolve(import.meta.dirname,".."),env,stdio:"inherit"});
let stopping=false;
function stop(signal){
  if(stopping)return;
  stopping=true;
  if(server.exitCode===null)server.kill(signal);
}
process.on("SIGTERM",()=>stop("SIGTERM"));
process.on("SIGINT",()=>stop("SIGINT"));
server.on("error",e=>{console.error("preview_server_start_failed:",e.code);process.exitCode=1});
server.on("exit",(code,signal)=>{
  fs.rmSync(directory,{recursive:true,force:true});
  if(signal)process.exitCode=128+(signal==="SIGTERM"?15:2);
  else process.exitCode=code??1;
});

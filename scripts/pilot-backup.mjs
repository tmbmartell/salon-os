#!/usr/bin/env node
// Execução local/CI. Não publica URLs de backup nem transfere dados bancários.
// Senha fornecida somente por variável de ambiente, nunca como argumento CLI.
import path from "node:path";
import process from "node:process";
import {createPilotBackup,verifyPilotBackup,restorePilotBackup} from "../pilot-backup.mjs";
const action=process.argv[2],args=process.argv.slice(3);
const input={};
for(let i=0;i<args.length;i+=2){
  if(!args[i]?.startsWith("--")||!args[i+1])throw Error("invalid_arguments");
  input[args[i].slice(2)]=args[i+1];
}
function required(k){if(!input[k])throw Error("missing_argument_"+k);return input[k]}
try{
  if(!["create","verify","restore"].includes(action))throw Error("expected_create_verify_or_restore");
  const passphrase=process.env.NOVAGENTE_BACKUP_PASSPHRASE;
  if(!passphrase)throw Error("NOVAGENTE_BACKUP_PASSPHRASE_is_required");
  let result;
  if(action==="create"){
    const databasePath=required("db"),archivePath=required("archive");
    result=createPilotBackup({databasePath,archivePath,passphrase});
  }else if(action==="verify"){
    result=verifyPilotBackup({archivePath:required("archive"),passphrase});
  }else{
    result=restorePilotBackup({archivePath:required("archive"),
      targetDirectory:required("target-dir"),passphrase});
  }
  console.log(JSON.stringify({ok:true,action,...result},null,2));
}catch(error){
  console.error(JSON.stringify({ok:false,error:error.message}));
  process.exitCode=1;
}

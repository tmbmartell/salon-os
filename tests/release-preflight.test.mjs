import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {evaluateRelease} from "../scripts/release-preflight.mjs";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const key=Buffer.alloc(32,7).toString("base64");
test("release candidate: árvore acumulada e scripts mínimos prontos para regressão",()=>{
  const res=evaluateRelease({directory:repo,mode:"ci",nodeVersion:"22.11.0"});
  assert.equal(res.blockers.length,0,JSON.stringify(res.blockers));
  assert.equal(res.automated_checks_passed,true);
  assert.equal(res.production_ready,false,"nenhum teste declara produção pronta");
  assert.equal(res.whatsapp_required,false,"WhatsApp foi adiado para outra fase");
});
test("preflight nunca trata ausência de segurança de produção como liberação",()=>{
  const missing=evaluateRelease({directory:repo,mode:"production",nodeVersion:"22.11.0",environment:{}});
  for(const blocker of ["node_env","public_https_origin","mfa_encryption_key","bootstrap_token","database_outside_public_tree"])
    assert.ok(missing.blockers.includes(blocker),blocker);
  assert.equal(missing.production_ready,false);
  const configured=evaluateRelease({directory:repo,mode:"production",nodeVersion:"22.11.0",
    environment:{NODE_ENV:"production",NOVAGENTE_PUBLIC_ORIGIN:"https://salon.example.invalid",
      NOVAGENTE_MFA_KEY:key,NOVAGENTE_SETUP_TOKEN:"test-long-initial-setup-token-123456",
      SALON_DB:"/srv/novagente/data/salon.sqlite"}});
  assert.deepEqual(configured.blockers,[]);
  assert.equal(configured.production_ready,false,"pendências humanas continuam bloqueando liberação");
  assert.ok(configured.manual_review.includes("offsite_backup_and_restore"));
  assert.ok(configured.manual_review.includes("user_acceptance"));
  const result=JSON.stringify(configured);
  assert.equal(result.includes(key),false,"não serializar segredos");
});
test("preflight falha quando o pacote da candidata perde arquivos essenciais",()=>{
  const missing=fs.mkdtempSync(path.join(os.tmpdir(),"novagente-preflight-"));
  try{
    fs.writeFileSync(path.join(missing,"package.json"),JSON.stringify({scripts:{check:"true",test:"true","release:preflight":"true"}}));
    const res=evaluateRelease({directory:missing,mode:"ci",nodeVersion:"22.11.0"});
    assert.ok(res.blockers.includes("complete_source_tree"));
  }finally{fs.rmSync(missing,{recursive:true,force:true})}
});

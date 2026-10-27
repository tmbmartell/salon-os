#!/usr/bin/env node
/**
 * Release candidate checks for NOVAGENTE Estética.
 * CI mode validates a complete delivery tree without needing secrets.
 * Production mode deliberately never self-certifies operational approval:
 * infrastructure, restoration drills, MFA recovery and LGPD require human evidence.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const expectedFiles=[
  "server.mjs","auth.mjs","tenant-admin.mjs","mfa.mjs","request-security.mjs",
  "whatsapp.mjs","whatsapp-backfill.mjs","owner-eye.mjs","marketing.mjs",
  "phase2.mjs","phase3.mjs","phase5.mjs","phase6.mjs","phase7.mjs",
  "phase8.mjs","phase9.mjs","phase10.mjs","phase11.mjs",
  "pilot-backup.mjs","scripts/pilot-backup.mjs",
  "public/index.html","public/app.js","public/security-center.js",
  "public/beauty-ui.css","public/novagente-logo.svg",
  "public/mfa-security-ui.js","public/whatsapp-backfill-ui.js",
  "docs/ETAPA-17-PRIVACIDADE-CHECKLIST-ENTREGA.md",
  ".github/workflows/security.yml",".github/workflows/browser-qa.yml"
];
const stage=process.argv.includes("--production")?"production":"ci";
export function evaluateRelease({directory=root,environment=process.env,nodeVersion=process.versions.node,mode="ci"}={}){
  if(!["ci","production"].includes(mode))throw Error("unsupported_mode");
  const checks=[];
  function check(id,passed,detail){
    checks.push({id,status:passed?"passed":"blocked",detail});
  }
  function manual(id,detail){checks.push({id,status:"manual",detail})}
  const major=Number(String(nodeVersion).split(".")[0]);
  check("node_version",Number.isInteger(major)&&major>=22,"Node.js >= 22");
  const missing=expectedFiles.filter(f=>!fs.existsSync(path.join(directory,f)));
  check("complete_source_tree",missing.length===0,missing.length?"Arquivos faltantes: "+missing.join(", "):
    "API, módulos, interface, documentação e workflows presentes");
  let pkg;
  try{pkg=JSON.parse(fs.readFileSync(path.join(directory,"package.json"),"utf8"))}
  catch{pkg=null}
  check("package_scripts",!!pkg&&["check","test","release:preflight"].every(k=>typeof pkg.scripts?.[k]==="string"),
    "Scripts de sintaxe, regressão e pré-validação disponíveis");
  // Integrations are intentionally NOT prerequisites for the offline pilot.
  if(mode==="production"){
    check("node_env",environment.NODE_ENV==="production","NODE_ENV deve ser production");
    const origin=String(environment.NOVAGENTE_PUBLIC_ORIGIN||"");
    let https=false;
    try{const u=new URL(origin);https=u.protocol==="https:"&&!!u.hostname&&
      u.username===""&&u.password===""&&u.pathname==="/"&&u.search===""&&u.hash===""&&
      !origin.endsWith("/");}catch{}
    check("public_https_origin",https,"Origem pública HTTPS exata sem barra final");
    const mfaKey=String(environment.NOVAGENTE_MFA_KEY||"");
    const key=Buffer.from(mfaKey,"base64");
    check("mfa_encryption_key",key.length===32&&key.toString("base64").replace(/=+$/,"")===mfaKey.replace(/=+$/,""),
      "NOVAGENTE_MFA_KEY deve conter 32 bytes em base64, estável entre servidores");
    check("bootstrap_token",String(environment.NOVAGENTE_SETUP_TOKEN||"").length>=32,
      "Segredo inicial de proprietária com 32 ou mais caracteres configurado");
    const db=String(environment.SALON_DB||"");
    const dbAbs=db?path.resolve(db):"";
    check("database_outside_public_tree",!!db&&
      !dbAbs.startsWith(path.join(directory,"public")+path.sep)&&
      !dbAbs.startsWith(path.join(directory,".git")+path.sep),
      "SALON_DB definido fora da árvore pública e do Git");
    manual("offsite_backup_and_restore","Comprovar backup cifrado externo, rotação e restauração real");
    manual("security_review","Homologar MFA operacional, CSRF, acesso às fichas e revisão LGPD");
    manual("user_acceptance","Executar piloto com gestora, recepção e profissional em aparelhos físicos");
    manual("https_proxy_and_rollbacks","Validar proxy, cookies, cabeçalhos HTTPS, monitoramento e rollback");
  }
  const blockers=checks.filter(x=>x.status==="blocked").map(x=>x.id);
  const manualReview=checks.filter(x=>x.status==="manual").map(x=>x.id);
  return {system:"NOVAGENTE Estética",target:mode==="production"?"production_gate":"offline_candidate",
    whatsapp_required:false,checks,blockers,manual_review:manualReview,
    automated_checks_passed:blockers.length===0,production_ready:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=evaluateRelease({mode:stage});
  console.log(JSON.stringify(result,null,2));
  if(result.blockers.length||stage==="production"&&result.manual_review.length)process.exitCode=1;
}

// Ambiente de demonstração pública de uso descartável.
// Nunca provisionar a conta de demonstração em bancos de clientes.
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import {makePasswordHash} from "./auth.mjs";

export const isFreePreview=()=>process.env.NOVAGENTE_FREE_PREVIEW_ACTIVE==="true";

export function verifyFreePreviewEnvironment(env=process.env){
  if(env.NOVAGENTE_FREE_PREVIEW!=="yes"||env.NODE_ENV!=="production")
    throw Error("free_preview_requires_explicit_production_isolation");
  const db=path.resolve(String(env.SALON_DB||""));
  const tempPrefix=path.join(os.tmpdir(),"novagente-free-preview-");
  if(!db.startsWith(tempPrefix)||path.basename(db)!=="salon.sqlite")
    throw Error("free_preview_requires_disposable_database");
  const email=String(env.NOVAGENTE_DEMO_OWNER_EMAIL||"").toLowerCase().trim();
  const pw=String(env.NOVAGENTE_DEMO_OWNER_PASSWORD||"");
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||pw.length<16||pw.length>128)
    throw Error("free_preview_owner_credentials_missing");
  const forbidden=[
    "WAHA_API_KEY","WAHA_BASE_URL","WAHA_WEBHOOK_HMAC_SECRET","JEV_CONTROL_PLANE_URL",
    "OPENAI_API_KEY","ANTHROPIC_API_KEY","DATABASE_URL"
  ];
  if(forbidden.some(k=>String(env[k]||"").trim()))throw Error("free_preview_external_integration_forbidden");
  if(env.NOVAGENTE_ENABLE_RECEPTIONIST_AI==="true")
    throw Error("free_preview_ai_must_remain_disabled");
  return {email,db};
}

export function provisionFreePreview(db,tenantId,env=process.env){
  if(env.NOVAGENTE_FREE_PREVIEW_ACTIVE!=="true")return false;
  const {email}=verifyFreePreviewEnvironment(env);
  const owner=db.prepare("select id from users where tenant_id=? and role='owner' order by created_at limit 1").get(tenantId);
  if(!owner)throw Error("free_preview_owner_record_missing");
  const active=db.prepare("select password_hash from users where id=? and tenant_id=?").get(owner.id,tenantId);
  if(active?.password_hash)throw Error("free_preview_database_not_fresh");
  db.prepare("update users set name=?,email=?,password_hash=?,updated_at=? where id=? and tenant_id=?")
    .run("Proprietária — demonstração",email,makePasswordHash(env.NOVAGENTE_DEMO_OWNER_PASSWORD),
      new Date().toISOString(),owner.id,tenantId);
  return true;
}

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {createPilotBackup,verifyPilotBackup,restorePilotBackup} from "../pilot-backup.mjs";
import {installPhase5,handlePhase5Api} from "../phase5.mjs";

const passphrase="qa-backup-only-strong-passphrase-123456789";
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ne-backup-qa-"));
  const dbPath=path.join(dir,"salon.sqlite");
  const db=new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE clients(id text primary key,name text);
    CREATE TABLE marketing_assets(id text primary key,tenant_id text,storage_key text);
    CREATE TABLE users(id text primary key,tenant_id text,name text,email text,role text,active integer,created_at text,updated_at text);
    CREATE TABLE audit_log(id text primary key,tenant_id text,user_id text,action text,entity_type text,entity_id text,metadata text,created_at text);`);
  db.prepare("insert into clients(id,name) values(?,?)").run("qa-client","Cliente fictícia");
  const tenant="11111111-1111-4111-8111-111111111111",key="aaabbbccc-1234.webp";
  const mediaDir=path.join(dir,"marketing-assets",tenant);
  fs.mkdirSync(mediaDir,{recursive:true});
  const media=Buffer.from("RIFF0000WEBPimagem-qa");
  fs.writeFileSync(path.join(mediaDir,key),media);
  db.prepare("insert into marketing_assets(id,tenant_id,storage_key) values(?,?,?)").run("img",tenant,key);
  db.prepare("insert into users(id,tenant_id,name,email,role,active,created_at) values(?,?,?,?,?,?,?)")
    .run("owner",tenant,"Dona QA","qa@example.invalid","owner",1,new Date().toISOString());
  installPhase5(db);
  return {dir,db,dbPath,tenant,key,media};
}
test("backup cifrado preserva SQLite WAL e imagem e permite verificar e restaurar em pasta nova",()=>{
  const f=fixture(),archive=path.join(f.dir,"backups","pilot.nebak");
  try{
    const created=createPilotBackup({databasePath:f.dbPath,archivePath:archive,passphrase});
    assert.equal(created.encrypted,true);
    assert.equal(created.assets,1);
    const raw=fs.readFileSync(archive);
    assert.ok(raw.subarray(0,6).toString()==="NEBAK1");
    assert.equal(raw.includes(Buffer.from("Cliente fictícia")),false,"nome não aparece em backup cifrado");
    const verified=verifyPilotBackup({archivePath:archive,passphrase});
    assert.equal(verified.sqlite_integrity,"ok");
    assert.equal(verified.asset_count,1);
    assert.throws(()=>verifyPilotBackup({archivePath:archive,passphrase:"senha-errada-muito-grande"}),/incorrect_passphrase_or_corrupt_backup/);
    assert.throws(()=>createPilotBackup({databasePath:f.dbPath,archivePath:archive,passphrase}),/backup_already_exists/);
    const folder=path.join(f.dir,"restaurado");
    const done=restorePilotBackup({archivePath:archive,targetDirectory:folder,passphrase});
    assert.equal(done.verified,true);
    assert.deepEqual(fs.readFileSync(path.join(folder,"marketing-assets",f.tenant,f.key)),f.media);
    const restored=new DatabaseSync(path.join(folder,"salon.sqlite"),{readOnly:true});
    assert.equal(restored.prepare("select name from clients where id='qa-client'").get().name,"Cliente fictícia");
    restored.close();
    assert.throws(()=>restorePilotBackup({archivePath:archive,targetDirectory:folder,passphrase}),/restore_target_must_not_exist/);
    const receipt=JSON.parse(fs.readFileSync(path.join(f.dir,"backups","restore-verify.json"),"utf8"));
    assert.equal(receipt.ok,true);
    assert.equal(receipt.sqlite_integrity,"ok");
  }finally{f.db.close();fs.rmSync(f.dir,{recursive:true,force:true})}
});
test("arquivo corrompido não passa na autenticação; mídia ausente impede backup falso de restauração",()=>{
  const f=fixture(),archive=path.join(f.dir,"backups","pilot.nebak");
  try{
    createPilotBackup({databasePath:f.dbPath,archivePath:archive,passphrase});
    const raw=fs.readFileSync(archive);raw[raw.length-1]^=0x0f;
    fs.writeFileSync(archive,raw);
    assert.throws(()=>verifyPilotBackup({archivePath:archive,passphrase}),/incorrect_passphrase_or_corrupt_backup/);
    assert.throws(()=>restorePilotBackup({archivePath:archive,
      targetDirectory:path.join(f.dir,"never-created"),passphrase}),/incorrect_passphrase_or_corrupt_backup/);
    assert.equal(fs.existsSync(path.join(f.dir,"never-created")),false);
    const other=path.join(f.dir,"backups","other.nebak");
    fs.rmSync(path.join(f.dir,"marketing-assets",f.tenant,f.key));
    createPilotBackup({databasePath:f.dbPath,archivePath:other,passphrase});
    assert.throws(()=>verifyPilotBackup({archivePath:other,passphrase}),/missing_marketing_asset/);
  }finally{f.db.close();fs.rmSync(f.dir,{recursive:true,force:true})}
});
test("admin reporta cópias reais configuradas; não exibe caminho fixo antigo nem chama arquivo íntegro sem restauração",async()=>{
  const f=fixture(),archive=path.join(f.dir,"backups","pilot.nebak");
  const prevDb=process.env.SALON_DB,prevDir=process.env.NOVAGENTE_BACKUP_DIR;
  process.env.SALON_DB=f.dbPath;process.env.NOVAGENTE_BACKUP_DIR=path.dirname(archive);
  try{
    const args={req:{method:"GET"},res:{},url:new URL("/api/admin/overview","http://localhost"),
      db:f.db,tenant:f.tenant,user:{id:"owner",role:"owner",tenantId:f.tenant},
      send:(_res,status,data)=>({status,data}),requirePermission:()=>{},audit:()=>{},parseBody:async()=>({})};
    const initial=await handlePhase5Api(args);
    assert.equal(initial.status,200);
    assert.equal(initial.data.backup.count,0);
    assert.equal(initial.data.restore.ok,false);
    createPilotBackup({databasePath:f.dbPath,archivePath:archive,passphrase});
    const after=await handlePhase5Api(args);
    assert.equal(after.data.backup.count,1);
    assert.equal(after.data.backup.encrypted,true);
    assert.equal(after.data.backup.latest.name,"pilot.nebak");
    assert.equal(after.data.restore.ok,false);
    restorePilotBackup({archivePath:archive,targetDirectory:path.join(f.dir,"restore-qa"),passphrase});
    const confirmed=await handlePhase5Api(args);
    assert.equal(confirmed.data.restore.ok,true);
  }finally{
    if(prevDb===undefined)delete process.env.SALON_DB;else process.env.SALON_DB=prevDb;
    if(prevDir===undefined)delete process.env.NOVAGENTE_BACKUP_DIR;else process.env.NOVAGENTE_BACKUP_DIR=prevDir;
    f.db.close();fs.rmSync(f.dir,{recursive:true,force:true});
  }
});

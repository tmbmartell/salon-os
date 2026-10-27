// Backup cifrado para homologação local. Nunca publica dados via HTTP.
// SQLite usa VACUUM INTO para snapshot consistente mesmo com WAL ativo.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import zlib from "node:zlib";
import {DatabaseSync} from "node:sqlite";

const MAGIC=Buffer.from("NEBAK1");
const FORMAT="novagente-estetica-pilot-backup-v1";
const LIMIT=256*1024*1024;
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
const safeAsset=relative=>/^[A-Za-z0-9_-]+\/[0-9a-f-]+\.(?:png|jpg|jpeg|gif|webp)$/i.test(relative);
function passwordOk(pass){
  if(typeof pass!=="string"||pass.length<16)throw new Error("backup_passphrase_minimum_16");
}
function snapshotSQLite(dbPath,temporary){
  if(!fs.existsSync(dbPath)||!fs.statSync(dbPath).isFile())throw new Error("database_not_found");
  const db=new DatabaseSync(dbPath,{readOnly:true});
  try{
    db.exec("VACUUM INTO '"+temporary.replaceAll("'","''")+"'");
  }finally{db.close()}
}
function collectAssets(folder){
  if(!fs.existsSync(folder))return [];
  const output=[];
  for(const tenant of fs.readdirSync(folder,{withFileTypes:true})){
    if(!tenant.isDirectory()||tenant.isSymbolicLink()||!/^[A-Za-z0-9_-]+$/.test(tenant.name))
      throw new Error("unsupported_media_entry");
    const root=path.join(folder,tenant.name);
    for(const entry of fs.readdirSync(root,{withFileTypes:true})){
      const relative=tenant.name+"/"+entry.name;
      if(!entry.isFile()||entry.isSymbolicLink()||!safeAsset(relative))
        throw new Error("unsupported_media_entry");
      const file=fs.readFileSync(path.join(root,entry.name));
      if(file.length>LIMIT)throw new Error("backup_too_large");
      output.push({path:relative,sha256:hash(file),data:file.toString("base64")});
    }
  }
  return output;
}
function createEnvelope(json,passphrase){
  passwordOk(passphrase);
  const plaintext=zlib.gzipSync(Buffer.from(JSON.stringify(json)),{level:6});
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12);
  const key=crypto.scryptSync(passphrase,salt,32,{N:32768,maxmem:64*1024*1024});
  try{
    const cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
    const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);
    return Buffer.concat([MAGIC,salt,iv,cipher.getAuthTag(),encrypted]);
  }finally{key.fill(0)}
}
function readEnvelope(file,passphrase){
  passwordOk(passphrase);
  const encrypted=fs.readFileSync(file);
  if(encrypted.length<50||!encrypted.subarray(0,6).equals(MAGIC))throw new Error("invalid_backup_format");
  const salt=encrypted.subarray(6,22),iv=encrypted.subarray(22,34),
    tag=encrypted.subarray(34,50),bytes=encrypted.subarray(50);
  const key=crypto.scryptSync(passphrase,salt,32,{N:32768,maxmem:64*1024*1024});
  let decoded;
  try{
    const decipher=crypto.createDecipheriv("aes-256-gcm",key,iv);decipher.setAuthTag(tag);
    decoded=Buffer.concat([decipher.update(bytes),decipher.final()]);
  }catch{throw new Error("incorrect_passphrase_or_corrupt_backup")}
  finally{key.fill(0)}
  const raw=zlib.gunzipSync(decoded,{maxOutputLength:LIMIT*3});
  const parsed=JSON.parse(raw.toString("utf8"));
  if(parsed.format!==FORMAT||!Array.isArray(parsed.assets))throw new Error("invalid_backup_manifest");
  return parsed;
}
function inspectBundle(bundle){
  const sqlite=Buffer.from(bundle.database.data,"base64");
  if(hash(sqlite)!==bundle.database.sha256||sqlite.length>LIMIT)throw new Error("database_checksum_mismatch");
  const files=new Map(),mediaLimit=LIMIT;
  let total=sqlite.length;
  for(const file of bundle.assets){
    if(!safeAsset(file.path)||files.has(file.path))throw new Error("invalid_asset_path");
    const bytes=Buffer.from(file.data,"base64");
    if(hash(bytes)!==file.sha256)throw new Error("media_checksum_mismatch");
    total+=bytes.length;if(total>mediaLimit)throw new Error("backup_too_large");
    files.set(file.path,bytes);
  }
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"ne-restore-check-"));
  try{
    const local=path.join(temporary,"check.sqlite");
    fs.writeFileSync(local,sqlite,{mode:0o600});
    const db=new DatabaseSync(local,{readOnly:true});
    try{
      const integrity=db.prepare("PRAGMA integrity_check").get()?.integrity_check;
      if(integrity!=="ok")throw new Error("sqlite_integrity_failed");
      const table=db.prepare("select count(*) n from sqlite_master where name='marketing_assets'").get()?.n;
      if(table){
        const refs=db.prepare("select tenant_id,storage_key from marketing_assets").all();
        for(const a of refs){
          if(!files.has(a.tenant_id+"/"+a.storage_key))throw new Error("missing_marketing_asset");
        }
      }
      return {format:bundle.format,created_at:bundle.created_at,sqlite_integrity:"ok",
        asset_count:files.size,database_bytes:sqlite.length,archive_completeness:"sqlite_and_marketing_assets"};
    }finally{db.close()}
  }finally{fs.rmSync(temporary,{recursive:true,force:true})}
}
export function createPilotBackup({databasePath,archivePath,passphrase}){
  passwordOk(passphrase);
  const dbPath=path.resolve(databasePath),target=path.resolve(archivePath);
  if(fs.existsSync(target))throw new Error("backup_already_exists");
  if(target.startsWith(path.resolve(process.cwd(),"public")+path.sep))
    throw new Error("refuse_public_backup_path");
  const work=fs.mkdtempSync(path.join(os.tmpdir(),"ne-snapshot-"));
  try{
    const snapshot=path.join(work,"snapshot.sqlite");
    snapshotSQLite(dbPath,snapshot);
    const contents=fs.readFileSync(snapshot),assets=collectAssets(path.join(path.dirname(dbPath),"marketing-assets"));
    const estimated=contents.length+assets.reduce((sum,x)=>sum+Buffer.byteLength(x.data,"base64"),0);
    if(estimated>LIMIT)throw new Error("backup_too_large");
    const pack={format:FORMAT,created_at:new Date().toISOString(),
      database:{sha256:hash(contents),data:contents.toString("base64")},assets};
    const encrypted=createEnvelope(pack,passphrase);
    fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
    // Só apresenta o .nebak quando a escrita terminou; não substituir backups existentes.
    const temporary=path.join(path.dirname(target),"."+crypto.randomUUID()+".partial");
    try{
      fs.writeFileSync(temporary,encrypted,{flag:"wx",mode:0o600});
      fs.linkSync(temporary,target); // criação atômica, falha se target já existe
    }finally{fs.rmSync(temporary,{force:true})}
    return {archive_path:target,archive_bytes:encrypted.length,assets:assets.length,encrypted:true};
  }finally{fs.rmSync(work,{recursive:true,force:true})}
}
export function verifyPilotBackup({archivePath,passphrase}){
  return inspectBundle(readEnvelope(path.resolve(archivePath),passphrase));
}
export function restorePilotBackup({archivePath,targetDirectory,passphrase}){
  const archive=path.resolve(archivePath),target=path.resolve(targetDirectory);
  if(fs.existsSync(target))throw new Error("restore_target_must_not_exist");
  const bundle=readEnvelope(archive,passphrase),report=inspectBundle(bundle);
  const base=path.dirname(target);
  fs.mkdirSync(base,{recursive:true,mode:0o700});
  const working=fs.mkdtempSync(path.join(base,".ne-restore-"));
  let moved=false;
  try{
    fs.writeFileSync(path.join(working,"salon.sqlite"),Buffer.from(bundle.database.data,"base64"),{mode:0o600});
    for(const item of bundle.assets){
      const destination=path.join(working,"marketing-assets",item.path);
      fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
      fs.writeFileSync(destination,Buffer.from(item.data,"base64"),{flag:"wx",mode:0o600});
    }
    fs.renameSync(working,target);moved=true;
    // Prova que uma restauração PARA PASTA NOVA foi realizada, não somente listada.
    const receipt={ok:true,checked_at:new Date().toISOString(),backup_sha256:hash(fs.readFileSync(archive)),
      asset_count:report.asset_count,sqlite_integrity:report.sqlite_integrity};
    fs.writeFileSync(path.join(path.dirname(archive),"restore-verify.json"),JSON.stringify(receipt,null,2),{mode:0o600});
    return {...report,restored_to:target,verified:true};
  }finally{if(!moved)fs.rmSync(working,{recursive:true,force:true})}
}

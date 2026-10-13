import path from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {installPhase2} from "./phase2.mjs";
import {installPhase3} from "./phase3.mjs";
import {installPhase4,ensureAgentProfiles,generateAgentTasks,autoExecuteInternalTasks} from "./phase4.mjs";
import {installPhase6} from "./phase6.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const dbPath=process.env.SALON_DB||path.join(here,"data","salon.sqlite");
const db=new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
installPhase2(db);installPhase3(db);installPhase4(db);installPhase6(db);
const tenants=db.prepare("select id,name from tenants").all();
for(const t of tenants){
  ensureAgentProfiles(db,t.id);
  const out=generateAgentTasks(db,t.id,null);
  const auto=autoExecuteInternalTasks(db,t.id);
  console.log(new Date().toISOString(),t.name,{...out,auto_executed:auto});
}

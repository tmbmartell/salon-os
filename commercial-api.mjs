import {AUTOMATION_SWITCHES, FUNNEL_STAGES, classifyMessage, receptionistDraft, policies, setPolicy, setContactPermission, updateServiceRule, registerIncoming, advanceLead, commercialOverview} from "./commercial-automation.mjs";
const parseIntCents=v=>Number.isInteger(v)&&v>=0?v:null;
export async function handleCommercialApi({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit,isDemo,bookingPreview}){
  if(!url.pathname.startsWith("/api/commercial/"))return false;
  requirePermission(user,"marketing.read");
  const mustManage=()=>{
    if(user.role!=="owner")throw Object.assign(new Error("owner_required"),{status:403});
  };
  const fail=e=>send(res,e.status||400,{ok:false,error:String(e.message||"commercial_action_failed").slice(0,200)});
  if(req.method==="GET"&&url.pathname==="/api/commercial/overview"){
    return send(res,200,commercialOverview(db,tenant));
  }
  if(req.method==="GET"&&url.pathname==="/api/commercial/policies"){
    return send(res,200,{policies:policies(db,tenant),available:AUTOMATION_SWITCHES,sending_enabled:false});
  }
  if(req.method==="PATCH"&&url.pathname==="/api/commercial/policies"){
    mustManage();
    try{
      const b=await parseBody(req);
      if(!AUTOMATION_SWITCHES.includes(b.key)||typeof b.enabled!=="boolean")return send(res,400,{error:"invalid_policy"});
      const out=setPolicy(db,tenant,b.key,b.enabled,user.id);
      audit(db,user,"commercial.policy.changed","automation_policy",b.key,out);
      return send(res,200,{ok:true,...out,sending_enabled:false});
    }catch(e){return fail(e)}
  }
  const consent=url.pathname.match(/^\/api\/commercial\/clients\/([\w-]+)\/permission$/);
  if(req.method==="PATCH"&&consent){
    mustManage();
    try{
      const b=await parseBody(req);
      if(!["explicit","documented_form","revoked_by_client"].includes(b.source))return send(res,400,{error:"permission_evidence_required"});
      const out=setContactPermission(db,tenant,consent[1],b.purpose,b.allowed,b.source,b.evidence);
      audit(db,user,"commercial.permission.changed","client",consent[1],{purpose:b.purpose,allowed:b.allowed,source:b.source});
      return send(res,200,{ok:true,...out});
    }catch(e){return fail(e)}
  }
  const rule=url.pathname.match(/^\/api\/commercial\/services\/([\w-]+)\/rule$/);
  if(req.method==="PUT"&&rule){
    mustManage();
    try{
      const b=await parseBody(req);
      const out=updateServiceRule(db,tenant,rule[1],b);
      audit(db,user,"commercial.service_rule.changed","service",rule[1],out);
      return send(res,200,{ok:true,...out});
    }catch(e){return fail(e)}
  }
  const stage=url.pathname.match(/^\/api\/commercial\/leads\/([\w-]+)\/stage$/);
  if(req.method==="PATCH"&&stage){
    requirePermission(user,"marketing.write");
    try{
      const b=await parseBody(req),record=db.prepare("select client_id from commercial_leads where tenant_id=? and id=?").get(tenant,stage[1]);
      if(!record)return send(res,404,{error:"lead_not_found"});
      if(!FUNNEL_STAGES.includes(b.stage))return send(res,400,{error:"invalid_stage"});
      const nextValue=b.estimated_value_cents==null?null:parseIntCents(b.estimated_value_cents);
      if(b.estimated_value_cents!=null&&nextValue==null)return send(res,400,{error:"invalid_estimate"});
      const out=advanceLead(db,tenant,record.client_id,b.stage,{actor:user.id,estimatedValueCents:nextValue});
      audit(db,user,"commercial.lead.stage","commercial_lead",out.id,{stage:b.stage});
      return send(res,200,{ok:true,lead:out});
    }catch(e){return fail(e)}
  }
  if(req.method==="POST"&&url.pathname==="/api/commercial/preview-message"){
    requirePermission(user,"marketing.write");
    try{
      const b=await parseBody(req);
      const services=db.prepare("select name,price_cents,active from services where tenant_id=? and active=1 order by name").all(tenant);
      const out=receptionistDraft({text:String(b.text||"").slice(0,1000),services,lastGreeting:String(b.last_greeting||"").slice(0,200)});
      return send(res,200,{...out,preview:true,delivery:false,note:"Preview deterministic; no WhatsApp message sent; no unverified availability"});
    }catch(e){return fail(e)}
  }
  if(req.method==="POST"&&url.pathname==="/api/commercial/booking-preview"){
    mustManage();
    if(!isDemo)return send(res,403,{error:"booking_preview_only_in_disposable_demo"});
    if(typeof bookingPreview!=="function")return send(res,503,{error:"booking_preview_not_configured"});
    try{
      const body=await parseBody(req);
      if(!String(body.text||"").trim())return send(res,400,{error:"message_required"});
      if(String(body.text||"").length>1000)return send(res,413,{error:"message_too_long"});
      const result=bookingPreview({clientId:String(body.client_id||"").slice(0,64),text:body.text});
      audit(db,user,"commercial.booking_preview","conversation",result.conversation_id,{state:result.booking_state,booked:!!result.booked});
      return send(res,200,{ok:true,...result});
    }catch(e){return fail(e)}
  }
  if(req.method==="POST"&&url.pathname==="/api/commercial/simulate-inbound"){
    mustManage();
    if(!isDemo)return send(res,403,{error:"simulation_only_in_disposable_preview"});
    try{
      const b=await parseBody(req),clientId=String(b.client_id||"").slice(0,64),
        client=db.prepare("select id from clients where id=? and tenant_id=?").get(clientId,tenant);
      if(!client)return send(res,404,{error:"client_not_found"});
      if(!String(b.text||"").trim())return send(res,400,{error:"message_required"});
      const lead=registerIncoming(db,tenant,clientId,String(b.text).slice(0,1000),{source:"demo"});
      audit(db,user,"commercial.simulated_inbound","commercial_lead",lead.id,{intent:lead.intent});
      return send(res,200,{ok:true,lead,simulated:true,message_sent:false});
    }catch(e){return fail(e)}
  }
  return send(res,404,{error:"commercial_route_not_found"});
}
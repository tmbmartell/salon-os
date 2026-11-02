const SLOT_MIN=15,SLOT_PX=20,LUNAR_DAYS=29.530588853,NEW_MOON_MS=Date.UTC(2000,0,6,18,14);
const MONTHS=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEK=["D","S","T","Q","Q","S","S"];
const STATUS=[["scheduled","Agendado"],["confirmed","Confirmado"],["arrived","Chegou"],["in_service","Em atendimento"],["completed","Finalizado"],["cancelled","Cancelado"],["no_show","Não compareceu"]];
const OFF_LABEL={day_off:"FOLGA",vacation:"FÉRIAS",medical:"ATESTADO",personal:"COMPROMISSO",training:"CURSO"};
const CLOSED=["cancelled","no_show","completed"];
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const hhmm=d=>d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});

function moonPhase(date){
  const age=(((date.getTime()-NEW_MOON_MS)/86400000%LUNAR_DAYS)+LUNAR_DAYS)%LUNAR_DAYS,part=age/LUNAR_DAYS;
  return part<.125||part>=.875?"LUA NOVA":part<.375?"LUA CRESCENTE":part<.625?"LUA CHEIA":"LUA MINGUANTE";
}

export function setupAgenda({api,esc,fmt,toast,$,$$,statusLabel,initials,openNew,openCheckout,afterChange}){
  const ui={date:new Date(),month:null,pros:[],appointments:[],selectedPro:"",selectedGroup:"",tab:"professionals",statuses:new Set(),presence:"",client:"",scrolled:false,seq:0};
  ui.date.setHours(12,0,0,0);ui.month=new Date(ui.date.getFullYear(),ui.date.getMonth(),1);
  const blocks=a=>(a.items?.length?a.items:[{professional_id:a.professional_id,start_at:a.start_at,end_at:a.end_at}]).map(i=>({a,pro:i.professional_id,start:new Date(i.start_at),end:new Date(i.end_at)}));
  function visible(a){
    if(ui.statuses.size&&!ui.statuses.has(a.status))return false;
    if(ui.presence==="in"&&!["arrived","in_service"].includes(a.status))return false;
    if(ui.presence==="out"&&a.status!=="completed")return false;
    return !ui.client||String(a.client_name||"").toLowerCase().includes(ui.client);
  }
  function columns(){
    if(ui.selectedPro)return ui.pros.filter(p=>p.id===ui.selectedPro);
    return ui.selectedGroup?ui.pros.filter(p=>(p.role||"Equipe")===ui.selectedGroup):ui.pros;
  }
  function renderCalendar(){
    const first=ui.month,start=new Date(first.getFullYear(),first.getMonth(),1-first.getDay()),today=iso(new Date()),selected=iso(ui.date);
    $("#agMoon").textContent=moonPhase(ui.date);$("#agMonthLabel").textContent=MONTHS[first.getMonth()].toUpperCase()+" "+first.getFullYear();
    const days=Array.from({length:42},(_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i,12));
    $("#agCalendar").innerHTML=WEEK.map(d=>"<b>"+d+"</b>").join("")+days.map(d=>{const k=iso(d),cls=[d.getMonth()!==first.getMonth()?"other":"",k===today?"today":"",k===selected?"selected":""].join(" ");return '<button type="button" class="'+cls+'" data-ag-day="'+k+'">'+d.getDate()+"</button>"}).join("");
    $$("[data-ag-day]").forEach(b=>b.onclick=()=>{ui.date=new Date(b.dataset.agDay+"T12:00:00");ui.month=new Date(ui.date.getFullYear(),ui.date.getMonth(),1);ui.scrolled=false;load()});
  }
  function renderPros(){
    const rows=ui.tab==="groups"?[...new Set(ui.pros.map(p=>p.role||"Equipe"))].map(name=>({id:name,name,sub:ui.pros.filter(p=>(p.role||"Equipe")===name).length+" profissionais"})):ui.pros.map(p=>({id:p.id,name:p.name,sub:p.time_off?OFF_LABEL[p.time_off.type]||"AUSÊNCIA":p.window?"":"sem expediente"}));
    const current=ui.tab==="groups"?ui.selectedGroup:ui.selectedPro;
    $("#agProList").innerHTML='<button type="button" class="agPro all '+(current?"":"active")+'" data-ag-pro=""><span class="agAvatar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 7M18 15c2.500.700 4 2.500 4 6"/></svg></span><span>TODOS</span></button>'+rows.map(r=>'<button type="button" class="agPro '+(current===r.id?"active":"")+'" data-ag-pro="'+esc(r.id)+'"><span class="agAvatar">'+esc(initials(r.name))+"</span><span>"+esc(r.name.toUpperCase())+(r.sub?"<small>"+esc(r.sub)+"</small>":"")+"</span></button>").join("");
    $$("[data-ag-pro]").forEach(b=>b.onclick=()=>{if(ui.tab==="groups"){ui.selectedGroup=b.dataset.agPro;ui.selectedPro=""}else{ui.selectedPro=b.dataset.agPro;ui.selectedGroup=""}renderPros();renderGrid()});
  }
  function bounds(cols){
    const windows=cols.map(p=>p.window).filter(Boolean),hour=t=>Number(t.split(":")[0])+(Number(t.split(":")[1])>0?1:0);
    let start=windows.length?Math.min(...windows.map(w=>Number(w.start.split(":")[0]))):8,end=windows.length?Math.max(...windows.map(w=>hour(w.end))):20;
    for(const a of ui.appointments)for(const b of blocks(a)){start=Math.min(start,b.start.getHours());end=Math.max(end,b.end.getHours()+(b.end.getMinutes()?1:0))}
    return {start,end:Math.max(end,start+1)};
  }
  function columnHtml(p,hours,slots){
    const top=m=>(m-hours.start*60)/SLOT_MIN*SLOT_PX,mins=t=>{const [h,m]=t.split(":").map(Number);return h*60+m};
    let body=p.window?'<div class="agOpen" style="top:'+top(mins(p.window.start))+"px;height:"+(mins(p.window.end)-mins(p.window.start))/SLOT_MIN*SLOT_PX+'px"></div>':"";
    if(p.time_off)body+='<div class="agAbsence"><span>AUSÊNCIA: '+esc(OFF_LABEL[p.time_off.type]||"AUSÊNCIA")+"</span></div>";
    const own=ui.appointments.filter(visible).flatMap(blocks).filter(b=>b.pro===p.id).sort((x,y)=>x.start-y.start),lanes=[];
    for(const b of own){let lane=lanes.findIndex(end=>end<=b.start);if(lane<0){lane=lanes.length;lanes.push(0)}lanes[lane]=b.end;b.lane=lane}
    const count=Math.max(1,lanes.length);
    body+=own.map(b=>{
      const minutes=b.start.getHours()*60+b.start.getMinutes(),h=Math.max(SLOT_PX,(b.end-b.start)/60000/SLOT_MIN*SLOT_PX-1);
      return '<button type="button" class="agBlock st-'+esc(b.a.status)+'" data-ag-event="'+esc(b.a.id)+'" title="'+esc(statusLabel(b.a.status)+" · "+hhmm(b.start)+"–"+hhmm(b.end))+'" style="top:'+top(minutes)+"px;height:"+h+"px;left:calc("+b.lane*100/count+"% + 1px);width:calc("+100/count+'% - 2px)"><u>'+esc(b.a.client_name||"")+"</u><span>"+esc(b.a.service_summary||b.a.service_name||"")+"</span>"+(h>=60?"<em>"+esc(statusLabel(b.a.status))+"</em>":"")+"</button>";
    }).join("");
    return '<div class="agColumn" data-ag-column="'+esc(p.id)+'" style="height:'+slots*SLOT_PX+'px">'+body+"</div>";
  }
  function renderGrid(){
    const cols=columns(),hours=bounds(cols),slots=(hours.end-hours.start)*60/SLOT_MIN,grid=$("#agGrid"),template="62px repeat("+Math.max(1,cols.length)+",minmax(84px,1fr))";
    if(!cols.length){grid.innerHTML='<p class="muted agEmpty">Cadastre um profissional para montar a agenda.</p>';return}
    const times=Array.from({length:slots},(_,i)=>{const m=hours.start*60+i*SLOT_MIN;return '<span class="'+(m%60?"":"hour")+'" style="height:'+SLOT_PX+'px">'+String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0")+"</span>"}).join("");
    grid.innerHTML='<div class="agBoard" style="grid-template-columns:'+template+'"><div class="agCorner"></div>'+cols.map(p=>'<div class="agHead">'+esc(p.name.toUpperCase())+"</div>").join("")+'<div class="agTimes">'+times+"</div>"+cols.map(p=>columnHtml(p,hours,slots)).join("")+'<div id="agNow" class="agNow hidden"></div></div>';
    $$("[data-ag-event]").forEach(b=>b.onclick=e=>{e.stopPropagation();openEvent(b.dataset.agEvent)});
    $$("[data-ag-column]").forEach(col=>col.onclick=e=>{
      const pro=ui.pros.find(p=>p.id===col.dataset.agColumn);if(pro?.time_off){toast(pro.name+" está ausente neste dia");return}
      const slot=Math.floor((e.clientY-col.getBoundingClientRect().top)/SLOT_PX),start=new Date(ui.date);start.setHours(hours.start,slot*SLOT_MIN,0,0);openNew(pro?.id,start);
    });
    ui.hours=hours;placeNow();
  }
  function placeNow(){
    const line=$("#agNow"),grid=$("#agGrid");if(!line||!ui.hours)return;
    const now=new Date(),m=now.getHours()*60+now.getMinutes(),shown=iso(now)===iso(ui.date)&&m>=ui.hours.start*60&&m<=ui.hours.end*60;line.classList.toggle("hidden",!shown);if(!shown)return;
    const y=(m-ui.hours.start*60)/SLOT_MIN*SLOT_PX;line.style.top=$(".agHead").offsetHeight+y+"px";
    if(!ui.scrolled){grid.scrollTop=Math.max(0,y-120);ui.scrolled=true}
  }
  function openEvent(id){
    const a=ui.appointments.find(x=>x.id===id);if(!a)return;const b=blocks(a),start=new Date(Math.min(...b.map(x=>x.start))),end=new Date(Math.max(...b.map(x=>x.end)));
    $("#agEventTitle").textContent=a.client_name;$("#agEventSub").textContent=hhmm(start)+" – "+hhmm(end)+" · "+statusLabel(a.status);
    $("#agEventBody").innerHTML='<div class="agFacts"><span>Serviços</span><strong>'+esc(a.service_summary||a.service_name)+"</strong><span>Profissional</span><strong>"+esc(a.professional_summary||a.professional_name)+"</strong><span>Valor</span><strong>"+fmt.format(a.price||0)+"</strong>"+(a.client_phone?"<span>WhatsApp</span><strong>"+esc(a.client_phone)+"</strong>":"")+(a.resource_name?"<span>Recurso</span><strong>"+esc(a.resource_name)+"</strong>":"")+(a.notes?"<span>Observações</span><strong>"+esc(a.notes)+"</strong>":"")+"</div>";
    const locked=a.status==="completed";
    $("#agEventActions").innerHTML=(locked?'<p class="muted">Atendimento finalizado.</p>':STATUS.filter(s=>s[0]!=="completed").map(s=>'<button type="button" class="secondary '+(s[0]===a.status?"current":"")+'" data-ag-status="'+s[0]+'">'+s[1]+"</button>").join(""))+(CLOSED.includes(a.status)?"":'<button type="button" class="primary" id="agEventCheckout">Finalizar e receber</button>');
    $$("[data-ag-status]").forEach(btn=>btn.onclick=async()=>{try{await api("/api/appointments/"+a.id+"/status",{method:"PATCH",body:JSON.stringify({status:btn.dataset.agStatus})});$("#agEventModal").close();toast("Status atualizado");await load();await afterChange()}catch{toast("Não foi possível atualizar")}});
    if($("#agEventCheckout"))$("#agEventCheckout").onclick=()=>{$("#agEventModal").close();openCheckout(a.id)};
    $("#agEventModal").showModal();
  }
  function openRotation(){
    const now=new Date(),isToday=iso(now)===iso(ui.date),all=ui.appointments.filter(a=>!["cancelled","no_show"].includes(a.status)).flatMap(blocks);
    const rows=ui.pros.filter(p=>p.window).map(p=>{const own=all.filter(b=>b.pro===p.id);return {p,count:own.length,busy:isToday&&own.some(b=>b.start<=now&&b.end>now),last:Math.max(0,...own.filter(b=>b.start<=now).map(b=>+b.start))}}).sort((a,b)=>a.busy-b.busy||a.count-b.count||a.last-b.last);
    $("#agRotationList").innerHTML=rows.map((r,i)=>'<div class="agRotationRow"><b>'+(i+1)+'º</b><span class="agAvatar">'+esc(initials(r.p.name))+"</span><div><strong>"+esc(r.p.name)+"</strong><small>"+r.count+" atendimento(s) no dia"+(r.busy?" · ocupado agora":"")+'</small></div><button type="button" class="secondary" data-ag-rotate="'+esc(r.p.id)+'">Agendar</button></div>').join("")||'<p class="muted">Nenhum profissional com expediente neste dia.</p>';
    $$("[data-ag-rotate]").forEach(b=>b.onclick=()=>{const start=new Date(isToday?now:ui.date);if(isToday)start.setMinutes(Math.ceil(start.getMinutes()/SLOT_MIN)*SLOT_MIN,0,0);else start.setHours(ui.hours?.start||8,0,0,0);$("#agRotationModal").close();openNew(b.dataset.agRotate,start)});
    $("#agRotationModal").showModal();
  }
  async function load(){
    const seq=++ui.seq,day=new Date(ui.date),from=new Date(day);from.setHours(0,0,0,0);const to=new Date(from);to.setDate(to.getDate()+1);to.setMilliseconds(-1);
    renderCalendar();
    if(!ui.pros.length)$("#agGrid").innerHTML='<div class="agSkeleton"><i class="skel"></i><i class="skel"></i><i class="skel"></i><i class="skel"></i></div>';
    try{
      const [pros,rows]=await Promise.all([api("/api/agenda/windows?date="+iso(day)),api("/api/appointments?from="+encodeURIComponent(from.toISOString())+"&to="+encodeURIComponent(to.toISOString()))]);
      if(seq!==ui.seq)return;ui.pros=pros;ui.appointments=rows;renderPros();renderGrid();
    }catch(err){if(err.status!==401)toast("Não foi possível carregar a agenda")}
  }
  $("#agStatusFilters").innerHTML=STATUS.map(s=>'<button type="button" class="status '+s[0]+'" data-ag-filter="'+s[0]+'" aria-pressed="false">'+s[1]+"</button>").join("");
  $$("[data-ag-filter]").forEach(b=>b.onclick=()=>{const k=b.dataset.agFilter,on=!ui.statuses.has(k);on?ui.statuses.add(k):ui.statuses.delete(k);b.classList.toggle("on",on);b.setAttribute("aria-pressed",on);renderGrid()});
  $$("[data-ag-presence]").forEach(input=>input.onclick=()=>{const v=input.dataset.agPresence;ui.presence=ui.presence===v?"":v;$$("[data-ag-presence]").forEach(x=>x.checked=x.dataset.agPresence===ui.presence);renderGrid()});
  $$("[data-ag-tab]").forEach(b=>b.onclick=()=>{ui.tab=b.dataset.agTab;$$("[data-ag-tab]").forEach(x=>x.classList.toggle("active",x===b));renderPros()});
  $("#agClient").oninput=e=>{ui.client=e.target.value.trim().toLowerCase();renderGrid()};
  $("#agFiltersToggle").onclick=e=>{const open=$("#agFilters").classList.toggle("hidden")===false;e.currentTarget.setAttribute("aria-expanded",open)};$("#agRefresh").onclick=load;$("#agRotation").onclick=openRotation;$("#agWaitlist").onclick=()=>$("#agWaitlistModal").showModal();
  $("#agPrevMonth").onclick=()=>{ui.month=new Date(ui.month.getFullYear(),ui.month.getMonth()-1,1);renderCalendar()};
  $("#agNextMonth").onclick=()=>{ui.month=new Date(ui.month.getFullYear(),ui.month.getMonth()+1,1);renderCalendar()};
  setInterval(placeNow,60000);
  return {load};
}

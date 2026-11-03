const NS_W={top:14,right:14,bottom:52,left:48},CHART_H=270;
const dateBR=v=>v.split("-").reverse().join("/");
const toIso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
function shiftDays(iso,n){const d=new Date(iso+"T12:00:00");d.setDate(d.getDate()+n);return toIso(d)}
function shiftMonths(iso,n){const d=new Date(iso+"T12:00:00"),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return toIso(d)}
function niceMax(v){if(v<=0)return 1000;const p=10**Math.floor(Math.log10(v)),n=v/p;return (n<=1?1:n<=2?2:n<=5?5:10)*p}
function pctBR(v){return Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+"%"}
function curve(points,yMax,yMin){
  if(!points.length)return "";let d="M"+points[0][0]+" "+points[0][1];
  for(let i=0;i<points.length-1;i++){
    const p0=points[i-1]||points[i],p1=points[i],p2=points[i+1],p3=points[i+2]||p2,clamp=v=>Math.min(yMax,Math.max(yMin,v));
    d+=" C"+(p1[0]+(p2[0]-p0[0])/6)+" "+clamp(p1[1]+(p2[1]-p0[1])/6)+" "+(p2[0]-(p3[0]-p1[0])/6)+" "+clamp(p2[1]-(p3[1]-p1[1])/6)+" "+p2[0]+" "+p2[1];
  }
  return d;
}

export function setupDashboard({api,esc,fmt,toast,$}){
  let data=null,compareLabel="";
  function compareOptions(){
    const from=$("#dashFrom").value,to=$("#dashTo").value,select=$("#dashCompare"),keep=select.value;if(!from||!to||from>to)return;
    const span=Math.round((new Date(to+"T12:00:00")-new Date(from+"T12:00:00"))/86400000),prevTo=shiftDays(from,-1);
    const ranges=[[shiftDays(prevTo,-span),prevTo],[shiftMonths(from,-1),shiftMonths(to,-1)],[shiftMonths(from,-12),shiftMonths(to,-12)]];
    const values=[...new Set(ranges.map(r=>r.join("|")))];
    select.innerHTML=values.map(v=>{const [a,b]=v.split("|");return '<option value="'+v+'">'+dateBR(a)+" a "+dateBR(b)+"</option>"}).join("");
    if(values.includes(keep))select.value=keep;
  }
  function pill(el,cur,prev,{money=false,upIsGood=true}={}){
    const diff=money?(prev?(cur-prev)/prev*100:null):cur-prev;
    if(diff===null){el.className="dashDelta neutral";el.textContent=cur?"sem base de comparação":"sem movimento";return}
    const flat=Math.abs(diff)<.05,good=diff>0===upIsGood;
    el.className="dashDelta "+(flat?"neutral":good?"good":"bad");
    el.textContent=(flat?"= ":diff>0?"▲ ":"▼ ")+Math.abs(diff).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+(money?"%":" p.p.")+" vs período anterior";
  }
  function renderChart(){
    const host=$("#dashChart");if(!data||!host.clientWidth)return;
    const cur=data.current.series,cmp=data.compare.series,n=Math.max(cur.length,cmp.length),W=host.clientWidth,plotW=W-NS_W.left-NS_W.right,plotH=CHART_H-NS_W.top-NS_W.bottom;
    const top=niceMax(Math.max(...cur.map(x=>x.value),...cmp.map(x=>x.value),0)),x=i=>NS_W.left+(n>1?i*plotW/(n-1):plotW/2),y=v=>NS_W.top+plotH-(v/top)*plotH,base=NS_W.top+plotH;
    const pts=s=>s.map((p,i)=>[+x(i).toFixed(1),+y(p.value).toFixed(1)]),curPts=pts(cur),cmpPts=pts(cmp),line=curve(curPts,base,NS_W.top);
    const ticks=Array.from({length:6},(_,i)=>top*i/5),every=Math.max(1,Math.ceil(n/(plotW/34)));
    const grid=ticks.map(t=>'<line class="dashGrid" x1="'+NS_W.left+'" x2="'+(W-NS_W.right)+'" y1="'+y(t)+'" y2="'+y(t)+'"/><text class="dashAxis" x="'+(NS_W.left-8)+'" y="'+(y(t)+4)+'" text-anchor="end">'+Math.round(t).toLocaleString("pt-BR")+"</text>").join("");
    const labels=Array.from({length:n},(_,i)=>i%every?"":'<text class="dashAxis" transform="translate('+x(i)+" "+(base+14)+') rotate(-45)" text-anchor="end">Dia '+(i+1)+"</text>").join("");
    const area=curPts.length>1?'<path class="dashArea" d="'+line+" L"+curPts.at(-1)[0]+" "+base+" L"+curPts[0][0]+" "+base+' Z"/>':"";
    host.innerHTML='<svg width="'+W+'" height="'+CHART_H+'" role="img" aria-label="Faturamento diário do período comparado ao período de referência">'+grid+labels+area+'<path class="dashLine compare" d="'+curve(cmpPts,base,NS_W.top)+'"/><path class="dashLine" d="'+line+'"/><line id="dashCross" class="dashCross hidden" y1="'+NS_W.top+'" y2="'+base+'"/><circle id="dashDotCmp" class="dashDot compare hidden" r="4"/><circle id="dashDot" class="dashDot hidden" r="4"/></svg><div id="dashTip" class="dashTip hidden"></div>';
    const cross=$("#dashCross"),dot=$("#dashDot"),dotCmp=$("#dashDotCmp"),tip=$("#dashTip");
    host.onpointermove=e=>{
      const px=e.clientX-host.getBoundingClientRect().left,i=Math.max(0,Math.min(n-1,Math.round((px-NS_W.left)/(plotW/Math.max(1,n-1))))),cx=x(i);
      cross.setAttribute("x1",cx);cross.setAttribute("x2",cx);cross.classList.remove("hidden");
      for(const [el,s] of [[dot,cur],[dotCmp,cmp]]){el.classList.toggle("hidden",!s[i]);if(s[i]){el.setAttribute("cx",cx);el.setAttribute("cy",y(s[i].value))}}
      tip.innerHTML="<strong>Dia "+(i+1)+"</strong>"+(cur[i]?'<span><i class="swatch"></i>'+dateBR(cur[i].date)+"<b>"+fmt.format(cur[i].value)+"</b></span>":"")+(cmp[i]?'<span><i class="swatch compare"></i>'+dateBR(cmp[i].date)+"<b>"+fmt.format(cmp[i].value)+"</b></span>":"");
      tip.classList.remove("hidden");tip.style.left=Math.min(W-190,Math.max(0,cx+12))+"px";tip.style.top=NS_W.top+"px";
    };
    host.onpointerleave=()=>{[cross,dot,dotCmp,tip].forEach(el=>el.classList.add("hidden"))};
    $("#dashLegendCompare").textContent=compareLabel;
  }
  function render(){
    const c=data.current,p=data.compare,w=data.projection,set=(id,v)=>{$(id).textContent=v};
    set("#dashRevenue",fmt.format(c.revenue));pill($("#dashRevenueDelta"),c.revenue,p.revenue,{money:true});
    set("#dashOccupancy",pctBR(c.occupancy));pill($("#dashOccupancyDelta"),c.occupancy,p.occupancy);
    set("#dashTicket",fmt.format(c.avg_ticket));pill($("#dashTicketDelta"),c.avg_ticket,p.avg_ticket,{money:true});
    set("#dashCancel",pctBR(c.last_minute_cancellation));pill($("#dashCancelDelta"),c.last_minute_cancellation,p.last_minute_cancellation,{upIsGood:false});
    set("#dashReturn",pctBR(c.return_rate.rate));pill($("#dashReturnDelta"),c.return_rate.rate,p.return_rate.rate);
    set("#dashReturnNote",c.return_rate.returned+" de "+c.return_rate.expected+" retornos previstos já reagendados");
    set("#dashReceivable",fmt.format(w.receivable));set("#dashEstimated",fmt.format(w.estimated));set("#dashPayable",fmt.format(w.payable));set("#dashTotal",fmt.format(w.total));
    $("#dashTotal").classList.toggle("negative",w.total<0);
    compareLabel=dateBR(p.from)+" a "+dateBR(p.to);set("#dashCompareText","Comparando com "+compareLabel);
    renderChart();
  }
  async function load(){
    const from=$("#dashFrom").value,to=$("#dashTo").value,[compareFrom,compareTo]=($("#dashCompare").value||"|").split("|");
    if(!from||!to||from>to){toast("Informe um período válido");return}
    const q=new URLSearchParams({from,to});if(compareFrom&&compareTo){q.set("compare_from",compareFrom);q.set("compare_to",compareTo)}
    if(!data)$("#dashAnalytics").classList.add("isLoading");try{data=await api("/api/analytics/dashboard?"+q);$("#dashDenied").classList.add("hidden");$("#dashAnalytics").classList.remove("hidden");render()}
    catch(err){
      if(err.status===403){$("#dashDenied").classList.remove("hidden");$("#dashAnalytics").classList.add("hidden")}
      else if(err.status!==401)toast("Não foi possível carregar o dashboard");
    }finally{$("#dashAnalytics").classList.remove("isLoading")}
  }
  const today=new Date();$("#dashTo").value=toIso(today);$("#dashFrom").value=toIso(new Date(today.getFullYear(),today.getMonth(),1));compareOptions();
  $("#dashFilters").onsubmit=e=>{e.preventDefault();load()};
  $("#dashFrom").onchange=$("#dashTo").onchange=compareOptions;
  $("#dashCompare").onchange=load;
  new ResizeObserver(renderChart).observe($("#dashChart"));
  const panel=$("#dashNumbers"),KEY="nv-dash-numbers";let started=false;
  try{panel.open=localStorage.getItem(KEY)==="1"}catch{}
  panel.addEventListener("toggle",()=>{try{panel.open?localStorage.setItem(KEY,"1"):localStorage.removeItem(KEY)}catch{}if(panel.open&&started)load()});
  return {load:()=>{started=true;return panel.open&&!panel.classList.contains("hidden")?load():undefined},resize:renderChart};
}

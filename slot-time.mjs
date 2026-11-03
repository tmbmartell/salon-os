export function localTimeToUtc(date,time,zone="America/Porto_Velho"){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))throw Error("invalid_local_datetime");
 const [y,mo,d]=date.split("-").map(Number),[h,mi]=time.split(":").map(Number);
 if(h>23||mi>59||mo<1||mo>12||d<1||d>31)throw Error("invalid_local_datetime");
 const desired=Date.UTC(y,mo-1,d,h,mi,0);
 if(new Date(Date.UTC(y,mo-1,d,12)).toISOString().slice(0,10)!==date)throw Error("invalid_calendar_date");
 const fmt=new Intl.DateTimeFormat("en-US",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 const wall=stamp=>{
  const f=Object.fromEntries(fmt.formatToParts(new Date(stamp)).filter(x=>x.type!=="literal").map(x=>[x.type,Number(x.value)]));
  return Date.UTC(f.year,f.month-1,f.day,f.hour,f.minute,f.second);
 };
 let guess=desired;
 for(let i=0;i<5;i++){
  const diff=wall(guess)-desired;
  if(diff===0)return new Date(guess).toISOString();
  guess-=diff;
 }
 if(wall(guess)!==desired)throw Error("nonexistent_local_time");
 return new Date(guess).toISOString();
}

// Partes da data/hora de um instante UTC no fuso do salão.
export function zonedParts(iso,zone="America/Porto_Velho"){
 const d=new Date(iso);
 if(Number.isNaN(d.getTime()))return null;
 const fmt=new Intl.DateTimeFormat("en-US",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 const f=Object.fromEntries(fmt.formatToParts(d).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
 return {year:f.year,month:f.month,day:f.day,hour:f.hour,minute:f.minute,second:f.second};
}
// "YYYY-MM-DD" local do salão (usado em folgas/escala).
export function localDateOf(iso,zone="America/Porto_Velho"){
 const p=zonedParts(iso,zone);return p?`${p.year}-${p.month}-${p.day}`:null;
}
// Minutos desde 00:00 no horário local do salão.
export function localMinutesOf(iso,zone="America/Porto_Velho"){
 const p=zonedParts(iso,zone);return p?Number(p.hour)*60+Number(p.minute)+Number(p.second)/60:null;
}
// "dd/mm/aaaa hh:mm" local para CSV e relatórios.
export function localStamp(iso,zone="America/Porto_Velho"){
 if(!iso)return "";
 const d=new Date(iso);if(Number.isNaN(d.getTime()))return String(iso);
 const p=zonedParts(iso,zone);if(!p)return String(iso);
 return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

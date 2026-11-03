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
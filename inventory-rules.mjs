// Controle de estoque na unidade cadastrada: gramas, mililitros ou unidades.
// Não converte peso em volume: exigir equivalência física explícita fora deste fluxo.
const WHOLE_UNITS = new Set(["un","unidade","unidades","unit","und","cx"]);
export function isWholeUnit(unit){return WHOLE_UNITS.has(String(unit||"").toLowerCase())}
export function quantity(value,unit,{zero=true,signed=false}={}){
  const n=Number(value);
  if(value===null||value===undefined||String(value).trim()===""||!Number.isFinite(n)||Math.abs(n)>1_000_000)
    throw Object.assign(new Error("invalid_stock_quantity"),{status:400});
  if(!signed&&n<0||!zero&&n===0||isWholeUnit(unit)&&!Number.isInteger(n)||Math.abs(n-Math.round(n*1000)/1000)>1e-8)
    throw Object.assign(new Error("invalid_stock_quantity"),{status:400});
  return Math.round(n*1000)/1000;
}
const round=n=>Math.round((n+Number.EPSILON)*1000)/1000;
export function allocateConsumption(lines,submitted=[]){
  if(!Array.isArray(lines)||!Array.isArray(submitted))
    throw Object.assign(new Error("invalid_consumption"),{status:400});
  const groups=new Map();
  for(const line of lines){
    if(!(line.standard_qty>0))continue;
    const group=groups.get(line.product_id)||{unit:line.unit,standard:0,lines:[]};
    group.standard=round(group.standard+line.standard_qty);
    group.lines.push(line);groups.set(line.product_id,group);
  }
  const actuals=new Map();
  for(const input of submitted){
    const id=String(input?.product_id||"").trim(),group=groups.get(id);
    if(!group||actuals.has(id))
      throw Object.assign(new Error("invalid_consumption_product"),{status:400});
    actuals.set(id,quantity(input.actual_qty,group.unit));
  }
  const result=[];
  for(const [productId,group] of groups){
    const total=actuals.has(productId)?actuals.get(productId):group.standard;
    if(isWholeUnit(group.unit)&&!Number.isInteger(total))
      throw Object.assign(new Error("invalid_stock_quantity"),{status:400});
    let allocated=0;
    group.lines.forEach((line,i)=>{
      const last=i===group.lines.length-1;
      const amount=last?round(total-allocated):round(total*line.standard_qty/group.standard);
      allocated=round(allocated+amount);
      result.push({...line,actual_qty:Math.max(0,amount),variance_qty:round(amount-line.standard_qty)});
    });
  }
  return result;
}

// Transições operacionais manuais da agenda.
// Finalização/comissão/baixa de estoque acontecem exclusivamente no checkout.
const manualFlow=Object.freeze({
  scheduled:["confirmed","arrived","in_service","cancelled","no_show"],
  confirmed:["arrived","in_service","cancelled","no_show"],
  arrived:["in_service","cancelled"],
  in_service:[],
  completed:[],
  cancelled:[],
  no_show:[]
});
export function allowedManualStatuses(current){
  return [...(manualFlow[String(current)]||[])];
}
export function checkManualStatusTransition(current,next){
  const from=String(current||""),to=String(next||"");
  if(!(from in manualFlow)||!(to in manualFlow))return {ok:false,code:"invalid_status"};
  if(from===to)return {ok:true,unchanged:true};
  if(to==="completed")return {ok:false,code:"checkout_required"};
  return manualFlow[from].includes(to)?{ok:true,unchanged:false}:{ok:false,code:"invalid_status_transition"};
}

// Validação de dinheiro e do fechamento do caixa.
// Valores persistidos em centavos inteiros, nunca em ponto flutuante.
export const PAYMENT_METHODS=Object.freeze(["pix","credit_card","debit_card","cash","voucher","other"]);
export function cents(value,{allowZero=false}={}){
  if(value===null||value===undefined||String(value).trim()==="")throw Object.assign(new Error("invalid_amount"),{status:400});
  const number=Number(value);
  if(!Number.isFinite(number)||number<0||(!allowZero&&number===0)||number>10_000_000||Math.abs(number*100-Math.round(number*100))>1e-6)
    throw Object.assign(new Error("invalid_amount"),{status:400});
  return Math.round(number*100);
}
export function validPaymentMethod(method,{allowEmpty=false}={}){
  const value=String(method||"").trim();
  if(allowEmpty&&!value)return null;
  if(!PAYMENT_METHODS.includes(value))throw Object.assign(new Error("invalid_payment_method"),{status:400});
  return value;
}
export function cashCloseResult(expectedCents,actual,notes=""){
  const expected=Number(expectedCents);
  if(!Number.isSafeInteger(expected)||expected<0)throw Object.assign(new Error("invalid_expected_cash"),{status:409});
  const counted=cents(actual,{allowZero:true});
  const difference=counted-expected;
  const reason=String(notes||"").trim().slice(0,500);
  if(difference!==0&&reason.length<8)throw Object.assign(new Error("cash_difference_reason_required"),{status:400});
  return {expected_cents:expected,actual_cents:counted,difference_cents:difference,notes:reason};
}

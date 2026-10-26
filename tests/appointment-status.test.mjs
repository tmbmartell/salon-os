import test from "node:test";
import assert from "node:assert/strict";
import {allowedManualStatuses,checkManualStatusTransition} from "../appointment-status.mjs";

test("não permite finalizar atendimento fora do checkout",()=>{
  for(const current of ["scheduled","confirmed","arrived","in_service"]){
    assert.deepEqual(checkManualStatusTransition(current,"completed"),{ok:false,code:"checkout_required"});
  }
});
test("permite apenas transições operacionais válidas e proíbe reabrir encerrados",()=>{
  assert.equal(checkManualStatusTransition("scheduled","confirmed").ok,true);
  assert.equal(checkManualStatusTransition("confirmed","arrived").ok,true);
  assert.equal(checkManualStatusTransition("arrived","in_service").ok,true);
  assert.equal(checkManualStatusTransition("confirmed","cancelled").ok,true);
  assert.equal(checkManualStatusTransition("scheduled","no_show").ok,true);
  assert.deepEqual(checkManualStatusTransition("in_service","confirmed"),{ok:false,code:"invalid_status_transition"});
  assert.deepEqual(checkManualStatusTransition("completed","scheduled"),{ok:false,code:"invalid_status_transition"});
  assert.deepEqual(checkManualStatusTransition("cancelled","confirmed"),{ok:false,code:"invalid_status_transition"});
  assert.deepEqual(checkManualStatusTransition("scheduled","wrong"),{ok:false,code:"invalid_status"});
  assert.deepEqual(checkManualStatusTransition("confirmed","confirmed"),{ok:true,unchanged:true});
  assert.deepEqual(allowedManualStatuses("arrived"),["in_service","cancelled"]);
});

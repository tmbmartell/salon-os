import test from "node:test";
import assert from "node:assert/strict";
import {can} from "../auth.mjs";

test("exportação integral da base de clientes só é autorizada para proprietária e gerência",()=>{
  assert.equal(can({role:"owner"},"clients.export"),true);
  assert.equal(can({role:"manager"},"clients.export"),true);
  for(const role of ["reception","professional"]){
    assert.equal(can({role},"clients.read"),true,role+" pode consultar CRM na rotina permitida");
    assert.equal(can({role},"clients.export"),false,role+" não pode baixar a base inteira");
  }
  assert.equal(can(null,"clients.export"),false);
});

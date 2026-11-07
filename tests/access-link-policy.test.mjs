import test from 'node:test';
import assert from 'node:assert/strict';
import {isPlatformAdmin} from '../auth.mjs';
test('admin NOVAGENTE exige correspondência exata de usuário e salão',()=>{
  const old=process.env.NOVAGENTE_PLATFORM_ADMIN_USERS;
  try{
    process.env.NOVAGENTE_PLATFORM_ADMIN_USERS='salon-1:user-1';
    assert.equal(isPlatformAdmin({id:'user-1',tenantId:'salon-1',role:'owner'}),true);
    assert.equal(isPlatformAdmin({id:'user-1',tenantId:'salon-2',role:'owner'}),false);
    assert.equal(isPlatformAdmin({id:'user-1',tenantId:'salon-1',role:'manager'}),false);
    assert.equal(isPlatformAdmin({id:'user-2',tenantId:'salon-1',role:'owner'}),false);
    delete process.env.NOVAGENTE_PLATFORM_ADMIN_USERS;
    assert.equal(isPlatformAdmin({id:'user-1',tenantId:'salon-1',role:'owner'}),false);
  }finally{if(old===undefined)delete process.env.NOVAGENTE_PLATFORM_ADMIN_USERS;else process.env.NOVAGENTE_PLATFORM_ADMIN_USERS=old;}
});

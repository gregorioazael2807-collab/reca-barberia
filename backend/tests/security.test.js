import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordHash, verifyPassword, validateWeekly, email, password, bilingual } from '../security.js';
test('contraseñas: salt distinto y verificación scrypt',async()=>{
  const value='Private unit testing password!';const a=await passwordHash(value),b=await passwordHash(value);
  assert.notEqual(a,b);assert.equal(await verifyPassword(value,a),true);assert.equal(await verifyPassword('wrong',a),false);
});
test('validación de email, contraseña y traducciones',()=>{
  assert.equal(email('Owner@Example.com'),'owner@example.com');
  for(const value of ['',null,'a@','a b@example.com'])assert.throws(()=>email(value));
  assert.throws(()=>password('short'));assert.throws(()=>password('a'.repeat(129)));
  assert.throws(()=>bilingual({es:'Nombre'}));
});
test('horarios: intervalos contiguos válidos, cruces y días cerrados inválidos',()=>{
  const week=Array.from({length:7},(_,day)=>({day,closed:true,intervals:[]}));
  week[1]={day:1,closed:false,intervals:[['10:00','11:00'],['11:00','12:00']]};assert.equal(validateWeekly(week)[1].intervals.length,2);
  const closed=structuredClone(week);closed[1].closed=true;assert.throws(()=>validateWeekly(closed));
  const cross=structuredClone(week);cross[1].intervals[1][0]='10:30';assert.throws(()=>validateWeekly(cross));
});

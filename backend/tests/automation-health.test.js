import test from 'node:test';
import assert from 'node:assert/strict';
import {automationRunnerStatus} from '../automation.js';

test('salud de correos: no confundir SMTP configurado con n8n conectado',()=>{
 const now=Date.parse('2027-01-01T12:00:00Z');
 assert.equal(automationRunnerStatus(null,now),'never');
 assert.equal(automationRunnerStatus(new Date(now-60000),now),'connected');
 assert.equal(automationRunnerStatus(new Date(now-180000),now),'connected');
 assert.equal(automationRunnerStatus(new Date(now-180001),now),'stale');
 assert.equal(automationRunnerStatus('invalid',now),'stale');
 assert.equal(automationRunnerStatus(new Date(now+60000),now),'stale');
});

import { readFile, writeFile } from 'node:fs/promises';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';
initializeApp({credential:applicationDefault(),projectId:'comparacel'});
const rules=getSecurityRules();
const previous=await rules.getFirestoreRuleset();
let backup;
try {backup=JSON.parse(await readFile('data/firestore-rules-after-social.json','utf8'));}
catch(error) {if(error.code !== 'ENOENT') throw error;}
if(backup && backup.name !== previous.name) throw new Error('As regras remotas mudaram desde o backup. Revise antes de publicar.');
await writeFile('data/firestore-rules-before-reactions.json',JSON.stringify({name:previous.name,source:previous.source},null,2));
const released=await rules.releaseFirestoreRulesetFromSource(await readFile('firestore.rules','utf8'));
await writeFile('data/firestore-rules-after-reactions.json',JSON.stringify({name:released.name,source:released.source},null,2));
console.log('Regras de reações públicas agregadas e votos privados aplicadas em comparacel.');

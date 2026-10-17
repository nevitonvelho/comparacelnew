import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {NextRequest} from 'next/server.js';
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const modelUrl=url(compile(await readFile('lib/admin-model.ts','utf8')));
const dbUrl=url(`export function getAdminDatabase(){return globalThis.oauthDatabase;}export function getAdminAuth(){return {getUser:async()=>({uid:"owner",email:"owner@example.com",emailVerified:true,disabled:false,providerData:[{providerId:"google.com"}],customClaims:{}})};}`);
const apiUrl=url(`export const adminHeaders={"Cache-Control":"no-store"};export async function requireAdministrator(req,permission){globalThis.oauthPermission=permission;if(!globalThis.oauthAllowed)throw Object.assign(new Error("Forbidden"),{status:403});return {uid:"owner"};}export async function getStaffAccess(){return {role:globalThis.oauthRole};}export function adminFailure(e){return Response.json({error:e.message},{status:e.status||503});}`);
const seoUrl=url('export const absoluteUrl=path=>"https://comparacel.com.br"+path;');
const oauthSource=compile(await readFile('lib/search-console-oauth.ts','utf8')).replace('import "server-only";','').replace('"./firebase/admin"',JSON.stringify(dbUrl)).replace('"./admin-model"',JSON.stringify(modelUrl));
const oauthUrl=url(oauthSource);
const {encryptSearchSecret,decryptSearchSecret}=await import(oauthUrl);
async function load(file){let source=compile(await readFile(file,'utf8'));for(const [key,value] of Object.entries({'next/server':import.meta.resolve('next/server.js'),'@/lib/admin-api':apiUrl,'@/lib/firebase/admin':dbUrl,'@/lib/admin-model':modelUrl,'@/lib/search-console-oauth':oauthUrl,'@/lib/seo':seoUrl}))source=source.replaceAll(JSON.stringify(key),JSON.stringify(value));return import(url(source));}
const start=await load('app/api/admin/seo/oauth/route.ts');
const callback=await load('app/api/admin/seo/oauth/callback/route.ts');
const prior={secret:process.env.SEARCH_CONSOLE_TOKEN_SECRET,credentials:process.env.SEARCH_CONSOLE_CREDENTIALS_JSON,property:process.env.SEARCH_CONSOLE_PROPERTY,fetch:globalThis.fetch};
const values=new Map();
const ref=path=>({path,get:async()=>({data:()=>values.get(path)}),set:async value=>values.set(path,value)});
globalThis.oauthDatabase={collection:name=>({doc:id=>ref(`${name}/${id}`)}),runTransaction:async fn=>fn({get:async r=>({data:()=>values.get(r.path)}),delete:r=>values.delete(r.path)})};
process.env.SEARCH_CONSOLE_TOKEN_SECRET='test-only-oauth-encryption-key-123456789';
process.env.SEARCH_CONSOLE_CREDENTIALS_JSON=JSON.stringify({web:{client_id:'client',client_secret:'not-for-browser'}});
process.env.SEARCH_CONSOLE_PROPERTY='sc-domain:comparacel.com.br';
globalThis.oauthAllowed=true;globalThis.oauthRole='administrator';
const startRequest=()=>new NextRequest('https://comparacel.com.br/api/admin/seo/oauth',{method:'POST'});
try {
 await test('OAuth secrets round trip and tampering is rejected',()=>{
  const encrypted=encryptSearchSecret({refreshToken:'sensitive'});assert(!encrypted.includes('sensitive'));assert.deepEqual(decryptSearchSecret(encrypted),{refreshToken:'sensitive'});
  const [iv,tag]=encrypted.split('.');assert.throws(()=>decryptSearchSecret([iv,tag,Buffer.from('tampered').toString('base64url')].join('.')));
 });
 await test('only administrators can start an authorization and Desktop clients are rejected',async()=>{
  globalThis.oauthAllowed=false;assert.equal((await start.POST(startRequest())).status,403);assert.equal(globalThis.oauthPermission,'users.manage');
  globalThis.oauthAllowed=true;const client=process.env.SEARCH_CONSOLE_CREDENTIALS_JSON;process.env.SEARCH_CONSOLE_CREDENTIALS_JSON=JSON.stringify({installed:{client_id:'desktop',client_secret:'secret'}});
  assert.equal((await start.POST(startRequest())).status,503);process.env.SEARCH_CONSOLE_CREDENTIALS_JSON=client;
 });
 await test('OAuth URL uses readonly scope, PKCE and HttpOnly state cookie without client secret',async()=>{
  const response=await start.POST(startRequest());assert.equal(response.status,200);const data=await response.json();const target=new URL(data.url);
  assert.equal(target.hostname,'accounts.google.com');assert.equal(target.searchParams.get('scope'),'https://www.googleapis.com/auth/webmasters.readonly');assert.equal(target.searchParams.get('code_challenge_method'),'S256');assert(!data.url.includes('not-for-browser'));assert.match(response.headers.get('set-cookie'),/HttpOnly/i);assert.match(response.headers.get('set-cookie'),/SameSite=lax/i);
 });
 await test('callback rejects mismatched state without requesting Google tokens',async()=>{
  globalThis.fetch=async()=>{throw Error('Provider must not be called');};const r=await callback.GET(new NextRequest('https://comparacel.com.br/api/admin/seo/oauth/callback?state=bad&code=bad'));
  assert.match(r.headers.get('location'),/invalid-state/);
 });
 await test('callback stores encrypted refresh token only after property validation and consumes state once',async()=>{
  const begin=await start.POST(startRequest());const auth=new URL((await begin.json()).url);const state=auth.searchParams.get('state');
  globalThis.fetch=async endpoint=>endpoint.includes('oauth2.googleapis.com')?Response.json({refresh_token:'private-refresh-token',access_token:'private-access-token'}):Response.json({siteEntry:[{siteUrl:'sc-domain:comparacel.com.br',permissionLevel:'siteOwner'}]});
  const req=()=>new NextRequest(`https://comparacel.com.br/api/admin/seo/oauth/callback?state=${state}&code=authorization-code`,{headers:{cookie:`comparacel_search_oauth=${state}`}});
  const response=await callback.GET(req());assert.match(response.headers.get('location'),/search-console=connected/);assert(!response.headers.get('location').includes('private'));
  const saved=values.get('adminSeoConnections/searchConsole');assert.equal(saved.disabled,false);assert(!JSON.stringify(saved).includes('private-refresh-token'));assert.equal(decryptSearchSecret(saved.encryptedTokens).refreshToken,'private-refresh-token');
  assert(!values.has('adminSeoOAuth/'+createHash('sha256').update(state).digest('hex')));assert.match((await callback.GET(req())).headers.get('location'),/search-console=failed/);
 });
 await test('expired state and revoked administrator access cannot connect an account',async()=>{
  const begin=await start.POST(startRequest());const state=new URL((await begin.json()).url).searchParams.get('state');
  const key='adminSeoOAuth/'+createHash('sha256').update(state).digest('hex');values.get(key).createdAt=Date.now()-700000;
  const request=()=>new NextRequest(`https://comparacel.com.br/api/admin/seo/oauth/callback?state=${state}&code=code`,{headers:{cookie:`comparacel_search_oauth=${state}`}});
  assert.match((await callback.GET(request())).headers.get('location'),/search-console=failed/);
  const begin2=await start.POST(startRequest());const state2=new URL((await begin2.json()).url).searchParams.get('state');globalThis.oauthRole='employee';
  const req2=new NextRequest(`https://comparacel.com.br/api/admin/seo/oauth/callback?state=${state2}&code=code`,{headers:{cookie:`comparacel_search_oauth=${state2}`}});
  assert.match((await callback.GET(req2)).headers.get('location'),/search-console=denied/);globalThis.oauthRole='administrator';
 });
} finally {
 globalThis.fetch=prior.fetch;
 for(const [key,value]of Object.entries({SEARCH_CONSOLE_TOKEN_SECRET:prior.secret,SEARCH_CONSOLE_CREDENTIALS_JSON:prior.credentials,SEARCH_CONSOLE_PROPERTY:prior.property}))if(value===undefined)delete process.env[key];else process.env[key]=value;
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const model=url(compile(await readFile('lib/admin-model.ts','utf8')));
const workbench=url(compile(await readFile('lib/seo-workbench.ts','utf8')).replace('"./admin-model"',JSON.stringify(model)));
const source=compile(await readFile('lib/gemini-seo.ts','utf8')).replace('import "server-only";','').replace('"./admin-model"',JSON.stringify(model)).replace('"./seo-workbench"',JSON.stringify(workbench));
const {generateSeoSuggestion}=await import(url(source));
const fields={title:'Produto: ficha técnica',metaDescription:'Descrição factual da ficha para ajudar a comparação de especificações do produto cadastrado.',description:'Conteúdo factual em texto simples para revisar antes de publicar.',tags:['Tela']};
const original=globalThis.fetch;
const previousKey=process.env.GEMINI_API_KEY;
const previousModel=process.env.GEMINI_MODEL;
process.env.GEMINI_API_KEY='test-secret';process.env.GEMINI_MODEL='gemini-3.8-flash';
const mockCandidate=(value,finishReason='STOP')=>Response.json({candidates:[{finishReason,content:{parts:[{text:JSON.stringify(value)}]}}]});
try {
 await test('Gemini sends credentials only in headers and validates structured output',async()=>{
  globalThis.fetch=async(endpoint,options)=>{assert(!endpoint.includes('test-secret'));assert.equal(options.headers['x-goog-api-key'],'test-secret');assert.equal(options.cache,'no-store');const body=JSON.parse(options.body);assert.equal(body.generationConfig.responseMimeType,'application/json');return mockCandidate(fields);};
  const result=await generateSeoSuggestion({products:[]},fields,[]);assert.deepEqual(result.fields,fields);
 });
 await test('Gemini refuses incomplete output and unsafe fields without returning a draft',async()=>{
  for(const [value,reason] of [[fields,'MAX_TOKENS'],[{...fields,description:'<script>unsafe</script>'},'STOP'],[{...fields,title:''},'STOP']]){
   globalThis.fetch=async()=>mockCandidate(value,reason);await assert.rejects(generateSeoSuggestion({},fields,[]),error=>error.status===502);
  }
 });
 await test('provider errors and timeouts never expose the credential',async()=>{
  globalThis.fetch=async()=>Response.json({error:{message:'test-secret'}},{status:429});
  await assert.rejects(generateSeoSuggestion({},fields,[]),error=>error.status===502&&!error.message.includes('test-secret'));
  globalThis.fetch=async()=>{throw new Error('test-secret');};
  await assert.rejects(generateSeoSuggestion({},fields,[]),error=>error.status===504&&!error.message.includes('test-secret'));
 });
} finally {
 globalThis.fetch=original;
 if(previousKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previousKey;
 if(previousModel===undefined)delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=previousModel;
}

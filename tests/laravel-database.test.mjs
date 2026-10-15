import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = source => ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const valuesUrl = url(compile(await readFile('lib/laravel-values.ts','utf8')));
const apiUrl = url(compile(await readFile('lib/laravel-api.ts','utf8')).replace('import "server-only";',''));
const source = compile(await readFile('lib/laravel-database.ts','utf8')).replace('import "server-only";','').replace('"./laravel-api"',JSON.stringify(apiUrl)).replace('"./laravel-values"',JSON.stringify(valuesUrl));
const {getLaravelDatabase} = await import(url(source));
const {encodeValues,decodeValues} = await import(valuesUrl);
const {backendRequest} = await import(apiUrl);
const originalFetch = globalThis.fetch;
const oldUrl=process.env.LARAVEL_BACKEND_URL, oldToken=process.env.LARAVEL_API_TOKEN;
process.env.LARAVEL_BACKEND_URL='https://api.comparacel.test';
process.env.LARAVEL_API_TOKEN='test-server-secret';
test('timestamps preserve milliseconds recursively without converting ordinary date strings',()=>{
  const date=new Date('2026-10-15T01:02:03.456Z');
  const encoded=encodeValues({date,raw:date.toISOString(),nested:[{toDate:()=>date}],omitted:undefined});
  assert.equal(encoded.omitted,undefined);
  const decoded=decodeValues(encoded);
  assert.equal(decoded.date.toMillis(),date.getTime());
  assert.equal(decoded.nested[0].toDate().toISOString(),date.toISOString());
  assert.equal(decoded.raw,date.toISOString());
});
test('missing server credentials fail closed before any network access',async()=>{
  delete process.env.LARAVEL_API_TOKEN;
  globalThis.fetch=()=>{throw new Error('Unexpected network');};
  await assert.rejects(backendRequest('get',{}),/LARAVEL_API_TOKEN/);
  process.env.LARAVEL_API_TOKEN='test-server-secret';
});
test('SQL query requests preserve projections, active filter and cursor and never use a browser cache',async()=>{
  globalThis.fetch=async(endpoint,options)=>{
    assert.equal(String(endpoint),'https://api.comparacel.test/api/v1/internal/query');
    assert.equal(options.headers.Authorization,'Bearer test-server-secret');
    assert.equal(options.cache,'no-store');
    const body=JSON.parse(options.body);
    assert.deepEqual(body.filters,[{field:'isActive',operator:'==',value:true}]);
    assert.deepEqual(body.fields,['name']);
    assert.equal(body.after,'alpha');assert.equal(body.limit,50);
    return Response.json({documents:[{path:'products/beta',data:{name:'Beta'},version:'v1'}],version:'q1'});
  };
  const result=await getLaravelDatabase().collection('products').where('isActive','==',true).orderBy('__name__').startAfter('alpha').limit(50).select('name').get();
  assert.equal(result.docs[0].data().name,'Beta');assert.equal(result.docs[0].ref.path,'products/beta');
});
test('optimistic SQL transactions retry a conflict and carry all read versions',async()=>{
  let commits=0, reads=0;
  globalThis.fetch=async(endpoint,options)=>{
    const body=JSON.parse(options.body);
    if(String(endpoint).endsWith('/get')) {
      reads++;return Response.json({documents:[{path:'pageStats/product:alpha',data:{views:reads},version:`v${reads}`} ]});
    }
    assert.equal(body.checks[0].version,`v${reads}`);
    assert.equal(body.writes[0].data.views,reads+1);
    commits++;
    return commits===1?Response.json({error:'conflict'},{status:409}):Response.json({committed:true});
  };
  const ref=getLaravelDatabase().doc('pageStats/product:alpha');
  const result=await getLaravelDatabase().runTransaction(async tx=>{const old=await tx.get(ref);tx.set(ref,{views:old.data().views+1});return old.data().views+1;});
  assert.equal(commits,2);assert.equal(reads,2);assert.equal(result,3);
});
test('migrated images resolve to the API without changing affiliate offer URLs',async()=>{
  const legacy='https://firebasestorage.googleapis.com/v0/b/comparacel.firebasestorage.app/o/products%2Fone.png?alt=media&token=old';
  globalThis.fetch=async(endpoint)=>String(endpoint).endsWith('/images')
    ?Response.json({images:{'products/one.png':'https://api.comparacel.com.br/api/v1/media/'+'a'.repeat(64)}})
    :Response.json({documents:[{path:'products/alpha',data:{imageUrl:legacy,offers:[{url:'https://amzn.to/original'},{url:'https://mercadolivre.com.br/original?affiliate=kept'}]},version:'v1'}]});
  const result=(await getLaravelDatabase().doc('products/alpha').get()).data();
  assert.match(result.imageUrl,/api\.comparacel\.com\.br/);
  assert.equal(result.offers[0].url,'https://amzn.to/original');
  assert.equal(result.offers[1].url,'https://mercadolivre.com.br/original?affiliate=kept');
});
test.after(()=>{globalThis.fetch=originalFetch;for(const [name,value] of [['LARAVEL_BACKEND_URL',oldUrl],['LARAVEL_API_TOKEN',oldToken]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}});

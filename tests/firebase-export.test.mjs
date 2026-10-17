import assert from 'node:assert/strict';
import test from 'node:test';
import { exportFirestore } from '../scripts/export-firebase.mjs';

test('export traverses orphan subcollections, pagination and empty documents without losing typed values', async () => {
  const root = 'projects/demo-comparacel/databases/(default)/documents';
  const readTime = '2026-10-14T19:00:00.000Z';
  const calls = [], exported = [];
  const record = { name: `${root}/products/phone`, updateTime: readTime, fields: { amount: { integerValue: '9223372036854775807' }, timestamp: { timestampValue: readTime }, link: { stringValue: 'https://amzn.to/owner' } } };
  const counts = await exportFirestore({ root, readTime, onDocument: row => exported.push(row), request: async (resource, options={}) => {
    calls.push([resource,options]);
    const decoded = decodeURIComponent(resource);
    if (decoded === `${root}:listCollectionIds`) return options.body.pageToken ? { collectionIds: ['users'] } : { collectionIds: ['products'], nextPageToken: 'collections-next' };
    if (decoded === `${root}/users/orphan:listCollectionIds`) return { collectionIds: ['savedComparisons'] };
    if (decoded.endsWith(':listCollectionIds')) return {};
    const url = new URL(`https://example.test/${resource}`);
    assert.equal(url.searchParams.get('readTime'),readTime);
    assert.equal(url.searchParams.get('showMissing'),'true');
    if (decoded.includes('/products?')) return url.searchParams.has('pageToken') ? { documents: [{name:`${root}/products/empty`,updateTime:readTime}] } : { documents:[record],nextPageToken:'documents-next' };
    if (decoded.includes('/users?')) return { documents:[{name:`${root}/users/orphan`}] };
    if (decoded.includes('/savedComparisons?')) return { documents:[{name:`${root}/users/orphan/savedComparisons/a-vs-b`,updateTime:readTime,fields:{}}] };
    throw new Error('Unexpected request');
  }});
  assert.deepEqual(counts,{ products:2,savedComparisons:1 });
  assert.equal(exported.length,3);
  assert.deepEqual(exported[0],record);
  assert(calls.every(([,options])=>!options.method||options.method==='POST'));
  assert(calls.filter(([resource])=>resource.endsWith(':listCollectionIds')).every(([,options])=>options.body.readTime===readTime));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';

test('Firebase auth loads and resolves RSA signing keys without require(ESM)',()=>{
  const result=spawnSync(process.execPath,['--no-experimental-require-module','-e',`
    const assert=require('node:assert/strict');
    const {generateKeyPairSync,createPublicKey}=require('node:crypto');
    const {createRequire}=require('node:module');
    assert.equal(typeof require('firebase-admin/auth').getAuth,'function');
    assert.equal(typeof require('firebase-admin/app-check').getAppCheck,'function');
    const firebaseRequire=createRequire(require.resolve('firebase-admin/auth'));
    const client=firebaseRequire('jwks-rsa')({jwksUri:'https://unused.example',cache:false});
    const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
    client.getKeys=async()=>[{...publicKey.export({format:'jwk'}),kid:'test',alg:'RS256',use:'sig'}];
    client.getSigningKeys().then(keys=>{
      assert.equal(keys.length,1);
      assert.equal(keys[0].kid,'test');
      assert.deepEqual(createPublicKey(keys[0].getPublicKey()).export({format:'jwk'}),publicKey.export({format:'jwk'}));
    }).catch(error=>{console.error(error);process.exitCode=1;});
  `],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

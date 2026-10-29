const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Pallet worker only removes its own obsolete caches',async()=>{
 const handlers={},removed=[];
 const context={
  self:{addEventListener:(type,handler)=>handlers[type]=handler,clients:{claim:async()=>{}},registration:{scope:'https://hesseldevries.com/pallet-optimizer/'}},
  caches:{keys:async()=>['another-app-v1','pallet-optimizer-site-v1','pallet-optimizer-site-v2'],delete:async key=>removed.push(key)},URL,Response
 };
 vm.runInNewContext(fs.readFileSync('pallet-optimizer/service-worker.js','utf8'),context);
 let complete;handlers.activate({waitUntil:promise=>complete=promise});await complete;
 assert.deepEqual(removed,['pallet-optimizer-site-v1']);
 let intercepted=false;
 handlers.fetch({request:{url:'https://api.example.com/data',method:'GET'},respondWith:()=>intercepted=true});
 assert.equal(intercepted,false);
 handlers.fetch({request:{url:'https://hesseldevries.com/meals/',method:'GET'},respondWith:()=>intercepted=true});
 assert.equal(intercepted,false);
});

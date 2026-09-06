import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { googleMapsCoordinates, validCoordinates, expandGoogleMapsUrl, resolveGoogleMapsLink, savedCoordinates, isGoogleMapsUrl } from '../lib/google-maps.ts';

test('place coordinates exclude viewport and null but allow numeric zero', () => {
  for (const value of [null, undefined, '', '24', NaN, Infinity]) assert.equal(validCoordinates(value, 0), false);
  assert.equal(validCoordinates(0, 0), true);
  assert.equal(validCoordinates(91, 0), false);
  assert.equal(validCoordinates(0, 181), false);
  assert.equal(googleMapsCoordinates('https://www.google.com/maps/@24,124,16z'), null);
  assert.deepEqual(googleMapsCoordinates('https://www.google.com/maps?q=24,124'), {latitude:24,longitude:124});
  assert.equal(googleMapsCoordinates('https://www.google.com/maps/dir/a/b/data=!3d24!4d124'), null);
  assert.equal(savedCoordinates({latitude:null,longitude:null}), null);
  assert.throws(() => savedCoordinates({latitude:'24',longitude:124}));
});

test('short link resolves address and does not reinterpret ftid', async () => {
  const address='일본 〒907-0004 Okinawa, Ishigaki, Tonoshiro, 1-13 まるじゅう';
  const result = await resolveGoogleMapsLink('https://maps.app.goo.gl/V6Q1ayNMGMKRTL1M9?g_st=ic', async () => new Response(null, {status:302,headers:{location:'https://maps.google.com/?q='+encodeURIComponent(address)+'&ftid=0x34600aadfca4822d:0xeeaacff16940cdbc'}}));
  assert.equal(result.address,address);
  assert.equal(result.coordinates,null);
});

test('redirect validation prevents external targets, loops and invalid URLs', async () => {
  for (const link of ['http://maps.google.com/', 'https://google.com.evil.test/maps', 'https://www.google.com/url?q=https://example.com', 'https://user@www.google.com/maps']) assert.equal(isGoogleMapsUrl(link),false);
  let calls=0;
  await assert.rejects(expandGoogleMapsUrl('https://maps.app.goo.gl/x',async () => {calls++; return new Response(null,{status:302,headers:{location:'https://127.0.0.1/'}})}));
  assert.equal(calls,1);
  calls=0;
  await assert.rejects(expandGoogleMapsUrl('https://maps.app.goo.gl/x',async () => {calls++; return new Response(null,{status:302,headers:{location:'/x'}})}));
  assert.equal(calls,6);
  await assert.rejects(expandGoogleMapsUrl('https://maps.app.goo.gl/x',async () => {throw new Error('network unavailable')}));
});

test('map excludes unresolved coordinates without guessing and accepts coordinate-only places', async () => {
  const html = await readFile(new URL('../public/itinerary-map.html',import.meta.url),'utf8');
  const body=html.match(/function coordinates\(location,context,item\)\{([^]*?)\}\s*function render/)[1];
  const coordinates=new Function('location','context','item',body);
  assert.equal(coordinates('',null,{latitude:null,longitude:null}),null);
  assert.equal(coordinates('address',null,{latitude:'',longitude:''}),null);
  assert.deepEqual(coordinates('',null,{latitude:0,longitude:0}),[0,0]);
  assert.deepEqual(coordinates('',null,{latitude:24,longitude:124}),[124,24]);
});
import ts from 'typescript';
import vm from 'node:vm';
import * as maps from '../lib/google-maps.ts';

test('schedule POST and PATCH save unresolved links and selected coordinates', async () => {
  const source=await readFile(new URL('../app/api/trips/[id]/route.ts',import.meta.url),'utf8');
  let written;
  const chain={from(){return this},where(){return this},orderBy(){return this},limit:async()=>[{id:'trip',sortOrder:0}],set(value){written=value;return this},values(value){written=value;return this},returning:async()=>[{id:'item',...written}]};
  const db={select:()=>chain,insert:()=>chain,update:()=>chain};
  const module={exports:{}};
  const require=name=>name.includes('google-maps')?maps:name.includes('admin-auth')?{requireSiteAdminResponse:async()=>null,isSiteAdmin:async()=>true}:name.endsWith('/db')?{getDb:()=>db}:name.includes('/schema')?{destinations:{},tripItems:{}}:{and:()=>0,asc:()=>0,desc:()=>0,eq:()=>0};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module.exports,module,require,Response,Request,crypto});
  for (const method of ['POST','PATCH']) {
    const base={itemId:'item',category:'food',title:'まるじゅう',mapUrl:'https://maps.app.goo.gl/V6Q1ayNMGMKRTL1M9?g_st=ic',latitude:null,longitude:null};
    const call=payload=>module.exports[method](new Request('https://test/api/trips/trip',{method,body:JSON.stringify(payload)}),{params:Promise.resolve({id:'trip'})});
    assert.equal((await call(base)).status,method==='POST'?201:200);
    assert.equal(written.mapUrl,base.mapUrl);
    assert.equal(written.latitude??null,null);
    assert.equal((await call({...base,latitude:24,longitude:124})).status,method==='POST'?201:200);
    assert.equal(written.latitude,24);
    assert.equal(written.longitude,124);
    assert.equal((await call({...base,latitude:999,longitude:124})).status,400);
    assert.equal((await call({...base,mapUrl:'https://example.com/'})).status,400);
  }
});

test('lookup returns candidates without selecting the first and handles no results or failure', async () => {
  const source=await readFile(new URL('../app/api/maps/resolve/route.ts',import.meta.url),'utf8');
  for (const scenario of ['multiple','empty','failure']) {
    const module={exports:{}};
    const require=name=>name.includes('admin-auth')?{requireSiteAdminResponse:async()=>null}:{...maps,resolveGoogleMapsLink:async()=>({coordinates:null,address:'まるじゅう Ishigaki',name:''})};
    const fetch=async()=>{
      if(scenario==='failure') throw new Error('offline');
      return Response.json(scenario==='empty'?[]:[{name:'A',display_name:'Address A',lat:'24',lon:'124'},{name:'B',display_name:'Address B',lat:'25',lon:'125'}]);
    };
    vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module.exports,module,require,Response,Request,fetch,AbortSignal,setTimeout});
    const response=await module.exports.POST(new Request('https://test/api/maps/resolve',{method:'POST',body:JSON.stringify({mapUrl:'https://maps.app.goo.gl/V6Q1ayNMGMKRTL1M9?g_st=ic'})}));
    const data=await response.json();
    if(scenario==='failure') {assert.equal(response.status,502);assert.match(data.error,/저장/);}
    else {assert.equal(response.status,200);assert.equal(data.candidates.length,scenario==='empty'?0:2);assert.equal(data.coordinates,undefined);}
  }
});

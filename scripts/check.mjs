import assert from 'node:assert/strict';
import worker from '../worker/index.js';
class Bucket {map=new Map();async get(k){let o=this.map.get(k);return o?{...o,json:async()=>JSON.parse(o.body)}:null}async put(k,body,opts={}){let old=this.map.get(k);if(opts.onlyIf?.etagDoesNotMatch==='*'&&old)return null;if(opts.onlyIf?.etagMatches&&old?.etag!==opts.onlyIf.etagMatches)return null;let o={body,etag:crypto.randomUUID(),...opts};this.map.set(k,o);return o}async list({prefix}){return {objects:[...this.map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false}}}
const env={BUCKET:new Bucket()},origin='https://test.example';
async function call(path,b,auth=true){let r=await worker.fetch(new Request(origin+'/api/'+path,{method:b?'POST':'GET',headers:{...(auth?{'oai-authenticated-user-id':'owner'}:{}),Origin:origin,'Content-Type':'application/json'},...(b?{body:JSON.stringify(b)}:{})}),env);return {status:r.status,data:await r.json()}}
assert.equal((await call('state',null,false)).status,401);
const meme={title:'Test meme',url:'https://www.reddit.com/r/test/1',image:'https://i.redd.it/example.jpg',score:100};
assert.equal((await call('import',meme)).data.added,true);assert.equal((await call('import',meme)).data.added,false);
let s=(await call('state')).data;assert.equal(s.items.length,1);const id=s.items[0].id;
assert.equal((await call('publish',{id,channel:'x'})).status,400);
env.X_ACCESS_TOKEN='test';assert.equal((await call('publish',{id,channel:'x'})).status,400);
await call('update',{id,rights:true,status:'approved',caption:'caption'});
const realFetch=globalThis.fetch;let posts=0;globalThis.fetch=async()=>{posts++;return Response.json({data:{id:'posted'}})};
assert.equal((await call('publish',{id,channel:'x'})).data.deliveries.x.status,'published');assert.equal((await call('publish',{id,channel:'x'})).status,400);assert.equal(posts,1);globalThis.fetch=realFetch;
assert.equal((await call('import',{...meme,image:'javascript:alert(1)'})).status,400);
const r=await worker.fetch(new Request(origin+'/api/import',{method:'POST',headers:{Origin:'https://evil.example','oai-authenticated-user-id':'owner'},body:JSON.stringify(meme)}),env);assert.equal(r.status,403);
const html=await(await worker.fetch(new Request(origin),env)).text();const client=html.split('<script>')[1].split('</script>')[0];new Function(client);
console.log('Passed: authentication, origin checks, persistence, deduplication, approval gates, publishing, duplicate-post protection, URL validation, client syntax.');

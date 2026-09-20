// Local-only end-to-end API check. Creates qa-* fixtures; cleanup SQL is printed to a file.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const base=process.env.LOCAL_API || 'http://127.0.0.1:8787';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('This smoke test is local-only');
const prefix='qa-'+Date.now(),tokens=[],keys=[];
async function call(path,method='GET',body,user=0){
 const res=await fetch(base+path,{method,headers:{...(tokens[user]?{'X-Rater-Token':tokens[user]}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
 const data=await res.json();assert.equal(res.status,200,JSON.stringify({path,status:res.status,data}));return data;
}
for(let i=0;i<2;i++){const r=await call('/api/account/login','POST',{displayName:`测试食客${i}`,pin:'731942'});tokens.push(r.token);keys.push(r.visitorKey);}
const me=await call('/api/account/me');assert.equal(me.displayName,'测试食客0');assert.ok(me.token);
const image=new FormData();image.append('file',new Blob([readFileSync(new URL('../web/public/covers/2026-09-14-chicken-pumpkin-risotto.jpg',import.meta.url))],{type:'image/jpeg'}),'test.jpg');
const upload=await call('/api/journal/upload','POST',image);
const img=await fetch(base+new URL(upload.coverUrl).pathname);assert.equal(img.status,200);assert.equal(img.headers.get('content-type'),'image/jpeg');
await call('/api/journal/dishes','POST',{id:prefix+'-dish',title:'测试菜品',categories:['测试分类'],recipe:{steps:['测试步骤']},coverPath:upload.coverPath});
for(const [suffix,date] of [['a','2026-09-19'],['b','2026-09-20']])await call('/api/journal/entries','POST',{id:prefix+'-'+suffix,kind:'home',targetId:prefix+'-dish',date});
await call(`/api/journal/entries/${prefix}-a/rating`,'PUT',{score:8});await call(`/api/journal/entries/${prefix}-b/rating`,'PUT',{score:9});
await call('/api/journal/restaurants','POST',{id:prefix+'-shop',title:'测试餐厅',location:'测试城市'});
await call('/api/journal/entries','POST',{id:prefix+'-visit',kind:'out',targetId:prefix+'-shop',date:'2026-09-20'});
await call(`/api/journal/entries/${prefix}-visit/rating`,'PUT',{score:10});
await call(`/api/journal/wants/dish/${prefix}-dish`,'PUT',{wanted:true});await call(`/api/journal/wants/dish/${prefix}-dish`,'PUT',{wanted:true},1);
let c=await call('/api/journal/catalog'),board=c.boards.find(b=>b.targetId===prefix+'-dish');assert.equal(c.dishes.find(d=>d.id===prefix+'-dish').ratingAvg,8.5);
assert.ok(c.dishes.find(d=>d.id===prefix+'-dish').coverUrl.includes('/api/media/'));
await call(`/api/journal/comments/board/${board.id}`,'POST',{body:'临时点菜留言'});await call(`/api/journal/comments/dish/${prefix}-dish`,'POST',{body:'长期菜品留言'});
await call(`/api/journal/wants/dish/${prefix}-dish`,'PUT',{wanted:false});await call(`/api/journal/wants/dish/${prefix}-dish`,'PUT',{wanted:false},1);
assert.equal((await call('/api/journal/catalog')).boards.some(b=>b.id===board.id),false);
assert.equal((await call(`/api/journal/comments/dish/${prefix}-dish`)).comments.length,1);
writeFileSync(new URL('../qa-cleanup.sql',import.meta.url),`DELETE FROM comments WHERE target_id LIKE '${prefix}%';\nDELETE FROM board_entries WHERE target_id LIKE '${prefix}%';\nDELETE FROM entries WHERE id LIKE '${prefix}%';\nDELETE FROM dishes WHERE id LIKE '${prefix}%';\nDELETE FROM restaurants WHERE id LIKE '${prefix}%';\nDELETE FROM categories WHERE id='测试分类';\n`);
console.log('PASS: real Worker/D1 login renewal, upload/filter/media, independent ratings, restaurant visits, board lifecycle, persistent comments.');

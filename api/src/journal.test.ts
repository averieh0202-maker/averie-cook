import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import journal,{validDate} from './journal';
import {issueRaterToken} from './account';

class LocalD1 {
  sqlite=new DatabaseSync(':memory:');
  prepare(sql:string){
    const db=this.sqlite;
    const make=(args:any[]=[])=>({bind:(...values:any[])=>make(values),
      first:async()=>db.prepare(sql).get(...args)??null,
      all:async()=>({results:db.prepare(sql).all(...args),success:true}),
      run:async()=>({success:true,meta:{changes:Number(db.prepare(sql).run(...args).changes)}}),
      execute:()=>{const stmt=db.prepare(sql);try{return {results:stmt.all(...args),meta:{changes:0}}}catch{return {results:[],meta:{changes:Number(stmt.run(...args).changes)}}}},
    });return make();
  }
  async batch(statements:any[]){this.sqlite.exec('BEGIN');try{const results=statements.map(s=>s.execute());this.sqlite.exec('COMMIT');return results;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
}
const secret='test-only-journal-session-secret-123';
async function fixture(){
  const db=new LocalD1();db.sqlite.exec('PRAGMA foreign_keys=ON');
  for(const f of readdirSync(new URL('../migrations/',import.meta.url)).sort())db.sqlite.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
  const users=[{id:crypto.randomUUID(),name:'甲'},{id:crypto.randomUUID(),name:'乙'}];
  const tokens=[] as string[];
  for(const u of users){db.sqlite.prepare('INSERT INTO raters VALUES(?,?,?,?,?,?)').run(u.id,u.name,u.name,'hash',u.id,'2026-09-20');tokens.push(await issueRaterToken(secret,u.id,u.name));}
  const env:any={DB:db,OWNER_SESSION_SECRET:secret,INGEST_SECRET:'test-ingest-secret',ENVIRONMENT:'development',ASSET_BASE_URL:'http://localhost'};
  const call=async(path:string,method='GET',body?:any,user:number|null=0)=>{
    const res=await journal.request('http://localhost'+path,{method,headers:{...(user===null?{}:{'X-Rater-Token':tokens[user]}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined},env);
    return {status:res.status,data:await res.json() as any};
  };
  await call('/dishes','POST',{id:'rice',title:'烩饭',status:'want_cook',categories:['主食'],recipe:{steps:['炖煮']}});
  return {db,call,env,users};
}
test('calendar rejects impossible dates',()=>{assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2026-9-1'),false)});
test('recipes are public, while writes require a signed account rather than a visitor header',async()=>{
 const {call,env,users}=await fixture();assert.equal((await call('/dishes/rice','GET',undefined,null)).data.recipe.steps[0],'炖煮');
 assert.equal((await call('/dishes','POST',{title:'匿名'},null)).status,401);
 const res=await journal.request('http://localhost/dishes',{method:'POST',headers:{'X-Visitor-Key':users[0].id,'Content-Type':'application/json'},body:JSON.stringify({title:'伪装'})},env);assert.equal(res.status,401);
});
test('same dish on different dates retains separate scores; editing only replaces one score',async()=>{
 const {call}=await fixture();for(const [id,date] of [['first','2026-09-19'],['second','2026-09-20']])assert.equal((await call('/entries','POST',{id,kind:'home',targetId:'rice',date})).status,200);
 await call('/entries/first/rating','PUT',{score:6});await call('/entries/second/rating','PUT',{score:9});await call('/entries/first/rating','PUT',{score:8});await call('/entries/first/rating','PUT',{score:10},1);
 const c=(await call('/catalog')).data;assert.deepEqual(c.entries.map((e:any)=>[e.id,e.myScore,e.ratingCount,e.ratingAvg]),[['second',9,1,9],['first',8,2,9]]);assert.equal(c.dishes[0].status,'cooked');assert.equal(c.dishes[0].ratingCount,3);assert.equal(c.dishes[0].ratingAvg,9);
 await call('/dishes','POST',{id:'rice',recipe:{steps:['更新做法']}});assert.equal((await call('/catalog')).data.entries.length,2);
});
test('restaurant visits are independent and location is retained',async()=>{
 const {call}=await fixture();await call('/restaurants','POST',{id:'shop',title:'京都小店',location:'京都 · 祇园'});
 for(const [id,date]of[['visit-a','2026-09-18'],['visit-b','2026-09-20']])await call('/entries','POST',{id,kind:'out',targetId:'shop',date});
 await call('/entries/visit-a/rating','PUT',{score:7});await call('/entries/visit-b/rating','PUT',{score:9});
 const c=(await call('/catalog')).data;assert.equal(c.restaurants[0].location,'京都 · 祇园');assert.equal(c.restaurants[0].ratingAvg,8);assert.equal(c.entries.length,2);
});
test('last cancellation clears board-only comments; later re-entry starts a new cycle',async()=>{
 const {call}=await fixture();await call('/wants/dish/rice','PUT',{wanted:true});await call('/wants/dish/rice','PUT',{wanted:true},1);
 const original=(await call('/catalog')).data.boards[0];await call(`/comments/board/${original.id}`,'POST',{body:'本轮留言'});await call('/comments/dish/rice','POST',{body:'长期留言'});
 await call('/wants/dish/rice','PUT',{wanted:false});assert.equal((await call('/catalog')).data.boards[0].wantEatCount,1);assert.equal((await call(`/comments/board/${original.id}`)).data.comments.length,1);
 await call('/wants/dish/rice','PUT',{wanted:false},1);assert.equal((await call('/catalog')).data.boards.length,0);assert.equal((await call(`/comments/board/${original.id}`)).status,404);
 await call('/wants/dish/rice','PUT',{wanted:true});const next=(await call('/catalog')).data.boards[0];assert.notEqual(next.id,original.id);assert.equal((await call(`/comments/board/${next.id}`)).data.comments.length,0);assert.equal((await call('/comments/dish/rice')).data.comments.length,1);
});
test('ranking uses most recent active want, retries do not duplicate or bump a vote',async()=>{
 const {call,db,users}=await fixture();await call('/dishes','POST',{id:'soup',title:'汤'});await call('/wants/dish/rice','PUT',{wanted:true});await call('/wants/dish/rice','PUT',{wanted:true},1);await call('/wants/dish/soup','PUT',{wanted:true});
 db.sqlite.exec("UPDATE board_wants SET created_at='2026-09-19T00:00:00Z'");db.sqlite.prepare("UPDATE board_wants SET created_at='2026-09-20T00:00:00Z' WHERE board_id IN(SELECT id FROM board_entries WHERE target_id='soup')").run();
 assert.deepEqual((await call('/catalog')).data.boards.map((b:any)=>b.targetId),['soup','rice']);
 await call('/wants/dish/rice','PUT',{wanted:true});assert.equal((await call('/catalog')).data.boards[1].wantEatCount,2);
 await call('/wants/dish/rice','PUT',{wanted:false});await call('/wants/dish/rice','PUT',{wanted:true});assert.equal((await call('/catalog')).data.boards[0].targetId,'rice');
});
test('comments and content ownership cannot be overwritten by another account',async()=>{
 const {call}=await fixture();assert.equal((await call('/dishes','POST',{id:'rice',title:'别人修改'},1)).status,403);
 const comment=await call('/comments/dish/rice','POST',{body:'我的留言'});assert.equal((await call(`/comments/dish/${comment.data.id}`,'DELETE',undefined,1)).status,404);assert.equal((await call(`/comments/dish/${comment.data.id}`,'DELETE')).status,200);
 assert.equal((await call('/entries','POST',{kind:'home',targetId:'rice',date:'2026-02-30'})).status,400);
 assert.equal((await call('/comments/dish/missing','POST',{body:'无效'})).status,404);
});

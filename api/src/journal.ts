import { Hono, type Context } from 'hono';
import type { Env } from './env';
import { ingestAuthorized, isOwner, readRaterToken, verifyRaterSession } from './auth';
import { buildCoverUrl, sanitizeCoverPath, parseRatingScore } from './dto';
import { resolveAssetBase } from './cors';

type C = Context<{ Bindings: Env }>;
type Row = Record<string, any>;
const journal = new Hono<{ Bindings: Env }>();
const idOk = (id: string) => /^[A-Za-z0-9._-]{1,100}$/.test(id);
const json = (s: string | null, fallback: any = []) => { try { return JSON.parse(s || '') ?? fallback; } catch { return fallback; } };
function textField(value: unknown, max = 2000) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export async function authenticatedRater(c: C) {
  const token = await verifyRaterSession(readRaterToken(c), c.env.OWNER_SESSION_SECRET);
  if (!token) return null;
  const row = await c.env.DB.prepare('SELECT display_name FROM raters WHERE visitor_key=?').bind(token.visitorKey).first<{display_name:string}>();
  return row ? { visitorKey: token.visitorKey, displayName: row.display_name } : null;
}
async function writer(c: C) {
  if (await ingestAuthorized(c) || await isOwner(c)) return { visitorKey: 'owner', displayName: 'Averie', admin: true };
  const user = await authenticatedRater(c);
  return user ? { ...user, admin: false } : null;
}
function cover(c: C, path: string | null) {
  return buildCoverUrl(path, resolveAssetBase(c.env.ASSET_BASE_URL, c.req.url), new URL(c.req.url).origin);
}
async function targetExists(c: C, kind: string, id: string) {
  if (!idOk(id)) return false;
  if (kind === 'dish') return !!await c.env.DB.prepare('SELECT id FROM dishes WHERE id=? AND published=1 AND deleted_at IS NULL').bind(id).first();
  if (kind === 'restaurant') return !!await c.env.DB.prepare('SELECT id FROM restaurants WHERE id=?').bind(id).first();
  if (kind === 'entry') return !!await c.env.DB.prepare("SELECT e.id FROM entries e WHERE e.id=? AND ((e.kind='home' AND EXISTS(SELECT 1 FROM dishes d WHERE d.id=e.target_id AND d.published=1 AND d.deleted_at IS NULL)) OR (e.kind='out' AND EXISTS(SELECT 1 FROM restaurants r WHERE r.id=e.target_id)))").bind(id).first();
  return false;
}

// Aggregate per occasion. Library averages are explicitly all occasion ratings, not unique people.
export function aggregate(scores: Array<{score:number}>) {
  return { ratingCount: scores.length, ratingAvg: scores.length ? Math.round(scores.reduce((sum, r) => sum + Number(r.score), 0) / scores.length * 10) / 10 : null };
}

journal.get('/catalog', async c => {
  const user = await authenticatedRater(c);
  const result = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id,title,status,categories,cover_path,cooked_at,source_url,created_at,updated_at FROM dishes WHERE published=1 AND deleted_at IS NULL ORDER BY updated_at DESC'),
    c.env.DB.prepare('SELECT * FROM restaurants ORDER BY updated_at DESC'),
    c.env.DB.prepare('SELECT * FROM entries ORDER BY occurred_on DESC,created_at DESC,id DESC'),
    c.env.DB.prepare('SELECT * FROM entry_ratings'),
    c.env.DB.prepare('SELECT b.*,MAX(w.created_at) AS last_wanted_at,COUNT(w.visitor_key) AS want_count FROM board_entries b JOIN board_wants w ON w.board_id=b.id GROUP BY b.id ORDER BY last_wanted_at DESC,b.id DESC'),
    c.env.DB.prepare('SELECT board_id FROM board_wants WHERE visitor_key=?').bind(user?.visitorKey ?? ''),
    c.env.DB.prepare('SELECT id,name,sort FROM categories ORDER BY sort'),
    c.env.DB.prepare('SELECT scope,target_id,COUNT(*) AS count FROM comments GROUP BY scope,target_id'),
    c.env.DB.prepare('SELECT board_id,COUNT(*) AS count FROM board_comments GROUP BY board_id'),
  ]);
  const rows = result.map(r => r.results as Row[]);
  const [dishes, restaurants, allEntries, ratings, boards, mine, categories, comments, boardComments] = rows;
  const allowed = new Set([...dishes.map(d => 'home:'+d.id), ...restaurants.map(r => 'out:'+r.id)]);
  const entries = allEntries.filter(e => allowed.has(e.kind+':'+e.target_id));
  const entryMap = new Map(entries.map(e => [e.id, e]));
  const mineSet = new Set(mine.map(r => r.board_id));
  const countFor = (scope: string, id: string) => Number(comments.find(r => r.scope===scope && r.target_id===id)?.count ?? 0);
  const boardFor = (kind: string, id: string) => {
    const b = boards.find(b => b.kind===kind && b.target_id===id);
    return { wanted: !!b && mineSet.has(b.id), wantEatCount: Number(b?.want_count ?? 0), boardId: b?.id ?? null };
  };
  const scoresFor = (kind: string, id: string) => ratings.filter(r => { const e = entryMap.get(r.entry_id); return e?.kind===kind && e.target_id===id; });
  return c.json({
    generatedAt: new Date().toISOString(),
    dishes: dishes.map(d => ({ id:d.id,title:d.title,status:d.status,categories:json(d.categories).map((id:string) => categories.find(c=>c.id===id) ?? {id,name:id}),coverUrl:cover(c,d.cover_path),sourceUrl:d.source_url,updatedAt:d.updated_at,...aggregate(scoresFor('home',d.id) as any),...boardFor('dish',d.id),commentCount:countFor('dish',d.id) })),
    restaurants: restaurants.map(r => ({id:r.id,title:r.title,location:r.location,categories:json(r.categories),coverUrl:cover(c,r.cover_path),notes:r.notes,...aggregate(scoresFor('out',r.id) as any),...boardFor('restaurant',r.id),commentCount:countFor('restaurant',r.id)})),
    entries: entries.map(e => ({id:e.id,kind:e.kind,targetId:e.target_id,date:e.occurred_on,meal:e.meal,notes:e.notes,coverUrl:cover(c,e.cover_path),...aggregate(ratings.filter(r=>r.entry_id===e.id) as any),myScore:ratings.find(r=>r.entry_id===e.id && r.visitor_key===user?.visitorKey)?.score ?? null,commentCount:countFor('entry',e.id)})),
    boards: boards.filter(b=>allowed.has((b.kind==='dish'?'home':'out')+':'+b.target_id)).map(b=>({id:b.id,kind:b.kind,targetId:b.target_id,lastWantedAt:b.last_wanted_at,wantEatCount:Number(b.want_count),wanted:mineSet.has(b.id),commentCount:Number(boardComments.find(r=>r.board_id===b.id)?.count ?? 0)})),
    categories,
  });
});

journal.get('/dishes/:id', async c => {
  const id=c.req.param('id');
  if (!await targetExists(c,'dish',id)) return c.json({error:'找不到这道菜'},404);
  const row=await c.env.DB.prepare('SELECT recipe,source_url FROM dishes WHERE id=?').bind(id).first<Row>();
  return c.json({recipe:json(row?.recipe,{}),sourceUrl:row?.source_url});
});

journal.post('/dishes', async c => {
  const user=await writer(c); if(!user) return c.json({error:'请先登录'},401);
  const body=await c.req.json<Row>();
  const id=body.id || crypto.randomUUID();
  if(!idOk(id)) return c.json({error:'菜品编号无效'},400);
  const existing=await c.env.DB.prepare('SELECT * FROM dishes WHERE id=?').bind(id).first<Row>();
  if(existing && !user.admin && existing.author_key!==user.visitorKey) return c.json({error:'只能修改自己上传的菜品'},403);
  const title=textField(body.title ?? existing?.title,80), status=body.status ?? existing?.status ?? 'want_cook';
  if(!title || !['cooked','want_cook'].includes(status)) return c.json({error:'请填写菜名和有效状态'},400);
  const cats=body.categories ?? json(existing?.categories);
  if(!Array.isArray(cats) || cats.length>12 || cats.some(x=>typeof x!=='string'||!x.trim()||x.length>30)) return c.json({error:'分类最多12项，每项不超过30字'},400);
  const path=body.coverPath===undefined ? existing?.cover_path ?? null : body.coverPath ? sanitizeCoverPath(body.coverPath) : null;
  if(body.coverPath && !path) return c.json({error:'图片路径无效'},400);
  const recipe=body.recipe ?? json(existing?.recipe,{});
  if(!recipe || typeof recipe!=='object' || Array.isArray(recipe) || JSON.stringify(recipe).length>100000) return c.json({error:'食谱内容格式无效或过长'},400);
  const source=textField(body.sourceUrl ?? existing?.source_url,1000);
  if(source && !/^https?:\/\//i.test(source)) return c.json({error:'来源须为网页链接'},400);
  const now=new Date().toISOString();
  await c.env.DB.batch([
    ...cats.map((name:string)=>c.env.DB.prepare('INSERT INTO categories(id,name,sort) VALUES(?,?,100) ON CONFLICT(id) DO NOTHING').bind(name.trim(),name.trim())),
    c.env.DB.prepare(`INSERT INTO dishes(id,title,status,categories,cover_path,source_url,recipe,published,author_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,status=excluded.status,categories=excluded.categories,cover_path=excluded.cover_path,source_url=excluded.source_url,recipe=excluded.recipe,updated_at=excluded.updated_at`).bind(id,title,status,JSON.stringify(cats.map((s:string)=>s.trim())),path,source||null,JSON.stringify(recipe),user.visitorKey,now,now),
  ]);
  return c.json({ok:true,id});
});

journal.post('/restaurants', async c => {
  const user=await writer(c); if(!user) return c.json({error:'请先登录'},401);
  const body=await c.req.json<Row>(), id=body.id || crypto.randomUUID();
  if(!idOk(id)) return c.json({error:'餐厅编号无效'},400);
  const existing=await c.env.DB.prepare('SELECT * FROM restaurants WHERE id=?').bind(id).first<Row>();
  if(existing && !user.admin && existing.author_key!==user.visitorKey) return c.json({error:'只能修改自己添加的餐厅'},403);
  const title=textField(body.title ?? existing?.title,80),location=textField(body.location ?? existing?.location,120);
  if(!title || !location) return c.json({error:'请填写店名和地点'},400);
  const cats=body.categories ?? json(existing?.categories);
  if(!Array.isArray(cats)||cats.length>12||cats.some(x=>typeof x!=='string'||x.length>30)) return c.json({error:'分类格式无效'},400);
  const path=body.coverPath===undefined ? existing?.cover_path ?? null : body.coverPath ? sanitizeCoverPath(body.coverPath) : null;
  if(body.coverPath && !path) return c.json({error:'图片路径无效'},400);
  const now=new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO restaurants(id,title,location,categories,cover_path,notes,author_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,location=excluded.location,categories=excluded.categories,cover_path=excluded.cover_path,notes=excluded.notes,updated_at=excluded.updated_at`).bind(id,title,location,JSON.stringify(cats),path,textField(body.notes ?? existing?.notes,5000),user.visitorKey,now,now).run();
  return c.json({ok:true,id});
});

journal.post('/entries', async c => {
  const user=await writer(c); if(!user) return c.json({error:'请先登录'},401);
  const body=await c.req.json<Row>(), id=body.id || crypto.randomUUID();
  if(!idOk(id)||!['home','out'].includes(body.kind)||!validDate(body.date)) return c.json({error:'请填写有效日期和记录类型'},400);
  const kind=body.kind==='home'?'dish':'restaurant';
  if(!await targetExists(c,kind,String(body.targetId))) return c.json({error:'关联的菜品或餐厅不存在'},404);
  const existing=await c.env.DB.prepare('SELECT author_key,kind,target_id FROM entries WHERE id=?').bind(id).first<Row>();
  if(existing && !user.admin && existing.author_key!==user.visitorKey) return c.json({error:'只能修改自己添加的记录'},403);
  if(existing && (existing.kind!==body.kind || existing.target_id!==body.targetId)) return c.json({error:'已有记录不能更换菜品或餐厅，请新建记录'},400);
  const path=body.coverPath ? sanitizeCoverPath(body.coverPath) : null;
  if(body.coverPath && !path) return c.json({error:'图片路径无效'},400);
  const now=new Date().toISOString();
  const statements=[c.env.DB.prepare(`INSERT INTO entries(id,kind,target_id,occurred_on,meal,notes,cover_path,author_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET occurred_on=excluded.occurred_on,meal=excluded.meal,notes=excluded.notes,cover_path=COALESCE(excluded.cover_path,entries.cover_path),updated_at=excluded.updated_at`).bind(id,body.kind,body.targetId,body.date,textField(body.meal,20),textField(body.notes,10000),path,user.visitorKey,now,now)];
  if(body.kind==='home') statements.push(c.env.DB.prepare("UPDATE dishes SET status='cooked',cooked_at=CASE WHEN cooked_at IS NULL OR cooked_at<? THEN ? ELSE cooked_at END,updated_at=? WHERE id=?").bind(body.date,body.date,now,body.targetId));
  await c.env.DB.batch(statements);
  return c.json({ok:true,id});
});

journal.put('/entries/:id/rating',async c=>{
  const user=await authenticatedRater(c); if(!user)return c.json({error:'请先登录再评分'},401);
  const id=c.req.param('id'),body=await c.req.json<Row>(),score=parseRatingScore(body.score);
  if(score===null)return c.json({error:'请选择1–10的整数分数'},400);
  if(!await targetExists(c,'entry',id))return c.json({error:'记录不存在'},404);
  await c.env.DB.prepare('INSERT INTO entry_ratings(entry_id,visitor_key,score,updated_at) VALUES(?,?,?,?) ON CONFLICT(entry_id,visitor_key) DO UPDATE SET score=excluded.score,updated_at=excluded.updated_at').bind(id,user.visitorKey,score,new Date().toISOString()).run();
  return c.json({ok:true,myScore:score});
});

// An explicit desired state makes retries safe. D1 batch keeps removal + cycle cleanup atomic.
journal.put('/wants/:kind/:id',async c=>{
  const user=await authenticatedRater(c);if(!user)return c.json({error:'请先登录再点想吃'},401);
  const kind=c.req.param('kind'),id=c.req.param('id'),body=await c.req.json<Row>();
  if(!['dish','restaurant'].includes(kind)||typeof body.wanted!=='boolean')return c.json({error:'点菜参数无效'},400);
  if(!await targetExists(c,kind,id))return c.json({error:'菜品或餐厅不存在'},404);
  if(body.wanted){
    const now=new Date().toISOString();
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO board_entries(id,kind,target_id,created_at) VALUES(?,?,?,?) ON CONFLICT(kind,target_id) DO NOTHING').bind(crypto.randomUUID(),kind,id,now),
      c.env.DB.prepare('INSERT INTO board_wants(board_id,visitor_key,created_at) SELECT id,?,? FROM board_entries WHERE kind=? AND target_id=? ON CONFLICT(board_id,visitor_key) DO NOTHING').bind(user.visitorKey,now,kind,id),
    ]);
  }else{
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM board_wants WHERE visitor_key=? AND board_id IN (SELECT id FROM board_entries WHERE kind=? AND target_id=?)').bind(user.visitorKey,kind,id),
      c.env.DB.prepare('DELETE FROM board_entries WHERE kind=? AND target_id=? AND NOT EXISTS(SELECT 1 FROM board_wants w WHERE w.board_id=board_entries.id)').bind(kind,id),
    ]);
  }
  return c.json({ok:true,wanted:body.wanted});
});

async function commentTarget(c:C,scope:string,id:string){
  if(scope==='board')return !!await c.env.DB.prepare("SELECT b.id FROM board_entries b WHERE b.id=? AND EXISTS(SELECT 1 FROM board_wants w WHERE w.board_id=b.id) AND ((b.kind='dish' AND EXISTS(SELECT 1 FROM dishes d WHERE d.id=b.target_id AND d.published=1 AND d.deleted_at IS NULL)) OR (b.kind='restaurant' AND EXISTS(SELECT 1 FROM restaurants r WHERE r.id=b.target_id)))").bind(id).first();
  return targetExists(c,scope,id);
}
journal.get('/comments/:scope/:id',async c=>{
  const scope=c.req.param('scope'),id=c.req.param('id');
  if(!await commentTarget(c,scope,id))return c.json({error:scope==='board'?'这轮点菜已结束，评论已清除':'内容不存在'},404);
  const user=await authenticatedRater(c);
  const result=scope==='board'
    ? await c.env.DB.prepare('SELECT * FROM board_comments WHERE board_id=? ORDER BY created_at,id').bind(id).all<Row>()
    : await c.env.DB.prepare('SELECT * FROM comments WHERE scope=? AND target_id=? ORDER BY created_at,id').bind(scope,id).all<Row>();
  return c.json({comments:result.results.map(r=>({id:r.id,author:r.author_name,body:r.body,createdAt:r.created_at,mine:r.visitor_key===user?.visitorKey}))});
});
journal.post('/comments/:scope/:id',async c=>{
  const user=await authenticatedRater(c);if(!user)return c.json({error:'请先登录再评论'},401);
  const scope=c.req.param('scope'),id=c.req.param('id'),body=await c.req.json<Row>();
  if(!await commentTarget(c,scope,id))return c.json({error:scope==='board'?'这轮点菜已结束，评论已清除':'内容不存在'},404);
  if(typeof body.body!=='string'||!body.body.trim()||body.body.length>2000)return c.json({error:'评论须为1–2000字'},400);
  const commentId=crypto.randomUUID(),now=new Date().toISOString();
  if(scope==='board'){
    // The INSERT SELECT also handles cancellation after the existence check.
    const result=await c.env.DB.prepare('INSERT INTO board_comments(id,board_id,visitor_key,author_name,body,created_at) SELECT ?,id,?,?,?,? FROM board_entries WHERE id=?').bind(commentId,user.visitorKey,user.displayName,body.body.trim(),now,id).run();
    if(!result.meta.changes)return c.json({error:'这轮点菜已结束，评论已清除'},409);
  }else await c.env.DB.prepare('INSERT INTO comments(id,scope,target_id,visitor_key,author_name,body,created_at) VALUES(?,?,?,?,?,?,?)').bind(commentId,scope,id,user.visitorKey,user.displayName,body.body.trim(),now).run();
  return c.json({ok:true,id:commentId});
});
journal.delete('/comments/:scope/:id',async c=>{
  const user=await authenticatedRater(c);if(!user)return c.json({error:'请先登录'},401);
  const scope=c.req.param('scope'),id=c.req.param('id');
  const table=scope==='board'?'board_comments':'comments';
  const result=await c.env.DB.prepare(`DELETE FROM ${table} WHERE id=? AND visitor_key=?`).bind(id,user.visitorKey).run();
  if(!result.meta.changes)return c.json({error:'评论不存在或不属于你'},404);
  return c.json({ok:true});
});
journal.onError((err,c)=>{
  console.error('journal request failed',err);
  if(err instanceof SyntaxError)return c.json({error:'内容格式不正确'},400);
  return c.json({error:'暂时没能保存或加载，请稍后重试'},500);
});
export default journal;

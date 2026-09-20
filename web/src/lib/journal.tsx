import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { request, isUnreachableError } from './api';
import { useAuth } from './auth';

export type Stats={ratingAvg:number|null;ratingCount:number};
export type Food=Stats & {id:string;title:string;status:'cooked'|'want_cook';categories:{id:string;name:string}[];coverUrl:string|null;sourceUrl?:string;wanted:boolean;wantEatCount:number;boardId:string|null;commentCount:number};
export type Restaurant=Stats & {id:string;title:string;location:string;categories:string[];coverUrl:string|null;notes:string;wanted:boolean;wantEatCount:number;boardId:string|null;commentCount:number};
export type Entry=Stats & {id:string;kind:'home'|'out';targetId:string;date:string;meal:string;notes:string;coverUrl:string|null;myScore:number|null;commentCount:number};
export type Board={id:string;kind:'dish'|'restaurant';targetId:string;lastWantedAt:string;wantEatCount:number;wanted:boolean;commentCount:number};
export type Catalog={generatedAt:string;dishes:Food[];restaurants:Restaurant[];entries:Entry[];boards:Board[];categories:{id:string;name:string}[]};
const CACHE='averie-journal-public-v2';
function publicCopy(data:Catalog):Catalog{return {...data,entries:data.entries.map(e=>({...e,myScore:null})),dishes:data.dishes.map(d=>({...d,wanted:false})),restaurants:data.restaurants.map(r=>({...r,wanted:false})),boards:data.boards.map(b=>({...b,wanted:false}))};}
function cached():Catalog|null {try {const d=JSON.parse(localStorage.getItem(CACHE)||'null');return d&&Array.isArray(d.entries)&&Array.isArray(d.boards)?publicCopy(d):null;}catch{return null;}}
const Ctx=createContext<{data:Catalog|null;error:string|null;loading:boolean;live:boolean;refresh:()=>Promise<void>}>({data:null,error:null,loading:true,live:false,refresh:async()=>{}});
export function JournalProvider({children}:{children:ReactNode}){
  const {identityEpoch}=useAuth();
  const [data,setData]=useState<Catalog|null>(cached),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(false),[live,setLive]=useState(false);
  const generation=useRef(0);
  const refresh=useCallback(async()=>{
    const n=++generation.current;setLoading(true);
    try{const next=await request<Catalog>('/api/journal/catalog');if(n!==generation.current)return;setData(next);setLive(true);setError(null);try{localStorage.setItem(CACHE,JSON.stringify(publicCopy(next)))}catch{}}
    catch(e){if(n===generation.current){setLive(false);setError(isUnreachableError(e)||e instanceof Error && /^请求失败（5\d\d）$/.test(e.message)?'网络暂时不可用，先看看已保存的记录。':e instanceof Error && e.message!=='slow'?e.message:'网络有点慢，先看看已保存的记录。');}}
    finally{if(n===generation.current)setLoading(false);}
  },[]);
  useEffect(()=>{setData(prev=>prev?publicCopy(prev):null);setLive(false);void refresh();},[refresh,identityEpoch]);
  useEffect(()=>{
    const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),4000);
    fetch(`${import.meta.env.BASE_URL}data/journal.json`,{signal:ctrl.signal}).then(r=>r.ok?r.json():null).then(d=>{if(d)setData(old=>old??d)}).catch(()=>{}).finally(()=>clearTimeout(timer));
    const online=()=>void refresh();window.addEventListener('online',online);return()=>{ctrl.abort();window.removeEventListener('online',online);};
  },[refresh]);
  return <Ctx.Provider value={{data,error,loading,live,refresh}}>{children}</Ctx.Provider>;
}
export const useJournal=()=>useContext(Ctx);
export const api=<T,>(path:string,method='GET',body?:unknown)=>request<T>('/api/journal'+path,{method,...(body===undefined?{}:{body:JSON.stringify(body)})});
export function photoUrl(url:string|null){
  if(!url)return null;
  if(/^https?:\/\//.test(url)){try{const u=new URL(url);if(u.hostname.endsWith('.workers.dev')&&u.pathname.startsWith('/api/media/'))return u.pathname;return url;}catch{return null;}}
  return `${import.meta.env.BASE_URL}${url.replace(/^\//,'')}`;
}
export const tags=(item:Food|Restaurant)=>item.categories.map(c=>typeof c==='string'?c:c.name);
export const score=(n:number|null)=>n===null?'待评分':n.toFixed(1);

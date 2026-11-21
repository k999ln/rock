'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import type { NoahProfileView } from '@/lib/noah-profile-contract';
export function useNoahProfile(expectedOwner?:string|null){
  const [profile,setProfile]=useState<NoahProfileView|null>(null),[error,setError]=useState(''),[guest,setGuest]=useState(false),[busy,setBusy]=useState(false);
  const epoch=useRef(0),lock=useRef(false);
  const reload=useCallback(async()=>{
    const current=++epoch.current;setProfile(null);setError('');setGuest(false);setBusy(false);
    try{const response=await fetch('/api/noah/profile',{cache:'no-store'});const data=await response.json() as NoahProfileView & {error?:string};
      if(current!==epoch.current)return;
      if(response.status===401){setGuest(true);return;}
      if(!response.ok || !data.ownerScope)throw Error(data.error??'保存情報を開けません。');
      if(expectedOwner && data.ownerScope!==expectedOwner)throw Error('アカウントが変わりました。画面を開き直してください。');
      setProfile(data);
    }catch(e){if(current===epoch.current)setError(e instanceof Error?e.message:'保存情報を開けません。');}
  },[expectedOwner]);
  const invalidate=useCallback(()=>{epoch.current++;},[]);
  useEffect(()=>{let active=true;queueMicrotask(()=>{if(active)void reload();});const visibility=()=>{if(document.hidden){epoch.current++;setProfile(null);}else void reload();};document.addEventListener('visibilitychange',visibility);return()=>{active=false;invalidate();document.removeEventListener('visibilitychange',visibility);};},[reload,invalidate]);
  async function mutate(body:Record<string,unknown>|File){
    if(!profile || lock.current)return null;
    const current=epoch.current;lock.current=true;setBusy(true);setError('');
    try{
      const upload=body instanceof File;
      const response=await fetch(`/api/noah/profile${upload?'/documents':''}`,{method:'POST',cache:'no-store',headers:{[OWNER_SCOPE_HEADER]:profile.ownerScope,...(upload?{'Content-Type':body.type,'X-Noah-File-Name':encodeURIComponent(body.name),'X-Noah-Profile-Revision':String(profile.revision)}:{'Content-Type':'application/json'})},body:upload?body:JSON.stringify({...body,revision:profile.revision})});
      const data=await response.json() as NoahProfileView & {error?:string};
      if(current!==epoch.current)return null;
      if(!response.ok){if(response.status===401||response.status===409)setProfile(null);throw Error(data.error??'保存できませんでした。');}
      if(data.ownerScope!==profile.ownerScope){setProfile(null);throw Error('アカウントが変わりました。');}
      setProfile(data);return data;
    }catch(e){if(current===epoch.current)setError(e instanceof Error?e.message:'接続を確認してください。');return null;}
    finally{lock.current=false;if(current===epoch.current)setBusy(false);}
  }
  return {profile,error,guest,busy,save:mutate,reload};
}

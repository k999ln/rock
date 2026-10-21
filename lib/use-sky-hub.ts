'use client';
import { useCallback,useEffect,useState } from 'react';
import type { SkyHubPlugin } from './sky-hub';
export function useSkyHub() {
  const [plugins,setPlugins]=useState<SkyHubPlugin[]>([]),[state,setState]=useState<'loading'|'ready'|'signed-out'|'error'>('loading');
  const refresh=useCallback(async(signal?:AbortSignal)=>{try{
    const response=await fetch('/api/sky/hub',{cache:'no-store',signal});if(response.status===401){setPlugins([]);setState('signed-out');return;}
    const value=await response.json() as {plugins?:SkyHubPlugin[]};if(!response.ok||!Array.isArray(value.plugins))throw new Error('unavailable');
    if(!signal?.aborted){setPlugins(value.plugins);setState('ready');}
  }catch{if(!signal?.aborted){setPlugins([]);setState('error');}}},[]);
  useEffect(()=>{const controller=new AbortController();const frame=requestAnimationFrame(()=>{void refresh(controller.signal);});const reload=()=>{void refresh(controller.signal);};window.addEventListener('sky-hub-changed',reload);return()=>{cancelAnimationFrame(frame);controller.abort();window.removeEventListener('sky-hub-changed',reload);};},[refresh]);
  const save=async(input:unknown)=>{const response=await fetch('/api/sky/hub',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const value=await response.json() as {plugins?:SkyHubPlugin[];error?:string};if(!response.ok||!value.plugins){if(response.status===409)void refresh();throw new Error(value.error||'保存できませんでした。');}setPlugins(value.plugins);window.dispatchEvent(new Event('sky-hub-changed'));};
  return{plugins,state,refresh,save};
}

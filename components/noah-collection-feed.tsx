'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import NoahPinHome from './noah-pin-home';
export default function NoahCollectionFeed({searchQuery,onClearQuery,showSearch=true}:{compact?:boolean;searchQuery?:string;onClearQuery?:()=>void;allResultsHref?:string;showSearch?:boolean}) {
  const params=useSearchParams(),[query,setQuery]=useState(params.get('collectionQuery')??'');
  return <>{showSearch && searchQuery===undefined && <label>Agentを検索<input type="search" value={query} maxLength={200} onChange={event=>setQuery(event.target.value)}/></label>}
    <NoahPinHome searchQuery={searchQuery ?? query} onClearQuery={()=>{setQuery('');onClearQuery?.();}} initialSource={params.get('collectionSource') ?? 'discovered'}/></>;
}

import {COMBINATIONS_ORIGIN} from '@/lib/noah-combinations';
export async function POST(request:Request){
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin&&origin!=='https://avoado.si')return Response.json({error:'送信元を確認してください。'},{status:403});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'JSONで送信してください。'},{status:415});
  const reader=request.body?.getReader();if(!reader)return Response.json({error:'入力がありません。'},{status:400});
  let size=0;const chunks:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return Response.json({error:'入力が長すぎます。'},{status:413});}chunks.push(value);}
  const body=new Uint8Array(size);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.length;}
  try{const r=await fetch(COMBINATIONS_ORIGIN+'/api/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(8000)});return new Response(await r.text(),{status:r.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}catch{return Response.json({error:'接続に時間がかかっています。少し待って再試行してください。'},{status:503});}
}

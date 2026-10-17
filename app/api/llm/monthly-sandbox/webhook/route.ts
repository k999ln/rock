import {env} from 'cloudflare:workers';
import {database} from '@/lib/fund-store';
import {hostedMonthlyService} from '@/lib/sky-hosted-monthly';
export async function POST(request:Request){try{const raw=await request.text();if(raw.length>200000)return new Response('Too large',{status:413});const result=await hostedMonthlyService(database(),env as unknown as Record<string,string>).webhook(raw,request.headers.get('stripe-signature'));return Response.json(result);}catch{return new Response('Verification or reconciliation failed',{status:503});}}

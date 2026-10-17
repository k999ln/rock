import {env} from 'cloudflare:workers';
import {database} from '@/lib/fund-store';
import {authorizeRemoteAiRequest,RemoteAiGuardError} from '@/lib/remote-ai-guard';
import {hostedMonthlyService} from '@/lib/sky-hosted-monthly';
import {skyRecurringUsage} from '@/lib/sky-recurring-plan';
import {WorkError} from '@/lib/workflow';
async function handle(request:Request){try{
 const db=database(),owner=await authorizeRemoteAiRequest(request,'hosted-monthly',db),runtime=env as unknown as Record<string,string>;
 const service=hostedMonthlyService(db,runtime);
 if(request.method==='POST'){const raw=await request.text();if(raw.length>400)throw new WorkError('入力が長すぎます。',413);const b=JSON.parse(raw);await service.action(owner,b.action,b.consent);}
 const clock=await service.refresh(owner),trial=await service.status(owner);
 const plan=await skyRecurringUsage(db,owner,clock??Date.now());
 const events=await db.prepare('SELECT e.id,e.type FROM sky_hosted_monthly_events e JOIN sky_recurring_charges c ON c.invoice_id=e.invoice_id JOIN sky_hosted_monthly_tests t ON t.contract_id=c.contract_id WHERE t.owner_id=?').bind(owner).all<{id:string;type:string}>();
 return Response.json({trial,plan,events:events.results},{headers:{'Cache-Control':'no-store, private'}});
}catch(error){return Response.json({error:error instanceof WorkError?error.message:'本人認証・Sandbox接続を確認してください。'},{status:error instanceof WorkError||error instanceof RemoteAiGuardError?error.status:503,headers:{'Cache-Control':'no-store'}});}}
export const GET=handle;export const POST=handle;

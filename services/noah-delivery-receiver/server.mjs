import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseDeliveryPayload, deliveryDigest } from '../../lib/noah-delivery.ts';

/** Reference durable receiver. It records an inbox receipt; it never sends email
 * or forwards to another service. Bind loopback and place behind authenticated
 * HTTPS only after a separate deployment review. */
export function createNoahDeliveryReceiver({path,token,testMode=false}){
  if(typeof token!=='string'||token.length<16)throw Error('Receiver credential is required');
  const db=new DatabaseSync(path);
  db.exec('CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, payload_sha256 TEXT NOT NULL, payload TEXT NOT NULL, receipt TEXT NOT NULL)');
  const pending=new Set();
  const respond=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const server=createServer(async(req,res)=>{
    try{
      if(req.headers.origin){respond(res,403,{error:'origin_denied'});return;}
      const supplied=Buffer.from(req.headers.authorization??''),expected=Buffer.from(`Bearer ${token}`);
      if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){respond(res,401,{error:'unauthorized'});return;}
      const match=/^\/deliveries\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(req.url??'');
      if(!match||!['GET','POST'].includes(req.method)){respond(res,404,{error:'not_found'});return;}
      const id=match[1];
      if(req.method==='GET'){const old=db.prepare('SELECT receipt FROM deliveries WHERE id=?').get(id);respond(res,old?200:404,old?JSON.parse(old.receipt):{error:'not_found'});return;}
      if(!req.headers['content-type']?.startsWith('application/json')||req.headers['idempotency-key']!==id){respond(res,400,{error:'invalid_request'});return;}
      let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>24000){respond(res,413,{error:'too_large'});return;}chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['schema','id','payloadSha256','payload'].includes(k))||body.schema!=='noah-delivery/1'||body.id!==id){respond(res,400,{error:'invalid_request'});return;}
      const payload=parseDeliveryPayload(body.payload),hash=await deliveryDigest(payload);if(body.payloadSha256!==hash){respond(res,409,{error:'digest_mismatch'});return;}
      const receipt={schema:'noah-delivery-receipt/1',id,payloadSha256:hash,status:testMode&&payload.recipient==='test-reject'?'rejected':'accepted',receiptId:`inbox:${id}`,receivedAt:Date.now()};
      db.prepare('INSERT OR IGNORE INTO deliveries(id,payload_sha256,payload,receipt) VALUES(?,?,?,?)').run(id,hash,JSON.stringify(payload),JSON.stringify(receipt));
      const saved=db.prepare('SELECT payload_sha256,receipt FROM deliveries WHERE id=?').get(id);
      if(saved.payload_sha256!==hash){respond(res,409,{error:'id_conflict'});return;}
      if(testMode&&payload.recipient==='test-lost-response'){res.destroy();return;}
      if(testMode&&payload.recipient==='test-delay'){const timer=setTimeout(()=>{pending.delete(timer);respond(res,200,JSON.parse(saved.receipt));},15000);pending.add(timer);return;}
      respond(res,200,JSON.parse(saved.receipt));
    }catch{if(!res.headersSent)respond(res,400,{error:'invalid_request'});else res.destroy();}
  });
  server.on('close',()=>{for(const timer of pending)clearTimeout(timer);db.close();});
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const path=process.argv[2],port=Number(process.argv[3]??3110);if(!path||!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Usage: node server.mjs <sqlite-path> [port]');
  const server=createNoahDeliveryReceiver({path,token:process.env.NOAH_RECEIVER_TOKEN??'noah-local-test-receiver-v1',testMode:true});
  server.listen(port,'127.0.0.1',()=>process.stdout.write(`Noah local test inbox listening on 127.0.0.1:${port}; no external delivery\n`));
  const stop=()=>{server.close();server.closeAllConnections();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}

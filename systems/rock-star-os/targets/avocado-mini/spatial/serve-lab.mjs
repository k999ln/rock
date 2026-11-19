import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=process.argv[2];if(!root)throw new Error('LAB_DIRECTORY_REQUIRED');
const server=createServer(async(req,res)=>{
 const port=server.address().port,host='127.0.0.1:'+port;
 if(req.headers.host!==host || !['GET','HEAD'].includes(req.method)) {res.writeHead(403);res.end();return;}
 if(req.headers.origin && req.headers.origin!=='http://'+host){res.writeHead(403);res.end();return;}
 const path=req.url.split('?')[0],file=path==='/'?'index.html':path==='/lab.mjs'?'lab.mjs':null;
 if(!file){res.writeHead(404);res.end();return;}
 try {const data=await readFile(resolve(root,file));res.writeHead(200,{'content-type':file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8','permissions-policy':'camera=(self), microphone=(), geolocation=()','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});res.end(req.method==='HEAD'?undefined:data);}
 catch{res.writeHead(500);res.end('Build the local Lab first.');}
});
server.listen(0,'127.0.0.1',()=>console.log('Local Mini Lab: http://127.0.0.1:'+server.address().port));

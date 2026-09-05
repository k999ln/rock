export interface WalletProvider {
  request(args:{method:string;params?:unknown[]}):Promise<unknown>;
  on?(event:string,listener:(...args:unknown[])=>void):void;
  removeListener?(event:string,listener:(...args:unknown[])=>void):void;
}
export function parseAccounts(value:unknown):string[] {return Array.isArray(value)?value.filter((a):a is string=>typeof a==='string'&&/^0x[0-9a-fA-F]{40}$/.test(a)):[];}
export function walletError(error:unknown):string {
 const code=error&&typeof error==='object'&&'code' in error?error.code:undefined;
 if(code===4001)return '接続がキャンセルされました。必要なときに再度お試しください。';
 if(code===-32002)return 'ウォレットで保留中の接続リクエストを確認してください。';
 return 'ウォレットを接続できませんでした。ロックを解除して再度お試しください。';
}

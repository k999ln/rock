/** Start a conversation without dropping the selected library revision or device pins. */
export function eveAgentConversationPath(query:string,threadId:string,view:'build'|'work') {
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(threadId)||!['build','work'].includes(view))throw Error('会話と作業画面を確認してください。');
 const params=new URLSearchParams(query);params.set('thread',threadId);params.set('view',view);
 return '/os/eve?'+params.toString();
}

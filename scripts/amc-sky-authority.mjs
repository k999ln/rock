// Opaque, process-local proof. Request JSON cannot manufacture this capability.
const grants = new WeakMap();
export const protectedSkyEvents = new Set(['start_task', 'submit_result', 'verify_task', 'accept_goal', 'resume_task', 'revalidate_task']);
export function grantSkyTransition(goal, event) {
  const capability = Object.freeze({});
  grants.set(capability, JSON.stringify([goal, event]));
  return capability;
}
export function requireSkyAuthority(goal, event, capability) {
  if (!goal.skyBrief || !protectedSkyEvents.has(event.type)) return;
  if (!capability || grants.get(capability) !== JSON.stringify([goal, event]))
    throw new Error('Sky指示の最新観測・本人/担当照合が未接続です。自己申告のactor/hashでは実行・検収できません。');
  grants.delete(capability);
}

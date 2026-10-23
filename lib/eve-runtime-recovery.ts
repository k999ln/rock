/** Trusted deployment configuration, never a browser or device request field.
 * This pause is required during runtime recovery; it cannot detect a DB rollback. */
export function eveRuntimeRecoveryPaused(value:unknown):boolean {
 return !(value===undefined||value===null||value===''||value==='normal');
}

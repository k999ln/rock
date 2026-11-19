export const isNoahInviteAgentId = id => typeof id === 'string' && /^invite-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
export const noahInviteAgentId = id => isNoahInviteAgentId(`invite-${id}`) ? `invite-${id}` : null;
export const NOAH_INVITE_VALID = `i.revoked_at IS NULL AND i.expires_at>? AND a.deleted_at IS NULL AND a.upload_state='ready'
  AND a.owner_id=i.owner_id AND a.manifest_sha256=i.manifest_sha256 AND a.source_sha256 IS i.source_sha256`;

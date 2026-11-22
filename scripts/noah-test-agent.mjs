// A deliberately bounded test Agent. No files, credentials, models or external
// network are used. Only the parent can send work over this process's IPC pipe.
process.on('message', message => {
  if (!message || typeof message.id !== 'string') return;
  if (message.method === 'probe') {
    process.send?.({ id: message.id, result: { protocol: 'noah-text-check/1', nonce: message.input?.nonce } });
  } else if (message.method === 'run') {
    const text = message.input?.text;
    if (typeof text !== 'string' || !text.trim() || text.length > 4000) {
      process.send?.({ id: message.id, error: '入力は1〜4000文字で指定してください。' }); return;
    }
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const unique = [...new Set(lines)];
    process.send?.({ id: message.id, result: { text: unique.join('\n'), inputLines: lines.length, uniqueLines: unique.length, removedLines: lines.length - unique.length } });
  }
});
process.on('disconnect', () => process.exit(0));

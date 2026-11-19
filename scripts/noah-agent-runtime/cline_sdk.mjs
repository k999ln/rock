import { readFile } from 'node:fs/promises';
import { Agent, createBuiltinTools } from '@cline/sdk';

// Use Cline's own loop and shell tool, inside the already isolated container.
const tools = createBuiltinTools({ cwd: '/workspace', enableReadFiles: false, enableSearch: false,
  enableBash: true, enableWebFetch: false, enableApplyPatch: false, enableEditor: false,
  enableSkills: false, enableAskQuestion: false, enableSubmitAndExit: false,
  executorOptions: { bash: { timeoutMs: 30000 } },
});
const agent = new Agent({
  providerId: 'lmstudio', modelId: process.env.NOAH_MODEL,
  apiKey: 'noah-local-only', baseUrl: process.env.OPENAI_BASE_URL,
  systemPrompt: 'Complete the user task with the run_commands tool. Work only in /workspace, using Python 3 or shell. Finish after the requested files are saved.',
  tools, maxIterations: 6, toolExecution: 'sequential',
});
const result = await agent.run(await readFile('/tmp/request.txt', 'utf8'));
console.log(result.outputText || '');
if (result.status === 'failed') {
  console.error(result.error?.message || 'Cline execution failed');
  process.exitCode = 1;
}

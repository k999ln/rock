#!/usr/bin/env node
import readline from "node:readline";
import { createRuntime } from "./runtime.mjs";
import { McpProtocol } from "./mcp.mjs";

const runtime = createRuntime();
const protocol = new McpProtocol(runtime.callTool);
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

lines.on("line", async (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
    return;
  }
  const response = await protocol.handle(message);
  if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
});

function close() { try { runtime.store.close(); } finally { process.exit(0); } }
process.on("SIGINT", close);
process.on("SIGTERM", close);

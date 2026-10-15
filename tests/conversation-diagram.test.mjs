import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  conversationDiagramToSvg, diagramConversation, formatConversationDiagrams,
  SKY_CONVERSATION_DIAGRAM_MAX_INPUT,
} from '../lib/conversation-diagram.ts';

void test('conversation diagram turns blank-line paragraphs into bounded flows', () => {
  const result = diagramConversation('うん、その方向性で選んだ。自分がやりたいことだから決めた。\n\nでも別の案もあった。最後は長く続けたい方を選んだ。');
  assert.equal(result.schema, 'sky.conversation-diagram/1');
  assert.equal(result.execution, 'first-party-rules');
  assert.equal(result.paragraphs.length, 2);
  assert.equal(result.paragraphs[0].nodes[0].text, 'その方向性で選んだ。');
  assert.ok(result.paragraphs.every((paragraph) => paragraph.nodes.length <= 6));
  assert.equal(result.paragraphs[1].nodes[0].kind, '転換');
  assert.match(result.warnings.join(' '), /意味の推測/);
});

void test('conversation diagram rejects oversized input and leaves empty input empty', () => {
  assert.equal(diagramConversation('  ').paragraphs.length, 0);
  assert.throws(() => diagramConversation('x'.repeat(SKY_CONVERSATION_DIAGRAM_MAX_INPUT + 1)), /文字以内/);
});

void test('conversation diagram exports faithful text and escaped SVG', () => {
  const result = diagramConversation('<script>alert("x")</script>。だから共有前に確認する。');
  const text = formatConversationDiagrams(result);
  const svg = conversationDiagramToSvg(result.paragraphs[0]);
  assert.match(text, /元の段落:/);
  assert.match(svg, /^<svg/);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
});

void test('Visual Scribe uses the shared workspace landmark without nesting another main', () => {
  const component = readFileSync(new URL('../components/conversation-diagram-workspace.tsx', import.meta.url), 'utf8');
  assert.match(component, /<WorkspaceShell/);
  assert.doesNotMatch(component, /<main(?:\s|>)/u);
});

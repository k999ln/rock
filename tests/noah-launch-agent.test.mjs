import test from 'node:test';
import assert from 'node:assert/strict';
import { noahLaunchAgent } from '../scripts/noah-launch-agent.mjs';

void test('user service can start before the SSD mounts and survives the requesting shell',()=>{
  const s=noahLaunchAgent({home:'/Users/test user',node:'/opt/homebrew/bin/node'});
  assert.equal(s.launcher,'/Users/test user/Library/Application Support/avokado/Noah/noah-workspace-recovery.mjs');
  assert.ok(s.plist.includes('<key>WorkingDirectory</key><string>/Users/test user</string>'));
  assert.ok(s.plist.includes('<key>KeepAlive</key><true/>'));
  assert.ok(s.plist.includes('<key>ThrottleInterval</key><integer>30</integer>'));
  assert.ok(s.plist.includes('<key>NOAH_WORKSPACE</key><string>/Volumes/avokado</string>'));
  assert.ok(s.plist.includes('<key>SKY_LINUX_PRIVATE_PREVIEW</key><string>1</string>'));
  assert.equal(s.plistPath,'/Users/test user/Library/LaunchAgents/si.avokado.noah.local.plist');
});
void test('paths are XML escaped without shell interpolation and malformed paths fail',()=>{
  const s=noahLaunchAgent({home:'/Users/a&<b>',node:'/opt/node & tools/node'});
  assert.ok(s.plist.includes('/Users/a&amp;&lt;b&gt;'));
  assert.ok(s.plist.includes('/opt/node &amp; tools/node'));
  for(const input of [{home:'relative'},{home:'/Users/test\nother'},{home:'/Users/test',node:'node'}])assert.throws(()=>noahLaunchAgent(input));
});

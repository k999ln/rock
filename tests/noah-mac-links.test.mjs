import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
void test(
  'native URL handlers reject executable intent, extra parameters and credential redirects',
  { skip: process.platform !== 'darwin', timeout: 60000 },
  async (t) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'noah-native-links-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const source = path.join(dir, 'main.swift');
    await writeFile(
      source,
      `import Foundation
precondition(noahConnectionAgent(URL(string: "noah://connect?agent=anicca")!) == "anicca")
precondition(noahConnectionAgent(URL(string: "noah://connect")!) == "")
for text in ["noah://run?agent=anicca", "noah://connect?agent=anicca&command=run", "noah://connect?agent=a&agent=b", "noah://connect?agent=..%2Fsecret", "noah://connect?agent=%24%28whoami%29", "noah://user@connect?agent=a", "https://connect?agent=a", "noah://connect:443", "noah://connect#run"] {
    precondition(noahConnectionAgent(URL(string: text)!) == nil, text)
}
precondition(noahApprovalURL("https://avoado.si/connect/device?user_code=ABCDEFGH") != nil)
for text in ["http://avoado.si/connect/device?user_code=ABCDEFGH", "https://evil.test/connect/device?user_code=ABCDEFGH", "https://avoado.si.evil.test/connect/device?user_code=ABCDEFGH", "https://avoado.si@evil.test/connect/device?user_code=ABCDEFGH", "https://avoado.si/connect/device?user_code=ABCDEFGH&next=https://evil.test", "https://avoado.si/connect/device?user_code=ABCDEFGH#secret", "https://avoado.si:444/connect/device?user_code=ABCDEFGH", "https://avoado.si/connect/device?user_code=invalid"] {
    precondition(noahApprovalURL(text) == nil, text)
}
print("native link boundaries verified")
`,
    );
    const binary = path.join(dir, 'check');
    await run(
      '/usr/bin/xcrun',
      [
        'swiftc',
        path.resolve('scripts/noah-mac-app/NoahLinks.swift'),
        source,
        '-o',
        binary,
      ],
      { timeout: 45000 },
    );
    assert.match((await run(binary)).stdout, /native link boundaries verified/);
  },
);

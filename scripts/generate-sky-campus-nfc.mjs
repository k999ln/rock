import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const campuses = ['nyu', 'fit', 'columbia', 'fordham', 'johnjay'];
export const skyCampusUrl = (campus) => {
  if (!campuses.includes(campus)) throw new Error('Unknown campus');
  return `https://avoado.si/os/sky/campus/${campus}/hub?source=nfc`;
};

// One NFC Forum NDEF Well Known URI record, with the HTTPS URI prefix (0x04).
// The tag contains only a public URL; it carries no login or student entitlement.
export function ndefUri(url) {
  if (!url.startsWith('https://avoado.si/')) throw new Error('Unexpected NFC origin');
  const uri = Buffer.from(url.slice('https://'.length), 'utf8');
  const payloadLength = uri.length + 1;
  if (payloadLength > 255) throw new Error('URL exceeds short-record capacity');
  return Buffer.concat([
    Buffer.from([0xd1, 0x01, payloadLength, 0x55, 0x04]),
    uri,
  ]);
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  const directory = resolve(process.argv[2] ?? '/private/tmp/sky-campus-nfc');
  await mkdir(directory, { recursive: true });
  const lines = ['campus,url,ndef_file'];
  for (const campus of campuses) {
    const url = skyCampusUrl(campus);
    const file = `${campus}.ndef`;
    await writeFile(resolve(directory, file), ndefUri(url));
    lines.push(`${campus},${url},${file}`);
  }
  await writeFile(resolve(directory, 'tags.csv'), `${lines.join('\n')}\n`);
  await writeFile(resolve(directory, 'WRITE-ME.txt'), [
    'Sky campus NFC stickers',
    '',
    'Write one HTTPS URL from tags.csv to each matching sticker as an NFC NDEF URL/URI record.',
    'The .ndef files are raw NDEF messages for compatible writer tools, not complete NTAG memory images.',
    'Do not write a plain-text record or put login tokens, student status, or payment details on a sticker.',
    'Read each sticker back with a phone before attaching or permanently locking it.',
    'Confirm that the opened page says the matching university and shows Sky actions.',
    'iPhone and newer Android versions can require tapping an Open Link notification.',
    '',
  ].join('\n'));
  process.stdout.write(`${directory}/tags.csv\n`);
}

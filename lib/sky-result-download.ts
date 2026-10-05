/** Keep result export local and match UTF-8 file encoding for malformed UTF-16. */
export function skyMarkdownDownloadHref(text: string): string {
  const utf8Text = Array.from(text, (character) => {
    const point = character.codePointAt(0)!;
    return point >= 0xd800 && point <= 0xdfff ? '\ufffd' : character;
  }).join('');
  return `data:text/markdown;charset=utf-8,${encodeURIComponent(utf8Text)}`;
}

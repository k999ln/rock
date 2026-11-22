import qrcode from 'qrcode-generator';
import type { EsimInstallMaterial } from './esim-install-material.ts';

export function supportsIosEsimLink(userAgent: string): boolean {
  if (!/\b(?:iPhone|iPad|iPod)\b/.test(userAgent)) return false;
  const version = /\bCPU (?:iPhone )?OS (\d+)_(\d+)(?:_\d+)?\b/.exec(userAgent);
  if (!version) return false;
  const major = Number(version[1]);
  return major > 17 || (major === 17 && Number(version[2]) >= 4);
}

export function esimIosInstallCard(material: Pick<EsimInstallMaterial, 'smdpAddress' | 'matchingId'>) {
  const { smdpAddress, matchingId } = material;
  // The address is a DNS name and the activation code is printable ASCII.
  // Reject delimiter characters so each value occupies exactly one LPA field.
  const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  if (smdpAddress.length > 253 || !smdpAddress.includes('.') ||
      !smdpAddress.split('.').every((label) => dnsLabel.test(label)) ||
      matchingId.length > 256 || !/^[!-#%-~]+$/.test(matchingId)) return null;
  const cardData = `LPA:1$${smdpAddress}$${matchingId}`;
  return {
    cardData,
    url: `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA:1$${smdpAddress}$${encodeURIComponent(matchingId)}`,
  };
}

export function esimInstallQr(cardData: string): string {
  const code = qrcode(0, 'M');
  code.addData(cardData, 'Byte');
  code.make();
  return code.createDataURL(5);
}

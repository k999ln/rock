import type { Metadata, MetadataRoute } from 'next';

// Transparent derivative of the existing avokado artwork. Version the URL so
// browsers do not reuse the earlier white-background icon.
export const webBrandIcon = '/brand/avokado-rainbow-transparent-66dfbd0d.png';
export const webBrandIcons: Metadata['icons'] = {
  icon: [{ url: webBrandIcon, type: 'image/png', sizes: '1254x1254' }],
  apple: [{ url: webBrandIcon, type: 'image/png', sizes: '1254x1254' }],
};

export const webManifestIcons: MetadataRoute.Manifest['icons'] = [
  { src: webBrandIcon, sizes: '1254x1254', type: 'image/png', purpose: 'any' },
];

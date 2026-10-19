/** User-confirmed product destinations. These links do not establish identity,
 * credential sharing, CORS trust, DNS ownership or permission to deploy. */
export const productDomains = [
  { id: 'service', name: 'avoado', hostname: 'avoado.si', url: 'https://avoado.si/', role: '総合・Skyの入口' },
  { id: 'mini', name: 'avocadoMini', hostname: 'avocadomini.si', url: 'https://avocadomini.si/', role: 'Miniの製品・導入案内' },
  { id: 'pro', name: 'avocadoPro', hostname: 'avocadopro.si', url: 'https://avocadopro.si/', role: 'Proの製品・導入案内' },
] as const;

/** Private lab paths are always relative/local; never join them onto a product domain. */
export const privateZoomLabPath = '/sky/add/zoom/lab';

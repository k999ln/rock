// 設計キットと製品の検査は同じ分類・監査規則を使う（task 84）。
export {
  NOAH_SURFACE_SIGNS,
  noahRuntimeDependencies,
  classifyNoahSurface,
  decideNoahSurface,
  noahPlacesForSurface,
} from '../../lib/noah-surface-class.ts';
export { auditNoahContainerArgs, auditNoahVmArgs } from '../../lib/noah-screenless-audit.mjs';

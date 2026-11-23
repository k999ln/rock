/**
 * 稼ぎ方の設計図画面向け互換 wrapper（task 122）。
 * 共通表示は noah-step-levels に置き、ここだけ business の能力語彙を
 * 渡す。既存の reviewer page の import と CSS ファイル名は変えない。
 */
import { NOAH_CAPABILITIES, type NoahBlueprintStep } from '@/lib/noah-business';
import { NoahStepLevels } from './noah-step-levels';

export { NoahStepLevels } from './noah-step-levels';
export type {
  NoahStepCapabilityLabel,
  NoahStepLevelLabels,
  NoahStepLevelTranslate,
  NoahStepLevelsProps,
} from './noah-step-levels';

export default function NoahBlueprintLevels({
  steps,
}: {
  steps: readonly NoahBlueprintStep[];
}) {
  return <NoahStepLevels steps={steps} capabilityLabels={NOAH_CAPABILITIES} />;
}

import fixture from '@/contracts/sky-compute-grid-fixture.json';
import { runComputeGridFixture } from '@/lib/sky-compute-grid';

type FixtureInput = Parameters<typeof runComputeGridFixture>[0];

export async function GET() {
  const result = runComputeGridFixture(fixture as unknown as FixtureInput);
  return Response.json(
    {
      schema: 'sky-compute-grid-demo/1',
      ...result,
      boundaries: {
        input: 'synthetic_only',
        runtime: 'fixed_artifacts_only',
        settlement: 'service_credit_hold_only',
        productionDispatch: false,
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}

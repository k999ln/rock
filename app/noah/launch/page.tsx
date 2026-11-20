import { redirect } from 'next/navigation';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const q = await searchParams;
  const agent =
    typeof q.agent === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(q.agent)
      ? q.agent
      : '';
  redirect(
    `/noah/activity?${new URLSearchParams(agent ? { agent } : { compose: '1' })}`,
  );
}

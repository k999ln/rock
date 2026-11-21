'use client';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { noahReturnPath } from '@/lib/noah-navigation';
import NoahLoading from './noah-loading';

/** Old account links continue to their selected task; membership forms are retired. */
export default function NoahAccess() {
  const query = useSearchParams();
  const returnTo = query.has('returnTo') ? noahReturnPath(query.get('returnTo')) : '/noah/profile';
  useEffect(() => { window.location.replace(returnTo); }, [returnTo]);
  return <NoahLoading />;
}

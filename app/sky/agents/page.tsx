import { redirect } from 'next/navigation';
/** Saved management links keep opening the same owner library, inside Home. */
export default function Page() { redirect('/#sky-manage'); }

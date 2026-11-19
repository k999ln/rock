import { redirect } from 'next/navigation';
/** Saved management links keep opening the same owner library, inside Noah. */
export default function Page() { redirect('/noah/saved'); }

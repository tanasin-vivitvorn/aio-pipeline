import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import Home from './_home';

export default async function Page() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySessionToken(token))) {
    redirect('/login');
  }
  return <Home />;
}

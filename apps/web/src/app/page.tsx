'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { getToken } from '@/lib/session';

// ponytail: client-side gate — token lives in localStorage, so no SSR/middleware check.
// Upgrade to httpOnly-cookie + middleware redirect when auth is hardened (session.ts ponytail note).
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getToken() ? '/overview' : '/login');
  }, [router]);
  return null;
}

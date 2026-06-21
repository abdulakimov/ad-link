'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getToken } from './session';

/** Returns the auth token, redirecting to /login when absent. */
export function useAuthToken(): string | null {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const t = getToken();
    if (!t) router.replace('/login');
    else setToken(t);
  }, [router]);
  return token;
}

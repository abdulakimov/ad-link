'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { setToken } from '@/lib/session';

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get('token');
    if (token) {
      setToken(token);
      router.replace('/overview');
    } else {
      router.replace('/login?error=social');
    }
  }, [params, router]);

  return (
    <main className="grid min-h-dvh place-items-center text-sm text-muted-foreground">
      Signing you in…
    </main>
  );
}

export default function AuthCallbackPage() {
  // useSearchParams needs a Suspense boundary for static export.
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}

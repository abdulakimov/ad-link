const KEY = 'adlink_token';

// ponytail: localStorage token now; upgrade to an httpOnly cookie + SSR session in Phase 11 (auth hardening).
export function setToken(token: string) {
  localStorage.setItem(KEY, token);
}

export function getToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(KEY);
}

export function clearToken() {
  localStorage.removeItem(KEY);
}

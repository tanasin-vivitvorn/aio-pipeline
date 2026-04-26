'use client';

import { useState, FormEvent, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, LogIn } from 'lucide-react';
import { encryptPassword, hmacSign } from '@/lib/clientCrypto';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Step 1: obtain a one-time challenge (server sets a signed httpOnly cookie)
      const chalRes = await fetch('/api/auth/challenge');
      if (!chalRes.ok) {
        setError('Failed to initiate login — please try again');
        return;
      }
      const { challenge } = await chalRes.json() as { challenge: string };

      // Step 2: encrypt the password client-side; compute HMAC over the request body
      const ep = await encryptPassword(password, challenge);
      const bodyObj = { username, ep };
      const bodyStr = JSON.stringify(bodyObj);
      const checksum = await hmacSign(bodyStr, challenge);

      // Step 3: send encrypted credentials with integrity checksum
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Checksum': checksum,
        },
        body: bodyStr,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      // Full browser navigation — guarantees the cookies are committed before
      // the next request fires (avoids router.replace + Set-Cookie race under
      // K8s ingress latency).
      window.location.href = redirect;
    } catch (e) {
      console.error('Login error', e);
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-emerald-600">National ERP Platform</h1>
          <p className="text-sm text-gray-500 mt-1">Jenkins CI/CD Dashboard</p>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">Sign in</h2>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function InvitePage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('coupleDeviceId');
    if (!stored) {
      const newId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem('coupleDeviceId', newId);
      setDeviceId(newId);
    } else {
      setDeviceId(stored);
    }
  }, []);

  const fetchCoupleSpace = useCallback(async () => {
    if (!deviceId) return;

    try {
      const response = await fetch(`/api/couple-space?deviceId=${encodeURIComponent(deviceId)}`);
      const data = await response.json();

      if (data.inviteCode) {
        setInviteCode(data.inviteCode);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invite code');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    if (deviceId) {
      fetchCoupleSpace();
    }
  }, [deviceId, fetchCoupleSpace]);

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      setError('\u8bf7\u8f93\u5165\u9080\u8bf7\u7801');
      return;
    }

    if (!deviceId) {
      setError('\u672a\u627e\u5230\u8bbe\u5907ID');
      return;
    }

    setJoining(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/couple-space', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          inviteCode: joinCode.trim().toUpperCase(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid invite code');
      }

      setSuccess('\u6210\u529f\u52a0\u5165\u60c5\u4fa3\u7a7a\u95f4\uff01');
      setJoinCode('');

      if (data.inviteCode) {
        setInviteCode(data.inviteCode);
      }

      setTimeout(() => {
        router.push('/');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-8 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-5rem] top-[-3rem] h-56 w-56 rounded-full bg-rose-200/50 blur-3xl" />
        <div className="absolute right-[-4rem] top-24 h-56 w-56 rounded-full bg-amber-100/55 blur-3xl" />
        <div className="absolute bottom-[-4rem] left-1/2 h-60 w-60 -translate-x-1/2 rounded-full bg-pink-100/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-lg">
        <div className="mb-6">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-4 py-2 text-sm font-semibold text-rose-500 shadow-sm backdrop-blur transition hover:bg-white"
          >
            <span>\u2190</span>
            <span>\u8fd4\u56de\u9996\u9875</span>
          </a>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-white/75 bg-white/72 shadow-[0_28px_70px_-52px_rgba(148,63,117,0.4)] backdrop-blur-xl">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">
              {'\u9080\u8bf7\u7801'}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {'\u5206\u4eab\u60c5\u4fa3\u7a7a\u95f4\uff0c\u8ba9\u4e24\u4e2a\u4eba\u7684\u8bb0\u5fc6\u4e92\u76f8\u901a'}
            </p>

            {loading ? (
              <div className="mt-8 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
              </div>
            ) : (
              <>
                {/* Invite Code Display */}
                <div className="mt-8 rounded-2xl border border-white/80 bg-gradient-to-br from-rose-50 to-pink-50 p-6 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                    {'\u4f60\u7684\u9080\u8bf7\u7801'}
                  </p>
                  <p className="mt-3 text-4xl font-black tracking-[0.2em] text-rose-500">
                    {inviteCode || '------'}
                  </p>
                  <button
                    onClick={handleCopy}
                    disabled={!inviteCode}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white/80 px-4 py-2 text-sm font-semibold text-rose-500 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copied ? (
                      <>
                        <span>\u2714</span>
                        <span>{'\u5df2\u590d\u5236'}</span>
                      </>
                    ) : (
                      <>
                        <span>\u2398</span>
                        <span>{'\u590d\u5236\u9080\u8bf7\u7801'}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Divider */}
                <div className="mt-8 flex items-center gap-4">
                  <div className="h-px flex-1 bg-slate-200" />
                  <p className="text-xs text-slate-400">{'\u6216\u8005'}</p>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                {/* Join Section */}
                <div className="mt-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                    {'\u52a0\u5165\u4ed6\u4eba\u7684\u7a7a\u95f4'}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder={'\u8f93\u5165\u9080\u8bf7\u7801'}
                      maxLength={6}
                      className="flex-1 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-center text-lg font-semibold tracking-[0.2em] text-slate-800 placeholder:text-slate-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    />
                    <button
                      onClick={handleJoin}
                      disabled={joining || !joinCode.trim()}
                      className="rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-3 font-semibold text-white shadow-md transition hover:from-rose-600 hover:to-pink-600 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {joining ? (
                        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        '\u52a0\u5165'
                      )}
                    </button>
                  </div>
                </div>

                {/* Messages */}
                {error && (
                  <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="mt-4 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-600">
                    {success}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Help Text */}
        <p className="mt-6 text-center text-xs text-slate-400">
          {'\u628a\u9080\u8bf7\u7801\u53d1\u7ed9\u4f60\u7684\u4f34\u4fa3\uff0c\u4ed6\u4eec\u5c31\u80fd\u52a0\u5165\u540c\u4e00\u4e2a\u7a7a\u95f4\u4e86'}
        </p>
      </div>
    </main>
  );
}

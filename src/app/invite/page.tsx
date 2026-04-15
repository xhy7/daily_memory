'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

function createOrGetDeviceId() {
  const stored = localStorage.getItem('coupleDeviceId');
  if (stored) {
    return stored;
  }

  const newId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `device_${crypto.randomUUID()}`
      : `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  localStorage.setItem('coupleDeviceId', newId);
  return newId;
}

export default function InvitePage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDeviceId(createOrGetDeviceId());
  }, []);

  const fetchCoupleSpace = useCallback(async () => {
    if (!deviceId) {
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/couple-space?deviceId=${encodeURIComponent(deviceId)}`);
      const data = (await response.json()) as { error?: string; inviteCode?: string };

      if (!response.ok) {
        throw new Error(data.error || '加载邀请码失败');
      }

      setInviteCode(data.inviteCode || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载邀请码失败');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) {
      return;
    }

    void fetchCoupleSpace();
  }, [deviceId, fetchCoupleSpace]);

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      setError('请输入邀请码');
      return;
    }

    if (!deviceId) {
      setError('未找到设备 ID');
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

      const data = (await response.json()) as { error?: string; inviteCode?: string };

      if (!response.ok) {
        throw new Error(data.error || '加入失败');
      }

      setInviteCode(data.inviteCode || null);
      setJoinCode('');
      setSuccess('已加入对方的记录空间，正在回到首页。');

      window.setTimeout(() => {
        router.push('/');
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入失败');
    } finally {
      setJoining(false);
    }
  };

  const handleApplyAccess = async () => {
    if (!joinCode.trim()) {
      setError('请输入邀请码');
      return;
    }

    if (!requesterName.trim()) {
      setError('请填写你的称呼');
      return;
    }

    if (!deviceId) {
      setError('未找到设备 ID');
      return;
    }

    setApplying(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          inviteCode: joinCode.trim().toUpperCase(),
          requesterName: requesterName.trim(),
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || '申请发送失败');
      }

      setSuccess('申请已发出，等待对方同意。你可以稍后去访问页查看状态。');
      setRequesterName('');
      setJoinCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '申请发送失败');
    } finally {
      setApplying(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setError(null);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('复制失败，请手动复制邀请码');
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-8 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-5rem] top-[-3rem] h-56 w-56 rounded-full bg-rose-200/50 blur-3xl" />
        <div className="absolute right-[-4rem] top-24 h-56 w-56 rounded-full bg-amber-100/55 blur-3xl" />
        <div className="absolute bottom-[-4rem] left-1/2 h-60 w-60 -translate-x-1/2 rounded-full bg-pink-100/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-4 py-2 text-sm font-semibold text-rose-500 shadow-sm backdrop-blur transition hover:bg-white"
          >
            <span>←</span>
            <span>返回首页</span>
          </Link>

          <Link
            href="/access"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/75 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:bg-white"
          >
            <span>查看访问申请</span>
            <span>→</span>
          </Link>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-white/75 bg-white/72 shadow-[0_28px_70px_-52px_rgba(148,63,117,0.4)] backdrop-blur-xl">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">邀请与访问</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              可以直接加入同一个记录空间，也可以先发起只读访问申请，
              看看对方的首页、历史和 3D 视图。
            </p>

            {loading ? (
              <div className="mt-8 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
              </div>
            ) : (
              <>
                <div className="mt-8 rounded-2xl border border-white/80 bg-gradient-to-br from-rose-50 to-pink-50 p-6 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                    你的邀请码
                  </p>
                  <p className="mt-3 text-4xl font-black tracking-[0.2em] text-rose-500">
                    {inviteCode || '------'}
                  </p>
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!inviteCode}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white/80 px-4 py-2 text-sm font-semibold text-rose-500 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>{copied ? '已复制' : '复制邀请码'}</span>
                  </button>
                </div>

                <div className="mt-8 grid gap-4 lg:grid-cols-2">
                  <section className="rounded-2xl border border-slate-100 bg-slate-50/85 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                      直接加入
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-slate-900">进入同一个记录空间</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      适合一起写、一起看，加入后会共享记录内容。
                    </p>

                    <div className="mt-4 space-y-3">
                      <input
                        type="text"
                        value={joinCode}
                        onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                        placeholder="输入邀请码"
                        maxLength={6}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-lg font-semibold tracking-[0.2em] text-slate-800 placeholder:text-slate-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      />
                      <button
                        type="button"
                        onClick={handleJoin}
                        disabled={joining || !joinCode.trim()}
                        className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-3 font-semibold text-white shadow-md transition hover:from-rose-600 hover:to-pink-600 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {joining ? '加入中...' : '加入'}
                      </button>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-100 bg-slate-50/85 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                      申请访问
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-slate-900">先申请只读查看</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      对方同意后，你可以在限定时间内查看首页、历史和 3D 视图。
                    </p>

                    <div className="mt-4 space-y-3">
                      <input
                        type="text"
                        value={requesterName}
                        onChange={(event) => setRequesterName(event.target.value)}
                        placeholder="填写你的称呼"
                        maxLength={20}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      />
                      <button
                        type="button"
                        onClick={handleApplyAccess}
                        disabled={applying || !joinCode.trim() || !requesterName.trim()}
                        className="w-full rounded-xl border border-slate-200 bg-white px-6 py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {applying ? '发送中...' : '申请访问'}
                      </button>
                    </div>
                  </section>
                </div>

                {error ? (
                  <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                  </div>
                ) : null}

                {success ? (
                  <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
                    {success}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        <p className="mt-6 text-center text-xs leading-6 text-slate-400">
          直接加入会共享同一份记录；申请访问只会开放浏览权限，不会改变你自己的空间。
        </p>
      </div>
    </main>
  );
}

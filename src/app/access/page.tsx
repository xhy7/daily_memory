'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type ProfileSlot = 'partnerA' | 'partnerB';
type AccessRequestStatus = 'pending' | 'approved' | 'active' | 'rejected' | 'revoked' | 'expired';

type AccessTarget = {
  id: number;
  name: string | null;
  profiles?: Partial<Record<ProfileSlot, { name: string | null; avatarUrl: string | null }>>;
} | null;

type AccessRequestItem = {
  id: number;
  requester_name: string;
  status: AccessRequestStatus;
  created_at: string;
  first_access_at?: string | null;
  access_expires_at?: string | null;
  targetCoupleSpace?: AccessTarget;
};

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

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getTargetLabel(request: AccessRequestItem) {
  const partnerA = request.targetCoupleSpace?.profiles?.partnerA?.name;
  const partnerB = request.targetCoupleSpace?.profiles?.partnerB?.name;

  if (partnerA || partnerB) {
    return [partnerA || '他', partnerB || '她'].join(' 与 ');
  }

  return '对方的记录空间';
}

export default function AccessPage() {
  const [requests, setRequests] = useState<AccessRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async (currentDeviceId: string) => {
    const response = await fetch(
      `/api/access-requests?deviceId=${encodeURIComponent(currentDeviceId)}&scope=outgoing`
    );
    const data = (await response.json()) as { error?: string; requests?: AccessRequestItem[] };

    if (!response.ok) {
      throw new Error(data.error || '加载访问申请失败');
    }

    setRequests(data.requests || []);
  }, []);

  useEffect(() => {
    const currentDeviceId = createOrGetDeviceId();

    void loadRequests(currentDeviceId)
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载访问申请失败');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [loadRequests]);

  const usableRequests = useMemo(
    () => requests.filter((request) => request.status === 'approved' || request.status === 'active'),
    [requests]
  );
  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending'),
    [requests]
  );
  const closedRequests = useMemo(
    () => requests.filter((request) => !['approved', 'active', 'pending'].includes(request.status)),
    [requests]
  );

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-8 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-5rem] top-[-3rem] h-56 w-56 rounded-full bg-sky-200/45 blur-3xl" />
        <div className="absolute right-[-4rem] top-24 h-56 w-56 rounded-full bg-rose-100/45 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:bg-white"
          >
            <span>←</span>
            <span>返回首页</span>
          </Link>

          <Link
            href="/invite"
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-4 py-2 text-sm font-semibold text-rose-500 shadow-sm backdrop-blur transition hover:bg-white"
          >
            <span>去发起新申请</span>
            <span>→</span>
          </Link>
        </div>

        <section className="rounded-[28px] border border-white/80 bg-white/82 p-6 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">访问页</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">你的访问申请</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            这里会显示你发出的访问申请。通过审批后，可以从这里进入对方的首页、历史和 3D 视图。
          </p>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[28px] border border-white/80 bg-white/82 p-5 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-900">可以进入</h2>
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-600">
                {usableRequests.length}
              </span>
            </div>

            {loading ? (
              <div className="mt-4 h-24 animate-pulse rounded-2xl bg-slate-100" />
            ) : usableRequests.length > 0 ? (
              <div className="mt-4 space-y-3">
                {usableRequests.map((request) => (
                  <div key={request.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{getTargetLabel(request)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {request.status === 'active'
                            ? `访问截止：${formatDateTime(request.access_expires_at) || '即将到期'}`
                            : '已获批准，进入后开始计时'}
                        </p>
                      </div>

                      <Link
                        href={`/access/${request.id}`}
                        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        进入查看
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-sky-200 bg-sky-50/60 px-4 py-6 text-sm leading-6 text-slate-500">
                还没有可进入的访问窗口。
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-white/80 bg-white/82 p-5 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-900">等待中</h2>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">
                {pendingRequests.length}
              </span>
            </div>

            {loading ? (
              <div className="mt-4 h-24 animate-pulse rounded-2xl bg-slate-100" />
            ) : pendingRequests.length > 0 ? (
              <div className="mt-4 space-y-3">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <p className="text-sm font-semibold text-slate-900">{getTargetLabel(request)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      已发出申请：{formatDateTime(request.created_at) || '刚刚'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-amber-200 bg-amber-50/60 px-4 py-6 text-sm leading-6 text-slate-500">
                现在没有等待中的访问申请。
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/80 bg-white/82 p-5 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">最近状态</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {closedRequests.length}
            </span>
          </div>

          {loading ? (
            <div className="mt-4 h-24 animate-pulse rounded-2xl bg-slate-100" />
          ) : closedRequests.length > 0 ? (
            <div className="mt-4 space-y-3">
              {closedRequests.map((request) => (
                <div key={request.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{getTargetLabel(request)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        申请时间：{formatDateTime(request.created_at) || '刚刚'}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {request.status === 'rejected'
                        ? '已拒绝'
                        : request.status === 'revoked'
                          ? '已撤销'
                          : '已过期'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-sm leading-6 text-slate-500">
              这里会显示已经结束的访问申请记录。
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

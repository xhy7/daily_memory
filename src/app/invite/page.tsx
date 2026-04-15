'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  access_expires_at?: string | null;
  targetCoupleSpace?: AccessTarget;
};

type AccessRequestsResponse = {
  requests?: AccessRequestItem[];
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

export default function InvitePage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [applyInviteCode, setApplyInviteCode] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [incomingRequests, setIncomingRequests] = useState<AccessRequestItem[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<AccessRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [applying, setApplying] = useState(false);
  const [actingRequestId, setActingRequestId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadInviteData = useCallback(async (currentDeviceId: string) => {
    const [spaceResponse, incomingResponse, outgoingResponse] = await Promise.all([
      fetch(`/api/couple-space?deviceId=${encodeURIComponent(currentDeviceId)}`),
      fetch(`/api/access-requests?deviceId=${encodeURIComponent(currentDeviceId)}&scope=incoming`),
      fetch(`/api/access-requests?deviceId=${encodeURIComponent(currentDeviceId)}&scope=outgoing`),
    ]);

    const spaceData = (await spaceResponse.json()) as { error?: string; inviteCode?: string };
    const incomingData = (await incomingResponse.json()) as { error?: string } & AccessRequestsResponse;
    const outgoingData = (await outgoingResponse.json()) as { error?: string } & AccessRequestsResponse;

    if (!spaceResponse.ok) {
      throw new Error(spaceData.error || '加载邀请码失败');
    }

    if (!incomingResponse.ok) {
      throw new Error(incomingData.error || '加载收到的访问申请失败');
    }

    if (!outgoingResponse.ok) {
      throw new Error(outgoingData.error || '加载发出的访问申请失败');
    }

    setInviteCode(spaceData.inviteCode || null);
    setIncomingRequests(incomingData.requests || []);
    setOutgoingRequests(outgoingData.requests || []);
  }, []);

  useEffect(() => {
    const currentDeviceId = createOrGetDeviceId();
    setDeviceId(currentDeviceId);

    void loadInviteData(currentDeviceId)
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载邀请页面失败');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [loadInviteData]);

  const refreshRequestsOnly = useCallback(async () => {
    if (!deviceId) {
      return;
    }

    const [incomingResponse, outgoingResponse] = await Promise.all([
      fetch(`/api/access-requests?deviceId=${encodeURIComponent(deviceId)}&scope=incoming`),
      fetch(`/api/access-requests?deviceId=${encodeURIComponent(deviceId)}&scope=outgoing`),
    ]);

    const incomingData = (await incomingResponse.json()) as { error?: string } & AccessRequestsResponse;
    const outgoingData = (await outgoingResponse.json()) as { error?: string } & AccessRequestsResponse;

    if (!incomingResponse.ok) {
      throw new Error(incomingData.error || '刷新收到的访问申请失败');
    }

    if (!outgoingResponse.ok) {
      throw new Error(outgoingData.error || '刷新发出的访问申请失败');
    }

    setIncomingRequests(incomingData.requests || []);
    setOutgoingRequests(outgoingData.requests || []);
  }, [deviceId]);

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
    if (!applyInviteCode.trim()) {
      setError('请输入对方的邀请码');
      return;
    }

    if (!requesterName.trim()) {
      setError('请填写你的昵称');
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
          inviteCode: applyInviteCode.trim().toUpperCase(),
          requesterName: requesterName.trim(),
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || '申请发送失败');
      }

      await refreshRequestsOnly();
      setApplyInviteCode('');
      setRequesterName('');
      setSuccess('访问申请已发出，等待对方处理。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '申请发送失败');
    } finally {
      setApplying(false);
    }
  };

  const handleIncomingAction = async (requestId: number, action: 'approve' | 'reject' | 'revoke') => {
    if (!deviceId) {
      setError('未找到设备 ID');
      return;
    }

    setActingRequestId(requestId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/access-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          requestId,
          action,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || '处理访问申请失败');
      }

      await refreshRequestsOnly();
      setSuccess(
        action === 'approve'
          ? '访问申请已同意。'
          : action === 'reject'
            ? '访问申请已拒绝。'
            : '访问权限已撤销。'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '处理访问申请失败');
    } finally {
      setActingRequestId(null);
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

  const pendingIncomingRequests = useMemo(
    () => incomingRequests.filter((request) => request.status === 'pending'),
    [incomingRequests]
  );
  const grantedIncomingRequests = useMemo(
    () => incomingRequests.filter((request) => request.status === 'approved' || request.status === 'active'),
    [incomingRequests]
  );
  const readyOutgoingRequests = useMemo(
    () => outgoingRequests.filter((request) => request.status === 'approved' || request.status === 'active'),
    [outgoingRequests]
  );
  const pendingOutgoingRequests = useMemo(
    () => outgoingRequests.filter((request) => request.status === 'pending'),
    [outgoingRequests]
  );
  const closedOutgoingRequests = useMemo(
    () => outgoingRequests.filter((request) => !['approved', 'active', 'pending'].includes(request.status)),
    [outgoingRequests]
  );

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-8 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-5rem] top-[-3rem] h-56 w-56 rounded-full bg-rose-200/50 blur-3xl" />
        <div className="absolute right-[-4rem] top-24 h-56 w-56 rounded-full bg-amber-100/55 blur-3xl" />
        <div className="absolute bottom-[-4rem] left-1/2 h-60 w-60 -translate-x-1/2 rounded-full bg-pink-100/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl space-y-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-4 py-2 text-sm font-semibold text-rose-500 shadow-sm backdrop-blur transition hover:bg-white"
          >
            <span>←</span>
            <span>返回首页</span>
          </Link>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-white/75 bg-white/72 shadow-[0_28px_70px_-52px_rgba(148,63,117,0.4)] backdrop-blur-xl">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <h1 className="font-display-art text-2xl text-slate-900 sm:text-3xl">邀请与访问</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              邀请、加入、申请访问和处理外部申请，都集中放在这里。
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
                    <h2 className="font-accent-art mt-2 text-lg text-slate-900">进入同一个记录空间</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      输入邀请码后，会直接加入对方的空间并共享记录内容。
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
                    <h2 className="font-accent-art mt-2 text-lg text-slate-900">先申请只读查看</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      申请时需要填写你的昵称和对方的邀请码，对方同意后才能进入浏览。
                    </p>

                    <div className="mt-4 space-y-3">
                      <input
                        type="text"
                        value={requesterName}
                        onChange={(event) => setRequesterName(event.target.value)}
                        placeholder="填写你的昵称"
                        maxLength={20}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      />
                      <input
                        type="text"
                        value={applyInviteCode}
                        onChange={(event) => setApplyInviteCode(event.target.value.toUpperCase())}
                        placeholder="输入对方的邀请码"
                        maxLength={6}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-lg font-semibold tracking-[0.2em] text-slate-800 placeholder:text-slate-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      />
                      <button
                        type="button"
                        onClick={handleApplyAccess}
                        disabled={applying || !applyInviteCode.trim() || !requesterName.trim()}
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

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[28px] border border-white/80 bg-white/82 p-5 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">收到的申请</p>
                <h2 className="font-accent-art mt-2 text-xl text-slate-900">外部访问申请</h2>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">
                {pendingIncomingRequests.length}
              </span>
            </div>

            {pendingIncomingRequests.length > 0 ? (
              <div className="mt-4 space-y-3">
                {pendingIncomingRequests.map((request) => (
                  <div key={request.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{request.requester_name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          申请时间：{formatDateTime(request.created_at) || '刚刚'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleIncomingAction(request.id, 'approve')}
                          disabled={actingRequestId === request.id}
                          className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actingRequestId === request.id ? '处理中...' : '同意'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleIncomingAction(request.id, 'reject')}
                          disabled={actingRequestId === request.id}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          拒绝
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-amber-200 bg-amber-50/60 px-4 py-6 text-sm leading-6 text-slate-500">
                现在还没有待处理的外部申请。
              </div>
            )}

            <div className="mt-5 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-slate-900">已开放的访问</h3>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-600">
                  {grantedIncomingRequests.length}
                </span>
              </div>

              {grantedIncomingRequests.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {grantedIncomingRequests.map((request) => (
                    <div key={request.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{request.requester_name}</p>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                request.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-600'
                                  : 'bg-sky-50 text-sky-600'
                              }`}
                            >
                              {request.status === 'active' ? '访问中' : '待进入'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {request.status === 'active'
                              ? `截止时间：${formatDateTime(request.access_expires_at) || '即将到期'}`
                              : `批准时间：${formatDateTime(request.created_at) || '刚刚'}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleIncomingAction(request.id, 'revoke')}
                          disabled={actingRequestId === request.id}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actingRequestId === request.id ? '处理中...' : '撤销'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-sky-200 bg-sky-50/60 px-4 py-6 text-sm leading-6 text-slate-500">
                  还没有已开放的访问记录。
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/80 bg-white/82 p-5 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">我发出的申请</p>
                <h2 className="font-accent-art mt-2 text-xl text-slate-900">访问状态</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {outgoingRequests.length}
              </span>
            </div>

            <div className="mt-4 space-y-5">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">可以进入</h3>
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-600">
                    {readyOutgoingRequests.length}
                  </span>
                </div>

                {readyOutgoingRequests.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {readyOutgoingRequests.map((request) => (
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
                  <div className="mt-3 rounded-2xl border border-dashed border-sky-200 bg-sky-50/60 px-4 py-6 text-sm leading-6 text-slate-500">
                    还没有可进入的访问窗口。
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">等待中</h3>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">
                    {pendingOutgoingRequests.length}
                  </span>
                </div>

                {pendingOutgoingRequests.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {pendingOutgoingRequests.map((request) => (
                      <div key={request.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                        <p className="text-sm font-semibold text-slate-900">{getTargetLabel(request)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          已发出申请：{formatDateTime(request.created_at) || '刚刚'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-dashed border-amber-200 bg-amber-50/60 px-4 py-6 text-sm leading-6 text-slate-500">
                    现在没有等待中的访问申请。
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">最近状态</h3>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {closedOutgoingRequests.length}
                  </span>
                </div>

                {closedOutgoingRequests.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {closedOutgoingRequests.map((request) => (
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
                  <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-sm leading-6 text-slate-500">
                    这里会显示已经结束的访问申请记录。
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <p className="text-center text-xs leading-6 text-slate-400">
          直接加入会共享同一份记录；申请访问只会开放浏览权限，不会改变你自己的空间。
        </p>
      </div>
    </main>
  );
}

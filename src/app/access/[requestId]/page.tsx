'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type MemoryType = 'sweet_interaction' | 'todo' | 'feeling' | 'reflection';
type ProfileSlot = 'partnerA' | 'partnerB';

type PartnerProfile = {
  name: string | null;
  avatarUrl: string | null;
};

type CoupleProfiles = Record<ProfileSlot, PartnerProfile>;

type CoupleSpaceResponse = {
  profiles?: Partial<CoupleProfiles>;
};

type HomeRecord = {
  id: number;
  type: MemoryType;
  content: string;
  image_url?: string;
  image_urls?: string[];
  tags?: string[];
  author?: 'him' | 'her';
  is_completed?: boolean;
  created_at: string;
};

type HomeRecordResponse = {
  records: HomeRecord[];
  pagination?: {
    total?: number | null;
    hasMore?: boolean;
  };
};

type StatsState = {
  todayCount: number;
  totalCount: number;
  todoCount: number;
};

const EMPTY_PROFILES: CoupleProfiles = {
  partnerA: { name: null, avatarUrl: null },
  partnerB: { name: null, avatarUrl: null },
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

function formatDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDisplayName(name: string | null | undefined, fallback: string) {
  return name && name.trim() ? name.trim() : fallback;
}

function getInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || '●';
}

function formatRecordTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '刚刚';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}…`;
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }

  return data as T;
}

async function fetchIncompleteTodoCount(deviceId: string, accessRequestId: string): Promise<number> {
  const pageSize = 200;
  let offset = 0;
  let count = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await requestJson<HomeRecordResponse>(
      `/api/records?deviceId=${encodeURIComponent(deviceId)}&accessRequestId=${encodeURIComponent(accessRequestId)}&limit=${pageSize}&offset=${offset}&fields=id,type,is_completed`
    );

    count += data.records.filter((record) => record.type === 'todo' && !record.is_completed).length;
    hasMore = Boolean(data.pagination?.hasMore);
    offset += pageSize;
  }

  return count;
}

function mergeProfiles(profiles: Partial<CoupleProfiles> | undefined): CoupleProfiles {
  return {
    partnerA: {
      name: profiles?.partnerA?.name ?? null,
      avatarUrl: profiles?.partnerA?.avatarUrl ?? null,
    },
    partnerB: {
      name: profiles?.partnerB?.name ?? null,
      avatarUrl: profiles?.partnerB?.avatarUrl ?? null,
    },
  };
}

function AvatarPreview({
  profile,
  fallbackName,
  badgeText,
}: {
  profile: PartnerProfile;
  fallbackName: string;
  badgeText: string;
}) {
  const displayName = getDisplayName(profile.name, fallbackName);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="relative h-24 w-24 overflow-hidden rounded-full border border-white/85 bg-gradient-to-br from-white to-rose-50 shadow-[0_18px_34px_-24px_rgba(15,23,42,0.4)] sm:h-28 sm:w-28">
        {profile.avatarUrl ? (
          <Image
            src={profile.avatarUrl}
            alt={`${displayName}的头像`}
            fill
            sizes="(max-width: 640px) 96px, 112px"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.92),transparent_24%),linear-gradient(135deg,rgba(251,113,133,0.12),rgba(255,255,255,0.96)_52%,rgba(251,191,36,0.12))]">
            <span className="text-4xl font-black tracking-tight text-slate-700">
              {getInitial(displayName)}
            </span>
          </div>
        )}
      </div>

      <div className="inline-flex items-center rounded-full border border-white/85 bg-white/80 px-3 py-1 text-[11px] font-semibold tracking-[0.24em] text-slate-500 shadow-sm">
        {badgeText}
      </div>

      <p className="text-lg font-semibold tracking-[0.06em] text-slate-800 sm:text-xl">{displayName}</p>
    </div>
  );
}

export default function AccessHomePage() {
  const params = useParams<{ requestId: string }>();
  const requestId = Array.isArray(params?.requestId) ? params.requestId[0] : params?.requestId;
  const [profiles, setProfiles] = useState<CoupleProfiles>(EMPTY_PROFILES);
  const [stats, setStats] = useState<StatsState>({
    todayCount: 0,
    totalCount: 0,
    todoCount: 0,
  });
  const [recentRecords, setRecentRecords] = useState<HomeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (currentDeviceId: string, currentRequestId: string) => {
    const today = formatDay(new Date());

    const [spaceData, todayData, totalData, recentData, todoCount] = await Promise.all([
      requestJson<CoupleSpaceResponse>(
        `/api/couple-space?deviceId=${encodeURIComponent(currentDeviceId)}&accessRequestId=${encodeURIComponent(currentRequestId)}`
      ),
      requestJson<HomeRecordResponse>(
        `/api/records?deviceId=${encodeURIComponent(currentDeviceId)}&accessRequestId=${encodeURIComponent(currentRequestId)}&date=${today}&limit=1&fields=id&includeTotal=1`
      ),
      requestJson<HomeRecordResponse>(
        `/api/records?deviceId=${encodeURIComponent(currentDeviceId)}&accessRequestId=${encodeURIComponent(currentRequestId)}&limit=1&fields=id&includeTotal=1`
      ),
      requestJson<HomeRecordResponse>(
        `/api/records?deviceId=${encodeURIComponent(currentDeviceId)}&accessRequestId=${encodeURIComponent(currentRequestId)}&limit=3&fields=id,type,content,image_url,image_urls,tags,author,is_completed,created_at`
      ),
      fetchIncompleteTodoCount(currentDeviceId, currentRequestId),
    ]);

    setProfiles(mergeProfiles(spaceData.profiles));
    setStats({
      todayCount: typeof todayData.pagination?.total === 'number' ? todayData.pagination.total : 0,
      totalCount: typeof totalData.pagination?.total === 'number' ? totalData.pagination.total : 0,
      todoCount,
    });
    setRecentRecords(recentData.records || []);
  }, []);

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      setError('缺少访问申请 ID');
      return;
    }

    const currentDeviceId = createOrGetDeviceId();

    void loadPage(currentDeviceId, requestId)
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载访问页面失败');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [loadPage, requestId]);

  const partnerAName = getDisplayName(profiles.partnerA.name, '他');
  const partnerBName = getDisplayName(profiles.partnerB.name, '她');

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-6rem] top-[-5rem] h-60 w-60 rounded-full bg-sky-200/35 blur-3xl" />
        <div className="absolute right-[-5rem] top-20 h-56 w-56 rounded-full bg-rose-100/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl space-y-4">
        <section className="overflow-hidden rounded-[28px] border border-white/75 bg-white/78 shadow-[0_30px_80px_-58px_rgba(148,63,117,0.38)] backdrop-blur-xl sm:rounded-[32px]">
          <div className="grid gap-5 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-8 lg:px-10">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/85 bg-white/85 px-4 py-2 text-[11px] font-semibold tracking-[0.28em] text-sky-600 shadow-sm">
                  <span>只读访问</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50/85 px-3 py-1.5 text-xs text-sky-600">
                  <span>你现在看到的是对方空间</span>
                </div>
              </div>

              <h1 className="mt-5 max-w-xl text-3xl font-black leading-tight text-slate-900 sm:text-4xl lg:text-[3.15rem] lg:leading-[1.06]">
                这里保存着
                <span className="mt-2 block bg-gradient-to-r from-sky-500 via-cyan-500 to-rose-500 bg-clip-text text-transparent">
                  他们写下的日常片段
                </span>
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
                你可以在这里查看最近的记录、按时间翻看历史，或者从 3D 图谱里看看这段时间的痕迹。
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`/access/${requestId}/history`}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800 sm:min-w-[156px]"
                >
                  <span>浏览历史</span>
                </Link>
                <Link
                  href={`/access/${requestId}/graph`}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/85 bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white sm:min-w-[156px]"
                >
                  <span>查看 3D 图谱</span>
                </Link>
              </div>
            </div>

            <div className="rounded-[26px] border border-white/80 bg-[linear-gradient(180deg,rgba(247,250,252,0.98),rgba(255,255,255,0.96))] p-5 shadow-[0_20px_60px_-46px_rgba(15,23,42,0.2)] sm:p-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-500">他们</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">这页只用来安静地看看</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  不会改动头像、名字和记录内容，你看到的是一个只读视角。
                </p>
              </div>

              <div className="mt-6 grid items-start gap-4 sm:grid-cols-[1fr_auto_1fr] sm:gap-5">
                <AvatarPreview badgeText="他" fallbackName="他" profile={profiles.partnerA} />
                <div className="flex h-12 w-12 items-center justify-center self-center rounded-full border border-white/80 bg-white text-xl text-sky-500 shadow-sm">
                  ♥
                </div>
                <AvatarPreview badgeText="她" fallbackName="她" profile={profiles.partnerB} />
              </div>

              <div className="mt-6 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-500 shadow-sm">
                {partnerAName} 和 {partnerBName} 的近况，都在这里。
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-[28px] border border-red-100 bg-red-50 p-5 text-sm text-red-600 shadow-sm">
            {error}
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[28px] border border-white/80 bg-white/82 p-5 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">概览</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">今天留下了什么</h2>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-400">今天写下的</p>
                <p className="mt-3 text-3xl font-black text-rose-500">{stats.todayCount}</p>
              </div>
              <div className="rounded-2xl border border-pink-100 bg-pink-50/70 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-pink-400">回忆总数</p>
                <p className="mt-3 text-3xl font-black text-pink-500">{stats.totalCount}</p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-500">待完成</p>
                <p className="mt-3 text-3xl font-black text-sky-600">{stats.todoCount}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/80 bg-white/82 p-5 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">最近写下的</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">刚刚留下的片段，都在这里</h2>
              </div>
              <Link href={`/access/${requestId}/history`} className="text-sm font-semibold text-slate-700 transition hover:text-slate-900">
                去回看 →
              </Link>
            </div>

            {loading ? (
              <div className="mt-5 space-y-3">
                {[0, 1].map((value) => (
                  <div key={value} className="animate-pulse rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                    <div className="h-3 w-28 rounded bg-slate-200" />
                    <div className="mt-4 h-4 w-full rounded bg-slate-200" />
                    <div className="mt-2 h-4 w-3/4 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : recentRecords.length > 0 ? (
              <div className="mt-5 space-y-3">
                {recentRecords.map((record) => (
                  <div
                    key={record.id}
                    className="block rounded-2xl border border-white/80 bg-slate-50/75 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {record.type === 'todo'
                          ? '待办'
                          : record.type === 'sweet_interaction'
                            ? '甜蜜互动'
                            : record.type === 'feeling'
                              ? '心情'
                              : '碎碎念'}
                      </span>
                      <span className="text-xs text-slate-400">{formatRecordTime(record.created_at)}</span>
                    </div>

                    <p className="mt-3 text-sm leading-7 text-slate-700">{truncateText(record.content, 88)}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      {record.tags?.slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded-full bg-white px-2.5 py-1 text-slate-500 shadow-sm">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50/65 px-5 py-8 text-center">
                <p className="text-lg font-semibold text-slate-800">这里还没有可显示的新记录</p>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  可能这段时间还没有新的内容，也可能访问窗口已经接近结束。
                </p>
              </div>
            )}
          </div>
        </section>

        <div className="flex justify-end">
          <Link
            href="/access"
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/82 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
          >
            <span>返回访问列表</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}

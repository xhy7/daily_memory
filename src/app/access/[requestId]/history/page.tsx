'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MemoryImage from '@/components/MemoryImage';

type MemoryItem = {
  id: number;
  type: string;
  content: string;
  polished_content?: string;
  image_url?: string;
  image_urls?: string[];
  tags?: string[];
  author?: string;
  is_completed?: boolean;
  deadline?: string | null;
  created_at: string;
};

type RecordsResponse = {
  records: MemoryItem[];
  pagination?: {
    hasMore?: boolean;
  };
};

const PAGE_SIZE = 20;

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

function formatDateTime(value: string) {
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

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未知日期';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
}

function getImages(record: MemoryItem) {
  if (Array.isArray(record.image_urls) && record.image_urls.length > 0) {
    return record.image_urls;
  }

  return record.image_url ? [record.image_url] : [];
}

export default function AccessHistoryPage() {
  const params = useParams<{ requestId: string }>();
  const requestId = Array.isArray(params?.requestId) ? params.requestId[0] : params?.requestId;
  const [deviceId, setDeviceId] = useState('');
  const [records, setRecords] = useState<MemoryItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const recordsRef = useRef<MemoryItem[]>([]);

  const fetchRecords = useCallback(
    async (currentDeviceId: string, currentRequestId: string, append = false) => {
      const offset = append ? recordsRef.current.length : 0;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await fetch(
          `/api/records?deviceId=${encodeURIComponent(currentDeviceId)}&accessRequestId=${encodeURIComponent(currentRequestId)}&limit=${PAGE_SIZE}&offset=${offset}&includeTotal=0&fields=id,type,content,polished_content,image_url,image_urls,tags,author,is_completed,deadline,created_at`
        );
        const data = (await response.json()) as { error?: string } & RecordsResponse;

        if (!response.ok) {
          throw new Error(data.error || '加载历史失败');
        }

        const nextRecords = append ? [...recordsRef.current, ...(data.records || [])] : (data.records || []);
        recordsRef.current = nextRecords;
        setRecords(nextRecords);
        setHasMore(Boolean(data.pagination?.hasMore));
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载历史失败');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      setError('缺少访问申请 ID');
      return;
    }

    const currentDeviceId = createOrGetDeviceId();
    setDeviceId(currentDeviceId);
    recordsRef.current = [];
    void fetchRecords(currentDeviceId, requestId);
  }, [fetchRecords, requestId]);

  const groupedRecords = useMemo(() => {
    const groups: Array<{ date: string; records: MemoryItem[] }> = [];

    for (const record of records) {
      const date = formatDateLabel(record.created_at);
      const lastGroup = groups[groups.length - 1];

      if (lastGroup && lastGroup.date === date) {
        lastGroup.records.push(record);
      } else {
        groups.push({ date, records: [record] });
      }
    }

    return groups;
  }, [records]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(251,207,232,0.2),transparent_30%),linear-gradient(180deg,#fff8fb_0%,#fff 40%,#f8fafc_100%)] px-4 py-4 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/access/${requestId}`}
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
          >
            <span>←</span>
            <span>返回访问首页</span>
          </Link>

          <Link
            href={`/access/${requestId}/graph`}
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-4 py-2 text-sm font-semibold text-sky-600 shadow-sm transition hover:bg-white"
          >
            <span>去看 3D 图谱</span>
            <span>→</span>
          </Link>
        </div>

        <section className="rounded-[28px] border border-white/80 bg-white/82 p-6 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.3)] backdrop-blur-xl sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">历史</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">按时间翻看这些记录</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            这里是只读视角。你可以按时间浏览已经写下的内容，但不会修改任何信息。
          </p>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          ) : null}
        </section>

        {loading ? (
          <section className="space-y-4">
            {[0, 1, 2].map((value) => (
              <div key={value} className="h-40 animate-pulse rounded-[28px] bg-white/80" />
            ))}
          </section>
        ) : groupedRecords.length > 0 ? (
          <section className="space-y-6">
            {groupedRecords.map((group) => (
              <div key={group.date} className="space-y-3">
                <div className="sticky top-4 z-10 inline-flex rounded-full border border-white/85 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur">
                  {group.date}
                </div>

                <div className="space-y-3">
                  {group.records.map((record) => {
                    const images = getImages(record);

                    return (
                      <article
                        key={record.id}
                        className="rounded-[24px] border border-white/80 bg-white/82 p-5 shadow-[0_20px_55px_-44px_rgba(15,23,42,0.25)]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                              {record.type === 'todo'
                                ? '待办'
                                : record.type === 'sweet_interaction'
                                  ? '甜蜜互动'
                                  : record.type === 'feeling'
                                    ? '心情'
                                    : '碎碎念'}
                            </span>
                            {record.type === 'todo' ? (
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  record.is_completed
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : 'bg-amber-50 text-amber-600'
                                }`}
                              >
                                {record.is_completed ? '已完成' : '进行中'}
                              </span>
                            ) : null}
                          </div>

                          <span className="text-xs text-slate-400">{formatDateTime(record.created_at)}</span>
                        </div>

                        <p className="mt-4 text-sm leading-7 text-slate-700">
                          {record.polished_content || record.content}
                        </p>

                        {images.length > 0 ? (
                          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {images.map((imageUrl, index) => (
                              <button
                                key={`${record.id}-${imageUrl}-${index}`}
                                type="button"
                                onClick={() => setSelectedImage(imageUrl)}
                                className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50"
                              >
                                <MemoryImage
                                  src={imageUrl}
                                  alt="记录图片"
                                  width={320}
                                  height={240}
                                  className="h-36 w-full object-cover"
                                  sizes="(max-width: 640px) 50vw, 220px"
                                />
                              </button>
                            ))}
                          </div>
                        ) : null}

                        {record.tags?.length ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {record.tags.map((tag) => (
                              <span key={`${record.id}-${tag}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}

            {hasMore ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    if (deviceId && requestId) {
                      void fetchRecords(deviceId, requestId, true);
                    }
                  }}
                  disabled={loadingMore}
                  className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? '加载中...' : '加载更多'}
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 px-6 py-10 text-center text-sm leading-7 text-slate-500">
            这里还没有可展示的历史内容。
          </section>
        )}
      </div>

      {selectedImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-3xl bg-white">
            <MemoryImage
              src={selectedImage}
              alt="查看图片"
              width={1400}
              height={1000}
              className="max-h-[90vh] w-auto max-w-full object-contain"
              sizes="100vw"
              priority
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}

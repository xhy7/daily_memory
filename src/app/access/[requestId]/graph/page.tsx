'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

const Diary3DGraph = lazy(() => import('@/components/Diary3DGraph'));
const GRAPH_RECORDS_PAGE_SIZE = 150;

interface RecordNode {
  id: number;
  content: string;
  image_url?: string;
  image_urls?: string[];
  tags?: string[];
  author?: string;
  created_at: string;
  type: string;
}

interface GraphRecordDetail extends RecordNode {
  polished_content?: string;
  is_completed?: boolean;
  deadline?: string | null;
}

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

function GraphSkeleton() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-950">
      <div className="relative">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-sky-300">✦</div>
      </div>
      <div className="mt-4 text-xl text-sky-300">加载 3D 视图中...</div>
      <div className="mt-2 text-sm text-slate-500">正在整理这段时间的轨迹</div>
    </div>
  );
}

export default function AccessGraphPage() {
  const params = useParams<{ requestId: string }>();
  const requestId = Array.isArray(params?.requestId) ? params.requestId[0] : params?.requestId;
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [records, setRecords] = useState<RecordNode[]>([]);
  const [recordDetails, setRecordDetails] = useState<Record<number, GraphRecordDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [recordsHasMore, setRecordsHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const recordsRef = useRef<RecordNode[]>([]);

  useEffect(() => {
    setDeviceId(createOrGetDeviceId());
  }, []);

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
    };
  }, []);

  const fetchRecords = useCallback(async (
    currentDeviceId: string,
    currentRequestId: string,
    options: { append?: boolean } = {}
  ) => {
    const append = options.append === true;
    const currentOffset = append ? recordsRef.current.length : 0;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    if (append) {
      setLoadingMore(true);
    }

    try {
      const res = await fetch(
        `/api/records?deviceId=${encodeURIComponent(currentDeviceId)}&accessRequestId=${encodeURIComponent(currentRequestId)}&limit=${GRAPH_RECORDS_PAGE_SIZE}&offset=${currentOffset}&includeTotal=0&fields=id,content,tags,author,created_at,type`,
        { signal: controller.signal }
      );
      const data = (await res.json()) as { error?: string; records?: RecordNode[]; pagination?: { hasMore?: boolean } };

      if (!res.ok) {
        throw new Error(data.error || `加载图谱失败：${res.status}`);
      }

      const nextPage = data.records || [];
      const nextRecords = append ? [...recordsRef.current, ...nextPage] : nextPage;
      const hasMore = Boolean(data.pagination?.hasMore);
      recordsRef.current = nextRecords;
      setRecords(nextRecords);
      setRecordsHasMore(hasMore);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }

      setError(err instanceof Error ? err.message : '加载图谱失败');
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  const fetchRecordDetail = useCallback(async (
    currentDeviceId: string,
    currentRequestId: string,
    recordId: number
  ) => {
    setDetailLoadingId(recordId);

    try {
      const res = await fetch(
        `/api/records?id=${recordId}&deviceId=${encodeURIComponent(currentDeviceId)}&accessRequestId=${encodeURIComponent(currentRequestId)}&fields=id,type,content,polished_content,image_url,image_urls,tags,author,is_completed,deadline,created_at`
      );
      const data = (await res.json()) as { error?: string; record?: GraphRecordDetail };

      if (!res.ok) {
        throw new Error(data.error || `加载详情失败：${res.status}`);
      }

      if (!data.record) {
        return;
      }

      setRecordDetails((previous) => ({ ...previous, [recordId]: data.record! }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载详情失败');
    } finally {
      setDetailLoadingId((current) => (current === recordId ? null : current));
    }
  }, []);

  useEffect(() => {
    if (!deviceId || !requestId) {
      return;
    }

    setRecordDetails({});
    setDetailLoadingId(null);
    void fetchRecords(deviceId, requestId);
  }, [deviceId, fetchRecords, requestId]);

  const handleSelectionChange = useCallback((recordId: number | null) => {
    if (!deviceId || !requestId || !recordId || recordDetails[recordId]) {
      return;
    }

    void fetchRecordDetail(deviceId, requestId, recordId);
  }, [deviceId, fetchRecordDetail, recordDetails, requestId]);

  return (
    <div className="relative h-screen w-full bg-black">
      {loading ? (
        <GraphSkeleton />
      ) : error ? (
        <div className="flex h-screen flex-col items-center justify-center bg-gray-950 px-6 text-center">
          <div className="text-xl font-semibold text-rose-300">无法打开 3D 视图</div>
          <div className="mt-3 max-w-md text-sm leading-6 text-slate-400">{error}</div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`/access/${requestId}`}
              className="rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              返回访问首页
            </Link>
            <Link
              href={`/access/${requestId}/history`}
              className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-400"
            >
              去看历史
            </Link>
          </div>
        </div>
      ) : records.length === 0 ? (
        <div className="flex h-screen flex-col items-center justify-center bg-gray-950">
          <div className="mb-4 text-6xl text-sky-300">✦</div>
          <div className="mb-2 text-xl text-sky-300">这里还没有足够的记录</div>
          <div className="mb-6 text-sm text-slate-400">等更多内容被写下后，再来看看这片 3D 图谱。</div>
          <button
            onClick={() => router.push(`/access/${requestId}`)}
            className="rounded-full bg-sky-500 px-6 py-3 text-white transition hover:bg-sky-400"
          >
            返回访问首页
          </button>
        </div>
      ) : (
        <Suspense fallback={<GraphSkeleton />}>
          <Diary3DGraph
            records={records}
            recordDetails={recordDetails}
            detailLoadingId={detailLoadingId}
            onNodeClick={() => undefined}
            onSelectionChange={handleSelectionChange}
            onTagClick={() => undefined}
          />
        </Suspense>
      )}

      {!loading && !error && records.length > 0 && recordsHasMore ? (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
          <button
            type="button"
            onClick={() => {
              if (deviceId && requestId) {
                void fetchRecords(deviceId, requestId, { append: true });
              }
            }}
            disabled={loadingMore}
            className="rounded-full border border-sky-400/40 bg-black/70 px-5 py-2 text-sm font-medium text-sky-300 backdrop-blur-sm transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? '加载中...' : '加载更多'}
          </button>
        </div>
      ) : null}

      <div className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-3">
        <Link
          href={`/access/${requestId}`}
          className="rounded-lg bg-black/60 px-4 py-2 text-sm font-semibold text-sky-200 backdrop-blur-sm transition hover:bg-black/80"
        >
          返回访问首页
        </Link>
        <Link
          href={`/access/${requestId}/history`}
          className="rounded-lg bg-black/60 px-4 py-2 text-sm font-semibold text-slate-200 backdrop-blur-sm transition hover:bg-black/80"
        >
          浏览历史
        </Link>
      </div>
    </div>
  );
}

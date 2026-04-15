'use client';

import { useCallback, useEffect, lazy, Suspense, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getRecordsDataVersion,
  readSessionCache,
  writeSessionCache,
} from '@/lib/client-cache';

const Diary3DGraph = lazy(() => import('@/components/Diary3DGraph'));
const GRAPH_CACHE_KEY_PREFIX = 'graph-records-cache';
const GRAPH_DETAIL_CACHE_KEY_PREFIX = 'graph-record-detail-cache';
const GRAPH_CACHE_TTL_MS = 60 * 1000;
const GRAPH_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
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

interface GraphCacheEntry {
  records: RecordNode[];
  hasMore: boolean;
}

function normalizeGraphCacheEntry(
  value: GraphCacheEntry | RecordNode[] | null
): GraphCacheEntry | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return {
      records: value,
      hasMore: value.length >= GRAPH_RECORDS_PAGE_SIZE,
    };
  }

  if (Array.isArray(value.records)) {
    return {
      records: value.records,
      hasMore: Boolean(value.hasMore),
    };
  }

  return null;
}

function GraphSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform text-pink-400 text-2xl">💗</div>
      </div>
      <div className="font-accent-art text-pink-400 text-xl mt-4">加载 3D 图谱中...</div>
      <div className="text-gray-500 text-sm mt-2">正在构建你们的回忆星系</div>
    </div>
  );
}

export default function GraphPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [records, setRecords] = useState<RecordNode[]>([]);
  const [recordDetails, setRecordDetails] = useState<Record<number, GraphRecordDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [recordsHasMore, setRecordsHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const recordsRef = useRef<RecordNode[]>([]);

  useEffect(() => {
    let storedDeviceId = localStorage.getItem('coupleDeviceId');
    if (!storedDeviceId) {
      storedDeviceId = 'couple_memory_001';
      localStorage.setItem('coupleDeviceId', storedDeviceId);
    }
    setDeviceId(storedDeviceId);
  }, []);

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
    };
  }, []);

  const getCacheKey = useCallback(
    (currentDeviceId: string) => `${GRAPH_CACHE_KEY_PREFIX}:${currentDeviceId}`,
    []
  );
  const getDetailCacheKey = useCallback(
    (currentDeviceId: string, recordId: number) =>
      `${GRAPH_DETAIL_CACHE_KEY_PREFIX}:${currentDeviceId}:${recordId}`,
    []
  );

  const readCachedRecords = useCallback(
    (currentDeviceId: string): GraphCacheEntry | null =>
      normalizeGraphCacheEntry(
        readSessionCache<GraphCacheEntry | RecordNode[]>(
          getCacheKey(currentDeviceId),
          GRAPH_CACHE_TTL_MS,
          getRecordsDataVersion(currentDeviceId)
        )
      ),
    [getCacheKey]
  );

  const writeCachedRecords = useCallback(
    (currentDeviceId: string, nextRecords: RecordNode[], hasMore: boolean) => {
      writeSessionCache<GraphCacheEntry>(
        getCacheKey(currentDeviceId),
        { records: nextRecords, hasMore },
        getRecordsDataVersion(currentDeviceId)
      );
    },
    [getCacheKey]
  );

  const readCachedRecordDetail = useCallback(
    (currentDeviceId: string, recordId: number): GraphRecordDetail | null =>
      readSessionCache<GraphRecordDetail>(
        getDetailCacheKey(currentDeviceId, recordId),
        GRAPH_DETAIL_CACHE_TTL_MS,
        getRecordsDataVersion(currentDeviceId)
      ),
    [getDetailCacheKey]
  );

  const writeCachedRecordDetail = useCallback(
    (currentDeviceId: string, record: GraphRecordDetail) => {
      writeSessionCache<GraphRecordDetail>(
        getDetailCacheKey(currentDeviceId, record.id),
        record,
        getRecordsDataVersion(currentDeviceId)
      );
    },
    [getDetailCacheKey]
  );

  const fetchRecords = useCallback(async (
    currentDeviceId: string,
    options: { append?: boolean } = {}
  ) => {
    const append = options.append === true;
    const currentOffset = append ? recordsRef.current.length : 0;

    if (!append) {
      const cachedRecords = readCachedRecords(currentDeviceId);
      if (cachedRecords) {
        recordsRef.current = cachedRecords.records;
        setRecords(cachedRecords.records);
        setRecordsHasMore(cachedRecords.hasMore);
        setLoading(false);
      }
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    if (append) {
      setLoadingMore(true);
    }

    try {
      const res = await fetch(
        `/api/records?deviceId=${encodeURIComponent(currentDeviceId)}&limit=${GRAPH_RECORDS_PAGE_SIZE}&offset=${currentOffset}&includeTotal=0&fields=id,content,tags,author,created_at,type`,
        { signal: controller.signal }
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch graph records: ${res.status}`);
      }

      const data = await res.json();
      const nextPage = (data.records || []) as RecordNode[];
      const nextRecords = append ? [...recordsRef.current, ...nextPage] : nextPage;
      const hasMore = Boolean(data.pagination?.hasMore);
      recordsRef.current = nextRecords;
      setRecords(nextRecords);
      setRecordsHasMore(hasMore);
      writeCachedRecords(currentDeviceId, nextRecords, hasMore);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('Failed to fetch records:', error);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [readCachedRecords, writeCachedRecords]);

  const fetchRecordDetail = useCallback(async (
    currentDeviceId: string,
    recordId: number
  ) => {
    const cachedRecord = readCachedRecordDetail(currentDeviceId, recordId);
    if (cachedRecord) {
      setRecordDetails((previous) => ({ ...previous, [recordId]: cachedRecord }));
      return;
    }

    setDetailLoadingId(recordId);
    try {
      const res = await fetch(
        `/api/records?id=${recordId}&fields=id,type,content,polished_content,image_url,image_urls,tags,author,is_completed,deadline,created_at`
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch graph detail: ${res.status}`);
      }

      const data = await res.json();
      const record = data.record as GraphRecordDetail | undefined;
      if (!record) {
        return;
      }

      setRecordDetails((previous) => ({ ...previous, [recordId]: record }));
      writeCachedRecordDetail(currentDeviceId, record);
    } catch (error) {
      console.error('Failed to fetch record detail:', error);
    } finally {
      setDetailLoadingId((current) => (current === recordId ? null : current));
    }
  }, [readCachedRecordDetail, writeCachedRecordDetail]);

  useEffect(() => {
    if (!deviceId) {
      return;
    }

    setRecordDetails({});
    setDetailLoadingId(null);
    void fetchRecords(deviceId);
  }, [deviceId, fetchRecords]);

  const handleNodeClick = (record: RecordNode) => {
    console.log('Node clicked:', record);
  };

  const handleSelectionChange = useCallback((recordId: number | null) => {
    if (!deviceId || !recordId) {
      return;
    }

    if (recordDetails[recordId]) {
      return;
    }

    void fetchRecordDetail(deviceId, recordId);
  }, [deviceId, fetchRecordDetail, recordDetails]);

  const handleTagClick = (tag: string) => {
    console.log('Tag clicked:', tag);
  };

  return (
    <div className="w-full h-screen">
      {loading ? (
        <GraphSkeleton />
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-900">
          <div className="text-6xl mb-4">💗</div>
          <div className="font-accent-art text-pink-400 text-xl mb-2">还没有记录</div>
          <div className="text-gray-400 text-sm mb-6">先去记录一些甜蜜回忆吧</div>
          <button
            onClick={() => router.push('/record')}
            className="px-6 py-3 bg-pink-500 hover:bg-pink-400 text-white rounded-full transition"
          >
            去记录
          </button>
        </div>
      ) : (
        <Suspense fallback={<GraphSkeleton />}>
          <Diary3DGraph
            records={records}
            recordDetails={recordDetails}
            detailLoadingId={detailLoadingId}
            onNodeClick={handleNodeClick}
            onSelectionChange={handleSelectionChange}
            onTagClick={handleTagClick}
          />
        </Suspense>
      )}

      {!loading && records.length > 0 && recordsHasMore && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
          <button
            type="button"
            onClick={() => void fetchRecords(deviceId, { append: true })}
            disabled={loadingMore}
            className="rounded-full border border-pink-400/40 bg-black/70 px-5 py-2 text-sm font-medium text-pink-300 backdrop-blur-sm transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? 'Loading...' : 'Load more memories'}
          </button>
        </div>
      )}

      <button
        onClick={() => router.push('/')}
        className="absolute top-4 right-4 z-10 px-4 py-2 bg-black/60 backdrop-blur-sm text-pink-400 rounded-lg hover:bg-black/80 transition"
      >
        返回 ❤️
      </button>
    </div>
  );
}

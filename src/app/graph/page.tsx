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
const GRAPH_CACHE_TTL_MS = 60 * 1000;

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

function GraphSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform text-pink-400 text-2xl">💗</div>
      </div>
      <div className="text-pink-400 text-xl mt-4">加载 3D 图谱中...</div>
      <div className="text-gray-500 text-sm mt-2">正在构建你们的回忆星系</div>
    </div>
  );
}

export default function GraphPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [records, setRecords] = useState<RecordNode[]>([]);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef<AbortController | null>(null);

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

  const readCachedRecords = useCallback(
    (currentDeviceId: string): RecordNode[] | null =>
      readSessionCache<RecordNode[]>(
        getCacheKey(currentDeviceId),
        GRAPH_CACHE_TTL_MS,
        getRecordsDataVersion(currentDeviceId)
      ),
    [getCacheKey]
  );

  const writeCachedRecords = useCallback(
    (currentDeviceId: string, nextRecords: RecordNode[]) => {
      writeSessionCache(
        getCacheKey(currentDeviceId),
        nextRecords,
        getRecordsDataVersion(currentDeviceId)
      );
    },
    [getCacheKey]
  );

  const fetchRecords = useCallback(async (currentDeviceId: string) => {
    const cachedRecords = readCachedRecords(currentDeviceId);
    if (cachedRecords) {
      setRecords(cachedRecords);
      setLoading(false);
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const res = await fetch(
        `/api/records?deviceId=${encodeURIComponent(currentDeviceId)}&limit=500&includeTotal=0&fields=id,content,tags,author,created_at,type`,
        { signal: controller.signal }
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch graph records: ${res.status}`);
      }

      const data = await res.json();
      const nextRecords = data.records || [];
      setRecords(nextRecords);
      writeCachedRecords(currentDeviceId, nextRecords);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('Failed to fetch records:', error);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [readCachedRecords, writeCachedRecords]);

  useEffect(() => {
    if (!deviceId) {
      return;
    }

    void fetchRecords(deviceId);
  }, [deviceId, fetchRecords]);

  const handleNodeClick = (record: RecordNode) => {
    console.log('Node clicked:', record);
  };

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
          <div className="text-pink-400 text-xl mb-2">还没有记录</div>
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
            onNodeClick={handleNodeClick}
            onTagClick={handleTagClick}
          />
        </Suspense>
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

'use client';

import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const Diary3DGraph = lazy(() => import('@/components/Diary3DGraph'));

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
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-pink-400 text-2xl">💕</div>
      </div>
      <div className="text-pink-400 text-xl mt-4">加载3D图谱中...</div>
      <div className="text-gray-500 text-sm mt-2">正在构建你们的回忆星系</div>
    </div>
  );
}

export default function GraphPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState('');
  const [records, setRecords] = useState<RecordNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let storedDeviceId = localStorage.getItem('coupleDeviceId');
    if (!storedDeviceId) {
      storedDeviceId = 'couple_memory_001';
      localStorage.setItem('coupleDeviceId', storedDeviceId);
    }
    setDeviceId(storedDeviceId);
  }, []);

  useEffect(() => {
    if (deviceId) {
      fetchRecords();
    }
  }, [deviceId]);

  const fetchRecords = async () => {
    try {
      // 优化：只请求需要的字段，不获取图片
      const res = await fetch(`/api/records?deviceId=${deviceId}&fields=id,content,tags,author,created_at,type`);
      const data = await res.json();
      setRecords(data.records || []);
    } catch (error) {
      console.error('Failed to fetch records:', error);
    } finally {
      setLoading(false);
    }
  };

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
          <div className="text-6xl mb-4">💕</div>
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
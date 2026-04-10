'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

// 动态导入 3D 组件，禁用 SSR
const Diary3DGraph = dynamic(() => import('@/components/Diary3DGraph'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-gray-900">
      <div className="text-pink-400 text-xl">加载3D图谱中...</div>
    </div>
  )
});

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
      const res = await fetch(`/api/records?deviceId=${deviceId}`);
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
        <div className="flex items-center justify-center h-screen bg-gray-900">
          <div className="text-pink-400 text-xl">加载中...</div>
        </div>
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
        <Diary3DGraph
          records={records}
          onNodeClick={handleNodeClick}
          onTagClick={handleTagClick}
        />
      )}

      {/* 返回按钮 */}
      <button
        onClick={() => router.push('/')}
        className="absolute top-4 right-4 z-10 px-4 py-2 bg-black/60 backdrop-blur-sm text-pink-400 rounded-lg hover:bg-black/80 transition"
      >
        返回 ❤️
      </button>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type CoupleNames = {
  him: string;
  her: string;
};

const DEFAULT_NAMES: CoupleNames = {
  him: '他',
  her: '她',
};

export default function Home() {
  const [coupleName, setCoupleName] = useState<CoupleNames>(DEFAULT_NAMES);

  useEffect(() => {
    const stored = localStorage.getItem('coupleNames');
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Partial<CoupleNames>;
      setCoupleName({
        him: parsed.him || DEFAULT_NAMES.him,
        her: parsed.her || DEFAULT_NAMES.her,
      });
    } catch {
      setCoupleName(DEFAULT_NAMES);
    }
  }, []);

  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-10 left-10 h-24 w-24 rounded-full bg-pink-200/40 blur-2xl" />
        <div className="absolute top-24 right-16 h-16 w-16 rounded-full bg-rose-200/40 blur-2xl" />
        <div className="absolute bottom-24 left-20 h-28 w-28 rounded-full bg-amber-100/40 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-20 w-20 rounded-full bg-pink-100/50 blur-2xl" />
      </div>

      <div className="relative z-10">
        <header className="text-center mb-12 mt-8">
          <p className="text-sm uppercase tracking-[0.4em] text-rose-300">Shared Journal</p>
          <h1 className="text-4xl font-bold mt-3 bg-gradient-to-r from-pink-500 via-rose-500 to-pink-400 bg-clip-text text-transparent">
            每日记忆
          </h1>
          <p className="text-rose-400 mt-3">把今天的心情、待办和甜蜜瞬间都记下来。</p>
        </header>

        <section className="flex justify-center items-center gap-8 mb-12">
          <div className="flex flex-col items-center">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-200 to-blue-400 flex items-center justify-center shadow-lg border-4 border-white">
              <span className="text-2xl font-semibold text-blue-900">{coupleName.him.slice(0, 1)}</span>
            </div>
            <span className="mt-3 text-blue-600 font-medium text-lg">{coupleName.him}</span>
          </div>

          <div className="h-1 w-16 rounded-full bg-gradient-to-r from-pink-300 via-rose-400 to-pink-300" />

          <div className="flex flex-col items-center">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-pink-200 to-rose-400 flex items-center justify-center shadow-lg border-4 border-white">
              <span className="text-2xl font-semibold text-rose-900">{coupleName.her.slice(0, 1)}</span>
            </div>
            <span className="mt-3 text-rose-600 font-medium text-lg">{coupleName.her}</span>
          </div>
        </section>

        <section className="space-y-4 px-4">
          <Link
            href="/record"
            className="block p-5 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-2xl text-center hover:from-pink-600 hover:to-rose-600 transition shadow-lg"
          >
            记录今日
          </Link>
          <Link
            href="/history"
            className="block p-5 bg-white/80 text-rose-700 rounded-2xl text-center hover:bg-white transition shadow-lg border border-pink-100"
          >
            浏览回忆
          </Link>
          <Link
            href="/graph"
            className="block p-5 bg-gradient-to-r from-indigo-500 to-sky-500 text-white rounded-2xl text-center hover:from-indigo-600 hover:to-sky-600 transition shadow-lg"
          >
            3D 回忆图谱
          </Link>
        </section>
      </div>
    </main>
  );
}

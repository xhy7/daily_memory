"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export default function Home() {
  const [coupleName, setCoupleName] = useState({ him: "他", her: "她" });

  useEffect(() => {
    const stored = localStorage.getItem("coupleNames");
    if (stored) {
      setCoupleName(JSON.parse(stored));
    }
  }, []);

  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto relative overflow-hidden">
      {/* Background hearts decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-10 left-10 text-pink-200 text-6xl opacity-30">💕</div>
        <div className="absolute top-20 right-20 text-pink-200 text-4xl opacity-30">❤️</div>
        <div className="absolute bottom-40 left-20 text-pink-200 text-5xl opacity-30">💗</div>
        <div className="absolute bottom-20 right-10 text-pink-200 text-6xl opacity-30">💖</div>
        <div className="absolute top-1/2 left-1/4 text-pink-200 text-4xl opacity-30">💘</div>
      </div>

      <div className="relative z-10">
        {/* Header with couple avatars */}
        <div className="text-center mb-12 mt-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-pink-400 via-rose-400 to-pink-400 bg-clip-text text-transparent">
            每日记忆
          </h1>
          <p className="text-pink-300 text-sm">记录我们的甜蜜时光</p>
        </div>

        {/* Couple avatars section */}
        <div className="flex justify-center items-center gap-8 mb-12">
          {/* Him */}
          <div className="flex flex-col items-center">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-200 to-blue-400 flex items-center justify-center shadow-lg border-4 border-white relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-transparent to-white/20"></div>
              <span className="text-6xl relative z-10">😎</span>
            </div>
            <span className="mt-3 text-blue-500 font-medium text-lg">{coupleName.him}</span>
          </div>

          {/* Heart in middle */}
          <div className="text-6xl animate-pulse">💕</div>

          {/* Her */}
          <div className="flex flex-col items-center">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-pink-200 to-rose-400 flex items-center justify-center shadow-lg border-4 border-white relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-transparent to-white/20"></div>
              <span className="text-6xl relative z-10">😊</span>
            </div>
            <span className="mt-3 text-rose-500 font-medium text-lg">{coupleName.her}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-4 px-4">
          <Link href="/record" className="block p-5 bg-gradient-to-r from-pink-400 to-rose-400 text-white rounded-2xl text-center hover:from-pink-500 hover:to-rose-500 transition shadow-lg transform hover:scale-[1.02]">
            <span className="text-xl font-medium">💖 记录今日</span>
          </Link>
          <Link href="/history" className="block p-5 bg-gradient-to-r from-pink-200 to-rose-200 text-rose-600 rounded-2xl text-center hover:from-pink-300 hover:to-rose-300 transition shadow-lg transform hover:scale-[1.02]">
            <span className="text-xl font-medium">📅 浏览回忆</span>
          </Link>
          <Link href="/graph" className="block p-5 bg-gradient-to-r from-purple-400 to-indigo-400 text-white rounded-2xl text-center hover:from-purple-500 hover:to-indigo-500 transition shadow-lg transform hover:scale-[1.02]">
            <span className="text-xl font-medium">🔮 3D记忆图谱</span>
          </Link>
          <Link href="/voice-clone" className="block p-5 bg-gradient-to-r from-blue-400 to-cyan-400 text-white rounded-2xl text-center hover:from-blue-500 hover:to-cyan-500 transition shadow-lg transform hover:scale-[1.02]">
            <span className="text-xl font-medium">🎙️ 声音克隆</span>
          </Link>
        </div>

        {/* Sweet quote */}
        <div className="mt-16 text-center px-8">
          <p className="text-pink-300 italic text-sm">
            "和你在一起的每一天，都是最美好的回忆"
          </p>
        </div>
      </div>
    </main>
  );
}

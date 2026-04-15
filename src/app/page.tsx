'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type CoupleNames = {
  him: string;
  her: string;
};

type AvatarCardProps = {
  accentClass: string;
  badgeText: string;
  icon: string;
  name: string;
  pattern: string;
  subtitle: string;
};

const DEFAULT_NAMES: CoupleNames = {
  him: '\u4ed6',
  her: '\u5979',
};

const ACTIONS = [
  {
    href: '/record',
    eyebrow: '\u5373\u523b\u5f00\u59cb',
    title: '\u8bb0\u5f55\u4eca\u65e5',
    description: '\u628a\u4eca\u5929\u7684\u5fc3\u60c5\u3001\u5bf9\u8bdd\u3001\u5f85\u529e\u548c\u5c0f\u60ca\u559c\u5b58\u8fdb\u540c\u4e00\u672c\u65e5\u8bb0\u3002',
    className: 'from-rose-500 via-pink-500 to-orange-400 text-white',
    accent: '\ud83d\udc95',
  },
  {
    href: '/history',
    eyebrow: '\u6162\u6162\u56de\u770b',
    title: '\u6d4f\u89c8\u56de\u5fc6',
    description: '\u6309\u65e5\u671f\u7ffb\u9605\u4f60\u4eec\u7684\u76f8\u5904\u7247\u6bb5\uff0c\u8ba9\u6e29\u67d4\u6709\u8ff9\u53ef\u5faa\u3002',
    className: 'from-white via-rose-50 to-pink-100 text-rose-900 border border-white/70',
    accent: '\ud83d\udcdc',
  },
  {
    href: '/graph',
    eyebrow: '\u7acb\u4f53\u8fde\u63a5',
    title: '3D \u56de\u5fc6\u56fe\u8c31',
    description: '\u7528\u6807\u7b7e\u3001\u65f6\u95f4\u548c\u60c5\u7eea\u628a\u8bb0\u5f55\u8fde\u8d77\u6765\uff0c\u770b\u89c1\u4f60\u4eec\u7684\u5173\u7cfb\u7eb9\u7406\u3002',
    className: 'from-sky-500 via-indigo-500 to-violet-500 text-white',
    accent: '\ud83c\udf20',
  },
] as const;

const MEMORY_PROMPTS = [
  '\u4eca\u5929\u6700\u60f3\u88ab\u7559\u4e0b\u7684\u4e00\u5e55',
  '\u4f60\u4eec\u4e4b\u95f4\u6700\u6696\u7684\u4e00\u53e5\u8bdd',
  '\u8fd9\u5468\u60f3\u4e00\u8d77\u5b8c\u6210\u7684\u5c0f\u76ee\u6807',
] as const;

function getDisplayName(name: string | undefined, fallback: string) {
  return name && name.trim() ? name : fallback;
}

function getInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || '\u25cf';
}

function AvatarCard({
  accentClass,
  badgeText,
  icon,
  name,
  pattern,
  subtitle,
}: AvatarCardProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-44 w-44 sm:h-52 sm:w-52">
        <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${accentClass} shadow-[0_30px_90px_-45px_rgba(15,23,42,0.65)]`} />
        <div className="absolute inset-[8px] rounded-full border border-white/60 bg-white/15 backdrop-blur-md" />
        <div
          className="absolute inset-[20px] rounded-full opacity-80"
          style={{
            backgroundImage: pattern,
          }}
        />
        <div className="absolute inset-[40px] rounded-full border border-white/80 bg-white/35 shadow-inner shadow-white/30 backdrop-blur-xl flex items-center justify-center">
          <span className="text-5xl sm:text-6xl font-black tracking-tight text-slate-800">
            {getInitial(name)}
          </span>
        </div>
        <div className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/25 text-xl backdrop-blur-md">
          {icon}
        </div>
        <div className="absolute left-4 top-10 h-3 w-3 rounded-full bg-white/80 shadow-[0_0_20px_rgba(255,255,255,0.9)]" />
        <div className="absolute bottom-8 right-7 h-2.5 w-2.5 rounded-full bg-white/70" />
        <div className="absolute inset-x-8 bottom-1 rounded-full border border-white/60 bg-white/30 px-3 py-1 text-center text-xs font-semibold tracking-[0.24em] text-slate-700 backdrop-blur-md">
          {badgeText}
        </div>
      </div>

      <div className="text-center">
        <p className="text-2xl font-semibold tracking-[0.08em] text-slate-800">{name}</p>
        <p className="mt-1 text-sm tracking-[0.18em] text-slate-500 uppercase">{subtitle}</p>
      </div>
    </div>
  );
}

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
        him: getDisplayName(parsed.him, DEFAULT_NAMES.him),
        her: getDisplayName(parsed.her, DEFAULT_NAMES.her),
      });
    } catch {
      setCoupleName(DEFAULT_NAMES);
    }
  }, []);

  const himName = getDisplayName(coupleName.him, DEFAULT_NAMES.him);
  const herName = getDisplayName(coupleName.her, DEFAULT_NAMES.her);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-6rem] top-[-4rem] h-64 w-64 rounded-full bg-rose-200/60 blur-3xl" />
        <div className="absolute right-[-5rem] top-20 h-72 w-72 rounded-full bg-orange-100/70 blur-3xl" />
        <div className="absolute bottom-[-4rem] left-1/3 h-72 w-72 rounded-full bg-pink-100/70 blur-3xl" />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage: 'radial-gradient(circle at center, black 48%, transparent 90%)',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/60 shadow-[0_35px_120px_-55px_rgba(148,63,117,0.55)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-white/65 to-transparent" />
            <div className="absolute right-[-4rem] top-[-3rem] h-44 w-44 rounded-full border border-white/50 bg-white/25" />
            <div className="absolute left-[-2rem] bottom-[-2rem] h-32 w-32 rounded-full bg-rose-100/60 blur-2xl" />
          </div>

          <div className="relative grid gap-10 px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-12 lg:py-12">
            <div className="flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/60 px-4 py-2 text-xs font-semibold tracking-[0.28em] text-rose-500 shadow-sm backdrop-blur-md">
                  <span>{'\u2726'}</span>
                  <span>{'\u60c5\u4fa3\u5171\u4eab\u8bb0\u5fc6\u518c'}</span>
                </div>

                <h1 className="mt-6 max-w-xl text-4xl font-black leading-tight text-slate-900 sm:text-5xl lg:text-6xl">
                  {'\u628a\u4f60\u4eec\u7684\u65e5\u5e38\u8fc7\u6210'}
                  <span className="block bg-gradient-to-r from-rose-500 via-pink-500 to-amber-500 bg-clip-text text-transparent">
                    {'\u53ef\u4ee5\u73cd\u85cf\u7684\u6d6a\u6f2b\u6848\u5e95'}
                  </span>
                </h1>

                <p className="mt-5 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
                  {'\u8fd9\u91cc\u53ef\u4ee5\u8bb0\u4e0b\u4f60\u4eec\u7684\u5bf9\u8bdd\u3001\u5f85\u529e\u3001\u60c5\u7eea\u548c\u77ac\u95f4\u60ca\u559c\uff0c\u8ba9\u6bcf\u4e00\u5929\u90fd\u4e0d\u53ea\u662f\u201c\u8fc7\u53bb\u201d\uff0c\u800c\u662f\u201c\u88ab\u597d\u597d\u4fdd\u5b58\u201d\u3002'}
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <div className="rounded-2xl border border-white/70 bg-white/65 px-4 py-3 shadow-sm backdrop-blur-md">
                    <p className="text-xs font-semibold tracking-[0.24em] text-slate-400 uppercase">{'\u8bb0\u5fc6\u5173\u952e\u8bcd'}</p>
                    <p className="mt-1 text-sm text-slate-700">{'\u65e5\u5e38 / \u7ea6\u4f1a / \u5fc3\u60c5 / \u76ee\u6807'}</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/65 px-4 py-3 shadow-sm backdrop-blur-md">
                    <p className="text-xs font-semibold tracking-[0.24em] text-slate-400 uppercase">{'\u73cd\u85cf\u65b9\u5f0f'}</p>
                    <p className="mt-1 text-sm text-slate-700">{'\u6587\u5b57 + \u56fe\u7247 + \u6807\u7b7e + \u56de\u5fc6\u8fde\u7ebf'}</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 rounded-[28px] border border-white/70 bg-gradient-to-br from-white/75 to-rose-50/70 p-5 shadow-sm backdrop-blur-md">
                <p className="text-xs font-semibold tracking-[0.28em] text-rose-400 uppercase">{'\u4eca\u5929\u53ef\u4ee5\u8bb0\u4ec0\u4e48'}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {MEMORY_PROMPTS.map((prompt, index) => (
                    <div
                      key={prompt}
                      className="rounded-2xl border border-white/80 bg-white/70 px-4 py-4 text-sm leading-6 text-slate-600 shadow-sm"
                    >
                      <div className="mb-2 text-xs font-bold tracking-[0.24em] text-slate-400">{`0${index + 1}`}</div>
                      {prompt}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative flex items-center justify-center py-2">
              <div className="absolute inset-x-10 top-1/2 h-44 -translate-y-1/2 rounded-full bg-gradient-to-r from-sky-200/40 via-rose-200/45 to-amber-100/40 blur-3xl" />
              <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
                <div className="sm:translate-y-8">
                  <AvatarCard
                    accentClass="from-sky-300 via-blue-300 to-cyan-200"
                    badgeText="HE"
                    icon={'\u2605'}
                    name={himName}
                    pattern="radial-gradient(circle at 22% 22%, rgba(255,255,255,0.88) 0 8%, transparent 9%), radial-gradient(circle at 72% 32%, rgba(255,255,255,0.42) 0 6%, transparent 7%), repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0 10px, transparent 10px 22px)"
                    subtitle={'\u6d77\u98ce\u84dd\u8c03'}
                  />
                </div>

                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/80 bg-white/65 text-3xl shadow-lg backdrop-blur-xl">
                    {'\u2665'}
                  </div>
                  <div className="rounded-full border border-white/70 bg-white/60 px-4 py-2 text-xs font-semibold tracking-[0.3em] text-rose-500 shadow-sm backdrop-blur-md">
                    {'\u6211\u4eec'}
                  </div>
                </div>

                <div className="sm:-translate-y-8">
                  <AvatarCard
                    accentClass="from-pink-300 via-rose-300 to-amber-200"
                    badgeText="SHE"
                    icon={'\u2726'}
                    name={herName}
                    pattern="radial-gradient(circle at 26% 24%, rgba(255,255,255,0.85) 0 8%, transparent 9%), radial-gradient(circle at 70% 28%, rgba(255,245,255,0.52) 0 6%, transparent 7%), repeating-linear-gradient(45deg, rgba(255,255,255,0.2) 0 9px, transparent 9px 18px)"
                    subtitle={'\u73ab\u7470\u5149\u6655'}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-3">
          {ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`group relative overflow-hidden rounded-[28px] bg-gradient-to-br p-6 shadow-[0_24px_70px_-40px_rgba(148,63,117,0.55)] transition duration-300 hover:-translate-y-1 ${action.className}`}
            >
              <div className="absolute right-4 top-4 text-3xl opacity-80 transition group-hover:scale-110">
                {action.accent}
              </div>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_38%)]" />
              <div className="relative">
                <p className="text-xs font-semibold tracking-[0.28em] uppercase opacity-80">{action.eyebrow}</p>
                <h2 className="mt-3 text-2xl font-bold">{action.title}</h2>
                <p className="mt-3 text-sm leading-7 opacity-90">{action.description}</p>
                <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
                  <span>{'\u8fdb\u5165'}</span>
                  <span className="transition group-hover:translate-x-1">{'\u2192'}</span>
                </div>
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-8 rounded-[28px] border border-white/70 bg-white/60 px-6 py-5 shadow-[0_24px_70px_-48px_rgba(148,63,117,0.45)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.28em] text-slate-400 uppercase">{'\u9996\u9875\u5c0f\u63d0\u9192'}</p>
              <p className="mt-2 text-lg font-semibold text-slate-800">
                {'\u6700\u597d\u7684\u56de\u5fc6\u5e76\u4e0d\u4e00\u5b9a\u9700\u8981\u5b8f\u5927\uff0c\u5f88\u591a\u65f6\u5019\u53ea\u662f\u4e00\u4e2a\u8f7b\u8f7b\u7684\u5bf9\u89c6\u3002'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-gradient-to-r from-rose-50 to-amber-50 px-4 py-3 text-sm text-slate-600 shadow-sm">
              {'\u4ece\u4eca\u5929\u5f00\u59cb\uff0c\u7ed9\u6bcf\u4e00\u4efd\u5728\u4e4e\u90fd\u7559\u4e00\u4e2a\u53ef\u4ee5\u91cd\u8bfb\u7684\u5730\u65b9\u3002'}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

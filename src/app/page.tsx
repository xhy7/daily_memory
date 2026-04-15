'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type CoupleNames = {
  him: string;
  her: string;
};

type AvatarMedallionProps = {
  badgeText: string;
  name: string;
  pattern: string;
  ringClass: string;
  subtitle: string;
  isEditing?: boolean;
  onNameChange?: (name: string) => void;
};

const DEFAULT_NAMES: CoupleNames = {
  him: '\u4ed6',
  her: '\u5979',
};

const ACTIONS = [
  {
    href: '/record',
    eyebrow: '\u5feb\u901f\u8bb0\u4e00\u7b14',
    title: '\u8bb0\u5f55\u4eca\u65e5',
    description:
      '\u628a\u4eca\u5929\u7684\u5fc3\u60c5\u3001\u5bf9\u8bdd\u3001\u7167\u7247\u548c\u5f85\u529e\u7b80\u6d01\u5730\u8bb0\u4e0b\u6765\u3002',
    accentClass: 'bg-rose-100 text-rose-500',
    icon: '01',
  },
  {
    href: '/history',
    eyebrow: '\u6339\u65f6\u95f4\u56de\u770b',
    title: '\u6d4f\u89c8\u56de\u5fc6',
    description:
      '\u6309\u65e5\u671f\u628a\u4f60\u4eec\u7684\u76f8\u5904\u7247\u6bb5\u7a7f\u8d77\u6765\uff0c\u5f88\u5feb\u5c31\u80fd\u627e\u5230\u90a3\u5929\u3002',
    accentClass: 'bg-amber-100 text-amber-600',
    icon: '02',
  },
  {
    href: '/graph',
    eyebrow: '\u770b\u5173\u7cfb\u8109\u7edc',
    title: '3D \u56de\u5fc6\u56fe\u8c31',
    description:
      '\u7528\u65f6\u95f4\u3001\u6807\u7b7e\u548c\u60c5\u7eea\u628a\u8bb0\u5f55\u8fde\u6210\u7ebf\uff0c\u66f4\u76f4\u89c2\u5730\u770b\u5230\u53d8\u5316\u3002',
    accentClass: 'bg-sky-100 text-sky-600',
    icon: '3D',
  },
] as const;

const GUIDES = [
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

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return { text: '\u51fa\u4e86\u591c\u8fdd\uff0c\u8c0b\u751f\u6d88\u9063', emoji: '\ud83c\udf19' };
  if (hour < 9) return { text: '\u65e9\u4e0a\u597d\uff0c\u65b0\u7684\u4e00\u5929\u5f00\u59cb\u4e86', emoji: '\ud83c\udf1e' };
  if (hour < 12) return { text: '\u4e0a\u5348\u597d\uff0c\u4eca\u5929\u611f\u89c9\u5982\u4f55', emoji: '\ud83c\udf1e' };
  if (hour < 14) return { text: '\u4e2d\u5348\u597d\uff0c\u8bf7\u5403\u996d', emoji: '\ud83c\udf57' };
  if (hour < 18) return { text: '\u4e0b\u5348\u597d\uff0c\u7ee7\u7eed\u52aa\u529b', emoji: '\ud83c\udf1e' };
  if (hour < 22) return { text: '\u665a\u4e0a\u597d\uff0c\u653e\u677e\u4e00\u4e0b', emoji: '\ud83c\udf19' };
  return { text: '\u591c\u665a\u597d\uff0c\u8ba9\u6211\u4eec\u8c08\u8c08\u5fc3', emoji: '\ud83c\udf19' };
}

function AvatarMedallion({
  badgeText,
  name,
  pattern,
  ringClass,
  subtitle,
  isEditing,
  onNameChange,
}: AvatarMedallionProps) {
  const [editValue, setEditValue] = useState(name);

  useEffect(() => {
    setEditValue(name);
  }, [name]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && onNameChange && editValue?.trim()) {
      onNameChange(editValue.trim());
    }
    if (e.key === 'Escape') {
      setEditValue(name);
      if (onNameChange) onNameChange(name);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`relative h-32 w-32 rounded-full bg-gradient-to-br p-[10px] shadow-[0_22px_40px_-28px_rgba(15,23,42,0.45)] sm:h-36 sm:w-36 ${ringClass}`}
      >
        <div className="absolute inset-[10px] rounded-full border border-white/70 bg-white/45" />
        <div
          className="absolute inset-[22px] rounded-full opacity-80"
          style={{
            backgroundImage: pattern,
          }}
        />
        <div className="absolute inset-[34px] flex items-center justify-center rounded-full border border-white/80 bg-white/85 shadow-inner shadow-white/50">
          <span className="text-4xl font-black tracking-tight text-slate-800 sm:text-5xl">
            {getInitial(name)}
          </span>
        </div>
        <div className="absolute inset-x-5 bottom-2 rounded-full border border-white/80 bg-white/80 px-3 py-1 text-center text-[10px] font-semibold tracking-[0.28em] text-slate-600 shadow-sm">
          {badgeText}
        </div>
      </div>

      <div className="text-center">
        {isEditing && onNameChange ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => editValue?.trim() && onNameChange(editValue.trim())}
            onKeyDown={handleKeyDown}
            className="w-24 rounded-lg border border-rose-200 bg-white/80 px-2 py-1 text-center text-sm font-semibold text-slate-800 focus:border-rose-400 focus:outline-none"
            maxLength={8}
            autoFocus
          />
        ) : (
          <button
            onClick={() => onNameChange?.(name)}
            className="group text-lg font-semibold tracking-[0.08em] text-slate-800 sm:text-xl hover:text-rose-500"
            title={'\u70b9\u51fb\u7f16\u8f91'}
          >
            {name}
            <span className="ml-1 inline-block text-xs opacity-0 transition group-hover:opacity-100">{'\u270e'}</span>
          </button>
        )}
        <p className="mt-1 text-xs uppercase tracking-[0.28em] text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

export default function Home() {
  const [coupleName, setCoupleName] = useState<CoupleNames>(DEFAULT_NAMES);
  const [todayCount, setTodayCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<'him' | 'her' | null>(null);
  const [greeting] = useState(getTimeGreeting);

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

  useEffect(() => {
    const deviceId = localStorage.getItem('coupleDeviceId');
    if (!deviceId) return;

    const fetchStats = async () => {
      try {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const response = await fetch(
          `/api/records?deviceId=${encodeURIComponent(deviceId)}&date=${dateStr}&limit=1&fields=id&includeTotal=1`,
        );
        const data = await response.json();
        if (typeof data.pagination?.total === 'number') {
          setTodayCount(data.pagination.total);
        } else {
          setTodayCount(0);
        }
      } catch {
        // ignore
      }
    };

    const fetchTotalCount = async () => {
      try {
        const deviceId = localStorage.getItem('coupleDeviceId');
        if (!deviceId) return;
        const response = await fetch(`/api/records?deviceId=${encodeURIComponent(deviceId)}&limit=0&includeTotal=1`);
        const data = await response.json();
        if (typeof data.pagination?.total === 'number') {
          setTotalCount(data.pagination.total);
        } else {
          setTotalCount(0);
        }
      } catch {
        // ignore
      }
    };

    const fetchInviteCode = async () => {
      try {
        const deviceId = localStorage.getItem('coupleDeviceId');
        if (!deviceId) return;
        const response = await fetch(`/api/couple-space?deviceId=${encodeURIComponent(deviceId)}`);
        const data = await response.json();
        if (data.inviteCode) {
          setInviteCode(data.inviteCode);
        }
      } catch {
        // ignore
      }
    };

    void fetchStats();
    void fetchTotalCount();
    void fetchInviteCode();
  }, []);

  const handleNameChange = useCallback((who: 'him' | 'her', newName: string) => {
    const updated = { ...coupleName, [who]: newName };
    setCoupleName(updated);
    localStorage.setItem('coupleNames', JSON.stringify(updated));
    setEditingName(null);
  }, [coupleName]);

  const himName = getDisplayName(coupleName.him, DEFAULT_NAMES.him);
  const herName = getDisplayName(coupleName.her, DEFAULT_NAMES.her);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-8 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-5rem] top-[-3rem] h-56 w-56 rounded-full bg-rose-200/50 blur-3xl" />
        <div className="absolute right-[-4rem] top-24 h-56 w-56 rounded-full bg-amber-100/55 blur-3xl" />
        <div className="absolute bottom-[-4rem] left-1/2 h-60 w-60 -translate-x-1/2 rounded-full bg-pink-100/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl">
        <section className="relative overflow-hidden rounded-[28px] border border-white/75 bg-white/72 shadow-[0_28px_70px_-52px_rgba(148,63,117,0.4)] backdrop-blur-xl sm:rounded-[32px]">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/70 to-transparent" />
            <div className="absolute right-[-3rem] top-[-2rem] h-32 w-32 rounded-full bg-white/35" />
          </div>

          <div className="relative grid gap-8 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:px-10 lg:py-10">
            <div>
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-4 py-2 text-[11px] font-semibold tracking-[0.28em] text-rose-500 shadow-sm">
                  <span>{'\u2726'}</span>
                  <span>{'\u60c5\u4fa3\u5171\u4eab\u8bb0\u5fc6\u518c'}</span>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50/80 px-3 py-1.5 text-xs text-rose-500">
                  <span>{greeting.emoji}</span>
                  <span className="font-medium">{greeting.text}</span>
                </div>
              </div>

              <h1 className="mt-5 max-w-xl text-3xl font-black leading-tight text-slate-900 sm:text-4xl lg:text-[3.2rem] lg:leading-[1.08]">
                {'\u628a\u65e5\u5e38\u8fc7\u6210'}
                <span className="mt-2 block bg-gradient-to-r from-rose-500 via-pink-500 to-amber-500 bg-clip-text text-transparent">
                  {'\u503c\u5f97\u518d\u7ffb\u770b\u7684\u56de\u5fc6'}
                </span>
              </h1>

              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
                {'\u5728\u8fd9\u91cc\u628a\u4f60\u4eec\u7684\u5bf9\u8bdd\u3001\u5fc3\u60c5\u3001\u7167\u7247\u548c\u5c0f\u8ba1\u5212\u597d\u597d\u7559\u4e0b\uff0c\u8ba9\u6bcf\u4e00\u5929\u90fd\u6709\u4e00\u4e2a\u53ef\u4ee5\u91cd\u65b0\u6253\u5f00\u7684\u5165\u53e3\u3002'}
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/record"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:from-rose-600 hover:to-pink-600 hover:shadow-lg"
                >
                  <span>{'\ud83d\udcdd'}</span>
                  <span>{'\u8bb0\u5f55\u4eca\u5929'}</span>
                </Link>
                <Link
                  href="/history"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/80 bg-white/75 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white"
                >
                  <span>{'\ud83d\udd0d'}</span>
                  <span>{'\u6d4f\u89c8\u56de\u5fc6'}</span>
                </Link>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{'\u4eca\u65e5\u8bb0\u5f55'}</p>
                  <p className="mt-2 text-2xl font-bold text-rose-500">{todayCount}</p>
                </div>
                <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{'\u603b\u8bb0\u5f55'}</p>
                  <p className="mt-2 text-2xl font-bold text-pink-500">{totalCount}</p>
                </div>
                <Link href="/invite" className="rounded-2xl border border-white/80 bg-white/70 px-4 py-4 shadow-sm transition hover:bg-white/90">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{'\u9080\u8bf7\u7801'}</p>
                  <p className="mt-2 text-lg font-bold text-amber-500">{inviteCode || '---'}</p>
                </Link>
              </div>
            </div>

            <div className="rounded-[26px] border border-white/75 bg-gradient-to-b from-rose-50/90 to-white/85 p-5 shadow-[0_20px_60px_-48px_rgba(148,63,117,0.35)] sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-rose-400">
                    {'\u6211\u4eec\u7684\u8bb0\u5fc6'}
                  </p>
                </div>

                <div className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-semibold tracking-[0.26em] text-rose-500 shadow-sm">
                  {'\u6211\u4eec'}
                </div>
              </div>

              <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-5">
                <AvatarMedallion
                  badgeText="HE"
                  name={himName}
                  pattern="radial-gradient(circle at 28% 28%, rgba(255,255,255,0.88) 0 7%, transparent 8%), repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0 8px, transparent 8px 18px)"
                  ringClass="from-sky-200 via-blue-200 to-cyan-100"
                  subtitle={'\u5b81\u9759\u84dd\u8c03'}
                  isEditing={editingName === 'him'}
                  onNameChange={(name) => handleNameChange('him', name)}
                />

                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/80 bg-white/85 text-xl text-rose-400 shadow-sm">
                  {'\u2665'}
                </div>

                <AvatarMedallion
                  badgeText="SHE"
                  name={herName}
                  pattern="radial-gradient(circle at 28% 26%, rgba(255,255,255,0.88) 0 7%, transparent 8%), repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 8px, transparent 8px 18px)"
                  ringClass="from-pink-200 via-rose-200 to-amber-100"
                  subtitle={'\u67d4\u548c\u7c89\u6676'}
                  isEditing={editingName === 'her'}
                  onNameChange={(name) => handleNameChange('her', name)}
                />
              </div>

              <div className="mt-6 rounded-3xl border border-white/80 bg-white/80 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                  {'\u4eca\u5929\u53ef\u4ee5\u4ece\u8fd9\u91cc\u5f00\u59cb'}
                </p>
                <div className="mt-3 space-y-3">
                  {GUIDES.map((guide, index) => (
                    <div
                      key={guide}
                      className="flex items-start gap-3 rounded-2xl border border-white/80 bg-white px-3 py-3 text-sm leading-6 text-slate-600"
                    >
                      <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-rose-50 text-xs font-semibold text-rose-500">
                        {index + 1}
                      </span>
                      <span>{guide}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group rounded-[24px] border border-white/80 bg-white/78 p-5 shadow-[0_20px_55px_-44px_rgba(15,23,42,0.35)] transition duration-300 hover:-translate-y-0.5 hover:bg-white"
            >
              <div
                className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold shadow-sm ${action.accentClass}`}
              >
                {action.icon}
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                {action.eyebrow}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-800">{action.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{action.description}</p>
              <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span>{'\u8fdb\u5165'}</span>
                <span className="transition group-hover:translate-x-1">{'\u2192'}</span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}

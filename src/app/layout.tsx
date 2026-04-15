import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '每日记忆 - 情侣空间',
  description: '记录你们的甜蜜日常、待办和回忆。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

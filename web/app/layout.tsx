import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AXIS / 03 — 魔方工作室',
  description: '真实 3D 磁力魔方、机械拆解、照片定制与 CFOP 可视化求解。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body>
        {children}
      </body>
    </html>
  );
}

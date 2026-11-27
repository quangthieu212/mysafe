import type { Metadata, Viewport } from 'next';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import './styles.css';

export const metadata: Metadata = {
  title: 'Két Sắt Việt · Thông tin của bạn, trong tầm tay',
  description: 'Két thông tin cá nhân bằng tiếng Việt, có đồng bộ và sao lưu được mã hóa.',
  applicationName: 'Két Sắt Việt',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f4f7f4' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><ServiceWorkerRegistration />{children}</body></html>;
}

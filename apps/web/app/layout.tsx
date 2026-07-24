import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'Amazing Chance',
  description: 'Transparent weekly lottery platform',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

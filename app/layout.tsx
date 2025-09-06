import type { ReactNode } from 'react';

export const metadata = { title: "Zazzle" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        {/* Plyr CSS */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/plyr/3.8.3/plyr.min.css"
          integrity="sha512-rpQwR0tBLVUtg/c2YJ08lqMhzVuO2KYzj6z7QdQdJNYpn5ovSvb70qsqkd7q+oA5l4A0wJjCwzclpPUmYtci2w=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body style={{ fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>{children}</body>
    </html>
  );
}

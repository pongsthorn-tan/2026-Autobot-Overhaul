import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Autobot Dashboard',
  description: 'AI-powered autonomous task scheduling system admin panel',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px',
            height: '56px',
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-color)',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <a
              href="/"
              style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              Autobot
            </a>
            <div style={{ display: 'flex', gap: '4px' }}>
              <a href="/" className="nav-link">
                Dashboard
              </a>
              <a href="/costs" className="nav-link">
                Costs
              </a>
              <a href="/logs" className="nav-link">
                Logs
              </a>
            </div>
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}
          >
            Admin Panel
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}

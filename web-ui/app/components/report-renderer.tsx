'use client';

import { type ReactNode } from 'react';

// Inline types to avoid cross-package imports
interface ReportSection {
  type: string;
  heading?: string;
  content?: string;
  items?: (string | { title: string; detail: string })[];
  columns?: string[];
  rows?: string[][];
  pros?: string[];
  cons?: string[];
  variant?: 'info' | 'warning' | 'success';
}

interface StructuredReport {
  title: string;
  subtitle?: string;
  generatedAt: string;
  sections: ReportSection[];
  conclusion?: string;
}

// Lightweight markdown to HTML (bold, italic, links, code, lists)
function renderMarkdown(text: string): ReactNode[] {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} style={{ margin: '8px 0', paddingLeft: '20px' }}>
          {listItems.map((item, i) => (
            <li key={i} style={{ marginBottom: '4px' }}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const listMatch = line.match(/^[-*]\s+(.+)/);
    if (listMatch) {
      listItems.push(listMatch[1]);
      continue;
    }
    flushList();
    if (line.trim() === '') {
      continue;
    }
    elements.push(<p key={`p-${i}`} style={{ margin: '6px 0', lineHeight: 1.6 }}>{renderInline(line)}</p>);
  }
  flushList();
  return elements;
}

function renderInline(text: string): ReactNode {
  // Process inline markdown: **bold**, *italic*, `code`, [link](url)
  const parts: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(<strong key={key++}>{boldMatch[2]}</strong>);
      remaining = boldMatch[3];
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
      parts.push(<em key={key++}>{italicMatch[2]}</em>);
      remaining = italicMatch[3];
      continue;
    }

    // Inline code
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>);
      parts.push(
        <code key={key++} style={{
          background: 'var(--bg-tertiary)',
          padding: '1px 5px',
          borderRadius: '3px',
          fontSize: '0.85em',
        }}>{codeMatch[2]}</code>
      );
      remaining = codeMatch[3];
      continue;
    }

    // Link
    const linkMatch = remaining.match(/^(.*?)\[(.+?)\]\((.+?)\)(.*)/);
    if (linkMatch) {
      if (linkMatch[1]) parts.push(<span key={key++}>{linkMatch[1]}</span>);
      parts.push(
        <a key={key++} href={linkMatch[3]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue, #3b82f6)' }}>
          {linkMatch[2]}
        </a>
      );
      remaining = linkMatch[4];
      continue;
    }

    // No more matches
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function SummarySection({ section }: { section: ReportSection }) {
  return (
    <div style={{
      borderLeft: '4px solid var(--accent-blue, #3b82f6)',
      padding: '16px 20px',
      background: 'rgba(59, 130, 246, 0.05)',
      borderRadius: '0 8px 8px 0',
      fontSize: '0.95rem',
      marginBottom: '24px',
    }}>
      {section.content && renderMarkdown(section.content)}
    </div>
  );
}

function KeyFindingsSection({ section }: { section: ReportSection }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      {section.heading && <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>{section.heading}</h3>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {section.items?.map((item, i) => {
          const isString = typeof item === 'string';
          const obj = isString ? null : item;
          const title = obj?.title ?? null;
          const detail = isString ? item : obj?.detail ?? '';

          return (
            <div key={i} style={{
              display: 'flex',
              gap: '12px',
              padding: '12px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'rgba(59, 130, 246, 0.1)',
                color: 'var(--accent-blue, #3b82f6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {i + 1}
              </div>
              <div>
                {title && <div style={{ fontWeight: 600, marginBottom: '4px' }}>{title}</div>}
                <div style={{ fontSize: '0.85rem', color: title ? 'var(--text-secondary)' : 'var(--text-primary)', lineHeight: 1.5 }}>
                  {renderInline(detail)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TextSection({ section }: { section: ReportSection }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      {section.heading && <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }}>{section.heading}</h3>}
      {section.content && <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{renderMarkdown(section.content)}</div>}
    </div>
  );
}

function TableSection({ section }: { section: ReportSection }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      {section.heading && <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>{section.heading}</h3>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.85rem',
        }}>
          {section.columns && (
            <thead>
              <tr>
                {section.columns.map((col, i) => (
                  <th key={i} style={{
                    padding: '10px 12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    borderBottom: '2px solid var(--border-color)',
                    background: 'var(--bg-tertiary)',
                    whiteSpace: 'nowrap',
                  }}>{col}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {section.rows?.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                  }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProsConsSection({ section }: { section: ReportSection }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      {section.heading && <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>{section.heading}</h3>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{
          padding: '14px',
          background: 'rgba(34, 197, 94, 0.05)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          borderRadius: '8px',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--accent-green)', marginBottom: '8px', fontSize: '0.85rem' }}>Pros</div>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.85rem', lineHeight: 1.6 }}>
            {section.pros?.map((pro, i) => (
              <li key={i} style={{ marginBottom: '4px', color: 'var(--text-primary)' }}>{renderInline(pro)}</li>
            ))}
          </ul>
        </div>
        <div style={{
          padding: '14px',
          background: 'rgba(239, 68, 68, 0.05)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '8px',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--accent-red)', marginBottom: '8px', fontSize: '0.85rem' }}>Cons</div>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.85rem', lineHeight: 1.6 }}>
            {section.cons?.map((con, i) => (
              <li key={i} style={{ marginBottom: '4px', color: 'var(--text-primary)' }}>{renderInline(con)}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function CalloutSection({ section }: { section: ReportSection }) {
  const variantColors = {
    info: { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.25)', text: 'var(--accent-blue, #3b82f6)', icon: '\u2139' },
    warning: { bg: 'rgba(234, 179, 8, 0.08)', border: 'rgba(234, 179, 8, 0.25)', text: 'var(--accent-yellow)', icon: '\u26A0' },
    success: { bg: 'rgba(34, 197, 94, 0.08)', border: 'rgba(34, 197, 94, 0.25)', text: 'var(--accent-green)', icon: '\u2713' },
  };
  const v = variantColors[section.variant ?? 'info'];

  return (
    <div style={{
      padding: '14px 18px',
      background: v.bg,
      border: `1px solid ${v.border}`,
      borderRadius: '8px',
      marginBottom: '24px',
      display: 'flex',
      gap: '12px',
      alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: '1.1rem', color: v.text, flexShrink: 0, marginTop: '2px' }}>{v.icon}</span>
      <div style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
        {section.content && renderMarkdown(section.content)}
      </div>
    </div>
  );
}

function renderSection(section: ReportSection, index: number) {
  const key = `section-${index}`;
  switch (section.type) {
    case 'summary': return <SummarySection key={key} section={section} />;
    case 'key-findings': return <KeyFindingsSection key={key} section={section} />;
    case 'text': return <TextSection key={key} section={section} />;
    case 'table': return <TableSection key={key} section={section} />;
    case 'pros-cons': return <ProsConsSection key={key} section={section} />;
    case 'callout': return <CalloutSection key={key} section={section} />;
    default: return null;
  }
}

export function parseReport(raw: string): StructuredReport | null {
  try {
    let jsonStr = raw.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }
    const parsed = JSON.parse(jsonStr);
    if (parsed && parsed.title && Array.isArray(parsed.sections)) {
      return parsed as StructuredReport;
    }
    return null;
  } catch {
    return null;
  }
}

interface ReportRendererProps {
  output: string;
}

export default function ReportRenderer({ output }: ReportRendererProps) {
  const report = parseReport(output);

  if (!report) {
    return (
      <div style={{
        padding: '16px',
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        fontSize: '0.85rem',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: 'var(--text-primary)',
      }}>
        {output}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px', paddingBottom: '20px', borderBottom: '2px solid var(--border-color)' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '4px', lineHeight: 1.2 }}>{report.title}</h1>
        {report.subtitle && (
          <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginTop: '6px' }}>{report.subtitle}</div>
        )}
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '10px' }}>
          Generated {new Date(report.generatedAt).toLocaleString()}
        </div>
      </div>

      {/* Sections */}
      {report.sections.map((section, i) => renderSection(section, i))}

      {/* Conclusion */}
      {report.conclusion && (
        <div style={{
          marginTop: '32px',
          paddingTop: '20px',
          borderTop: '2px solid var(--border-color)',
        }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }}>Conclusion</h3>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            {renderMarkdown(report.conclusion)}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: '32px',
        paddingTop: '16px',
        borderTop: '1px solid var(--border-color)',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        textAlign: 'center',
      }}>
        Generated by Autobot
      </div>
    </div>
  );
}

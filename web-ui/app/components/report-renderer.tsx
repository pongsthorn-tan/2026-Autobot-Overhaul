'use client';

import { type ReactNode } from 'react';
import { formatDate } from '../lib/format-date';

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

function extractLinks(report: StructuredReport): { text: string; url: string }[] {
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
  const seen = new Set<string>();
  const links: { text: string; url: string }[] = [];

  const scan = (str?: string) => {
    if (!str) return;
    let match;
    while ((match = linkRegex.exec(str)) !== null) {
      if (!seen.has(match[2])) {
        seen.add(match[2]);
        links.push({ text: match[1], url: match[2] });
      }
    }
  };

  for (const s of report.sections) {
    scan(s.content);
    s.items?.forEach(item => {
      if (typeof item === 'string') scan(item);
      else { scan(item.title); scan(item.detail); }
    });
    s.pros?.forEach(scan);
    s.cons?.forEach(scan);
  }
  scan(report.conclusion);
  return links;
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
            <li key={i} style={{ marginBottom: '6px', lineHeight: 1.7 }}>{renderInline(item)}</li>
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
    elements.push(<p key={`p-${i}`} style={{ margin: '8px 0', lineHeight: 1.75 }}>{renderInline(line)}</p>);
  }
  flushList();
  return elements;
}

function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(<strong key={key++} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{boldMatch[2]}</strong>);
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
          background: 'rgba(59, 130, 246, 0.1)',
          color: 'var(--accent-blue)',
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '0.85em',
          fontFamily: "'SF Mono', 'Fira Code', monospace",
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
        <a key={key++} href={linkMatch[3]} target="_blank" rel="noopener noreferrer" style={{
          color: 'var(--accent-blue)',
          textDecoration: 'underline',
          textDecorationColor: 'rgba(59, 130, 246, 0.3)',
          textUnderlineOffset: '3px',
        }}>
          {linkMatch[2]}
        </a>
      );
      remaining = linkMatch[4];
      continue;
    }

    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// Section heading with accent bar
function SectionHeading({ children }: { children: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '16px',
    }}>
      <div style={{
        width: '4px',
        height: '20px',
        borderRadius: '2px',
        background: 'linear-gradient(180deg, var(--accent-blue) 0%, var(--accent-purple) 100%)',
      }} />
      <h3 style={{
        fontSize: '1.05rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
      }}>{children}</h3>
    </div>
  );
}

function SummarySection({ section }: { section: ReportSection }) {
  return (
    <div style={{
      borderLeft: '4px solid var(--accent-blue)',
      padding: '20px 24px',
      background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(168, 85, 247, 0.04) 100%)',
      borderRadius: '0 12px 12px 0',
      fontSize: '0.92rem',
      marginBottom: '28px',
      lineHeight: 1.75,
      color: 'var(--text-primary)',
    }}>
      {section.content && renderMarkdown(section.content)}
    </div>
  );
}

function KeyFindingsSection({ section }: { section: ReportSection }) {
  const accentColors = [
    { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.2)', dot: '#3b82f6' },
    { bg: 'rgba(168, 85, 247, 0.08)', border: 'rgba(168, 85, 247, 0.2)', dot: '#a855f7' },
    { bg: 'rgba(34, 197, 94, 0.08)', border: 'rgba(34, 197, 94, 0.2)', dot: '#22c55e' },
    { bg: 'rgba(249, 115, 22, 0.08)', border: 'rgba(249, 115, 22, 0.2)', dot: '#f97316' },
    { bg: 'rgba(236, 72, 153, 0.08)', border: 'rgba(236, 72, 153, 0.2)', dot: '#ec4899' },
    { bg: 'rgba(234, 179, 8, 0.08)', border: 'rgba(234, 179, 8, 0.2)', dot: '#eab308' },
  ];

  return (
    <div style={{ marginBottom: '28px' }}>
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {section.items?.map((item, i) => {
          const isString = typeof item === 'string';
          const obj = isString ? null : item;
          const title = obj?.title ?? null;
          const detail = isString ? item : obj?.detail ?? '';
          const accent = accentColors[i % accentColors.length];

          return (
            <div key={i} style={{
              display: 'flex',
              gap: '14px',
              padding: '14px 18px',
              background: accent.bg,
              borderRadius: '10px',
              border: `1px solid ${accent.border}`,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}>
              <div style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                background: `linear-gradient(135deg, ${accent.dot}22, ${accent.dot}44)`,
                color: accent.dot,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 700,
                flexShrink: 0,
                marginTop: '1px',
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                {title && <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>{title}</div>}
                <div style={{
                  fontSize: '0.88rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.65,
                  opacity: title ? 0.85 : 1,
                }}>
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
    <div style={{ marginBottom: '28px' }}>
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      {section.content && (
        <div style={{
          fontSize: '0.9rem',
          color: 'var(--text-primary)',
          lineHeight: 1.75,
          opacity: 0.92,
        }}>
          {renderMarkdown(section.content)}
        </div>
      )}
    </div>
  );
}

function TableSection({ section }: { section: ReportSection }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <div style={{
        overflowX: 'auto',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
      }}>
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
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    borderBottom: '2px solid var(--border-color)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    whiteSpace: 'nowrap',
                  }}>{col}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {section.rows?.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                {row.map((cell, j) => (
                  <td key={j} style={{
                    padding: '10px 16px',
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
    <div style={{ marginBottom: '28px' }}>
      {section.heading && <SectionHeading>{section.heading}</SectionHeading>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <div style={{
          padding: '18px',
          background: 'rgba(34, 197, 94, 0.06)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          borderRadius: '10px',
        }}>
          <div style={{
            fontWeight: 600,
            color: 'var(--accent-green)',
            marginBottom: '12px',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span style={{ fontSize: '1rem' }}>{'\u2713'}</span> Pros
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.85rem', lineHeight: 1.7 }}>
            {section.pros?.map((pro, i) => (
              <li key={i} style={{ marginBottom: '6px', color: 'var(--text-primary)' }}>{renderInline(pro)}</li>
            ))}
          </ul>
        </div>
        <div style={{
          padding: '18px',
          background: 'rgba(239, 68, 68, 0.06)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '10px',
        }}>
          <div style={{
            fontWeight: 600,
            color: 'var(--accent-red)',
            marginBottom: '12px',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span style={{ fontSize: '1rem' }}>{'\u2717'}</span> Cons
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.85rem', lineHeight: 1.7 }}>
            {section.cons?.map((con, i) => (
              <li key={i} style={{ marginBottom: '6px', color: 'var(--text-primary)' }}>{renderInline(con)}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function CalloutSection({ section }: { section: ReportSection }) {
  const variantStyles = {
    info: {
      bg: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.04) 100%)',
      border: 'rgba(59, 130, 246, 0.25)',
      accent: 'var(--accent-blue)',
      icon: '\u2139\uFE0F',
    },
    warning: {
      bg: 'linear-gradient(135deg, rgba(234, 179, 8, 0.1) 0%, rgba(234, 179, 8, 0.04) 100%)',
      border: 'rgba(234, 179, 8, 0.25)',
      accent: 'var(--accent-yellow)',
      icon: '\u26A0\uFE0F',
    },
    success: {
      bg: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.04) 100%)',
      border: 'rgba(34, 197, 94, 0.25)',
      accent: 'var(--accent-green)',
      icon: '\u2705',
    },
  };
  const v = variantStyles[section.variant ?? 'info'];

  return (
    <div style={{
      padding: '18px 22px',
      background: v.bg,
      border: `1px solid ${v.border}`,
      borderRadius: '10px',
      marginBottom: '28px',
      display: 'flex',
      gap: '14px',
      alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: '1.2rem', flexShrink: 0, marginTop: '2px' }}>{v.icon}</span>
      <div style={{ fontSize: '0.88rem', lineHeight: 1.7, color: 'var(--text-primary)' }}>
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
        padding: '20px',
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        fontSize: '0.85rem',
        lineHeight: 1.7,
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
      {/* Header with gradient accent */}
      <div style={{
        marginBottom: '36px',
        paddingBottom: '24px',
        borderBottom: '1px solid var(--border-color)',
        position: 'relative',
      }}>
        {/* Gradient top bar */}
        <div style={{
          position: 'absolute',
          top: '-24px',
          left: '-24px',
          right: '-24px',
          height: '4px',
          background: 'linear-gradient(90deg, #3b82f6 0%, #a855f7 40%, #ec4899 70%, #f97316 100%)',
          borderRadius: '12px 12px 0 0',
        }} />
        <h1 style={{
          fontSize: '1.6rem',
          fontWeight: 700,
          marginBottom: '6px',
          lineHeight: 1.3,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
        }}>{report.title}</h1>
        {report.subtitle && (
          <div style={{
            fontSize: '1rem',
            color: 'var(--text-secondary)',
            marginTop: '8px',
            lineHeight: 1.5,
          }}>{report.subtitle}</div>
        )}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginTop: '14px',
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            background: 'var(--bg-tertiary)',
            borderRadius: '20px',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--accent-green)',
            }} />
            {formatDate(report.generatedAt)}
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 12px',
            background: 'var(--bg-tertiary)',
            borderRadius: '20px',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}>
            {report.sections.length} sections
          </div>
        </div>
      </div>

      {/* Sections */}
      {report.sections.map((section, i) => renderSection(section, i))}

      {/* Conclusion */}
      {report.conclusion && (
        <div style={{
          marginTop: '36px',
          padding: '24px',
          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.06) 0%, rgba(59, 130, 246, 0.06) 100%)',
          border: '1px solid rgba(168, 85, 247, 0.15)',
          borderRadius: '12px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '14px',
          }}>
            <div style={{
              width: '4px',
              height: '20px',
              borderRadius: '2px',
              background: 'linear-gradient(180deg, var(--accent-purple) 0%, var(--accent-blue) 100%)',
            }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>Conclusion</h3>
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.75, opacity: 0.92 }}>
            {renderMarkdown(report.conclusion)}
          </div>
        </div>
      )}

      {/* Sources */}
      {(() => {
        const links = extractLinks(report);
        if (links.length === 0) return null;
        return (
          <div style={{
            marginTop: '36px',
            padding: '20px 24px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '14px',
            }}>
              <div style={{
                width: '4px',
                height: '20px',
                borderRadius: '2px',
                background: 'linear-gradient(180deg, #3b82f6 0%, #06b6d4 100%)',
              }} />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>Sources</h3>
              <span style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-muted)',
              }}>{links.length}</span>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {links.map((link, i) => (
                <li key={i} style={{
                  padding: '8px 0',
                  borderTop: i > 0 ? '1px solid var(--border-color)' : undefined,
                }}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--accent-blue, #3b82f6)',
                      textDecoration: 'none',
                      fontSize: '0.85rem',
                      lineHeight: 1.5,
                    }}
                  >
                    {link.text}
                  </a>
                  <div style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    marginTop: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {link.url}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* Footer */}
      <div style={{
        marginTop: '36px',
        paddingTop: '16px',
        borderTop: '1px solid var(--border-color)',
        fontSize: '0.72rem',
        color: 'var(--text-muted)',
        textAlign: 'center',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}>
        Generated by Autobot
      </div>
    </div>
  );
}

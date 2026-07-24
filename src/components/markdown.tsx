import React from "react";

/**
 * Minimal, dependency-free markdown renderer for agent briefs.
 * Supports: #/##/### headings, - and 1. lists, > blockquotes, **bold**,
 * `code`, and paragraphs. Good enough for the structured briefs copilots emit.
 */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(
        <strong key={`${keyBase}-b${i}`} className="font-semibold">
          {m[2]}
        </strong>
      );
    } else if (m[3] !== undefined) {
      nodes.push(
        <code
          key={`${keyBase}-c${i}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {m[3]}
        </code>
      );
    }
    last = regex.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items;
    if (list.ordered) {
      blocks.push(
        <ol key={key++} className="my-2 list-decimal space-y-1 pl-6 text-sm">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `ol${key}-${idx}`)}</li>
          ))}
        </ol>
      );
    } else {
      blocks.push(
        <ul key={key++} className="my-2 list-disc space-y-1 pl-6 text-sm">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `ul${key}-${idx}`)}</li>
          ))}
        </ul>
      );
    }
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushList();
      const level = h[1].length;
      const cls =
        level === 1
          ? "mt-4 mb-2 text-lg font-semibold"
          : level === 2
            ? "mt-3 mb-1.5 text-base font-semibold"
            : "mt-2 mb-1 text-sm font-semibold";
      blocks.push(
        <div key={key++} className={cls}>
          {renderInline(h[2], `h${key}`)}
        </div>
      );
      continue;
    }
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[1]);
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) {
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }
    const bq = /^>\s?(.*)$/.exec(line);
    if (bq) {
      flushList();
      blocks.push(
        <blockquote
          key={key++}
          className="my-2 border-l-2 border-muted-foreground/30 pl-3 text-sm italic text-muted-foreground"
        >
          {renderInline(bq[1], `bq${key}`)}
        </blockquote>
      );
      continue;
    }
    flushList();
    blocks.push(
      <p key={key++} className="my-1.5 text-sm leading-relaxed">
        {renderInline(line, `p${key}`)}
      </p>
    );
  }
  flushList();

  return <div className="text-foreground">{blocks}</div>;
}

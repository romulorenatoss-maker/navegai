import React from "react";
import ReactMarkdown from "react-markdown";
import { AssistenteBarChart, AssistenteLineChart, AssistentePieChart } from "./AssistenteCharts";
import { AssistenteReportTable } from "./AssistenteReportTable";

interface Props {
  content: string;
}

function tryParseBlock(lang: string, code: string) {
  try {
    const data = JSON.parse(code);
    switch (lang) {
      case "report-table":
        return <AssistenteReportTable data={data} />;
      case "chart-bar":
        return <AssistenteBarChart data={data} />;
      case "chart-line":
        return <AssistenteLineChart data={data} />;
      case "chart-pie":
        return <AssistentePieChart data={data} />;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function AssistenteMessageRenderer({ content }: Props) {
  // Split content into text segments and special blocks
  const blockRegex = /```(report-table|chart-bar|chart-line|chart-pie)\n([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = blockRegex.exec(content)) !== null) {
    // Text before the block
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index);
      if (text.trim()) {
        parts.push(
          <div key={key++} className="prose prose-sm dark:prose-invert max-w-none text-sm [&_table]:text-xs [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_table]:border [&_th]:border [&_td]:border [&_table]:border-border">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        );
      }
    }
    
    const rendered = tryParseBlock(match[1], match[2].trim());
    if (rendered) {
      parts.push(<React.Fragment key={key++}>{rendered}</React.Fragment>);
    } else {
      // Fallback: show as code
      parts.push(
        <pre key={key++} className="text-xs bg-muted p-2 rounded overflow-auto my-2">
          <code>{match[2].trim()}</code>
        </pre>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex);
    if (text.trim()) {
      parts.push(
        <div key={key++} className="prose prose-sm dark:prose-invert max-w-none text-sm [&_table]:text-xs [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_table]:border [&_th]:border [&_td]:border [&_table]:border-border">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      );
    }
  }

  if (parts.length === 0) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    );
  }

  return <>{parts}</>;
}

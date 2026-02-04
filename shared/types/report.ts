export type ReportSectionType = "summary" | "key-findings" | "text" | "table" | "pros-cons" | "callout";

export interface ReportSection {
  type: ReportSectionType;
  heading?: string;
  content?: string;
  items?: { title: string; detail: string }[];
  columns?: string[];
  rows?: string[][];
  pros?: string[];
  cons?: string[];
  variant?: "info" | "warning" | "success";
}

export interface StructuredReport {
  title: string;
  subtitle?: string;
  generatedAt: string;
  sections: ReportSection[];
  conclusion?: string;
}

export function parseStructuredReport(raw: string): StructuredReport | null {
  try {
    // Try to extract JSON from the output (may be wrapped in markdown fences)
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

import type { Grade, Report } from "../types.js";

const COLORS: Record<Grade, string> = {
  A: "#4c1",
  B: "#97ca00",
  C: "#dfb317",
  D: "#fe7d37",
  F: "#e05d44",
};

export function formatBadge(report: Report): string {
  const label = "clawscore";
  const message = `${report.score} ${report.grade}`;
  const color = COLORS[report.grade];
  const labelWidth = 20 + label.length * 6;
  const messageWidth = 20 + message.length * 7;
  const width = labelWidth + messageWidth;
  const labelX = labelWidth * 5;
  const messageX = (labelWidth + width) * 5;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeXml(`${label}: ${message}`)}">
  <title>${escapeXml(`${label}: ${message}`)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>
    <rect width="${width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${labelX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${labelWidth * 8}">${escapeXml(label)}</text>
    <text x="${labelX}" y="140" transform="scale(.1)" fill="#fff" textLength="${labelWidth * 8}">${escapeXml(label)}</text>
    <text aria-hidden="true" x="${messageX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${messageWidth * 7}">${escapeXml(message)}</text>
    <text x="${messageX}" y="140" transform="scale(.1)" fill="#fff" textLength="${messageWidth * 7}">${escapeXml(message)}</text>
  </g>
</svg>
`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatJsonText(text: string): string {
  const parsed = JSON.parse(text.replace(/^\uFEFF/, '')) as unknown;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

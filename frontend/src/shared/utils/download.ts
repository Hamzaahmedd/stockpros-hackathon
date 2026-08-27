// shared/utils/download.ts
// Generic browser download trigger + CSV primitives shared by all export features.

export const escapeCsv = (value: string | number): string => {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

export const toCsvRow = (cells: Array<string | number>): string => cells.map(escapeCsv).join(',');

export const triggerBrowserDownload = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

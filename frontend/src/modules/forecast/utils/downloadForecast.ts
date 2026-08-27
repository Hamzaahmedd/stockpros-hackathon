// utils/downloadForecast.ts
// Exports the forecast as a polished, sectioned CSV report using ONLY the
// data returned by the backend GET /api/v1/forecast route.
import { toCsvRow, triggerBrowserDownload } from '@/shared/utils/download';
import { ForecastData } from '../types';
import {
  DISCLAIMER,
  TABLE_COLUMNS,
  formatGeneratedAt,
  getReportFileName,
  getSummaryFields,
  getTableRows,
} from './forecastExport';

export const downloadForecastCsv = (data: ForecastData): void => {
  const lines: string[] = [
    toCsvRow(['StockPros AI — Price Forecast Report']),
    '',
    toCsvRow(['Report Summary']),
    ...getSummaryFields(data).map((field) => toCsvRow([field.label, field.value])),
    toCsvRow(['Generated At', formatGeneratedAt()]),
    '',
    toCsvRow(['Price Data']),
    toCsvRow(TABLE_COLUMNS),
    ...getTableRows(data).map((row) =>
      toCsvRow([
        row.date,
        row.typeLabel,
        row.base.toFixed(2),
        row.bull !== undefined ? row.bull.toFixed(2) : '',
        row.bear !== undefined ? row.bear.toFixed(2) : '',
      ]),
    ),
    '',
    toCsvRow(['Note', DISCLAIMER]),
  ];

  const blob = new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerBrowserDownload(blob, getReportFileName(data, 'csv'));
};

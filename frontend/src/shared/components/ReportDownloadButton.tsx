import { SECONDARY_ACTION_BTN, SECONDARY_ACTION_ICON_BTN } from '@/shared/utils/buttonStyles';
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import React from 'react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Skeleton } from './ui/skeleton';

export type ReportFormat = 'csv' | 'pdf';

interface ReportDownloadButtonProps {
  onDownload: (format: ReportFormat) => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  title?: string;
}

export const ReportDownloadButton: React.FC<ReportDownloadButtonProps> = ({
  onDownload,
  loading = false,
  disabled = false,
  title = 'Download the report',
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        disabled={disabled || loading}
        variant="outline"
        className={`flex items-center gap-2 ${SECONDARY_ACTION_BTN}`}
        title={title}
      >
        {loading ? <Skeleton className="w-4 h-4 rounded-full" /> : <Download size={16} className={SECONDARY_ACTION_ICON_BTN} />}
        {loading ? 'Generating...' : 'Download Report'}
        <ChevronDown size={14} className={SECONDARY_ACTION_ICON_BTN} />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel>Choose export format</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onDownload('pdf')} disabled={loading}>
        <FileText size={16} className="mr-2" />
        <span>PDF Report</span>
        <span className="ml-auto text-xs text-muted-foreground">Presentation-ready</span>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onDownload('csv')} disabled={loading}>
        <FileSpreadsheet size={16} className="mr-2" />
        <span>CSV (Excel)</span>
        <span className="ml-auto text-xs text-muted-foreground">Spreadsheet</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
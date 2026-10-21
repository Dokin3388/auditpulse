export interface GoogleSheetSyncRun {
  id: string;
  sourceId: 'sales-operations' | 'sale-issues' | 'audit-team';
  sheetName: string;
  deliveryId: string;
  receivedAt: string;
  completedAt?: string | null;
  status: 'RECEIVED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  appliedRows: number;
  skippedRows: number;
  errorMessage?: string | null;
}

interface ApiListResponse<T> {
  data: T[];
}

export async function getGoogleSheetSyncRuns(): Promise<GoogleSheetSyncRun[]> {
  const response = await fetch('/api/sync/google-sheets/status');
  if (!response.ok) {
    throw new Error('Không thể tải trạng thái đồng bộ từ Neon.');
  }
  const payload = (await response.json()) as ApiListResponse<GoogleSheetSyncRun>;
  return payload.data;
}

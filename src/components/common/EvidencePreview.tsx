import React, { useState } from 'react';
import type { Evidence } from '../../types';
import { FileText, ExternalLink, X, ShieldCheck, Clock, User } from 'lucide-react';

interface EvidencePreviewProps {
  evidenceList: Evidence[];
  allowAdd?: boolean;
  onAddEvidence?: (evidence: Evidence) => void;
  title?: string;
  readOnly?: boolean;
}

export const EvidencePreview: React.FC<EvidencePreviewProps> = ({
  evidenceList,
  allowAdd = false,
  onAddEvidence,
  title = 'Bằng chứng & Tài liệu đính kèm',
  readOnly = false,
}) => {
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newCaption, setNewCaption] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newType, setNewType] = useState<'IMAGE' | 'DOCUMENT' | 'LINK'>('IMAGE');

  const handleCreateMockEvidence = () => {
    if (!newCaption.trim()) return;
    const mockEvidence: Evidence = {
      id: `EVI-${Date.now()}`,
      type: newType,
      fileName: newType === 'IMAGE' ? 'screenshot_proof.png' : 'bien_ban_xac_nhan.pdf',
      fileSize: '380 KB',
      fileUrl: newUrl.trim() || 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=80',
      thumbnailUrl: newUrl.trim() || 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=120&auto=format&fit=crop&q=80',
      caption: newCaption,
      uploadedByRole: 'SALE',
      uploadedByName: 'Người dùng hiện tại',
      uploadedAt: new Date().toISOString(),
    };

    if (onAddEvidence) {
      onAddEvidence(mockEvidence);
    }
    setNewCaption('');
    setNewUrl('');
    setIsAdding(false);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
          {title} ({evidenceList.length})
        </h4>
        {allowAdd && !readOnly && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="text-xs font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white inline-flex items-center gap-1"
          >
            + Tải lên bằng chứng
          </button>
        )}
      </div>

      {evidenceList.length === 0 ? (
        <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-md p-3 text-center text-xs text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
          Chưa có file hoặc ảnh bằng chứng nào được tải lên.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {evidenceList.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedEvidence(item)}
              className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-md p-2.5 flex items-start gap-2.5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700">
                {item.type === 'IMAGE' ? (
                  <img
                    src={item.thumbnailUrl || item.fileUrl}
                    alt={item.caption || item.fileName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FileText className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                  {item.caption || item.fileName}
                </p>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                  <span>{item.type}</span>
                  {item.fileSize && <span>• {item.fileSize}</span>}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                  <User className="w-2.5 h-2.5 text-slate-400" />
                  <span className="truncate">{item.uploadedByName} ({item.uploadedByRole})</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40">
          <div className="bg-white dark:bg-slate-900 rounded-lg max-w-md w-full p-4 border border-slate-200 dark:border-slate-800 space-y-3 shadow-lg">
            <div className="flex items-center justify-between border-b pb-2.5 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Bổ sung Bằng chứng / Biên bản (Tối giản)
              </h3>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Mô tả bằng chứng / Chú thích *
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Ảnh chụp màn hình email gửi báo giá chuẩn cho khách"
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Loại bằng chứng
                </label>
                <div className="flex gap-2">
                  {(['IMAGE', 'DOCUMENT', 'LINK'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewType(t)}
                      className={`flex-1 py-1 text-xs rounded border transition-colors ${
                        newType === t
                          ? 'border-slate-900 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  URL / Đường dẫn file (tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder="Để trống sẽ dùng link mẫu demo"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleCreateMockEvidence}
                disabled={!newCaption.trim()}
                className={`px-3 py-1.5 text-white font-medium rounded-md transition-colors ${
                  newCaption.trim()
                    ? 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-300 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
              >
                Lưu bằng chứng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Detail Modal */}
      {selectedEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50">
          <div className="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full p-4 border border-slate-200 dark:border-slate-800 space-y-3 shadow-lg">
            <div className="flex items-center justify-between border-b pb-2 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {selectedEvidence.caption || selectedEvidence.fileName}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {selectedEvidence.type}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvidence(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {selectedEvidence.type === 'IMAGE' ? (
                <div className="rounded border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-950 max-h-96 flex items-center justify-center">
                  <img
                    src={selectedEvidence.fileUrl}
                    alt={selectedEvidence.caption}
                    className="max-h-96 w-auto object-contain"
                  />
                </div>
              ) : (
                <div className="p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-850 text-center space-y-2">
                  <FileText className="w-10 h-10 text-slate-400 mx-auto" />
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {selectedEvidence.fileName}
                  </p>
                  <a
                    href={selectedEvidence.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-slate-700 hover:underline dark:text-slate-300"
                  >
                    <span>Mở file đính kèm</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <div className="p-2.5 bg-slate-50 dark:bg-slate-850 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <User className="w-3 h-3 text-slate-400" />
                  <span>
                    Người tải: <strong>{selectedEvidence.uploadedByName}</strong> ({selectedEvidence.uploadedByRole})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{new Date(selectedEvidence.uploadedAt).toLocaleString('vi-VN')}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setSelectedEvidence(null)}
                className="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

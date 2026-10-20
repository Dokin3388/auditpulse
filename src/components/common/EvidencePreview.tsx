import React, { useState } from 'react';
import { Evidence } from '../../types';
import { FileText, Image as ImageIcon, ExternalLink, X, Download, ShieldCheck, Clock, User } from 'lucide-react';
import { Badge } from './Badge';

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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-brand-600" />
          {title} ({evidenceList.length})
        </h4>
        {allowAdd && !readOnly && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 inline-flex items-center gap-1"
          >
            + Tải lên bằng chứng
          </button>
        )}
      </div>

      {evidenceList.length === 0 ? (
        <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-4 text-center text-xs text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
          Chưa có file hoặc ảnh bằng chứng nào được tải lên.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {evidenceList.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedEvidence(item)}
              className="group border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-850 rounded-lg p-2.5 flex items-start gap-3 hover:border-brand-500 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="w-12 h-12 rounded bg-slate-100 dark:bg-slate-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-200/80 dark:border-slate-700">
                {item.type === 'IMAGE' ? (
                  <img
                    src={item.thumbnailUrl || item.fileUrl}
                    alt={item.caption || item.fileName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <FileText className="w-6 h-6 text-slate-400 group-hover:text-brand-500 transition-colors" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-brand-600">
                  {item.caption || item.fileName}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                  <span>{item.fileSize || 'Link'}</span>
                  <span>•</span>
                  <span>{new Date(item.uploadedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <User className="w-3 h-3 text-slate-400" />
                  <span className="truncate">{item.uploadedByName}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Đính kèm bằng chứng khắc phục
              </h3>
              <button
                onClick={() => setIsAdding(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Mô tả / Nội dung bằng chứng *
                </label>
                <input
                  type="text"
                  placeholder="VD: Ảnh chụp màn hình chốt hợp đồng Zalo..."
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  className="w-full text-xs px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  Loại tài liệu
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['IMAGE', 'DOCUMENT', 'LINK'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewType(t)}
                      className={`text-xs py-1.5 rounded border text-center transition-all ${
                        newType === t
                          ? 'bg-brand-50 border-brand-500 text-brand-700 dark:bg-brand-950 dark:text-brand-300 font-medium'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t === 'IMAGE' ? 'Ảnh / Chụp MH' : t === 'DOCUMENT' ? 'File PDF' : 'Liên kết'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                  URL ảnh / tài liệu (Tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder="Để trống sẽ dùng ảnh minh họa thực tế"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full text-xs px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleCreateMockEvidence}
                disabled={!newCaption.trim()}
                className="px-4 py-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                Tải lên
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / Detail Modal */}
      {selectedEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-brand-600" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate max-w-md">
                  {selectedEvidence.caption || selectedEvidence.fileName}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvidence(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Preview */}
            <div className="p-4 bg-slate-950 flex items-center justify-center max-h-[460px] overflow-hidden">
              {selectedEvidence.type === 'IMAGE' ? (
                <img
                  src={selectedEvidence.fileUrl}
                  alt={selectedEvidence.caption}
                  className="max-h-[440px] max-w-full object-contain rounded"
                />
              ) : (
                <div className="py-16 text-center text-slate-300 space-y-3">
                  <FileText className="w-16 h-16 mx-auto text-brand-400" />
                  <p className="text-sm font-medium">{selectedEvidence.fileName}</p>
                  <p className="text-xs text-slate-400">{selectedEvidence.fileSize}</p>
                </div>
              )}
            </div>

            {/* Metadata Footer per Spec */}
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 text-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  <span>
                    Người tải: <strong className="text-slate-700 dark:text-slate-200">{selectedEvidence.uploadedByName}</strong> ({selectedEvidence.uploadedByRole})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{new Date(selectedEvidence.uploadedAt).toLocaleString('vi-VN')}</span>
                </div>
              </div>

              <a
                href={selectedEvidence.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:text-brand-600 hover:border-brand-500 font-medium text-xs transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Mở link gốc
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

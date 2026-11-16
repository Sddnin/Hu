'use client';

import { ChangeEvent, DragEvent, FormEvent, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Tag,
  Upload,
  X,
} from 'lucide-react';
import {
  ColumnMapping,
  ParsedVocabularyWorkbook,
  detectColumns,
  downloadSampleCsvTemplate,
  mapRowsToImportCards,
  parseVocabularyFile,
} from '@/lib/import-export';
import { LIMITS, normalizeTags } from '@/lib/types';

export interface BulkImportCardPayload {
  term: string;
  meaning: string;
  phonetic?: string;
  partOfSpeech?: string;
  example?: string;
  tags?: string[];
}

interface BulkImportModalProps {
  open: boolean;
  deckTitle: string;
  existingTags: string[];
  onClose: () => void;
  onImportCards: (items: BulkImportCardPayload[]) => Promise<void>;
}

const COLUMN_FIELDS: Array<{
  key: keyof ColumnMapping;
  label: string;
  required?: boolean;
}> = [
  { key: 'term', label: 'Từ vựng', required: true },
  { key: 'meaning', label: 'Nghĩa', required: true },
  { key: 'phonetic', label: 'Phiên âm (IPA)' },
  { key: 'partOfSpeech', label: 'Từ loại' },
  { key: 'example', label: 'Câu ví dụ' },
  { key: 'tags', label: 'Nhãn chủ đề' },
];

export function BulkImportModal({
  open,
  deckTitle,
  existingTags,
  onClose,
  onImportCards,
}: BulkImportModalProps) {
  const [tab, setTab] = useState<'file' | 'text'>('file');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File / Excel / CSV state
  const [dragging, setDragging] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);
  const [workbook, setWorkbook] = useState<ParsedVocabularyWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [skipHeader, setSkipHeader] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping>({
    term: 0,
    meaning: 1,
    phonetic: 2,
    partOfSpeech: 3,
    example: 4,
    tags: 5,
  });

  // Shared batch tags applied to all imported cards
  const [batchTagInput, setBatchTagInput] = useState('');

  // Text paste state
  const [bulkText, setBulkText] = useState('');

  const activeSheet = workbook?.sheets[sheetIndex] || null;

  const columnHeaders = useMemo(() => {
    if (!activeSheet) return [];
    const maxCols = activeSheet.rows.reduce((m, r) => Math.max(m, r.length), 0);
    const firstRow = activeSheet.rows[0] || [];
    return Array.from({ length: maxCols }, (_, i) => {
      const cell = firstRow[i]?.trim();
      return skipHeader && cell ? cell : `Cột ${i + 1}`;
    });
  }, [activeSheet, skipHeader]);

  const batchTags = useMemo(() => normalizeTags(batchTagInput), [batchTagInput]);

  const filePreview = useMemo(() => {
    if (!activeSheet) return { validCards: [], skippedRows: 0 };
    return mapRowsToImportCards(activeSheet.rows, mapping, skipHeader, batchTags);
  }, [activeSheet, mapping, skipHeader, batchTags]);

  const parsedTextCards = useMemo(() => {
    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const items: BulkImportCardPayload[] = [];
    for (const line of lines) {
      const parts = line.includes('|')
        ? line.split('|')
        : line.includes('\t')
          ? line.split('\t')
          : line.split(' - ');
      const cleaned = parts.map((p) => p.trim());
      if (cleaned.length >= 2 && cleaned[0] && cleaned[1]) {
        const lineTags = normalizeTags([
          ...normalizeTags(cleaned[4] || ''),
          ...batchTags,
        ]);
        items.push({
          term: cleaned[0],
          meaning: cleaned[1],
          phonetic: cleaned[2] || '',
          example: cleaned[3] || '',
          tags: lineTags,
        });
      }
    }
    return items.slice(0, LIMITS.IMPORT_BATCH_MAX);
  }, [bulkText, batchTags]);

  if (!open) return null;

  function applySheetDetection(rows: string[][]) {
    const detected = detectColumns(rows);
    setSkipHeader(detected.hasHeader);
    setMapping(detected.mapping);
  }

  async function processFile(file: File) {
    setError(null);
    setParsingFile(true);
    try {
      const parsed = await parseVocabularyFile(file);
      if (parsed.sheets.length === 0) {
        setWorkbook(null);
        setError('Tệp không có dữ liệu hoặc định dạng chưa được hỗ trợ.');
        return;
      }
      setWorkbook(parsed);
      setSheetIndex(0);
      applySheetDetection(parsed.sheets[0].rows);
    } catch {
      setWorkbook(null);
      setError(
        'Không đọc được tệp. Hãy kiểm tra tệp .csv, .tsv, .xlsx hoặc .xls hợp lệ.'
      );
    } finally {
      setParsingFile(false);
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processFile(file);
  }

  async function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  }

  function handleSelectSheet(nextIdx: number) {
    setSheetIndex(nextIdx);
    const nextSheet = workbook?.sheets[nextIdx];
    if (nextSheet) {
      applySheetDetection(nextSheet.rows);
    }
  }

  function toggleQuickBatchTag(tag: string) {
    const current = normalizeTags(batchTagInput);
    const exists = current.some((t) => t.toLowerCase() === tag.toLowerCase());
    const next = exists
      ? current.filter((t) => t.toLowerCase() !== tag.toLowerCase())
      : [...current, tag];
    setBatchTagInput(next.join(', '));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const itemsToImport =
      tab === 'file' ? filePreview.validCards : parsedTextCards;

    if (itemsToImport.length === 0) {
      setError(
        tab === 'file'
          ? 'Chưa có dòng nào hợp lệ (cần ít nhất cột Từ vựng và Nghĩa).'
          : 'Chưa nhận diện được thẻ hợp lệ. Dùng định dạng: từ | nghĩa | phiên âm | ví dụ | nhãn'
      );
      return;
    }

    setSubmitting(true);
    try {
      await onImportCards(itemsToImport);
      setWorkbook(null);
      setBulkText('');
      setBatchTagInput('');
      onClose();
    } catch {
      setError('Có lỗi xảy ra khi lưu thẻ. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  const readyCount =
    tab === 'file' ? filePreview.validCards.length : parsedTextCards.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-modal-title"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl sm:p-6">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="bulk-modal-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              Nhập thẻ từ vựng hàng loạt
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Thêm vào bộ “{deckTitle}” từ tệp CSV / Excel hoặc dán văn bản (tối đa{' '}
              {LIMITS.IMPORT_BATCH_MAX} thẻ/lần).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Switch Tabs */}
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
          <button
            type="button"
            onClick={() => {
              setTab('file');
              setError(null);
            }}
            className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              tab === 'file'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Tệp CSV / Excel</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('text');
              setError(null);
            }}
            className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              tab === 'text'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Dán danh sách</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {tab === 'file' ? (
            <div className="space-y-4">
              {/* Sample Template & Upload Dropzone */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  Hỗ trợ <code className="font-mono-tabular">.csv</code>,{' '}
                  <code className="font-mono-tabular">.tsv</code>,{' '}
                  <code className="font-mono-tabular">.xlsx</code>,{' '}
                  <code className="font-mono-tabular">.xls</code>
                </span>
                <button
                  type="button"
                  onClick={downloadSampleCsvTemplate}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Tải file CSV mẫu</span>
                </button>
              </div>

              {!workbook ? (
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
                    dragging
                      ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/30'
                      : 'border-slate-300 bg-slate-50/70 hover:border-sky-500 hover:bg-sky-50/40 dark:border-slate-700 dark:bg-slate-950/60 dark:hover:border-sky-500'
                  }`}
                >
                  <Upload
                    className="h-7 w-7 text-sky-600 dark:text-sky-400"
                    aria-hidden="true"
                  />
                  <span className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {parsingFile
                      ? 'Đang đọc tệp từ vựng...'
                      : 'Chọn tệp hoặc kéo thả vào đây'}
                  </span>
                  <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Tự động nhận diện cột Từ vựng, Nghĩa, Phiên âm, Từ loại, Ví dụ, Nhãn
                  </span>
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt,.xlsx,.xls,.ods"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
              ) : (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                  {/* File summary header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {workbook.fileName}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {activeSheet?.rows.length || 0} dòng ·{' '}
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {filePreview.validCards.length} thẻ hợp lệ
                        </span>
                        {filePreview.skippedRows > 0 &&
                          ` · Bỏ qua ${filePreview.skippedRows} dòng thiếu từ/nghĩa`}
                      </div>
                    </div>

                    <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Chọn tệp khác</span>
                      <input
                        type="file"
                        accept=".csv,.tsv,.txt,.xlsx,.xls,.ods"
                        onChange={handleFileChange}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  {/* Sheet selector & header checkbox */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {workbook.sheets.length > 1 && (
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor="import-sheet-select"
                          className="text-xs font-medium text-slate-600 dark:text-slate-400"
                        >
                          Trang tính (Sheet):
                        </label>
                        <select
                          id="import-sheet-select"
                          value={sheetIndex}
                          onChange={(e) =>
                            handleSelectSheet(Number(e.target.value))
                          }
                          className="min-h-[34px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        >
                          {workbook.sheets.map((s, idx) => (
                            <option key={s.name} value={idx}>
                              {s.name} ({s.rows.length} dòng)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={skipHeader}
                        onChange={(e) => setSkipHeader(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600"
                      />
                      <span>Dòng đầu tiên là tiêu đề cột</span>
                    </label>
                  </div>

                  {/* Column Mapping */}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {COLUMN_FIELDS.map((field) => (
                      <div key={field.key}>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          {field.label}
                          {field.required ? ' *' : ''}
                        </label>
                        <select
                          value={mapping[field.key]}
                          onChange={(e) =>
                            setMapping((prev) => ({
                              ...prev,
                              [field.key]: Number(e.target.value),
                            }))
                          }
                          className="mt-1 min-h-[36px] w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <option value={-1}>— Bỏ qua —</option>
                          {columnHeaders.map((headerLabel, colIdx) => (
                            <option key={colIdx} value={colIdx}>
                              {headerLabel}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Preview Table (first 5 valid cards) */}
                  {filePreview.validCards.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                          <tr>
                            <th className="px-2.5 py-2">Từ vựng</th>
                            <th className="px-2.5 py-2">Nghĩa</th>
                            <th className="px-2.5 py-2">Phiên âm / Loại</th>
                            <th className="px-2.5 py-2">Nhãn chủ đề</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filePreview.validCards.slice(0, 5).map((card, i) => (
                            <tr key={`${card.term}_${i}`}>
                              <td className="px-2.5 py-2 font-semibold text-slate-900 dark:text-slate-100">
                                {card.term}
                              </td>
                              <td className="px-2.5 py-2 text-slate-700 dark:text-slate-300">
                                {card.meaning}
                              </td>
                              <td className="px-2.5 py-2 text-slate-500 dark:text-slate-400">
                                {[card.phonetic, card.partOfSpeech]
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </td>
                              <td className="px-2.5 py-2 text-slate-600 dark:text-slate-300">
                                {card.tags.length > 0
                                  ? card.tags.map((t) => `#${t}`).join(', ')
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filePreview.validCards.length > 5 && (
                        <div className="border-t border-slate-100 px-2.5 py-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          ... và {filePreview.validCards.length - 5} thẻ khác sẽ được nhập.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="mb-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Mỗi dòng một thẻ theo mẫu:{' '}
                <code className="font-mono-tabular">
                  từ | nghĩa | phiên âm | ví dụ | nhãn
                </code>{' '}
                (phiên âm, ví dụ và nhãn là tùy chọn).
              </p>
              <textarea
                rows={6}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={
                  'ephemeral | ngắn ngủi, chóng tàn | /ɪˈfem.ər.əl/ | Fame can be ephemeral. | học thuật, văn học\neloquent | hùng biện, lưu loát | /ˈel.ə.kwənt/ | She gave an eloquent speech. | giao tiếp'
                }
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono-tabular text-xs text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          )}

          {/* Optional batch topic tags for all imported cards */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
            <label
              htmlFor="bulk-batch-tags-input"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              <Tag className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              <span>Gắn nhãn chủ đề cho cả đợt nhập (tùy chọn)</span>
            </label>
            <input
              id="bulk-batch-tags-input"
              type="text"
              value={batchTagInput}
              onChange={(e) => setBatchTagInput(e.target.value)}
              placeholder="Ví dụ: công việc, du lịch (ngăn cách bằng dấu phẩy)"
              className="mt-1.5 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {existingTags.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Nhãn có sẵn:
                </span>
                {existingTags.slice(0, 10).map((tag) => {
                  const active = batchTags.some(
                    (t) => t.toLowerCase() === tag.toLowerCase()
                  );
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleQuickBatchTag(tag)}
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                        active
                          ? 'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/50 dark:text-sky-300'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting || readyCount === 0}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 cursor-pointer"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              <span>
                {submitting
                  ? 'Đang nhập...'
                  : readyCount > 0
                    ? `Nhập ${readyCount} thẻ vào bộ`
                    : 'Nhập thẻ vào bộ'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

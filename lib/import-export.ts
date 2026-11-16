import { Flashcard, LIMITS, normalizeTags } from './types';

export interface ParsedSheetData {
  name: string;
  rows: string[][];
}

export interface ParsedVocabularyWorkbook {
  fileName: string;
  sheets: ParsedSheetData[];
}

export interface ColumnMapping {
  term: number;
  meaning: number;
  phonetic: number;
  partOfSpeech: number;
  example: number;
  tags: number;
}

export interface ImportCardCandidate {
  term: string;
  meaning: string;
  phonetic: string;
  partOfSpeech: string;
  example: string;
  tags: string[];
}

function stripDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function detectDelimiter(text: string): string {
  const candidates = [',', ';', '\t', '|'];
  const sampleLines: string[] = [];
  let inQuotes = false;
  let cur = '';

  for (let i = 0; i < text.length && sampleLines.length < 8; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (cur.trim().length > 0) sampleLines.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim().length > 0 && sampleLines.length < 8) {
    sampleLines.push(cur);
  }

  if (sampleLines.length === 0) return ',';

  let bestDelimiter = ',';
  let bestScore = -1;

  for (const delim of candidates) {
    const counts = sampleLines.map((line) => {
      let count = 0;
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') quoted = !quoted;
        else if (ch === delim && !quoted) count++;
      }
      return count;
    });
    const nonZero = counts.filter((c) => c > 0);
    if (nonZero.length === 0) continue;
    const avg = nonZero.reduce((a, b) => a + b, 0) / sampleLines.length;
    const consistencyBonus = nonZero.length === sampleLines.length ? 2 : 0;
    const score = avg + consistencyBonus;
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

export function parseDelimitedText(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '');
  if (!text.trim()) return [];

  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);

  return rows;
}

export async function parseVocabularyFile(
  file: File
): Promise<ParsedVocabularyWorkbook> {
  const lower = file.name.toLowerCase();
  if (
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    lower.endsWith('.ods')
  ) {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheets: ParsedSheetData[] = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: '',
      });
      const rows = matrix
        .map((r) =>
          Array.isArray(r) ? r.map((cell) => String(cell ?? '').trim()) : []
        )
        .filter((r) => r.some((c) => c.length > 0));
      return { name: sheetName, rows };
    }).filter((s) => s.rows.length > 0);

    return { fileName: file.name, sheets };
  }

  const text = await file.text();
  const rows = parseDelimitedText(text);
  return {
    fileName: file.name,
    sheets: rows.length > 0 ? [{ name: 'CSV', rows }] : [],
  };
}

const HEADER_SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  term: [
    'term',
    'word',
    'vocabulary',
    'vocab',
    'english',
    'front',
    'tu',
    'tu vung',
    'tieng anh',
    'mat truoc',
  ],
  meaning: [
    'meaning',
    'definition',
    'def',
    'vietnamese',
    'translation',
    'translate',
    'back',
    'nghia',
    'nghia tieng viet',
    'tieng viet',
    'dich',
    'mat sau',
    'giai nghia',
  ],
  phonetic: [
    'phonetic',
    'ipa',
    'pronunciation',
    'phien am',
    'cach doc',
  ],
  partOfSpeech: [
    'part of speech',
    'partofspeech',
    'pos',
    'type',
    'word type',
    'tu loai',
    'loai tu',
  ],
  example: [
    'example',
    'sentence',
    'sample',
    'context',
    'vi du',
    'cau vi du',
    'ngu canh',
  ],
  tags: [
    'tag',
    'tags',
    'topic',
    'topics',
    'label',
    'labels',
    'category',
    'nhan',
    'nhan chu de',
    'chu de',
    'nhom',
  ],
};

function matchHeaderField(headerCell: string): keyof ColumnMapping | null {
  const norm = stripDiacritics(headerCell);
  if (!norm) return null;

  for (const [field, aliases] of Object.entries(HEADER_SYNONYMS) as Array<
    [keyof ColumnMapping, string[]]
  >) {
    if (aliases.includes(norm)) return field;
  }

  for (const [field, aliases] of Object.entries(HEADER_SYNONYMS) as Array<
    [keyof ColumnMapping, string[]]
  >) {
    if (aliases.some((alias) => norm.includes(alias) && alias.length >= 3)) {
      return field;
    }
  }

  return null;
}

export function detectColumns(rows: string[][]): {
  hasHeader: boolean;
  headers: string[];
  mapping: ColumnMapping;
} {
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const firstRow = rows[0] || [];
  const mapping: ColumnMapping = {
    term: -1,
    meaning: -1,
    phonetic: -1,
    partOfSpeech: -1,
    example: -1,
    tags: -1,
  };

  let headerMatches = 0;
  for (let col = 0; col < firstRow.length; col++) {
    const matched = matchHeaderField(firstRow[col] || '');
    if (matched && mapping[matched] === -1) {
      mapping[matched] = col;
      headerMatches++;
    }
  }

  const hasHeader =
    headerMatches >= 2 ||
    (headerMatches === 1 && (mapping.term !== -1 || mapping.meaning !== -1));

  if (!hasHeader) {
    mapping.term = maxCols >= 1 ? 0 : -1;
    mapping.meaning = maxCols >= 2 ? 1 : -1;
    mapping.phonetic = maxCols >= 3 ? 2 : -1;
    mapping.partOfSpeech = maxCols >= 4 ? 3 : -1;
    mapping.example = maxCols >= 5 ? 4 : -1;
    mapping.tags = maxCols >= 6 ? 5 : -1;
  } else {
    if (mapping.term === -1 && maxCols >= 1) mapping.term = 0;
    if (mapping.meaning === -1 && maxCols >= 2) {
      mapping.meaning = mapping.term === 1 ? 0 : 1;
    }
  }

  const headers = Array.from({ length: maxCols }, (_, i) => {
    const raw = firstRow[i]?.trim();
    return hasHeader && raw ? raw : `Cột ${i + 1}`;
  });

  return { hasHeader, headers, mapping };
}

export function mapRowsToImportCards(
  rows: string[][],
  mapping: ColumnMapping,
  skipHeader: boolean,
  defaultTags: string[] = []
): { validCards: ImportCardCandidate[]; skippedRows: number } {
  const startIndex = skipHeader ? 1 : 0;
  const validCards: ImportCardCandidate[] = [];
  let skippedRows = 0;

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i] || [];
    const term =
      mapping.term >= 0 ? (row[mapping.term] || '').trim().slice(0, LIMITS.TERM_MAX) : '';
    const meaning =
      mapping.meaning >= 0
        ? (row[mapping.meaning] || '').trim().slice(0, LIMITS.MEANING_MAX)
        : '';

    if (!term || !meaning) {
      skippedRows++;
      continue;
    }

    const phonetic =
      mapping.phonetic >= 0
        ? (row[mapping.phonetic] || '').trim().slice(0, LIMITS.PHONETIC_MAX)
        : '';
    const partOfSpeech =
      mapping.partOfSpeech >= 0
        ? (row[mapping.partOfSpeech] || '').trim().slice(0, LIMITS.POS_MAX)
        : '';
    const example =
      mapping.example >= 0
        ? (row[mapping.example] || '').trim().slice(0, LIMITS.EXAMPLE_MAX)
        : '';
    const rawTags = mapping.tags >= 0 ? row[mapping.tags] || '' : '';
    const mergedTags = normalizeTags([...normalizeTags(rawTags), ...defaultTags]);

    validCards.push({
      term,
      meaning,
      phonetic,
      partOfSpeech,
      example,
      tags: mergedTags,
    });

    if (validCards.length >= LIMITS.IMPORT_BATCH_MAX) {
      break;
    }
  }

  return { validCards, skippedRows };
}

function escapeCsvCell(value: string): string {
  const needsQuotes = /[",\r\n]/.test(value);
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function downloadSampleCsvTemplate() {
  const header = ['Từ vựng', 'Nghĩa', 'Phiên âm', 'Từ loại', 'Ví dụ', 'Nhãn chủ đề'];
  const sampleRows = [
    [
      'itinerary',
      'lịch trình chuyến đi',
      '/aɪˈtɪn.ər.er.i/',
      'noun',
      'We planned a flexible itinerary for our trip to Da Nang.',
      'du lịch, kế hoạch',
    ],
    [
      'boarding pass',
      'thẻ lên máy bay',
      '/ˈbɔː.dɪŋ pɑːs/',
      'noun',
      'Please keep your passport and boarding pass ready at the gate.',
      'du lịch, sân bay',
    ],
    [
      'agenda',
      'chương trình nghị sự, nội dung cuộc họp',
      '/əˈdʒen.də/',
      'noun',
      'Let us review the first item on today’s meeting agenda.',
      'công việc, họp nhóm',
    ],
    [
      'negotiate',
      'đàm phán, thương lượng',
      '/nəˈɡəʊ.ʃi.eɪt/',
      'verb',
      'Both partners agreed to negotiate a fair delivery schedule.',
      'công việc, kinh doanh',
    ],
  ];

  const csv = [header, ...sampleRows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n');

  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lexicard_mau_tu_vung.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadDeckCsv(deckTitle: string, cards: Flashcard[]) {
  if (cards.length === 0) return;
  const header = ['Từ vựng', 'Nghĩa', 'Phiên âm', 'Từ loại', 'Ví dụ', 'Nhãn chủ đề'];
  const rows = cards.map((c) => [
    c.term,
    c.meaning,
    c.phonetic || '',
    c.partOfSpeech || '',
    c.example || '',
    (c.tags || []).join('; '),
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n');

  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName =
    deckTitle
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]+/gu, '_')
      .replace(/^_+|_+$/g, '') || 'lexicard_deck';
  a.download = `${safeName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

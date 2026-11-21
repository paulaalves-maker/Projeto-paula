import * as XLSX from 'xlsx';
import {
  ETAPA_KANBAN_LABELS,
  ETAPA_KANBAN_ORDER,
  EtapaKanban,
  ExpiredItem,
  ExpiredItemInput,
  ItemExit,
  MOTIVO_SAIDA_LABELS,
  STATUS_LABELS,
  StatusTratativa,
  VALID_DATE_REGEX,
  formatIsoToBrDate,
  getMissingItemFields,
  normalizeObservacaoStatus,
  sanitizeItemInput,
} from '../types/inventory';

export interface ColumnMapping {
  descricao: string;
  unidade: string;
  lote: string;
  dataValidade: string;
  saldoAtual: string;
  ruaPalete: string;
  paleteOpcional: string;
  observacoes: string;
}

export interface ParsedWorkbookData {
  fileName: string;
  sheetNames: string[];
  activeSheet: string;
  headers: string[];
  rawRows: Record<string, unknown>[];
  mapping: ColumnMapping;
}

export interface MappedPreviewRow {
  rowIndex: number;
  selected: boolean;
  data: ExpiredItemInput;
  missingFields: string[];
  hasBlankFields: boolean;
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function parsePtBrNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (typeof value !== 'string') {
    return Number.NaN;
  }
  const cleaned = value.trim().replace(/\s+/g, '');
  if (!cleaned) return Number.NaN;

  // Handle PT-BR format "1.250,50" or "48,5" vs US format "1250.50"
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  let normalized = cleaned;
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  }

  // Remove any unit suffixes like "un", "cx", "kg"
  const numericOnly = normalized.replace(/[^0-9.-]/g, '');
  if (!numericOnly) return Number.NaN;
  const parsed = Number(numericOnly);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseDateToISO(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 1000 && value < 100000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const y = String(parsed.y).padStart(4, '0');
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(value).trim();
  if (!str) return '';

  if (VALID_DATE_REGEX.test(str)) {
    return str;
  }

  // YYYY/MM/DD
  const isoSlash = str.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
  if (isoSlash) {
    return `${isoSlash[1]}-${isoSlash[2].padStart(2, '0')}-${isoSlash[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (also supports 2-digit year)
  const brMatch = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s.*)?$/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    let year = brMatch[3];
    if (year.length === 2) {
      year = Number(year) >= 70 ? `19${year}` : `20${year}`;
    }
    const iso = `${year}-${month}-${day}`;
    const testDate = new Date(`${iso}T00:00:00`);
    if (!Number.isNaN(testDate.getTime()) && Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return iso;
    }
  }

  // MM/YYYY or MM-YYYY -> YYYY-MM-01
  const monthYearMatch = str.match(/^(\d{1,2})[\/\-.](\d{4})$/);
  if (monthYearMatch) {
    const monthNum = Number(monthYearMatch[1]);
    if (monthNum >= 1 && monthNum <= 12) {
      return `${monthYearMatch[2]}-${String(monthNum).padStart(2, '0')}-01`;
    }
  }

  return '';
}

function findBestHeader(headers: string[], candidates: string[]): string {
  const normalizedHeaders = headers.map((h) => ({ original: h, norm: normalizeHeader(h) }));

  for (const candidate of candidates) {
    const exact = normalizedHeaders.find((h) => h.norm === candidate);
    if (exact) return exact.original;
  }

  for (const candidate of candidates) {
    const partial = normalizedHeaders.find((h) => h.norm.includes(candidate));
    if (partial) return partial.original;
  }

  return '';
}

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const ruaPaleteCombined = findBestHeader(headers, [
    'rua palete',
    'rua e palete',
    'ruapalete',
    'endereco',
    'localizacao',
    'posicao',
    'loc',
  ]);

  const ruaOnly = ruaPaleteCombined ? '' : findBestHeader(headers, ['rua', 'corredor', 'ala']);
  const paleteOnly = findBestHeader(headers, ['palete', 'pallet', 'posicao palete', 'box']);

  return {
    descricao: findBestHeader(headers, [
      'descricao do produto',
      'descricao produto',
      'descricao',
      'produto',
      'nome do produto',
      'item',
      'mercadoria',
      'desc',
    ]),
    unidade: findBestHeader(headers, [
      'unidade',
      'unid',
      'und',
      'un',
      'um',
      'u m',
      'medida',
      'embalagem',
      'unit',
    ]),
    lote: findBestHeader(headers, ['lote', 'num lote', 'codigo lote', 'batch', 'lot']),
    dataValidade: findBestHeader(headers, [
      'data de validade',
      'dt validade',
      'validade',
      'vencimento',
      'data vencimento',
      'dt vencimento',
      'expiracao',
      'data',
    ]),
    saldoAtual: findBestHeader(headers, [
      'saldo atual',
      'saldo',
      'quantidade',
      'qtd',
      'qtde',
      'estoque',
      'saldo vencido',
      'volume',
    ]),
    ruaPalete: ruaPaleteCombined || ruaOnly,
    paleteOpcional: !ruaPaleteCombined && paleteOnly && paleteOnly !== ruaOnly ? paleteOnly : '',
    observacoes: findBestHeader(headers, ['observacoes', 'observacao', 'obs', 'notas', 'motivo']),
  };
}

function extractSheetRows(workbook: XLSX.WorkBook, sheetName: string): {
  headers: string[];
  rawRows: Record<string, unknown>[];
} {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { headers: [], rawRows: [] };

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (matrix.length === 0) return { headers: [], rawRows: [] };

  // Find the first row with at least 2 non-empty cells as header row
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const nonEmptyCount = (matrix[i] || []).filter((cell) => String(cell ?? '').trim() !== '').length;
    if (nonEmptyCount >= 2) {
      headerRowIdx = i;
      break;
    }
  }

  const rawHeaderRow = matrix[headerRowIdx] || [];
  const usedHeaders = new Set<string>();
  const headers: string[] = rawHeaderRow.map((cell, idx) => {
    let base = String(cell ?? '').trim() || `Coluna ${idx + 1}`;
    let finalName = base;
    let counter = 2;
    while (usedHeaders.has(finalName)) {
      finalName = `${base} (${counter})`;
      counter += 1;
    }
    usedHeaders.add(finalName);
    return finalName;
  });

  const rawRows: Record<string, unknown>[] = [];
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const rowArr = matrix[r] || [];
    const hasAnyValue = rowArr.some((cell) => String(cell ?? '').trim() !== '');
    if (!hasAnyValue) continue;

    const record: Record<string, unknown> = {};
    headers.forEach((h, cIdx) => {
      record[h] = rowArr[cIdx] ?? '';
    });
    rawRows.push(record);
  }

  return { headers, rawRows };
}

export async function parseSpreadsheetFile(file: File, preferredSheet?: string): Promise<{
  workbook: XLSX.WorkBook;
  parsed: ParsedWorkbookData;
}> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetNames = workbook.SheetNames;
  const activeSheet = preferredSheet && sheetNames.includes(preferredSheet) ? preferredSheet : sheetNames[0] || '';
  const { headers, rawRows } = extractSheetRows(workbook, activeSheet);

  return {
    workbook,
    parsed: {
      fileName: file.name,
      sheetNames,
      activeSheet,
      headers,
      rawRows,
      mapping: autoDetectMapping(headers),
    },
  };
}

export function switchWorkbookSheet(
  workbook: XLSX.WorkBook,
  fileName: string,
  sheetName: string,
): ParsedWorkbookData {
  const { headers, rawRows } = extractSheetRows(workbook, sheetName);
  return {
    fileName,
    sheetNames: workbook.SheetNames,
    activeSheet: sheetName,
    headers,
    rawRows,
    mapping: autoDetectMapping(headers),
  };
}

export function parsePastedTabularText(text: string): ParsedWorkbookData | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const workbook = XLSX.read(trimmed, { type: 'string', raw: false });
  const activeSheet = workbook.SheetNames[0] || 'Dados Colados';
  const { headers, rawRows } = extractSheetRows(workbook, activeSheet);

  if (headers.length === 0 || rawRows.length === 0) {
    return null;
  }

  return {
    fileName: 'Dados colados da área de transferência',
    sheetNames: [activeSheet],
    activeSheet,
    headers,
    rawRows,
    mapping: autoDetectMapping(headers),
  };
}

export function buildPreviewRows(
  rawRows: Record<string, unknown>[],
  mapping: ColumnMapping,
): MappedPreviewRow[] {
  return rawRows.map((row, idx) => {
    const rawDescricao = mapping.descricao ? String(row[mapping.descricao] ?? '').trim() : '';
    const rawUnidade = mapping.unidade ? String(row[mapping.unidade] ?? '').trim() : '';
    const rawLote = mapping.lote ? String(row[mapping.lote] ?? '').trim() : '';
    const rawDate = mapping.dataValidade ? parseDateToISO(row[mapping.dataValidade]) : '';
    const rawSaldo = mapping.saldoAtual ? parsePtBrNumber(row[mapping.saldoAtual]) : Number.NaN;

    const ruaPart = mapping.ruaPalete ? String(row[mapping.ruaPalete] ?? '').trim() : '';
    const paletePart = mapping.paleteOpcional ? String(row[mapping.paleteOpcional] ?? '').trim() : '';
    const combinedRuaPalete =
      ruaPart && paletePart
        ? `${ruaPart} · ${paletePart}`
        : ruaPart || paletePart;

    const rawObs = mapping.observacoes ? String(row[mapping.observacoes] ?? '').trim() : '';

    const rawInput: ExpiredItemInput = {
      descricao: rawDescricao,
      unidade: rawUnidade,
      lote: rawLote,
      dataValidade: rawDate,
      saldoAtual: Number.isFinite(rawSaldo) ? rawSaldo : 0,
      ruaPalete: combinedRuaPalete,
      statusTratativa: 'nenhuma',
      observacoes: rawObs,
    };

    const sanitized = sanitizeItemInput(rawInput);
    const missingFields = getMissingItemFields(sanitized, !Number.isFinite(rawSaldo));

    return {
      rowIndex: idx + 1,
      selected: true,
      data: sanitized,
      missingFields,
      hasBlankFields: missingFields.length > 0,
    };
  });
}

export function downloadTemplateWorkbook(): void {
  const sampleData = [
    {
      'Descrição do Produto': 'Leite Condensado Integral 395g',
      Unidade: 'UN',
      Lote: 'L2604-88A',
      'Data de Validade': '15/10/2026',
      'Saldo Atual': 48,
      'Rua / Palete': 'Rua 04 · Palete B12',
      Observações: 'Caixa lacrada aguardando descarte',
    },
    {
      'Descrição do Produto': 'Farinha de Trigo Tipo 1 5kg',
      Unidade: 'PCT',
      Lote: 'FB-99412',
      'Data de Validade': '02/11/2026',
      'Saldo Atual': 15,
      'Rua / Palete': 'Rua 02 · Palete A05',
      Observações: '',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  worksheet['!cols'] = [
    { wch: 36 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 24 },
    { wch: 32 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Depósito 14');
  XLSX.writeFile(workbook, 'modelo_deposito_14_vencidos.xlsx');
}

export function exportItemsToExcel(items: ExpiredItem[]): void {
  const rows = items.map((item) => ({
    Depósito: item.deposito,
    'Descrição do Produto': item.descricao,
    Unidade: item.unidade,
    Lote: item.lote,
    'Data de Validade': item.dataValidade ? formatIsoToBrDate(item.dataValidade) : '',
    'Saldo Atual': item.saldoAtual,
    'Rua / Palete': item.ruaPalete,
    'Etapa Kanban': ETAPA_KANBAN_LABELS[item.etapaKanban || 'lote_ajustado'],
    Observação: STATUS_LABELS[normalizeObservacaoStatus(item.statusTratativa)],
    Origem: item.origemCadastro === 'planilha' ? 'Planilha' : 'Digitação Manual',
    Detalhes: item.observacoes || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 36 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 24 },
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    { wch: 32 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Itens Vencidos D14');
  const todayStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `deposito_14_itens_vencidos_${todayStr}.xlsx`);
}

export function exportSelectedReportToExcel(
  items: ExpiredItem[],
  generatedBy?: string,
): void {
  if (items.length === 0) return;

  const totalSaldo = items.reduce((sum, item) => sum + item.saldoAtual, 0);
  const now = new Date();
  const emittedAt = now.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const itemRows: Record<string, string | number>[] = items.map((item, idx) => ({
    '#': idx + 1,
    'Descrição do Produto': item.descricao || 'Sem descrição',
    Unidade: item.unidade || '',
    Lote: item.lote || '',
    'Data de Validade': item.dataValidade ? formatIsoToBrDate(item.dataValidade) : '',
    'Saldo Atual': item.saldoAtual,
    'Rua / Palete': item.ruaPalete || '',
    'Etapa Kanban': ETAPA_KANBAN_LABELS[item.etapaKanban || 'lote_ajustado'],
    Observação: STATUS_LABELS[normalizeObservacaoStatus(item.statusTratativa)],
    Origem: item.origemCadastro === 'planilha' ? 'Planilha' : 'Manual',
    Detalhes: item.observacoes || '',
  }));

  itemRows.push({
    '#': '',
    'Descrição do Produto': 'TOTAL GERAL',
    Unidade: '',
    Lote: `${items.length} ${items.length === 1 ? 'item' : 'itens'}`,
    'Data de Validade': '',
    'Saldo Atual': Number(totalSaldo.toFixed(4)),
    'Rua / Palete': '',
    'Etapa Kanban': '',
    Observação: '',
    Origem: '',
    Detalhes: '',
  });

  const itemsSheet = XLSX.utils.json_to_sheet(itemRows);
  itemsSheet['!cols'] = [
    { wch: 6 },
    { wch: 38 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 24 },
    { wch: 22 },
    { wch: 16 },
    { wch: 12 },
    { wch: 32 },
  ];

  const obsCounts: Record<StatusTratativa, { count: number; saldo: number }> = {
    nenhuma: { count: 0, saldo: 0 },
    falta: { count: 0, saldo: 0 },
    sobra: { count: 0, saldo: 0 },
    avaria: { count: 0, saldo: 0 },
  };
  const stageCounts: Record<EtapaKanban, { count: number; saldo: number }> = {
    lote_ajustado: { count: 0, saldo: 0 },
    retirado_da_reserva: { count: 0, saldo: 0 },
    remessa_realizada: { count: 0, saldo: 0 },
  };

  for (const item of items) {
    const obs = normalizeObservacaoStatus(item.statusTratativa);
    obsCounts[obs].count += 1;
    obsCounts[obs].saldo += item.saldoAtual;

    const stage = ETAPA_KANBAN_ORDER.includes(item.etapaKanban)
      ? item.etapaKanban
      : 'lote_ajustado';
    stageCounts[stage].count += 1;
    stageCounts[stage].saldo += item.saldoAtual;
  }

  const summaryRows: (string | number)[][] = [
    ['Relatório de Itens Selecionados — Depósito 14', '', ''],
    ['Emitido em', emittedAt, ''],
    ['Emitido por', generatedBy || 'Equipe Depósito 14', ''],
    ['Total de itens selecionados', items.length, ''],
    ['Saldo total selecionado', Number(totalSaldo.toFixed(4)), ''],
    ['', '', ''],
    ['Resumo por Etapa Kanban', 'Quantidade de Itens', 'Saldo Total'],
    ...ETAPA_KANBAN_ORDER.map((stage) => [
      ETAPA_KANBAN_LABELS[stage],
      stageCounts[stage].count,
      Number(stageCounts[stage].saldo.toFixed(4)),
    ]),
    ['', '', ''],
    ['Resumo por Observação', 'Quantidade de Itens', 'Saldo Total'],
    ...(Object.keys(STATUS_LABELS) as StatusTratativa[]).map((obs) => [
      STATUS_LABELS[obs],
      obsCounts[obs].count,
      Number(obsCounts[obs].saldo.toFixed(4)),
    ]),
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 36 }, { wch: 22 }, { wch: 18 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, itemsSheet, 'Itens Selecionados');
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo');
  const todayStr = now.toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `deposito_14_relatorio_selecionados_${todayStr}.xlsx`);
}

export function exportExitsToExcel(exits: ItemExit[]): void {
  const rows = exits.map((ex) => ({
    Depósito: ex.deposito,
    'Data da Saída': formatIsoToBrDate(ex.dataSaida),
    'Descrição do Produto': ex.descricao,
    Unidade: ex.unidade,
    Lote: ex.lote,
    'Data de Validade': ex.dataValidade ? formatIsoToBrDate(ex.dataValidade) : '',
    'Rua / Palete': ex.ruaPalete,
    'Quantidade Saída': ex.quantidadeSaida,
    'Saldo Anterior': ex.saldoAnterior,
    'Saldo Posterior': ex.saldoPosterior,
    Motivo: MOTIVO_SAIDA_LABELS[ex.motivoSaida],
    Responsável: ex.responsavel,
    Documento: ex.documentoRef || '',
    Observações: ex.observacoes || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 36 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 24 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 24 },
    { wch: 22 },
    { wch: 18 },
    { wch: 30 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Saídas D14');
  const todayStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `deposito_14_saidas_${todayStr}.xlsx`);
}

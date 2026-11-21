import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ExpiredItemInput,
  getMissingItemFields,
  sanitizeItemInput,
} from '../types/inventory';
import {
  ColumnMapping,
  MappedPreviewRow,
  ParsedWorkbookData,
  buildPreviewRows,
  downloadTemplateWorkbook,
  parsePastedTabularText,
  parseSpreadsheetFile,
  switchWorkbookSheet,
} from '../utils/spreadsheet';

interface SpreadsheetImporterProps {
  existingBatchesCount?: number;
  onImportItems: (fileName: string, items: ExpiredItemInput[]) => Promise<number>;
  onReplaceAllImports?: () => Promise<{
    deletedItems: number;
    deletedBatches: number;
    deletedExits: number;
  }>;
  onCompleteNavigate: () => void;
  onGoHistory?: () => void;
}

export function SpreadsheetImporter({
  existingBatchesCount = 0,
  onImportItems,
  onReplaceAllImports,
  onCompleteNavigate,
  onGoHistory,
}: SpreadsheetImporterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [workbookRef, setWorkbookRef] = useState<XLSX.WorkBook | null>(null);
  const [parsed, setParsed] = useState<ParsedWorkbookData | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [editedRows, setEditedRows] = useState<MappedPreviewRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [replacePrevious, setReplacePrevious] = useState(true);

  function loadParsedData(nextParsed: ParsedWorkbookData) {
    setParsed(nextParsed);
    setMapping(nextParsed.mapping);
    setEditedRows(buildPreviewRows(nextParsed.rawRows, nextParsed.mapping));
    setParseError(null);
    setImportSuccess(null);
  }

  async function handleFileSelect(file: File) {
    setParseError(null);
    setImportSuccess(null);
    try {
      const { workbook, parsed: nextParsed } = await parseSpreadsheetFile(file);
      if (nextParsed.headers.length === 0 || nextParsed.rawRows.length === 0) {
        setParseError('A planilha está vazia ou não possui linhas de dados válidas.');
        return;
      }
      setWorkbookRef(workbook);
      loadParsedData(nextParsed);
      setShowPasteBox(false);
    } catch {
      setParseError(
        'Não foi possível ler o arquivo. Utilize os formatos .xlsx, .xls, .csv ou .ods.',
      );
    }
  }

  function handleSheetChange(sheetName: string) {
    if (!workbookRef || !parsed) return;
    const nextParsed = switchWorkbookSheet(workbookRef, parsed.fileName, sheetName);
    loadParsedData(nextParsed);
  }

  function handleMappingChange(field: keyof ColumnMapping, columnHeader: string) {
    if (!parsed || !mapping) return;
    const nextMapping = { ...mapping, [field]: columnHeader };
    setMapping(nextMapping);
    setEditedRows(buildPreviewRows(parsed.rawRows, nextMapping));
  }

  function handlePasteSubmit() {
    const result = parsePastedTabularText(pasteText);
    if (!result) {
      setParseError('Cole os dados com cabeçalho e ao menos uma linha de produto.');
      return;
    }
    setWorkbookRef(null);
    loadParsedData(result);
    setShowPasteBox(false);
    setPasteText('');
  }

  function handleRowToggle(rowIndex: number) {
    setEditedRows((prev) =>
      prev.map((row) =>
        row.rowIndex === rowIndex ? { ...row, selected: !row.selected } : row,
      ),
    );
  }

  function handleToggleAllRows() {
    const allSelected = editedRows.length > 0 && editedRows.every((r) => r.selected);
    setEditedRows((prev) => prev.map((row) => ({ ...row, selected: !allSelected })));
  }

  function handleCellEdit(
    rowIndex: number,
    field: keyof ExpiredItemInput,
    rawValue: string,
  ) {
    setEditedRows((prev) =>
      prev.map((row) => {
        if (row.rowIndex !== rowIndex) return row;
        const parsedSaldo =
          field === 'saldoAtual'
            ? rawValue.trim() === ''
              ? Number.NaN
              : Number(rawValue.replace(',', '.'))
            : row.data.saldoAtual;
        const nextData = sanitizeItemInput({
          ...row.data,
          [field]:
            field === 'saldoAtual'
              ? Number.isFinite(parsedSaldo)
                ? parsedSaldo
                : 0
              : rawValue,
        });
        const missingFields = getMissingItemFields(
          nextData,
          field === 'saldoAtual' ? !Number.isFinite(parsedSaldo) : false,
        );
        return {
          ...row,
          data: nextData,
          missingFields,
          hasBlankFields: missingFields.length > 0,
        };
      }),
    );
  }

  function handleClear() {
    setWorkbookRef(null);
    setParsed(null);
    setMapping(null);
    setEditedRows([]);
    setParseError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const stats = useMemo(() => {
    const total = editedRows.length;
    const incomplete = editedRows.filter((r) => r.hasBlankFields).length;
    const complete = total - incomplete;
    const selected = editedRows.filter((r) => r.selected).length;
    return { total, complete, incomplete, selected };
  }, [editedRows]);

  async function handleConfirmImport() {
    if (!parsed) return;
    const itemsToImport = editedRows.filter((r) => r.selected).map((r) => r.data);

    if (itemsToImport.length === 0) return;

    setImporting(true);
    setParseError(null);
    try {
      let replacedMsg = '';
      if (existingBatchesCount > 0 && replacePrevious && onReplaceAllImports) {
        const replaced = await onReplaceAllImports();
        replacedMsg = ` (planilha anterior e ${replaced.deletedExits} ${
          replaced.deletedExits === 1 ? 'registro de saída' : 'registros de saída'
        } removidos)`;
      }
      const count = await onImportItems(parsed.fileName, itemsToImport);
      setImportSuccess(
        `${count} ${count === 1 ? 'item importado' : 'itens importados'} com sucesso para o Depósito 14${replacedMsg}.`,
      );
      handleClear();
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Falha ao gravar lote de itens no banco.',
      );
    } finally {
      setImporting(false);
    }
  }

  const mappingFields: { key: keyof ColumnMapping; label: string }[] = [
    { key: 'descricao', label: 'Descrição do Produto' },
    { key: 'unidade', label: 'Unidade' },
    { key: 'lote', label: 'Lote' },
    { key: 'dataValidade', label: 'Data de Validade' },
    { key: 'saldoAtual', label: 'Saldo Atual' },
    { key: 'ruaPalete', label: 'Rua / Palete' },
    { key: 'paleteOpcional', label: 'Palete (se separado)' },
    { key: 'observacoes', label: 'Observações' },
  ];

  return (
    <div className="space-y-6">
      {importSuccess && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4">
          <div className="flex items-center gap-2.5 text-sm font-medium text-emerald-900">
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{importSuccess}</span>
          </div>
          <button
            type="button"
            onClick={onCompleteNavigate}
            className="px-3.5 py-1.5 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ver itens cadastrados
          </button>
        </div>
      )}

      {parseError && (
        <div
          role="alert"
          className="flex items-center gap-2.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {!parsed && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Extrair Itens de Planilha
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Envie um arquivo Excel (.xlsx, .xls), CSV ou cole as linhas diretamente da sua planilha.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={downloadTemplateWorkbook}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar Planilha Modelo (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPasteBox((v) => !v)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showPasteBox
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Colar do Excel</span>
              </button>
            </div>
          </div>

          {showPasteBox ? (
            <div className="space-y-3">
              <label htmlFor="paste-area" className="block text-xs font-semibold text-slate-700">
                Cole aqui as células copiadas do Excel ou Google Sheets (incluindo a linha de cabeçalho)
              </label>
              <textarea
                id="paste-area"
                rows={7}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={
                  'Descrição do Produto\tUnidade\tLote\tData de Validade\tSaldo Atual\tRua / Palete\nLeite Condensado 395g\tUN\tL2604-88A\t15/10/2026\t48\tRua 04 · Palete B12'
                }
                className="w-full px-3.5 py-2.5 font-mono text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPasteBox(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handlePasteSubmit}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
                >
                  Processar Dados Colados
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                isDragging
                  ? 'border-blue-600 bg-blue-50/50'
                  : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.ods"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
                className="hidden"
              />
              <div className="max-w-md mx-auto space-y-4">
                <div className="w-11 h-11 mx-auto rounded-lg bg-white border border-slate-200 flex items-center justify-center text-blue-700">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">
                    Arraste sua planilha aqui ou selecione do computador
                  </p>
                  <p className="text-xs text-slate-500">
                    Suporta .xlsx, .xls, .csv e .ods · Mapeamento automático de Descrição, Unidade,
                    Lote, Validade, Saldo e Rua/Palete
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Selecionar Planilha</span>
                </button>
              </div>
            </div>
          )}

          {existingBatchesCount > 0 && onGoHistory && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs text-slate-600">
              <span>
                Você possui{' '}
                <strong className="font-semibold text-slate-900">
                  {existingBatchesCount}{' '}
                  {existingBatchesCount === 1 ? 'importação anterior' : 'importações anteriores'}
                </strong>{' '}
                no Depósito 14. Ao substituir ou excluir a planilha, os registros de saída vinculados
                também são removidos.
              </span>
              <button
                type="button"
                onClick={onGoHistory}
                className="text-blue-700 font-semibold hover:underline text-left sm:text-right cursor-pointer whitespace-nowrap shrink-0"
              >
                Excluir ou gerenciar importações anteriores
              </button>
            </div>
          )}
        </div>
      )}

      {parsed && mapping && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileSpreadsheet className="w-4 h-4 text-blue-700 shrink-0" />
                  <span className="truncate">{parsed.fileName}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="tabular-nums">{stats.total} linhas extraídas</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-700 font-medium tabular-nums">
                    {stats.complete} completas
                  </span>
                  {stats.incomplete > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-700 font-medium tabular-nums">
                        {stats.incomplete} com campos em branco (serão importadas normalmente)
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {parsed.sheetNames.length > 1 && (
                  <div className="flex items-center gap-2">
                    <label htmlFor="sheet-select" className="text-xs font-medium text-slate-600">
                      Aba:
                    </label>
                    <select
                      id="sheet-select"
                      value={parsed.activeSheet}
                      onChange={(e) => handleSheetChange(e.target.value)}
                      className="px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg"
                    >
                      {parsed.sheetNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Trocar Planilha</span>
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={importing || stats.selected === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {importing
                      ? 'Importando...'
                      : `Importar ${stats.selected} ${stats.selected === 1 ? 'item' : 'itens'}`}
                  </span>
                </button>
              </div>
            </div>

            {existingBatchesCount > 0 && onReplaceAllImports && (
              <div className="pt-1 pb-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={replacePrevious}
                    onChange={(e) => setReplacePrevious(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span>
                    Substituir planilha anterior (excluir itens importados e registros de saída
                    anteriores ao importar)
                  </span>
                </label>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-700">
                Correspondência das colunas da planilha
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {mappingFields.map((mf) => (
                  <div key={mf.key} className="space-y-1">
                    <label
                      htmlFor={`map-${mf.key}`}
                      className="block text-xs font-medium text-slate-600"
                    >
                      {mf.label}
                    </label>
                    <select
                      id={`map-${mf.key}`}
                      value={mapping[mf.key]}
                      onChange={(e) => handleMappingChange(mf.key, e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
                    >
                      <option value="">— Não mapeado —</option>
                      {parsed.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Pré-visualização e Correção Rápida
                </h3>
                <p className="text-xs text-slate-500">
                  Você pode editar qualquer célula diretamente abaixo antes de confirmar a importação.
                </p>
              </div>
              <span className="font-mono text-xs text-slate-500 tabular-nums shrink-0">
                {stats.selected} selecionados
              </span>
            </div>

            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <tr className="text-xs font-semibold text-slate-600">
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        aria-label="Selecionar todos os itens da planilha"
                        checked={editedRows.length > 0 && stats.selected === editedRows.length}
                        onChange={handleToggleAllRows}
                        className="rounded border-slate-300 text-blue-700"
                      />
                    </th>
                    <th className="py-2.5 px-3 w-12 font-mono">#</th>
                    <th className="py-2.5 px-3 min-w-[220px]">Descrição do Produto</th>
                    <th className="py-2.5 px-3 min-w-[110px]">Unidade</th>
                    <th className="py-2.5 px-3 min-w-[120px]">Lote</th>
                    <th className="py-2.5 px-3 min-w-[145px]">Data Validade</th>
                    <th className="py-2.5 px-3 min-w-[100px] text-right">Saldo Atual</th>
                    <th className="py-2.5 px-3 min-w-[160px]">Rua / Palete</th>
                    <th className="py-2.5 px-3 min-w-[155px]">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {editedRows.map((row) => {
                    return (
                      <tr
                        key={row.rowIndex}
                        className={
                          !row.selected
                            ? 'opacity-50'
                            : row.hasBlankFields
                              ? 'bg-amber-50/30 hover:bg-amber-50/50'
                              : 'hover:bg-slate-50/80'
                        }
                      >
                        <td className="py-2 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => handleRowToggle(row.rowIndex)}
                            className="rounded border-slate-300 text-blue-700"
                          />
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-400 tabular-nums">
                          {row.rowIndex}
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            value={row.data.descricao}
                            placeholder="Em branco"
                            onChange={(e) =>
                              handleCellEdit(row.rowIndex, 'descricao', e.target.value)
                            }
                            className={`w-full px-2 py-1 text-xs bg-white border rounded ${
                              !row.data.descricao ? 'border-amber-300' : 'border-slate-200'
                            }`}
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            value={row.data.unidade}
                            placeholder="Em branco"
                            onChange={(e) =>
                              handleCellEdit(
                                row.rowIndex,
                                'unidade',
                                e.target.value.toUpperCase(),
                              )
                            }
                            className={`w-full px-2 py-1 font-mono text-xs uppercase bg-white border rounded ${
                              !row.data.unidade ? 'border-amber-300' : 'border-slate-200'
                            }`}
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            value={row.data.lote}
                            placeholder="Em branco"
                            onChange={(e) =>
                              handleCellEdit(row.rowIndex, 'lote', e.target.value)
                            }
                            className={`w-full px-2 py-1 font-mono text-xs bg-white border rounded ${
                              !row.data.lote ? 'border-amber-300' : 'border-slate-200'
                            }`}
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="date"
                            value={row.data.dataValidade}
                            onChange={(e) =>
                              handleCellEdit(row.rowIndex, 'dataValidade', e.target.value)
                            }
                            className={`w-full px-2 py-1 font-mono text-xs bg-white border rounded ${
                              !row.data.dataValidade ? 'border-amber-300' : 'border-slate-200'
                            }`}
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={String(row.data.saldoAtual)}
                            onChange={(e) =>
                              handleCellEdit(row.rowIndex, 'saldoAtual', e.target.value)
                            }
                            className="w-full px-2 py-1 font-mono text-xs text-right tabular-nums bg-white border border-slate-200 rounded"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            value={row.data.ruaPalete}
                            placeholder="Em branco"
                            onChange={(e) =>
                              handleCellEdit(row.rowIndex, 'ruaPalete', e.target.value)
                            }
                            className={`w-full px-2 py-1 text-xs bg-white border rounded ${
                              !row.data.ruaPalete ? 'border-amber-300' : 'border-slate-200'
                            }`}
                          />
                        </td>
                        <td className="py-2 px-3">
                          {!row.hasBlankFields ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                              <Check className="w-3.5 h-3.5 shrink-0" />
                              <span>Completo</span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-amber-700 font-medium"
                              title={`Campos em branco: ${row.missingFields.join(', ')}. O item será importado normalmente.`}
                            >
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate max-w-[155px]">
                                Sem: {row.missingFields.join(', ')}
                              </span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

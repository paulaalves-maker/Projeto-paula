import { useMemo, useState } from 'react';
import { Check, FileSpreadsheet, Trash2 } from 'lucide-react';
import { ExpiredItem, ImportBatch, ItemExit } from '../types/inventory';

interface ImportHistoryViewProps {
  batches: ImportBatch[];
  items: ExpiredItem[];
  exits: ItemExit[];
  onGoImport: () => void;
  onDeleteBatch: (batchId: string) => Promise<{ deletedItems: number; deletedExits: number }>;
  onDeleteAllImports: () => Promise<{
    deletedItems: number;
    deletedBatches: number;
    deletedExits: number;
  }>;
}

export function ImportHistoryView({
  batches,
  items,
  exits,
  onGoImport,
  onDeleteBatch,
  onDeleteAllImports,
}: ImportHistoryViewProps) {
  const [confirmBatchId, setConfirmBatchId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [busyBatchId, setBusyBatchId] = useState<string | null>(null);
  const [busyClearAll, setBusyClearAll] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const counts = useMemo(() => {
    const itemsByBatch = new Map<string, number>();
    const itemToBatch = new Map<string, string>();
    const manualItemIds = new Set<string>();
    let totalSpreadsheetItems = 0;

    for (const item of items) {
      if (item.importBatchId) {
        itemsByBatch.set(item.importBatchId, (itemsByBatch.get(item.importBatchId) || 0) + 1);
        itemToBatch.set(item.id, item.importBatchId);
      }
      if (item.origemCadastro === 'planilha' || item.importBatchId) {
        totalSpreadsheetItems += 1;
      } else {
        manualItemIds.add(item.id);
      }
    }

    const exitsByBatch = new Map<string, number>();
    let totalSpreadsheetExits = 0;
    for (const ex of exits) {
      const bId = itemToBatch.get(ex.itemId);
      if (bId) {
        exitsByBatch.set(bId, (exitsByBatch.get(bId) || 0) + 1);
      }
      if (!manualItemIds.has(ex.itemId)) {
        totalSpreadsheetExits += 1;
      }
    }

    return {
      itemsByBatch,
      exitsByBatch,
      totalSpreadsheetItems,
      totalSpreadsheetExits,
    };
  }, [items, exits]);

  async function handleConfirmDeleteBatch(batch: ImportBatch) {
    setBusyBatchId(batch.id);
    setFeedback(null);
    try {
      const res = await onDeleteBatch(batch.id);
      setConfirmBatchId(null);
      setFeedback(
        `Importação "${batch.nomeArquivo}" excluída (${res.deletedItems} ${
          res.deletedItems === 1 ? 'item' : 'itens'
        } e ${res.deletedExits} ${
          res.deletedExits === 1 ? 'registro de saída' : 'registros de saída'
        } removidos).`,
      );
    } finally {
      setBusyBatchId(null);
    }
  }

  async function handleConfirmClearAll() {
    setBusyClearAll(true);
    setFeedback(null);
    try {
      const res = await onDeleteAllImports();
      setConfirmClearAll(false);
      setFeedback(
        `Todas as importações foram removidas (${res.deletedBatches} ${
          res.deletedBatches === 1 ? 'lote' : 'lotes'
        }, ${res.deletedItems} ${res.deletedItems === 1 ? 'item' : 'itens'} e ${
          res.deletedExits
        } ${res.deletedExits === 1 ? 'registro de saída' : 'registros de saída'}).`,
      );
    } finally {
      setBusyClearAll(false);
    }
  }

  if (batches.length === 0) {
    return (
      <div className="space-y-4">
        {feedback && (
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <Check className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>{feedback}</span>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Nenhuma planilha importada no momento
            </h3>
            <p className="text-sm text-slate-500">
              Quando você extrair itens de arquivos Excel ou CSV, os lotes importados aparecerão aqui
              e poderão ser excluídos junto com suas saídas quando desejar enviar uma nova planilha.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoImport}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Extrair Planilha</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <Check className="w-4 h-4 shrink-0 text-emerald-700" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Histórico de Importações — Depósito 14
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ao excluir uma importação, o lote, os itens daquela planilha e os registros de saída
              vinculados são removidos automaticamente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {confirmClearAll ? (
              <div className="inline-flex flex-wrap items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                <span className="text-xs font-medium text-red-800">
                  Excluir {batches.length} {batches.length === 1 ? 'lote' : 'lotes'},{' '}
                  {counts.totalSpreadsheetItems}{' '}
                  {counts.totalSpreadsheetItems === 1 ? 'item' : 'itens'} e{' '}
                  {counts.totalSpreadsheetExits}{' '}
                  {counts.totalSpreadsheetExits === 1 ? 'saída' : 'saídas'}?
                </span>
                <button
                  type="button"
                  disabled={busyClearAll}
                  onClick={handleConfirmClearAll}
                  className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                >
                  {busyClearAll ? 'Excluindo...' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  disabled={busyClearAll}
                  onClick={() => setConfirmClearAll(false)}
                  className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirmBatchId(null);
                  setConfirmClearAll(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Todas as Importações</span>
              </button>
            )}

            <button
              type="button"
              onClick={onGoImport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Nova Planilha</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4">Arquivo / Origem</th>
                <th className="py-2.5 px-4">Depósito</th>
                <th className="py-2.5 px-4 text-right">Itens Importados</th>
                <th className="py-2.5 px-4 text-right">Ativos no Depósito</th>
                <th className="py-2.5 px-4 text-right">Saídas Vinculadas</th>
                <th className="py-2.5 px-4 text-right">Data e Hora</th>
                <th className="py-2.5 px-4 w-48 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {batches.map((batch) => {
                const dateStr = batch.createdAt
                  ? new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(batch.createdAt.toDate())
                  : 'Sincronizando...';
                const activeCount = counts.itemsByBatch.get(batch.id) || 0;
                const linkedExitsCount = counts.exitsByBatch.get(batch.id) || 0;
                const isBusy = busyBatchId === batch.id;

                return (
                  <tr key={batch.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-medium text-slate-900">
                      <span className="inline-flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-blue-700 shrink-0" />
                        <span>{batch.nomeArquivo}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{batch.deposito}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {batch.totalLinhas}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 tabular-nums">
                      {activeCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 tabular-nums">
                      {linkedExitsCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                      {dateStr}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {confirmBatchId === batch.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleConfirmDeleteBatch(batch)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                          >
                            {isBusy
                              ? 'Excluindo...'
                              : `Excluir (${activeCount} + ${linkedExitsCount} saídas)`}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmBatchId(null)}
                            className="px-1.5 py-1 text-[11px] text-slate-500 hover:text-slate-900 cursor-pointer"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmClearAll(false);
                            setConfirmBatchId(batch.id);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Excluir lote</span>
                        </button>
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
  );
}



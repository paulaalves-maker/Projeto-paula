import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, Printer, X } from 'lucide-react';
import {
  ETAPA_KANBAN_LABELS,
  ETAPA_KANBAN_ORDER,
  EtapaKanban,
  ExpiredItem,
  STATUS_LABELS,
  StatusTratativa,
  formatIsoToBrDate,
  formatNumberPtBr,
  normalizeObservacaoStatus,
} from '../types/inventory';
import { exportSelectedReportToExcel } from '../utils/spreadsheet';

interface SelectedItemsReportModalProps {
  items: ExpiredItem[];
  generatedBy?: string;
  onClose: () => void;
}

export function SelectedItemsReportModal({
  items,
  generatedBy,
  onClose,
}: SelectedItemsReportModalProps) {
  useEffect(() => {
    document.body.classList.add('has-report-modal');
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('has-report-modal');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const summary = useMemo(() => {
    let totalSaldo = 0;
    let ocorrencias = 0;
    const locations = new Set<string>();
    const byStage: Record<EtapaKanban, { count: number; saldo: number }> = {
      lote_ajustado: { count: 0, saldo: 0 },
      retirado_da_reserva: { count: 0, saldo: 0 },
      remessa_realizada: { count: 0, saldo: 0 },
    };
    const byObs: Record<StatusTratativa, { count: number; saldo: number }> = {
      nenhuma: { count: 0, saldo: 0 },
      falta: { count: 0, saldo: 0 },
      sobra: { count: 0, saldo: 0 },
      avaria: { count: 0, saldo: 0 },
    };

    for (const item of items) {
      totalSaldo += item.saldoAtual;
      if (item.ruaPalete) locations.add(item.ruaPalete);

      const obs = normalizeObservacaoStatus(item.statusTratativa);
      if (obs === 'falta' || obs === 'sobra' || obs === 'avaria') {
        ocorrencias += 1;
      }
      byObs[obs].count += 1;
      byObs[obs].saldo += item.saldoAtual;

      const stage = ETAPA_KANBAN_ORDER.includes(item.etapaKanban)
        ? item.etapaKanban
        : 'lote_ajustado';
      byStage[stage].count += 1;
      byStage[stage].saldo += item.saldoAtual;
    }

    return {
      totalSaldo,
      ocorrencias,
      enderecosDistintos: locations.size,
      byStage,
      byObs,
    };
  }, [items]);

  const emittedAt = useMemo(
    () =>
      new Date().toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [],
  );

  return createPortal(
    <div
      id="report-print-portal"
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Relatório de itens selecionados"
    >
      <div className="w-full max-w-5xl bg-white border border-slate-200 rounded-xl overflow-hidden my-4 print:border-none print:rounded-none print:my-0 print:max-w-none">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileText className="w-4 h-4 text-blue-700" />
            <span>Relatório de Itens Selecionados ({items.length})</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportSelectedReportToExcel(items, generatedBy)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / Salvar PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar relatório"
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 print:p-0">
          <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-slate-200">
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500">
                Depósito 14 · Controle de Itens Vencidos
              </p>
              <h2 className="font-display text-xl font-bold text-slate-900 tracking-tight">
                Relatório de Itens Selecionados
              </h2>
            </div>
            <div className="text-xs text-slate-600 sm:text-right space-y-0.5">
              <div>
                Emitido em: <strong className="font-mono text-slate-900">{emittedAt}</strong>
              </div>
              {generatedBy && (
                <div>
                  Responsável: <strong className="text-slate-900">{generatedBy}</strong>
                </div>
              )}
            </div>
          </header>

          <section
            aria-label="Totais do relatório"
            className="grid grid-cols-2 sm:grid-cols-4 border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
          >
            <div className="p-3.5">
              <p className="text-xs text-slate-500">Itens Selecionados</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                {items.length}
              </p>
            </div>
            <div className="p-3.5">
              <p className="text-xs text-slate-500">Saldo Total</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                {formatNumberPtBr(summary.totalSaldo)}
              </p>
            </div>
            <div className="p-3.5">
              <p className="text-xs text-slate-500">Falta / Sobra / Avaria</p>
              <p className="mt-1 font-mono text-xl font-semibold text-amber-700 tabular-nums">
                {summary.ocorrencias}
              </p>
            </div>
            <div className="p-3.5">
              <p className="text-xs text-slate-500">Ruas / Paletes</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
                {summary.enderecosDistintos}
              </p>
            </div>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="border border-slate-200 rounded-lg p-3.5 space-y-2">
              <h3 className="font-semibold text-slate-900">Por Etapa Kanban</h3>
              <div className="divide-y divide-slate-100">
                {ETAPA_KANBAN_ORDER.map((stage) => (
                  <div key={stage} className="py-1.5 flex items-center justify-between gap-3">
                    <span className="text-slate-700">{ETAPA_KANBAN_LABELS[stage]}</span>
                    <span className="font-mono text-slate-900 tabular-nums">
                      {summary.byStage[stage].count} · Saldo{' '}
                      <strong>{formatNumberPtBr(summary.byStage[stage].saldo)}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg p-3.5 space-y-2">
              <h3 className="font-semibold text-slate-900">Por Observação</h3>
              <div className="divide-y divide-slate-100">
                {(Object.keys(STATUS_LABELS) as StatusTratativa[]).map((obs) => (
                  <div key={obs} className="py-1.5 flex items-center justify-between gap-3">
                    <span className="text-slate-700">{STATUS_LABELS[obs]}</span>
                    <span className="font-mono text-slate-900 tabular-nums">
                      {summary.byObs[obs].count} · Saldo{' '}
                      <strong>{formatNumberPtBr(summary.byObs[obs].saldo)}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="font-semibold text-slate-700">
                    <th className="py-2 px-3 w-10 text-center">#</th>
                    <th className="py-2 px-3">Descrição do Produto</th>
                    <th className="py-2 px-3">Unidade</th>
                    <th className="py-2 px-3">Lote</th>
                    <th className="py-2 px-3">Validade</th>
                    <th className="py-2 px-3 text-right">Saldo</th>
                    <th className="py-2 px-3">Rua / Palete</th>
                    <th className="py-2 px-3">Etapa Kanban</th>
                    <th className="py-2 px-3">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => {
                    const obs = normalizeObservacaoStatus(item.statusTratativa);
                    return (
                      <tr key={item.id}>
                        <td className="py-2 px-3 text-center font-mono text-slate-500 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-900">
                          {item.descricao || 'Sem descrição'}
                          {item.observacoes && (
                            <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                              {item.observacoes}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-700">
                          {item.unidade || '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-800 tabular-nums">
                          {item.lote || '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-800 tabular-nums">
                          {item.dataValidade ? formatIsoToBrDate(item.dataValidade) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {formatNumberPtBr(item.saldoAtual)}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-800">
                          {item.ruaPalete || '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {ETAPA_KANBAN_LABELS[item.etapaKanban || 'lote_ajustado']}
                        </td>
                        <td
                          className={`py-2 px-3 font-medium ${
                            obs === 'falta'
                              ? 'text-red-700'
                              : obs === 'sobra'
                                ? 'text-blue-700'
                                : obs === 'avaria'
                                  ? 'text-amber-700'
                                  : 'text-slate-600'
                          }`}
                        >
                          {STATUS_LABELS[obs]}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-900">
                  <tr>
                    <td colSpan={5} className="py-2.5 px-3 text-right">
                      Total ({items.length} {items.length === 1 ? 'item' : 'itens'}):
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {formatNumberPtBr(summary.totalSaldo)}
                    </td>
                    <td colSpan={3} className="py-2.5 px-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

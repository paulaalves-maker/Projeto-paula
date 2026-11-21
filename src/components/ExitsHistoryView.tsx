import { useMemo, useState } from 'react';
import {
  Check,
  Download,
  PackageMinus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  ItemExit,
  MOTIVO_SAIDA_LABELS,
  MotivoSaida,
  formatIsoToBrDate,
  formatNumberPtBr,
} from '../types/inventory';
import { exportExitsToExcel } from '../utils/spreadsheet';

interface ExitsHistoryViewProps {
  exits: ItemExit[];
  loading: boolean;
  hasAvailableItems: boolean;
  canReverse?: boolean;
  onOpenNewExit: () => void;
  onReverseExit: (exit: ItemExit) => Promise<void>;
  onDeleteExit: (exitId: string) => Promise<void>;
  onBulkDeleteExits: (exitIds: string[]) => Promise<void>;
}

export function ExitsHistoryView({
  exits,
  loading,
  hasAvailableItems,
  canReverse = false,
  onOpenNewExit,
  onReverseExit,
  onDeleteExit,
  onBulkDeleteExits,
}: ExitsHistoryViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [motivoFilter, setMotivoFilter] = useState<'todos' | MotivoSaida>('todos');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmReverseId, setConfirmReverseId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyBulk, setBusyBulk] = useState(false);

  const filteredExits = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return exits.filter((ex) => {
      if (motivoFilter !== 'todos' && ex.motivoSaida !== motivoFilter) return false;
      if (!q) return true;
      return (
        ex.descricao.toLowerCase().includes(q) ||
        ex.unidade.toLowerCase().includes(q) ||
        ex.lote.toLowerCase().includes(q) ||
        ex.ruaPalete.toLowerCase().includes(q) ||
        ex.responsavel.toLowerCase().includes(q) ||
        (ex.documentoRef || '').toLowerCase().includes(q)
      );
    });
  }, [exits, searchTerm, motivoFilter]);

  const totalQuantidadeSaida = useMemo(
    () => filteredExits.reduce((sum, ex) => sum + ex.quantidadeSaida, 0),
    [filteredExits],
  );

  function toggleSelectAll() {
    if (selectedIds.size === filteredExits.length && filteredExits.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredExits.map((ex) => ex.id)));
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirmReverse(exit: ItemExit) {
    setBusyId(exit.id);
    try {
      await onReverseExit(exit);
      setConfirmReverseId(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(exit.id);
        return next;
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmDelete(exitId: string) {
    setBusyId(exitId);
    try {
      await onDeleteExit(exitId);
      setConfirmDeleteId(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(exitId);
        return next;
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmBulkDelete() {
    if (selectedIds.size === 0) return;
    setBusyBulk(true);
    try {
      await onBulkDeleteExits(Array.from(selectedIds));
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
    } finally {
      setBusyBulk(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="h-10 bg-slate-100 rounded-md animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar saída por produto, lote, responsável ou NF..."
              className="w-full pl-9 pr-3.5 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filtrar por motivo de saída"
              value={motivoFilter}
              onChange={(e) => setMotivoFilter(e.target.value as 'todos' | MotivoSaida)}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
            >
              <option value="todos">Todos os motivos</option>
              {(Object.keys(MOTIVO_SAIDA_LABELS) as MotivoSaida[]).map((m) => (
                <option key={m} value={m}>
                  {MOTIVO_SAIDA_LABELS[m]}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => exportExitsToExcel(filteredExits)}
              disabled={filteredExits.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Saídas</span>
            </button>

            <button
              type="button"
              onClick={onOpenNewExit}
              disabled={!hasAvailableItems}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PackageMinus className="w-3.5 h-3.5" />
              <span>Registrar Saída</span>
            </button>
          </div>
        </div>

        {canReverse && selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-700 font-medium tabular-nums">
              {selectedIds.size}{' '}
              {selectedIds.size === 1 ? 'saída selecionada' : 'saídas selecionadas'}
            </span>

            {confirmBulkDelete ? (
              <div className="inline-flex items-center gap-2">
                <span className="text-red-700 font-medium">
                  Excluir registros sem devolver saldo?
                </span>
                <button
                  type="button"
                  disabled={busyBulk}
                  onClick={handleConfirmBulkDelete}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{busyBulk ? 'Excluindo...' : `Confirmar (${selectedIds.size})`}</span>
                </button>
                <button
                  type="button"
                  disabled={busyBulk}
                  onClick={() => setConfirmBulkDelete(false)}
                  className="px-2 py-1.5 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmBulkDelete(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir selecionadas</span>
              </button>
            )}
          </div>
        )}
      </div>

      {exits.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Nenhuma saída registrada no Depósito 14
            </h3>
            <p className="text-sm text-slate-500">
              Registre baixas por descarte, devolução ao fornecedor, doação ou transferência e
              acompanhe automaticamente o saldo restante.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenNewExit}
            disabled={!hasAvailableItems}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <PackageMinus className="w-4 h-4" />
            <span>Registrar Primeira Saída</span>
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-4 text-xs text-slate-600">
            <span className="tabular-nums">
              {filteredExits.length}{' '}
              {filteredExits.length === 1 ? 'saída listada' : 'saídas listadas'}
            </span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              Total baixado: {formatNumberPtBr(totalQuantidadeSaida)}
            </span>
          </div>

          {filteredExits.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhuma saída encontrada com os filtros atuais.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-xs font-semibold text-slate-600">
                    {canReverse && (
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          aria-label="Selecionar todas as saídas"
                          checked={
                            filteredExits.length > 0 && selectedIds.size === filteredExits.length
                          }
                          onChange={toggleSelectAll}
                          className="rounded border-slate-300 text-blue-700"
                        />
                      </th>
                    )}
                    <th className="py-2.5 px-3 min-w-[105px]">Data Saída</th>
                    <th className="py-2.5 px-3 min-w-[220px]">Produto / Unidade / Lote</th>
                    <th className="py-2.5 px-3 min-w-[140px]">Rua / Palete</th>
                    <th className="py-2.5 px-3 min-w-[105px] text-right">Qtd. Saída</th>
                    <th className="py-2.5 px-3 min-w-[130px] text-right">Saldo (Ant. → Pós)</th>
                    <th className="py-2.5 px-3 min-w-[160px]">Motivo</th>
                    <th className="py-2.5 px-3 min-w-[170px]">Responsável / Doc.</th>
                    {canReverse && <th className="py-2.5 px-3 w-40 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredExits.map((ex) => {
                    const isSelected = selectedIds.has(ex.id);
                    return (
                      <tr
                        key={ex.id}
                        className={isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50/80'}
                      >
                        {canReverse && (
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              aria-label={`Selecionar saída de ${ex.descricao || 'item'}`}
                              checked={isSelected}
                              onChange={() => toggleRow(ex.id)}
                              className="rounded border-slate-300 text-blue-700"
                            />
                          </td>
                        )}
                        <td className="py-2.5 px-3 font-mono text-slate-800 tabular-nums">
                          {formatIsoToBrDate(ex.dataSaida)}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-900 leading-snug">
                            {ex.descricao || 'Sem descrição'}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono">{ex.unidade || '—'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">Lote {ex.lote || '—'}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">
                          {ex.ruaPalete || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-red-700 tabular-nums">
                          -{formatNumberPtBr(ex.quantidadeSaida)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 tabular-nums">
                          {formatNumberPtBr(ex.saldoAnterior)} →{' '}
                          <strong className="text-slate-900">
                            {formatNumberPtBr(ex.saldoPosterior)}
                          </strong>
                        </td>
                        <td className="py-2.5 px-3 text-slate-800">
                          <div>{MOTIVO_SAIDA_LABELS[ex.motivoSaida]}</div>
                          {ex.observacoes && (
                            <div
                              className="text-[11px] text-slate-500 truncate max-w-[180px]"
                              title={ex.observacoes}
                            >
                              {ex.observacoes}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="text-slate-900 font-medium">{ex.responsavel}</div>
                          {ex.documentoRef && (
                            <div className="font-mono text-[11px] text-slate-500">
                              {ex.documentoRef}
                            </div>
                          )}
                        </td>
                        {canReverse && (
                          <td className="py-2.5 px-3 text-right">
                            {confirmReverseId === ex.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={busyId === ex.id}
                                  onClick={() => handleConfirmReverse(ex)}
                                  className="px-2 py-1 text-[11px] font-semibold text-white bg-slate-900 rounded hover:bg-slate-800 cursor-pointer"
                                >
                                  Estornar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmReverseId(null)}
                                  className="px-1.5 py-1 text-[11px] text-slate-500 hover:text-slate-900 cursor-pointer"
                                >
                                  Não
                                </button>
                              </div>
                            ) : confirmDeleteId === ex.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={busyId === ex.id}
                                  onClick={() => handleConfirmDelete(ex.id)}
                                  className="px-2 py-1 text-[11px] font-semibold text-white bg-red-600 rounded hover:bg-red-700 cursor-pointer"
                                >
                                  Excluir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-1.5 py-1 text-[11px] text-slate-500 hover:text-slate-900 cursor-pointer"
                                >
                                  Não
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteId(null);
                                    setConfirmReverseId(ex.id);
                                  }}
                                  title="Estornar saída e devolver saldo ao item"
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Estornar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmReverseId(null);
                                    setConfirmDeleteId(ex.id);
                                  }}
                                  title="Excluir registro de saída (sem devolver saldo)"
                                  className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


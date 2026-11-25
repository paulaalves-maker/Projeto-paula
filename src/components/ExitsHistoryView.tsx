import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  PackageMinus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  EXIT_FIELD_LIMITS,
  ItemExit,
  MOTIVO_SAIDA_LABELS,
  MotivoSaida,
  StatusRecolhimento,
  formatIsoToBrDate,
  formatNumberPtBr,
  normalizeStatusRecolhimento,
} from '../types/inventory';
import { exportExitsToExcel } from '../utils/spreadsheet';

interface ExitsHistoryViewProps {
  exits: ItemExit[];
  loading: boolean;
  hasAvailableItems: boolean;
  canReverse?: boolean;
  defaultCollectorName: string;
  onOpenNewExit: () => void;
  onConfirmCollection: (
    exitId: string,
    recolhidoPor: string,
    observacaoRecolhimento?: string,
  ) => Promise<void>;
  onReopenCollection: (exitId: string) => Promise<void>;
  onReverseExit: (exit: ItemExit) => Promise<void>;
  onDeleteExit: (exitId: string) => Promise<void>;
  onBulkDeleteExits: (exitIds: string[]) => Promise<void>;
}

function formatCollectionTimestamp(ts: ItemExit['recolhidoEm']): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  return ts.toDate().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toLocalIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDatePresets() {
  const now = new Date();
  const today = toLocalIsoDate(now);

  const sevenDaysAgoDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const sevenDaysAgo = toLocalIsoDate(sevenDaysAgoDate);

  const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStart = toLocalIsoDate(monthStartDate);

  return { today, sevenDaysAgo, monthStart };
}

export function ExitsHistoryView({
  exits,
  loading,
  hasAvailableItems,
  canReverse = false,
  defaultCollectorName,
  onOpenNewExit,
  onConfirmCollection,
  onReopenCollection,
  onReverseExit,
  onDeleteExit,
  onBulkDeleteExits,
}: ExitsHistoryViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [motivoFilter, setMotivoFilter] = useState<'todos' | MotivoSaida>('todos');
  const [collectionFilter, setCollectionFilter] = useState<'todos' | StatusRecolhimento>('todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmReverseId, setConfirmReverseId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const [confirmingExitId, setConfirmingExitId] = useState<string | null>(null);
  const [collectorName, setCollectorName] = useState(defaultCollectorName);
  const [collectorObs, setCollectorObs] = useState('');
  const [collectionError, setCollectionError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyBulk, setBusyBulk] = useState(false);

  const datePresets = getDatePresets();
  const hasDateFilter = Boolean(dateFrom || dateTo);
  const hasAnyFilter = Boolean(
    searchTerm.trim() || motivoFilter !== 'todos' || collectionFilter !== 'todos' || hasDateFilter,
  );

  const isTodayActive = dateFrom === datePresets.today && dateTo === datePresets.today;
  const isLast7Active = dateFrom === datePresets.sevenDaysAgo && dateTo === datePresets.today;
  const isMonthActive = dateFrom === datePresets.monthStart && dateTo === datePresets.today;

  const collectionCounts = useMemo(() => {
    let pending = 0;
    let collected = 0;
    for (const ex of exits) {
      if (normalizeStatusRecolhimento(ex.statusRecolhimento) === 'recolhido') {
        collected += 1;
      } else {
        pending += 1;
      }
    }
    return { pending, collected };
  }, [exits]);

  const filteredExits = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return exits.filter((ex) => {
      const recStatus = normalizeStatusRecolhimento(ex.statusRecolhimento);
      if (collectionFilter !== 'todos' && recStatus !== collectionFilter) return false;
      if (motivoFilter !== 'todos' && ex.motivoSaida !== motivoFilter) return false;

      if (dateFrom || dateTo) {
        const exitDate = (ex.dataSaida || '').trim().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(exitDate)) return false;
        if (dateFrom && exitDate < dateFrom) return false;
        if (dateTo && exitDate > dateTo) return false;
      }

      if (!q) return true;
      return (
        ex.descricao.toLowerCase().includes(q) ||
        ex.unidade.toLowerCase().includes(q) ||
        ex.lote.toLowerCase().includes(q) ||
        ex.ruaPalete.toLowerCase().includes(q) ||
        ex.responsavel.toLowerCase().includes(q) ||
        (ex.recolhidoPor || '').toLowerCase().includes(q) ||
        (ex.documentoRef || '').toLowerCase().includes(q)
      );
    });
  }, [exits, searchTerm, motivoFilter, collectionFilter, dateFrom, dateTo]);

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

  function openConfirmCollection(exitId: string) {
    setConfirmReverseId(null);
    setConfirmDeleteId(null);
    setConfirmingExitId(exitId);
    setCollectorName(defaultCollectorName);
    setCollectorObs('');
    setCollectionError(null);
  }

  async function handleSubmitCollection(e: React.FormEvent, exitId: string) {
    e.preventDefault();
    const trimmed = collectorName.trim();
    if (!trimmed) {
      setCollectionError('Informe o nome de quem conferiu o recolhimento.');
      return;
    }
    setBusyId(exitId);
    setCollectionError(null);
    try {
      await onConfirmCollection(exitId, trimmed, collectorObs);
      setConfirmingExitId(null);
      setCollectorObs('');
    } catch (err) {
      setCollectionError(
        err instanceof Error ? err.message : 'Não foi possível confirmar o recolhimento.',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleReopenCollection(exitId: string) {
    setBusyId(exitId);
    try {
      await onReopenCollection(exitId);
    } finally {
      setBusyId(null);
    }
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

  const colSpanCount = canReverse ? 9 : 7;

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
              placeholder="Buscar saída por produto, lote, solicitante, conferente ou NF..."
              className="w-full pl-9 pr-8 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Limpar busca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              <button
                type="button"
                onClick={() => setCollectionFilter('todos')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  collectionFilter === 'todos'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos ({exits.length})
              </button>
              <button
                type="button"
                onClick={() => setCollectionFilter('aguardando_recolhimento')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  collectionFilter === 'aguardando_recolhimento'
                    ? 'bg-white text-amber-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Aguardando recolhimento ({collectionCounts.pending})
              </button>
              <button
                type="button"
                onClick={() => setCollectionFilter('recolhido')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  collectionFilter === 'recolhido'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Recolhidos ({collectionCounts.collected})
              </button>
            </div>

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
              title="Exportar saídas atualmente filtradas para Excel"
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

        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-600 mr-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Data da saída:</span>
            </span>

            <label className="inline-flex items-center gap-1.5 text-slate-600">
              <span>De</span>
              <input
                type="date"
                aria-label="Data inicial da saída"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
              />
            </label>

            <label className="inline-flex items-center gap-1.5 text-slate-600">
              <span>Até</span>
              <input
                type="date"
                aria-label="Data final da saída"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
              />
            </label>

            <div className="flex flex-wrap items-center gap-1.5 sm:pl-2">
              <button
                type="button"
                onClick={() => {
                  if (isTodayActive) {
                    setDateFrom('');
                    setDateTo('');
                  } else {
                    setDateFrom(datePresets.today);
                    setDateTo(datePresets.today);
                  }
                }}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                  isTodayActive
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isLast7Active) {
                    setDateFrom('');
                    setDateTo('');
                  } else {
                    setDateFrom(datePresets.sevenDaysAgo);
                    setDateTo(datePresets.today);
                  }
                }}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                  isLast7Active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                Últimos 7 dias
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isMonthActive) {
                    setDateFrom('');
                    setDateTo('');
                  } else {
                    setDateFrom(datePresets.monthStart);
                    setDateTo(datePresets.today);
                  }
                }}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                  isMonthActive
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                Este mês
              </button>
            </div>
          </div>

          {hasDateFilter && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpar datas</span>
            </button>
          )}
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
              Registre solicitações de saída por descarte, devolução ao fornecedor, doação ou
              transferência e confirme o recolhimento físico com a equipe de separação.
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
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-3 tabular-nums">
              <span>
                {filteredExits.length}{' '}
                {filteredExits.length === 1 ? 'saída listada' : 'saídas listadas'}
              </span>
              {hasDateFilter && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-slate-800">
                    {dateFrom ? formatIsoToBrDate(dateFrom) : 'Início'} →{' '}
                    {dateTo ? formatIsoToBrDate(dateTo) : 'Hoje'}
                  </span>
                </>
              )}
              {collectionCounts.pending > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-amber-700">
                    {collectionCounts.pending} aguardando confirmação da separação
                  </span>
                </>
              )}
            </div>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              Total baixado: {formatNumberPtBr(totalQuantidadeSaida)}
            </span>
          </div>

          {filteredExits.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-slate-500">
                Nenhuma saída encontrada com os filtros atuais.
              </p>
              {hasAnyFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setMotivoFilter('todos');
                    setCollectionFilter('todos');
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Limpar todos os filtros</span>
                </button>
              )}
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
                    <th className="py-2.5 px-3 min-w-[100px]">Data Saída</th>
                    <th className="py-2.5 px-3 min-w-[205px]">Produto / Unidade / Lote</th>
                    <th className="py-2.5 px-3 min-w-[130px]">Rua / Palete</th>
                    <th className="py-2.5 px-3 min-w-[100px] text-right">Qtd. Saída</th>
                    <th className="py-2.5 px-3 min-w-[125px] text-right">Saldo (Ant. → Pós)</th>
                    <th className="py-2.5 px-3 min-w-[165px]">Motivo / Solicitante</th>
                    <th className="py-2.5 px-3 min-w-[225px]">Confirmação Separação</th>
                    {canReverse && <th className="py-2.5 px-3 w-36 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredExits.map((ex) => {
                    const isSelected = selectedIds.has(ex.id);
                    const recStatus = normalizeStatusRecolhimento(ex.statusRecolhimento);
                    const isRecolhido = recStatus === 'recolhido';
                    const isConfirmingThis = confirmingExitId === ex.id;
                    const recolhidoAtText = formatCollectionTimestamp(ex.recolhidoEm);

                    return (
                      <React.Fragment key={ex.id}>
                        <tr className={isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50/80'}>
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
                            <div className="text-[11px] text-slate-600 mt-0.5">
                              {ex.responsavel}
                              {ex.documentoRef ? ` · ${ex.documentoRef}` : ''}
                            </div>
                            {ex.observacoes && (
                              <div
                                className="text-[11px] text-slate-400 truncate max-w-[180px]"
                                title={ex.observacoes}
                              >
                                {ex.observacoes}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {isRecolhido ? (
                              <div className="space-y-0.5">
                                <div className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>Recolhido</span>
                                </div>
                                <div className="text-[11px] text-slate-600">
                                  Por <strong className="text-slate-800">{ex.recolhidoPor}</strong>
                                  {recolhidoAtText && (
                                    <span className="font-mono text-slate-400">
                                      {' '}
                                      · {recolhidoAtText}
                                    </span>
                                  )}
                                </div>
                                {ex.observacaoRecolhimento && (
                                  <div
                                    className="text-[11px] text-slate-500 truncate max-w-[210px]"
                                    title={ex.observacaoRecolhimento}
                                  >
                                    {ex.observacaoRecolhimento}
                                  </div>
                                )}
                                {canReverse && (
                                  <button
                                    type="button"
                                    disabled={busyId === ex.id}
                                    onClick={() => handleReopenCollection(ex.id)}
                                    className="text-[11px] text-slate-400 hover:text-slate-700 hover:underline cursor-pointer"
                                  >
                                    Reabrir conferência
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="inline-flex items-center gap-1.5 font-medium text-amber-700">
                                  <Clock className="w-3.5 h-3.5 shrink-0" />
                                  <span>Aguardando recolhimento</span>
                                </div>
                                <div>
                                  <button
                                    type="button"
                                    disabled={busyId === ex.id}
                                    onClick={() =>
                                      isConfirmingThis
                                        ? setConfirmingExitId(null)
                                        : openConfirmCollection(ex.id)
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap cursor-pointer"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>
                                      {isConfirmingThis ? 'Fechar' : 'Confirmar recolhimento'}
                                    </span>
                                  </button>
                                </div>
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
                                      setConfirmingExitId(null);
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
                                      setConfirmingExitId(null);
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

                        {isConfirmingThis && (
                          <tr className="bg-blue-50/40">
                            <td colSpan={colSpanCount} className="px-4 py-3 border-t border-blue-100">
                              <form
                                onSubmit={(e) => handleSubmitCollection(e, ex.id)}
                                className="flex flex-col lg:flex-row lg:items-end gap-3"
                              >
                                <div className="flex-1 min-w-[200px] space-y-1">
                                  <label
                                    htmlFor={`col-name-${ex.id}`}
                                    className="block text-[11px] font-semibold text-slate-700"
                                  >
                                    Conferido por (equipe de separação) *
                                  </label>
                                  <input
                                    id={`col-name-${ex.id}`}
                                    type="text"
                                    maxLength={EXIT_FIELD_LIMITS.recolhidoPorMax}
                                    value={collectorName}
                                    onChange={(e) => {
                                      setCollectorName(e.target.value);
                                      if (collectionError) setCollectionError(null);
                                    }}
                                    placeholder="Nome de quem recolheu o material"
                                    className="w-full px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                                  />
                                </div>

                                <div className="flex-1 min-w-[220px] space-y-1">
                                  <label
                                    htmlFor={`col-obs-${ex.id}`}
                                    className="block text-[11px] font-semibold text-slate-700"
                                  >
                                    Observação da separação (opcional)
                                  </label>
                                  <input
                                    id={`col-obs-${ex.id}`}
                                    type="text"
                                    maxLength={EXIT_FIELD_LIMITS.observacaoRecolhimentoMax}
                                    value={collectorObs}
                                    onChange={(e) => setCollectorObs(e.target.value)}
                                    placeholder="Ex.: Retirado completo da rua/palete"
                                    className="w-full px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                                  />
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="submit"
                                    disabled={busyId === ex.id}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>
                                      {busyId === ex.id
                                        ? 'Confirmando...'
                                        : 'Confirmar Recolhimento'}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmingExitId(null)}
                                    className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </form>
                              {collectionError && (
                                <p className="mt-1.5 text-xs text-red-700 font-medium">
                                  {collectionError}
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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

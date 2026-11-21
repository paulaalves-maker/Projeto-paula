import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Columns3,
  FileSpreadsheet,
  GripVertical,
  Keyboard,
  PackageMinus,
  Pencil,
  Rows3,
  Search,
  X,
} from 'lucide-react';
import {
  ETAPA_KANBAN_LABELS,
  ETAPA_KANBAN_ORDER,
  EtapaKanban,
  ExpiredItem,
  STATUS_LABELS,
  StatusTratativa,
  formatExpirationStatus,
  formatIsoToBrDate,
  formatNumberPtBr,
} from '../types/inventory';

interface KanbanBoardViewProps {
  items: ExpiredItem[];
  loading: boolean;
  locationFilter: string;
  onClearLocationFilter: () => void;
  onInspectItem: (item: ExpiredItem) => void;
  onMoveStage: (itemId: string, nextStage: EtapaKanban) => Promise<void>;
  onBulkMoveStage: (itemIds: string[], nextStage: EtapaKanban) => Promise<void>;
  onEditItem: (item: ExpiredItem) => void;
  onRegisterExit: (item: ExpiredItem) => void;
  onGoManual: () => void;
  onGoSpreadsheet: () => void;
}

const COLUMN_NUMBERS: Record<EtapaKanban, string> = {
  lote_ajustado: '01.',
  retirado_da_reserva: '02.',
  remessa_realizada: '03.',
};

type KanbanLayoutMode = 'colunas' | 'faixas';

export function KanbanBoardView({
  items,
  loading,
  locationFilter,
  onClearLocationFilter,
  onInspectItem,
  onMoveStage,
  onBulkMoveStage,
  onEditItem,
  onRegisterExit,
  onGoManual,
  onGoSpreadsheet,
}: KanbanBoardViewProps) {
  const [layoutMode, setLayoutMode] = useState<KanbanLayoutMode>('colunas');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | StatusTratativa>('todos');
  const [hideZeroBalance, setHideZeroBalance] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<EtapaKanban | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusyCol, setBulkBusyCol] = useState<EtapaKanban | null>(null);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== 'todos' && item.statusTratativa !== statusFilter) return false;
      if (hideZeroBalance && item.saldoAtual <= 0) return false;
      if (locationFilter && item.ruaPalete !== locationFilter) return false;
      if (!q) return true;
      return (
        item.descricao.toLowerCase().includes(q) ||
        item.unidade.toLowerCase().includes(q) ||
        item.lote.toLowerCase().includes(q) ||
        item.ruaPalete.toLowerCase().includes(q)
      );
    });
  }, [items, searchTerm, statusFilter, hideZeroBalance, locationFilter]);

  const groupedByStage = useMemo(() => {
    const groups: Record<EtapaKanban, ExpiredItem[]> = {
      lote_ajustado: [],
      retirado_da_reserva: [],
      remessa_realizada: [],
    };
    for (const item of filteredItems) {
      const stage = ETAPA_KANBAN_ORDER.includes(item.etapaKanban)
        ? item.etapaKanban
        : 'lote_ajustado';
      groups[stage].push(item);
    }
    return groups;
  }, [filteredItems]);

  async function handleCardMove(itemId: string, nextStage: EtapaKanban) {
    setBusyId(itemId);
    try {
      await onMoveStage(itemId, nextStage);
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdvanceAllInColumn(fromStage: EtapaKanban, toStage: EtapaKanban) {
    const columnItems = groupedByStage[fromStage];
    if (columnItems.length === 0) return;
    setBulkBusyCol(fromStage);
    try {
      await onBulkMoveStage(
        columnItems.map((i) => i.id),
        toStage,
      );
    } finally {
      setBulkBusyCol(null);
    }
  }

  function handleDragStart(e: React.DragEvent, itemId: string) {
    setDraggedItemId(itemId);
    e.dataTransfer.setData('text/plain', itemId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, stage: EtapaKanban) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== stage) {
      setDragOverColumn(stage);
    }
  }

  function handleDragLeave(stage: EtapaKanban) {
    if (dragOverColumn === stage) {
      setDragOverColumn(null);
    }
  }

  async function handleDrop(e: React.DragEvent, targetStage: EtapaKanban) {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('text/plain') || draggedItemId;
    setDragOverColumn(null);
    setDraggedItemId(null);
    if (!itemId) return;

    const currentItem = items.find((i) => i.id === itemId);
    if (!currentItem || currentItem.etapaKanban === targetStage) return;

    await handleCardMove(itemId, targetStage);
  }

  if (loading) {
    return (
      <div className="flex flex-nowrap gap-4 overflow-x-auto pb-2">
        {[0, 1, 2].map((col) => (
          <div
            key={col}
            className="min-w-[295px] flex-1 bg-white border border-slate-200 rounded-xl p-4 space-y-3"
          >
            <div className="h-6 w-40 bg-slate-100 rounded animate-pulse" />
            <div className="h-24 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-24 bg-slate-100 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
        <div className="max-w-md mx-auto space-y-2">
          <h3 className="font-display text-base font-semibold text-slate-900">
            Nenhum item no fluxo Kanban do Depósito 14
          </h3>
          <p className="text-sm text-slate-500">
            Cadastre itens manualmente ou extraia de uma planilha para acompanhá-los nas etapas Lote
            Ajustado, Retirado da Reserva e Remessa Realizada.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onGoManual}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
          >
            <Keyboard className="w-4 h-4" />
            <span>Cadastro Manual</span>
          </button>
          <button
            type="button"
            onClick={onGoSpreadsheet}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Extrair de Planilha</span>
          </button>
        </div>
      </div>
    );
  }

  function renderCard(item: ExpiredItem, prevStage: EtapaKanban | null, nextStage: EtapaKanban | null) {
    const exp = formatExpirationStatus(item.dataValidade);
    const isMoving = busyId === item.id;
    const isDraggingThis = draggedItemId === item.id;

    return (
      <article
        key={item.id}
        draggable={!isMoving}
        onDragStart={(e) => handleDragStart(e, item.id)}
        onDragEnd={() => {
          setDraggedItemId(null);
          setDragOverColumn(null);
        }}
        className={`bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between gap-2.5 transition-[transform,opacity,border-color] duration-150 ${
          layoutMode === 'faixas' ? 'w-[285px] shrink-0' : ''
        } ${isDraggingThis || isMoving ? 'opacity-50 scale-[0.98]' : 'hover:border-slate-300'}`}
      >
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-1.5 min-w-0">
              <GripVertical
                className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0 cursor-grab active:cursor-grabbing"
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => onInspectItem(item)}
                className={`text-left text-xs font-semibold leading-snug hover:text-blue-700 hover:underline transition-colors cursor-pointer ${
                  item.descricao ? 'text-slate-900' : 'text-slate-400 italic'
                }`}
              >
                {item.descricao || 'Sem descrição'}
              </button>
            </div>
            <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums shrink-0">
              {formatNumberPtBr(item.saldoAtual)}
            </span>
          </div>

          <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-5">
            <span className="font-mono text-slate-700">{item.unidade || '—'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-700">
              {item.lote ? `Lote ${item.lote}` : 'Sem lote'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {item.dataValidade ? `Val. ${formatIsoToBrDate(item.dataValidade)}` : 'Sem validade'}
            </span>
          </div>

          <div className="text-[11px] flex flex-wrap items-center justify-between gap-2 pl-5">
            <span className="font-mono text-slate-700 truncate">
              {item.ruaPalete || 'Sem endereço'}
            </span>
            <span
              className={`font-medium shrink-0 ${
                exp.severity === 'critical'
                  ? 'text-red-700'
                  : exp.severity === 'warning'
                    ? 'text-amber-700'
                    : 'text-slate-500'
              }`}
            >
              {exp.label}
            </span>
          </div>

          {item.statusTratativa !== 'nenhuma' && (
            <div className="text-[11px] pl-5">
              <span
                className={`font-semibold ${
                  item.statusTratativa === 'falta'
                    ? 'text-red-700'
                    : item.statusTratativa === 'sobra'
                      ? 'text-blue-700'
                      : 'text-amber-700'
                }`}
              >
                Obs.: {STATUS_LABELS[item.statusTratativa]}
              </span>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 pl-5">
          <div className="flex items-center gap-1">
            {prevStage && (
              <button
                type="button"
                disabled={isMoving}
                onClick={() => handleCardMove(item.id, prevStage)}
                title={`Voltar para ${ETAPA_KANBAN_LABELS[prevStage]}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Voltar</span>
              </button>
            )}
            {nextStage && (
              <button
                type="button"
                disabled={isMoving}
                onClick={() => handleCardMove(item.id, nextStage)}
                title={`Avançar para ${ETAPA_KANBAN_LABELS[nextStage]}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50/70 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Avançar</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={item.saldoAtual <= 0}
              onClick={() => onRegisterExit(item)}
              title={item.saldoAtual > 0 ? 'Registrar saída' : 'Sem saldo disponível'}
              className="p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-35 disabled:pointer-events-none rounded cursor-pointer"
            >
              <PackageMinus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onEditItem(item)}
              title="Editar item"
              className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </article>
    );
  }

  const totalFilteredCount = filteredItems.length;

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
              placeholder="Filtrar cartões por produto, unidade, lote ou rua/palete..."
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

          <div className="flex flex-wrap items-center gap-3">
            {locationFilter && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                <span>Endereço:</span>
                <strong className="font-mono text-slate-900">{locationFilter}</strong>
                <button
                  type="button"
                  onClick={onClearLocationFilter}
                  className="text-blue-700 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Limpar
                </button>
              </span>
            )}

            <select
              aria-label="Filtrar por observação"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'todos' | StatusTratativa)}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
            >
              <option value="todos">Todas as observações</option>
              {(Object.keys(STATUS_LABELS) as StatusTratativa[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideZeroBalance}
                onChange={(e) => setHideZeroBalance(e.target.checked)}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span>Ocultar saldo zerado</span>
            </label>

            <div
              role="group"
              aria-label="Modo de visualização do Kanban"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
            >
              <button
                type="button"
                onClick={() => setLayoutMode('colunas')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  layoutMode === 'colunas'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Columns3 className="w-3.5 h-3.5" />
                <span>Colunas</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('faixas')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  layoutMode === 'faixas'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Rows3 className="w-3.5 h-3.5" />
                <span>Faixas</span>
              </button>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4 text-slate-600">
            {ETAPA_KANBAN_ORDER.map((stage) => {
              const count = groupedByStage[stage].length;
              const pct = totalFilteredCount > 0 ? Math.round((count / totalFilteredCount) * 100) : 0;
              return (
                <span key={stage} className="inline-flex items-center gap-1.5 tabular-nums">
                  <span className="font-medium text-slate-700">
                    {COLUMN_NUMBERS[stage]} {ETAPA_KANBAN_LABELS[stage]}:
                  </span>
                  <strong className="font-mono text-slate-900">{count}</strong>
                  <span className="font-mono text-slate-400">({pct}%)</span>
                </span>
              );
            })}
          </div>
          <div className="w-full sm:w-56 h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
            {ETAPA_KANBAN_ORDER.map((stage, idx) => {
              const count = groupedByStage[stage].length;
              const widthPct = totalFilteredCount > 0 ? (count / totalFilteredCount) * 100 : 0;
              const barColor =
                idx === 0 ? 'bg-slate-400' : idx === 1 ? 'bg-amber-500' : 'bg-blue-700';
              return (
                <div
                  key={stage}
                  style={{ width: `${widthPct}%` }}
                  className={`${barColor} transition-[width] duration-200`}
                  title={`${ETAPA_KANBAN_LABELS[stage]}: ${count}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div
        className={
          layoutMode === 'colunas'
            ? 'flex flex-nowrap gap-4 overflow-x-auto pb-2 items-stretch'
            : 'space-y-4'
        }
      >
        {ETAPA_KANBAN_ORDER.map((stage, colIdx) => {
          const stageItems = groupedByStage[stage];
          const stageSaldo = stageItems.reduce((sum, i) => sum + i.saldoAtual, 0);
          const nextStage =
            colIdx < ETAPA_KANBAN_ORDER.length - 1 ? ETAPA_KANBAN_ORDER[colIdx + 1] : null;
          const prevStage = colIdx > 0 ? ETAPA_KANBAN_ORDER[colIdx - 1] : null;
          const isDropTarget = dragOverColumn === stage;

          return (
            <section
              key={stage}
              aria-label={ETAPA_KANBAN_LABELS[stage]}
              onDragOver={(e) => handleDragOver(e, stage)}
              onDragLeave={() => handleDragLeave(stage)}
              onDrop={(e) => handleDrop(e, stage)}
              className={`rounded-xl border transition-colors flex flex-col ${
                layoutMode === 'colunas'
                  ? 'min-w-[295px] sm:min-w-[310px] flex-1 max-h-[68vh] min-h-[420px]'
                  : 'w-full'
              } ${
                isDropTarget
                  ? 'bg-blue-50/40 border-blue-600'
                  : 'bg-slate-100/70 border-slate-200'
              }`}
            >
              <header
                className={`px-4 py-3 bg-white border-b border-slate-200 rounded-t-xl shrink-0 ${
                  layoutMode === 'faixas'
                    ? 'flex flex-wrap items-center justify-between gap-3'
                    : 'space-y-2'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-semibold text-slate-900 whitespace-nowrap truncate">
                    {COLUMN_NUMBERS[stage]} {ETAPA_KANBAN_LABELS[stage]}
                  </h2>
                  <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums shrink-0">
                    {stageItems.length} {stageItems.length === 1 ? 'item' : 'itens'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 text-xs text-slate-500">
                  <span className="font-mono tabular-nums">
                    Saldo: <strong className="text-slate-900">{formatNumberPtBr(stageSaldo)}</strong>
                  </span>
                  {nextStage && stageItems.length > 0 && (
                    <button
                      type="button"
                      disabled={bulkBusyCol === stage}
                      onClick={() => handleAdvanceAllInColumn(stage, nextStage)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>{bulkBusyCol === stage ? 'Movendo...' : 'Avançar todos'}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </header>

              <div
                className={
                  layoutMode === 'colunas'
                    ? 'p-3 space-y-2.5 flex-1 overflow-y-auto'
                    : 'p-3 flex flex-nowrap gap-3 overflow-x-auto items-stretch'
                }
              >
                {stageItems.length === 0 ? (
                  <div
                    className={`border border-dashed border-slate-300 rounded-lg p-6 text-center text-xs text-slate-500 ${
                      layoutMode === 'faixas' ? 'w-full' : ''
                    }`}
                  >
                    Arraste um item para cá ou use os botões nos cartões.
                  </div>
                ) : (
                  stageItems.map((item) => renderCard(item, prevStage, nextStage))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

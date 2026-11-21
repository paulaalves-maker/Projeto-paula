import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Keyboard,
  PackageMinus,
  Pencil,
  Search,
  Trash2,
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
import { exportItemsToExcel, exportSelectedReportToExcel } from '../utils/spreadsheet';
import { SelectedItemsReportModal } from './SelectedItemsReportModal';

export interface InventoryPresetFilter {
  status?: 'todos' | 'ocorrencias' | StatusTratativa;
  onlyWithBalance?: boolean;
  nonce: number;
}

interface InventoryTableProps {
  items: ExpiredItem[];
  loading: boolean;
  locationFilter: string;
  canEdit?: boolean;
  currentUserLabel?: string;
  presetFilter?: InventoryPresetFilter | null;
  onClearLocationFilter: () => void;
  onInspectItem: (item: ExpiredItem) => void;
  onEditItem: (item: ExpiredItem) => void;
  onRegisterExit: (item: ExpiredItem) => void;
  onChangeStatus: (itemId: string, status: StatusTratativa) => Promise<void>;
  onChangeKanbanStage: (itemId: string, stage: EtapaKanban) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onBulkUpdateStatus: (itemIds: string[], status: StatusTratativa) => Promise<void>;
  onBulkUpdateKanbanStage: (itemIds: string[], stage: EtapaKanban) => Promise<void>;
  onBulkDelete: (itemIds: string[]) => Promise<void>;
  onGoManual: () => void;
  onGoSpreadsheet: () => void;
}

type SortKey = 'dataValidade' | 'saldoAtual' | 'descricao' | 'ruaPalete';

export function InventoryTable({
  items,
  loading,
  locationFilter,
  canEdit = true,
  currentUserLabel,
  presetFilter,
  onClearLocationFilter,
  onInspectItem,
  onEditItem,
  onRegisterExit,
  onChangeStatus,
  onChangeKanbanStage,
  onDeleteItem,
  onBulkUpdateStatus,
  onBulkUpdateKanbanStage,
  onBulkDelete,
  onGoManual,
  onGoSpreadsheet,
}: InventoryTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ocorrencias' | StatusTratativa>('todos');
  const [onlyWithBalance, setOnlyWithBalance] = useState(false);
  const [originFilter, setOriginFilter] = useState<'todos' | 'manual' | 'planilha'>('todos');
  const [sortKey, setSortKey] = useState<SortKey>('dataValidade');
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  useEffect(() => {
    if (!presetFilter) return;
    if (presetFilter.status !== undefined) {
      setStatusFilter(presetFilter.status);
    }
    if (presetFilter.onlyWithBalance !== undefined) {
      setOnlyWithBalance(presetFilter.onlyWithBalance);
    }
  }, [presetFilter]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = items.filter((item) => {
      if (statusFilter === 'ocorrencias') {
        if (
          item.statusTratativa !== 'falta' &&
          item.statusTratativa !== 'sobra' &&
          item.statusTratativa !== 'avaria'
        ) {
          return false;
        }
      } else if (statusFilter !== 'todos' && item.statusTratativa !== statusFilter) {
        return false;
      }
      if (onlyWithBalance && item.saldoAtual <= 0) return false;
      if (originFilter !== 'todos' && item.origemCadastro !== originFilter) return false;
      if (locationFilter && item.ruaPalete !== locationFilter) return false;
      if (!q) return true;
      return (
        item.descricao.toLowerCase().includes(q) ||
        item.unidade.toLowerCase().includes(q) ||
        item.lote.toLowerCase().includes(q) ||
        item.ruaPalete.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'saldoAtual') {
        cmp = a.saldoAtual - b.saldoAtual;
      } else {
        cmp = a[sortKey].localeCompare(b[sortKey], 'pt-BR', { numeric: true });
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [items, searchTerm, statusFilter, onlyWithBalance, originFilter, locationFilter, sortKey, sortAsc]);

  const selectedItemsList = useMemo(() => {
    if (selectedIds.size === 0) return [];
    const inFiltered = filteredItems.filter((i) => selectedIds.has(i.id));
    const seen = new Set(inFiltered.map((i) => i.id));
    const extras = items.filter((i) => selectedIds.has(i.id) && !seen.has(i.id));
    return [...inFiltered, ...extras];
  }, [filteredItems, items, selectedIds]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
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

  async function handleConfirmSingleDelete(id: string) {
    setBusyAction(true);
    try {
      await onDeleteItem(id);
      setConfirmDeleteId(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } finally {
      setBusyAction(false);
    }
  }

  async function handleConfirmBulkDelete() {
    if (selectedIds.size === 0) return;
    setBusyAction(true);
    try {
      await onBulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
    } finally {
      setBusyAction(false);
    }
  }

  async function handleBulkStatus(status: StatusTratativa) {
    if (selectedIds.size === 0) return;
    setBusyAction(true);
    try {
      await onBulkUpdateStatus(Array.from(selectedIds), status);
      setSelectedIds(new Set());
    } finally {
      setBusyAction(false);
    }
  }

  async function handleBulkKanban(stage: EtapaKanban) {
    if (selectedIds.size === 0) return;
    setBusyAction(true);
    try {
      await onBulkUpdateKanbanStage(Array.from(selectedIds), stage);
      setSelectedIds(new Set());
    } finally {
      setBusyAction(false);
    }
  }

  const statusTabs: { id: 'todos' | 'ocorrencias' | StatusTratativa; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'ocorrencias', label: 'Ocorrências' },
    { id: 'nenhuma', label: 'Sem observação' },
    { id: 'falta', label: 'Falta' },
    { id: 'sobra', label: 'Sobra' },
    { id: 'avaria', label: 'Avaria' },
  ];

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        {[0, 1, 2, 3, 4].map((idx) => (
          <div
            key={idx}
            className="h-10 bg-slate-100 rounded-md animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
        <div className="max-w-md mx-auto space-y-2">
          <h3 className="font-display text-base font-semibold text-slate-900">
            Nenhum item vencido cadastrado no Depósito 14
          </h3>
          <p className="text-sm text-slate-500">
            Comece digitando os campos do primeiro produto ou importe diretamente de uma planilha Excel/CSV.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onGoManual}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
          >
            <Keyboard className="w-4 h-4" />
            <span>Cadastrar Primeiro Item</span>
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={onGoSpreadsheet}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Extrair de Planilha</span>
            </button>
          )}
        </div>
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
              placeholder="Buscar por produto, unidade, lote ou rua/palete..."
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
              {statusTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setOnlyWithBalance((v) => !v)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                onlyWithBalance
                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Com saldo
            </button>

            <select
              aria-label="Filtrar por origem"
              value={originFilter}
              onChange={(e) =>
                setOriginFilter(e.target.value as 'todos' | 'manual' | 'planilha')
              }
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
            >
              <option value="todos">Todas as origens</option>
              <option value="manual">Digitação Manual</option>
              <option value="planilha">Planilha</option>
            </select>

            <button
              type="button"
              onClick={() => exportItemsToExcel(filteredItems)}
              disabled={filteredItems.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Excel</span>
            </button>
          </div>
        </div>

        {(locationFilter || selectedItemsList.length > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {locationFilter && (
                <span className="inline-flex items-center gap-1.5 text-slate-700">
                  <span>Filtrando endereço:</span>
                  <strong className="font-mono text-slate-900">{locationFilter}</strong>
                  <button
                    type="button"
                    onClick={onClearLocationFilter}
                    className="text-blue-700 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    Remover
                  </button>
                </span>
              )}
              {selectedItemsList.length > 0 && (
                <span className="inline-flex items-center gap-2 text-slate-700 font-medium tabular-nums">
                  <span>
                    {selectedItemsList.length}{' '}
                    {selectedItemsList.length === 1 ? 'item selecionado' : 'itens selecionados'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIds(new Set());
                      setConfirmBulkDelete(false);
                    }}
                    className="text-slate-500 hover:text-slate-900 underline font-normal cursor-pointer"
                  >
                    Limpar seleção
                  </button>
                </span>
              )}
            </div>

            {selectedItemsList.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Gerar Relatório ({selectedItemsList.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => exportSelectedReportToExcel(selectedItemsList, currentUserLabel)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel selecionados</span>
                </button>

                {canEdit && (
                  <>
                    <select
                      aria-label="Alterar etapa Kanban em lote"
                      defaultValue=""
                      disabled={busyAction}
                      onChange={(e) => {
                        const val = e.target.value as EtapaKanban | '';
                        if (val) {
                          handleBulkKanban(val);
                          e.target.value = '';
                        }
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="" disabled>
                        Mover Kanban para...
                      </option>
                      {ETAPA_KANBAN_ORDER.map((k) => (
                        <option key={k} value={k}>
                          {ETAPA_KANBAN_LABELS[k]}
                        </option>
                      ))}
                    </select>

                    <select
                      aria-label="Alterar observação em lote"
                      defaultValue=""
                      disabled={busyAction}
                      onChange={(e) => {
                        const val = e.target.value as StatusTratativa | '';
                        if (val) {
                          handleBulkStatus(val);
                          e.target.value = '';
                        }
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="" disabled>
                        Alterar observação para...
                      </option>
                      {(Object.keys(STATUS_LABELS) as StatusTratativa[]).map((k) => (
                        <option key={k} value={k}>
                          {STATUS_LABELS[k]}
                        </option>
                      ))}
                    </select>

                    {confirmBulkDelete ? (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={handleConfirmBulkDelete}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Confirmar exclusão ({selectedItemsList.length})
                        </button>
                        <button
                          type="button"
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
                        Excluir selecionados
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Nenhum item encontrado com os filtros atuais.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      checked={
                        filteredItems.length > 0 &&
                        filteredItems.every((item) => selectedIds.has(item.id))
                      }
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-blue-700"
                    />
                  </th>
                  <th className="py-2.5 px-3 min-w-[220px]">
                    <button
                      type="button"
                      onClick={() => toggleSort('descricao')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      <span>Descrição do Produto</span>
                      <ArrowDownUp className="w-3 h-3 text-slate-400" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 min-w-[100px]">Unidade</th>
                  <th className="py-2.5 px-3 min-w-[115px]">Lote</th>
                  <th className="py-2.5 px-3 min-w-[155px]">
                    <button
                      type="button"
                      onClick={() => toggleSort('dataValidade')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      <span>Data de Validade</span>
                      <ArrowDownUp className="w-3 h-3 text-slate-400" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 min-w-[110px] text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('saldoAtual')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 ml-auto cursor-pointer"
                    >
                      <span>Saldo Atual</span>
                      <ArrowDownUp className="w-3 h-3 text-slate-400" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 min-w-[155px]">
                    <button
                      type="button"
                      onClick={() => toggleSort('ruaPalete')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                    >
                      <span>Rua / Palete</span>
                      <ArrowDownUp className="w-3 h-3 text-slate-400" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 min-w-[165px]">Etapa Kanban</th>
                  <th className="py-2.5 px-3 min-w-[145px]">Observação</th>
                  <th className="py-2.5 px-3 w-36 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredItems.map((item) => {
                  const exp = formatExpirationStatus(item.dataValidade);
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${item.descricao || 'item'}`}
                          checked={isSelected}
                          onChange={() => toggleRow(item.id)}
                          className="rounded border-slate-300 text-blue-700"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => onInspectItem(item)}
                          className={`text-left font-medium leading-snug hover:text-blue-700 hover:underline transition-colors cursor-pointer ${
                            item.descricao ? 'text-slate-900' : 'text-slate-400 italic'
                          }`}
                        >
                          {item.descricao || 'Sem descrição'}
                        </button>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span>
                            {item.origemCadastro === 'planilha' ? 'Planilha' : 'Manual'}
                          </span>
                          {item.observacoes && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate max-w-[200px]" title={item.observacoes}>
                                {item.observacoes}
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {item.unidade || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-800 tabular-nums">
                        {item.lote || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono text-slate-900 tabular-nums">
                          {item.dataValidade ? formatIsoToBrDate(item.dataValidade) : '—'}
                        </div>
                        <div
                          className={`text-[11px] font-medium ${
                            exp.severity === 'critical'
                              ? 'text-red-700'
                              : exp.severity === 'warning'
                                ? 'text-amber-700'
                                : 'text-slate-500'
                          }`}
                        >
                          {exp.label}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {formatNumberPtBr(item.saldoAtual)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-800">
                        {item.ruaPalete || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {canEdit ? (
                          <select
                            aria-label={`Etapa Kanban de ${item.descricao}`}
                            value={item.etapaKanban || 'lote_ajustado'}
                            onChange={(e) =>
                              onChangeKanbanStage(item.id, e.target.value as EtapaKanban)
                            }
                            className="px-2 py-1 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-700"
                          >
                            {ETAPA_KANBAN_ORDER.map((k) => (
                              <option key={k} value={k}>
                                {ETAPA_KANBAN_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs font-medium text-slate-700">
                            {ETAPA_KANBAN_LABELS[item.etapaKanban || 'lote_ajustado']}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {canEdit ? (
                          <select
                            aria-label={`Observação de ${item.descricao}`}
                            value={item.statusTratativa}
                            onChange={(e) =>
                              onChangeStatus(item.id, e.target.value as StatusTratativa)
                            }
                            className={`px-2 py-1 text-xs font-medium bg-white border rounded-md focus:outline-none focus:border-blue-700 ${
                              item.statusTratativa === 'falta'
                                ? 'border-red-200 text-red-800'
                                : item.statusTratativa === 'sobra'
                                  ? 'border-blue-200 text-blue-800'
                                  : item.statusTratativa === 'avaria'
                                    ? 'border-amber-200 text-amber-800'
                                    : 'border-slate-200 text-slate-600'
                            }`}
                          >
                            {(Object.keys(STATUS_LABELS) as StatusTratativa[]).map((k) => (
                              <option key={k} value={k}>
                                {STATUS_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`text-xs font-medium ${
                              item.statusTratativa === 'falta'
                                ? 'text-red-700'
                                : item.statusTratativa === 'sobra'
                                  ? 'text-blue-700'
                                  : item.statusTratativa === 'avaria'
                                    ? 'text-amber-700'
                                    : 'text-slate-500'
                            }`}
                          >
                            {STATUS_LABELS[item.statusTratativa]}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {canEdit && confirmDeleteId === item.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => handleConfirmSingleDelete(item.id)}
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
                              disabled={item.saldoAtual <= 0}
                              onClick={() => onRegisterExit(item)}
                              title={
                                item.saldoAtual > 0
                                  ? 'Registrar saída deste item'
                                  : 'Sem saldo disponível para saída'
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:pointer-events-none rounded-md transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <PackageMinus className="w-3.5 h-3.5" />
                              <span>Saída</span>
                            </button>
                            {canEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onEditItem(item)}
                                  title="Editar item"
                                  className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(item.id)}
                                  title="Excluir item"
                                  className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reportModalOpen && selectedItemsList.length > 0 && (
        <SelectedItemsReportModal
          items={selectedItemsList}
          generatedBy={currentUserLabel}
          onClose={() => setReportModalOpen(false)}
        />
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  MapPin,
  PackageMinus,
  Pencil,
  X,
} from 'lucide-react';
import {
  ETAPA_KANBAN_LABELS,
  ETAPA_KANBAN_ORDER,
  EtapaKanban,
  ExpiredItem,
  ItemExit,
  MOTIVO_SAIDA_LABELS,
  STATUS_LABELS,
  StatusTratativa,
  formatExpirationStatus,
  formatIsoToBrDate,
  formatNumberPtBr,
  normalizeObservacaoStatus,
} from '../types/inventory';

interface ItemDetailDrawerProps {
  item: ExpiredItem | null;
  exits: ItemExit[];
  canEdit: boolean;
  onClose: () => void;
  onRegisterExit: (item: ExpiredItem) => void;
  onEditItem: (item: ExpiredItem) => void;
  onChangeStatus: (itemId: string, status: StatusTratativa) => Promise<void>;
  onChangeKanbanStage: (itemId: string, stage: EtapaKanban) => Promise<void>;
}

const OBS_OPTIONS: StatusTratativa[] = ['nenhuma', 'falta', 'sobra', 'avaria'];

export function ItemDetailDrawer({
  item,
  exits,
  canEdit,
  onClose,
  onRegisterExit,
  onEditItem,
  onChangeStatus,
  onChangeKanbanStage,
}: ItemDetailDrawerProps) {
  const [updatingStage, setUpdatingStage] = useState(false);
  const [updatingObs, setUpdatingObs] = useState(false);

  useEffect(() => {
    if (!item) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, onClose]);

  const itemExits = useMemo(() => {
    if (!item) return [];
    return exits.filter((ex) => ex.itemId === item.id);
  }, [exits, item]);

  if (!item) return null;

  const exp = formatExpirationStatus(item.dataValidade);
  const currentObs = normalizeObservacaoStatus(item.statusTratativa);
  const currentStage = ETAPA_KANBAN_ORDER.includes(item.etapaKanban)
    ? item.etapaKanban
    : 'lote_ajustado';

  async function handleStageSelect(stage: EtapaKanban) {
    if (!item || !canEdit || stage === currentStage || updatingStage) return;
    setUpdatingStage(true);
    try {
      await onChangeKanbanStage(item.id, stage);
    } finally {
      setUpdatingStage(false);
    }
  }

  async function handleObsSelect(obs: StatusTratativa) {
    if (!item || !canEdit || obs === currentObs || updatingObs) return;
    setUpdatingObs(true);
    try {
      await onChangeStatus(item.id, obs);
    } finally {
      setUpdatingObs(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalhes de ${item.descricao || 'item'}`}
    >
      <div
        className="fixed inset-0 bg-slate-900/35 transition-opacity duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="relative z-10 w-full max-w-md bg-white border-l border-slate-200 h-full flex flex-col animate-[drawerIn_160ms_cubic-bezier(0.16,1,0.3,1)]">
        <header className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 space-y-1">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <span>Depósito 14</span>
              <span aria-hidden="true">·</span>
              <span>{item.origemCadastro === 'planilha' ? 'Planilha' : 'Manual'}</span>
            </div>
            <h2
              className={`font-display text-base font-bold leading-snug ${
                item.descricao ? 'text-slate-900' : 'text-slate-400 italic'
              }`}
            >
              {item.descricao || 'Sem descrição'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes"
            className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-2 border border-slate-200 rounded-lg divide-x divide-slate-200">
            <div className="p-3.5">
              <p className="text-xs text-slate-500">Saldo Atual</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {formatNumberPtBr(item.saldoAtual)}
              </p>
              <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                {item.unidade || 'Sem unidade'}
              </p>
            </div>
            <div className="p-3.5">
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Validade</span>
              </p>
              <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                {item.dataValidade ? formatIsoToBrDate(item.dataValidade) : '—'}
              </p>
              <p
                className={`text-[11px] font-medium mt-0.5 ${
                  exp.severity === 'critical'
                    ? 'text-red-700'
                    : exp.severity === 'warning'
                      ? 'text-amber-700'
                      : 'text-slate-500'
                }`}
              >
                {exp.label}
              </p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500">Lote</span>
              <span className="font-mono font-medium text-slate-900 tabular-nums">
                {item.lote || 'Não informado'}
              </span>
            </div>
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>Rua / Palete</span>
              </span>
              <span className="font-mono font-medium text-slate-900">
                {item.ruaPalete || 'Não informado'}
              </span>
            </div>
            {item.observacoes && (
              <div className="px-3.5 py-2.5 space-y-1">
                <span className="text-slate-500 block">Detalhes</span>
                <p className="text-slate-800 leading-relaxed">{item.observacoes}</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900">Etapa Kanban</h3>
              {!canEdit && (
                <span className="text-[11px] text-slate-400">Somente visualização</span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {ETAPA_KANBAN_ORDER.map((stage, idx) => {
                const active = stage === currentStage;
                return (
                  <button
                    key={stage}
                    type="button"
                    disabled={!canEdit || updatingStage}
                    onClick={() => handleStageSelect(stage)}
                    className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg border transition-colors text-left ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : canEdit
                          ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 cursor-pointer'
                          : 'bg-slate-50 text-slate-400 border-slate-200 cursor-default'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono opacity-75">0{idx + 1}.</span>
                      <span>{ETAPA_KANBAN_LABELS[stage]}</span>
                    </span>
                    {active && <span className="text-[11px] opacity-80">Atual</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-900">Observação</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {OBS_OPTIONS.map((obs) => {
                const active = obs === currentObs;
                return (
                  <button
                    key={obs}
                    type="button"
                    disabled={!canEdit || updatingObs}
                    onClick={() => handleObsSelect(obs)}
                    className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors text-left ${
                      active
                        ? obs === 'falta'
                          ? 'bg-red-50 text-red-800 border-red-300'
                          : obs === 'sobra'
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : obs === 'avaria'
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : 'bg-slate-900 text-white border-slate-900'
                        : canEdit
                          ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 cursor-pointer'
                          : 'bg-slate-50 text-slate-400 border-slate-200 cursor-default'
                    }`}
                  >
                    {STATUS_LABELS[obs]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900">
                Saídas deste item ({itemExits.length})
              </h3>
            </div>
            {itemExits.length === 0 ? (
              <p className="text-xs text-slate-500">
                Nenhuma saída registrada para este item até o momento.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {itemExits.map((ex) => (
                  <div key={ex.id} className="px-3 py-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        -{formatNumberPtBr(ex.quantidadeSaida)} {ex.unidade || ''}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                        {formatIsoToBrDate(ex.dataSaida)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-1.5">
                      <span>{MOTIVO_SAIDA_LABELS[ex.motivoSaida]}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ex.responsavel}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={item.saldoAtual <= 0}
            onClick={() => {
              onClose();
              onRegisterExit(item);
            }}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-45 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
          >
            <PackageMinus className="w-3.5 h-3.5" />
            <span>{item.saldoAtual > 0 ? 'Registrar Saída' : 'Saldo Zerado'}</span>
            {item.saldoAtual > 0 && <ArrowRight className="w-3.5 h-3.5" />}
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEditItem(item);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Editar</span>
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}

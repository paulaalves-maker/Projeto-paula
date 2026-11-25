import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, PackageMinus, X } from 'lucide-react';
import {
  EXIT_FIELD_LIMITS,
  ExpiredItem,
  ItemExitInput,
  MOTIVO_SAIDA_LABELS,
  MotivoSaida,
  STATUS_LABELS,
  StatusTratativa,
  formatIsoToBrDate,
  formatNumberPtBr,
  normalizeObservacaoStatus,
  validateItemExitInput,
} from '../types/inventory';

interface RegisterExitModalProps {
  items: ExpiredItem[];
  initialItem: ExpiredItem | null;
  defaultResponsavel: string;
  onConfirm: (input: ItemExitInput) => Promise<void>;
  onClose: () => void;
}

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function RegisterExitModal({
  items,
  initialItem,
  defaultResponsavel,
  onConfirm,
  onClose,
}: RegisterExitModalProps) {
  const availableItems = useMemo(
    () => items.filter((item) => item.saldoAtual > 0),
    [items],
  );

  const [selectedItemId, setSelectedItemId] = useState<string>(
    initialItem?.id || availableItems[0]?.id || '',
  );
  const [itemSearch, setItemSearch] = useState('');

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) || null,
    [items, selectedItemId],
  );

  const filteredSelectorItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return availableItems;
    return availableItems.filter(
      (i) =>
        i.descricao.toLowerCase().includes(q) ||
        i.unidade.toLowerCase().includes(q) ||
        i.lote.toLowerCase().includes(q) ||
        i.ruaPalete.toLowerCase().includes(q),
    );
  }, [availableItems, itemSearch]);

  const [quantidadeText, setQuantidadeText] = useState<string>(
    initialItem ? String(initialItem.saldoAtual) : '',
  );
  const [motivoSaida, setMotivoSaida] = useState<MotivoSaida>('descarte');
  const [dataSaida, setDataSaida] = useState<string>(getTodayIso());
  const [responsavel, setResponsavel] = useState<string>(defaultResponsavel);
  const [documentoRef, setDocumentoRef] = useState<string>('');
  const [observacoes, setObservacoes] = useState<string>('');
  const [novoStatus, setNovoStatus] = useState<StatusTratativa>(() =>
    normalizeObservacaoStatus(
      (initialItem || availableItems[0])?.statusTratativa,
    ),
  );
  const [statusEditedManually, setStatusEditedManually] = useState(false);

  const [errors, setErrors] = useState<Partial<Record<keyof ItemExitInput, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (initialItem) {
      setSelectedItemId(initialItem.id);
      setQuantidadeText(String(initialItem.saldoAtual));
      setNovoStatus(normalizeObservacaoStatus(initialItem.statusTratativa));
      setStatusEditedManually(false);
    }
  }, [initialItem]);

  const parsedQty = useMemo(() => {
    const normalized = quantidadeText.replace(',', '.').trim();
    if (!normalized) return Number.NaN;
    const val = Number(normalized);
    return Number.isFinite(val) ? val : Number.NaN;
  }, [quantidadeText]);

  const saldoRestante = useMemo(() => {
    if (!selectedItem) return 0;
    if (!Number.isFinite(parsedQty)) return selectedItem.saldoAtual;
    return Math.max(0, Math.round((selectedItem.saldoAtual - parsedQty) * 1000) / 1000);
  }, [selectedItem, parsedQty]);

  useEffect(() => {
    if (statusEditedManually || !selectedItem) return;
    setNovoStatus(normalizeObservacaoStatus(selectedItem.statusTratativa));
  }, [selectedItem, statusEditedManually]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedItem) {
      setErrors({ itemId: 'Selecione um item com saldo disponível.' });
      return;
    }

    const payload: ItemExitInput = {
      itemId: selectedItem.id,
      quantidadeSaida: parsedQty,
      motivoSaida,
      dataSaida,
      responsavel,
      documentoRef,
      observacoes,
      novoStatusTratativa: novoStatus,
    };

    const validation = validateItemExitInput(payload, selectedItem.saldoAtual);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm(payload);
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Erro ao registrar saída. Tente novamente.',
      );
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Registrar saída de item vencido"
    >
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-6 my-8 space-y-6">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <PackageMinus className="w-5 h-5 text-blue-700 shrink-0" />
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Registrar Saída — Depósito 14
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                A baixa reduz o saldo e fica como Aguardando recolhimento até a equipe de separação confirmar a retirada física.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="p-1.5 text-slate-400 hover:text-slate-900 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitError && (
          <div
            role="alert"
            className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5"
          >
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {!initialItem && (
            <div className="space-y-2">
              <label htmlFor="exit-item-search" className="block text-xs font-semibold text-slate-700">
                Selecionar Produto com Saldo Disponível <span className="text-red-600">*</span>
              </label>
              <input
                id="exit-item-search"
                type="text"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Filtrar item por nome, unidade, lote ou rua/palete..."
                className="w-full px-3 py-1.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
              />
              <select
                aria-label="Produto para saída"
                value={selectedItemId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedItemId(nextId);
                  const found = items.find((i) => i.id === nextId);
                  if (found) {
                    setQuantidadeText(String(found.saldoAtual));
                  }
                  setErrors({});
                }}
                className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
              >
                {filteredSelectorItems.length === 0 ? (
                  <option value="">Nenhum item com saldo disponível encontrado</option>
                ) : (
                  filteredSelectorItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.descricao || 'Sem descrição'} · {item.unidade || '—'} · Lote{' '}
                      {item.lote || '—'} · {item.ruaPalete || 'Sem endereço'} (Saldo:{' '}
                      {formatNumberPtBr(item.saldoAtual)})
                    </option>
                  ))
                )}
              </select>
              {errors.itemId && <p className="text-xs text-red-600">{errors.itemId}</p>}
            </div>
          )}

          {selectedItem && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">
                  {selectedItem.descricao || 'Sem descrição'}
                </span>
                <span className="font-mono text-xs font-semibold text-blue-800 tabular-nums shrink-0">
                  Saldo disponível: {formatNumberPtBr(selectedItem.saldoAtual)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                <span className="font-mono">{selectedItem.unidade || '—'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">Lote {selectedItem.lote || '—'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">
                  Validade{' '}
                  {selectedItem.dataValidade
                    ? formatIsoToBrDate(selectedItem.dataValidade)
                    : '—'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{selectedItem.ruaPalete || 'Sem endereço'}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="exit-qtd" className="block text-xs font-semibold text-slate-700">
                  Quantidade de Saída <span className="text-red-600">*</span>
                </label>
                {selectedItem && (
                  <button
                    type="button"
                    onClick={() => setQuantidadeText(String(selectedItem.saldoAtual))}
                    className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                  >
                    Saída total ({formatNumberPtBr(selectedItem.saldoAtual)})
                  </button>
                )}
              </div>
              <input
                id="exit-qtd"
                type="text"
                inputMode="decimal"
                value={quantidadeText}
                onChange={(e) => {
                  setQuantidadeText(e.target.value);
                  if (errors.quantidadeSaida) {
                    setErrors((prev) => ({ ...prev, quantidadeSaida: undefined }));
                  }
                }}
                placeholder="Ex.: 10"
                className={`w-full px-3.5 py-2 font-mono text-sm tabular-nums text-slate-900 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
                  errors.quantidadeSaida ? 'border-red-500' : 'border-slate-300'
                }`}
              />
              {selectedItem && Number.isFinite(parsedQty) && parsedQty > 0 && (
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  Saldo restante após saída: {formatNumberPtBr(saldoRestante)}
                </p>
              )}
              {errors.quantidadeSaida && (
                <p className="text-xs text-red-600">{errors.quantidadeSaida}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="exit-data" className="block text-xs font-semibold text-slate-700">
                Data da Saída <span className="text-red-600">*</span>
              </label>
              <input
                id="exit-data"
                type="date"
                value={dataSaida}
                onChange={(e) => setDataSaida(e.target.value)}
                className={`w-full px-3.5 py-2 font-mono text-sm text-slate-900 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
                  errors.dataSaida ? 'border-red-500' : 'border-slate-300'
                }`}
              />
              {errors.dataSaida && <p className="text-xs text-red-600">{errors.dataSaida}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="exit-motivo" className="block text-xs font-semibold text-slate-700">
                Motivo da Saída <span className="text-red-600">*</span>
              </label>
              <select
                id="exit-motivo"
                value={motivoSaida}
                onChange={(e) => setMotivoSaida(e.target.value as MotivoSaida)}
                className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
              >
                {(Object.keys(MOTIVO_SAIDA_LABELS) as MotivoSaida[]).map((m) => (
                  <option key={m} value={m}>
                    {MOTIVO_SAIDA_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="exit-status" className="block text-xs font-semibold text-slate-700">
                Observação do Item (Falta / Sobra / Avaria)
              </label>
              <select
                id="exit-status"
                value={novoStatus}
                onChange={(e) => {
                  setStatusEditedManually(true);
                  setNovoStatus(e.target.value as StatusTratativa);
                }}
                className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
              >
                {(Object.keys(STATUS_LABELS) as StatusTratativa[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="exit-resp" className="block text-xs font-semibold text-slate-700">
                Solicitante / Responsável <span className="text-red-600">*</span>
              </label>
              <input
                id="exit-resp"
                type="text"
                maxLength={EXIT_FIELD_LIMITS.responsavelMax}
                value={responsavel}
                onChange={(e) => {
                  setResponsavel(e.target.value);
                  if (errors.responsavel) {
                    setErrors((prev) => ({ ...prev, responsavel: undefined }));
                  }
                }}
                placeholder="Quem solicitou ou registrou a saída"
                className={`w-full px-3.5 py-2 text-sm text-slate-900 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
                  errors.responsavel ? 'border-red-500' : 'border-slate-300'
                }`}
              />
              {errors.responsavel && <p className="text-xs text-red-600">{errors.responsavel}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="exit-doc" className="block text-xs font-semibold text-slate-700">
                Documento / NF / MTR (opcional)
              </label>
              <input
                id="exit-doc"
                type="text"
                maxLength={EXIT_FIELD_LIMITS.documentoRefMax}
                value={documentoRef}
                onChange={(e) => setDocumentoRef(e.target.value)}
                placeholder="Ex.: NF 45892 ou MTR-2026-014"
                className="w-full px-3.5 py-2 font-mono text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="exit-obs" className="block text-xs font-semibold text-slate-700">
                Observações (opcional)
              </label>
              <textarea
                id="exit-obs"
                rows={2}
                maxLength={EXIT_FIELD_LIMITS.observacoesMax}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Detalhes da coleta, transportadora, lacre ou destino final..."
                className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedItem}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? (
                <span>Registrando...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirmar Saída</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

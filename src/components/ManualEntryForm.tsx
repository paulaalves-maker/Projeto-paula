import React, { useEffect, useState } from 'react';
import { Check, Plus, RotateCcw, Save } from 'lucide-react';
import {
  ETAPA_KANBAN_LABELS,
  ETAPA_KANBAN_ORDER,
  EtapaKanban,
  ExpiredItem,
  ExpiredItemInput,
  FIELD_LIMITS,
  STANDARD_UNITS,
  STATUS_LABELS,
  StatusTratativa,
  formatExpirationStatus,
  normalizeObservacaoStatus,
  validateExpiredItemInput,
} from '../types/inventory';

interface ManualEntryFormProps {
  editingItem?: ExpiredItem | null;
  knownLocations: string[];
  canManageStatus?: boolean;
  onSubmit: (data: ExpiredItemInput) => Promise<void>;
  onCancel?: () => void;
}

const EMPTY_FORM: ExpiredItemInput = {
  descricao: '',
  unidade: '',
  lote: '',
  dataValidade: '',
  saldoAtual: 0,
  ruaPalete: '',
  statusTratativa: 'nenhuma',
  etapaKanban: 'lote_ajustado',
  observacoes: '',
};

export function ManualEntryForm({
  editingItem,
  knownLocations,
  canManageStatus = true,
  onSubmit,
  onCancel,
}: ManualEntryFormProps) {
  const [form, setForm] = useState<ExpiredItemInput>(EMPTY_FORM);
  const [saldoText, setSaldoText] = useState<string>('');
  const [errors, setErrors] = useState<Partial<Record<keyof ExpiredItemInput, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [keepAdding, setKeepAdding] = useState(true);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (editingItem) {
      setForm({
        descricao: editingItem.descricao,
        unidade: editingItem.unidade,
        lote: editingItem.lote,
        dataValidade: editingItem.dataValidade,
        saldoAtual: editingItem.saldoAtual,
        ruaPalete: editingItem.ruaPalete,
        statusTratativa: normalizeObservacaoStatus(editingItem.statusTratativa),
        etapaKanban: editingItem.etapaKanban || 'lote_ajustado',
        observacoes: editingItem.observacoes || '',
      });
      setSaldoText(String(editingItem.saldoAtual));
      setErrors({});
      setSavedBanner(null);
    } else {
      setForm(EMPTY_FORM);
      setSaldoText('');
      setErrors({});
    }
  }, [editingItem]);

  function handleFieldChange<K extends keyof ExpiredItemInput>(field: K, value: ExpiredItemInput[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function handleSaldoChange(raw: string) {
    setSaldoText(raw);
    const normalized = raw.replace(',', '.');
    const num = normalized.trim() === '' ? Number.NaN : Number(normalized);
    setForm((prev) => ({ ...prev, saldoAtual: num }));
    if (errors.saldoAtual) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.saldoAtual;
        return next;
      });
    }
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavedBanner(null);
    setSubmitError(null);

    const parsedSaldo = saldoText.trim() === '' ? Number.NaN : Number(saldoText.replace(',', '.'));
    const candidate: ExpiredItemInput = {
      ...form,
      saldoAtual: parsedSaldo,
    };

    const validation = validateExpiredItemInput(candidate, {
      allowBlankFields: Boolean(editingItem && editingItem.origemCadastro === 'planilha'),
    });
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(candidate);
      if (!editingItem && keepAdding) {
        setForm({
          ...EMPTY_FORM,
          ruaPalete: form.ruaPalete,
        });
        setSaldoText('');
        setErrors({});
        setSavedBanner(`"${candidate.descricao}" cadastrado no Depósito 14.`);
      } else if (!editingItem) {
        setForm(EMPTY_FORM);
        setSaldoText('');
        setSavedBanner(`"${candidate.descricao}" cadastrado com sucesso.`);
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Erro ao salvar o item. Verifique sua conexão.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const expirationInfo = form.dataValidade ? formatExpirationStatus(form.dataValidade) : null;

  return (
    <form onSubmit={handleFormSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            {editingItem ? 'Editar Item Vencido' : 'Cadastro Manual — Depósito 14'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Preencha os campos do produto vencido para registro imediato no inventário.
          </p>
        </div>
        <span className="font-mono text-xs text-slate-500 shrink-0">Depósito 14</span>
      </div>

      {savedBanner && (
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5">
          <Check className="w-4 h-4 shrink-0 text-emerald-700" />
          <span>{savedBanner}</span>
        </div>
      )}

      {submitError && (
        <div
          role="alert"
          className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5"
        >
          {submitError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        <div className="md:col-span-8 space-y-1.5">
          <label htmlFor="campo-descricao" className="block text-xs font-semibold text-slate-700">
            Descrição do Produto <span className="text-red-600">*</span>
          </label>
          <input
            id="campo-descricao"
            type="text"
            maxLength={FIELD_LIMITS.descricaoMax}
            value={form.descricao}
            onChange={(e) => handleFieldChange('descricao', e.target.value)}
            placeholder="Ex.: Leite Condensado Integral 395g"
            className={`w-full px-3.5 py-2 text-sm text-slate-900 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
              errors.descricao ? 'border-red-500' : 'border-slate-300'
            }`}
          />
          {errors.descricao && <p className="text-xs text-red-600">{errors.descricao}</p>}
        </div>

        <div className="md:col-span-4 space-y-1.5">
          <label htmlFor="campo-unidade" className="block text-xs font-semibold text-slate-700">
            Unidade <span className="text-red-600">*</span>
          </label>
          <input
            id="campo-unidade"
            type="text"
            list="unidades-padrao"
            maxLength={FIELD_LIMITS.unidadeMax}
            value={form.unidade}
            onChange={(e) => handleFieldChange('unidade', e.target.value.toUpperCase())}
            placeholder="Ex.: UN, CX, KG"
            className={`w-full px-3.5 py-2 font-mono text-sm uppercase text-slate-900 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
              errors.unidade ? 'border-red-500' : 'border-slate-300'
            }`}
          />
          <datalist id="unidades-padrao">
            {STANDARD_UNITS.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
          {errors.unidade && <p className="text-xs text-red-600">{errors.unidade}</p>}
        </div>

        <div className="md:col-span-4 space-y-1.5">
          <label htmlFor="campo-lote" className="block text-xs font-semibold text-slate-700">
            Lote <span className="text-red-600">*</span>
          </label>
          <input
            id="campo-lote"
            type="text"
            maxLength={FIELD_LIMITS.loteMax}
            value={form.lote}
            onChange={(e) => handleFieldChange('lote', e.target.value)}
            placeholder="Ex.: L2408-99B"
            className={`w-full px-3.5 py-2 font-mono text-sm text-slate-900 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
              errors.lote ? 'border-red-500' : 'border-slate-300'
            }`}
          />
          {errors.lote && <p className="text-xs text-red-600">{errors.lote}</p>}
        </div>

        <div className="md:col-span-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="campo-validade" className="block text-xs font-semibold text-slate-700">
              Data de Validade <span className="text-red-600">*</span>
            </label>
            {expirationInfo && (
              <span
                className={`text-xs font-medium ${
                  expirationInfo.severity === 'critical'
                    ? 'text-red-700'
                    : expirationInfo.severity === 'warning'
                      ? 'text-amber-700'
                      : 'text-slate-600'
                }`}
              >
                {expirationInfo.label}
              </span>
            )}
          </div>
          <input
            id="campo-validade"
            type="date"
            value={form.dataValidade}
            onChange={(e) => handleFieldChange('dataValidade', e.target.value)}
            className={`w-full px-3.5 py-2 font-mono text-sm text-slate-900 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
              errors.dataValidade ? 'border-red-500' : 'border-slate-300'
            }`}
          />
          {errors.dataValidade && <p className="text-xs text-red-600">{errors.dataValidade}</p>}
        </div>

        <div className="md:col-span-4 space-y-1.5">
          <label htmlFor="campo-saldo" className="block text-xs font-semibold text-slate-700">
            Saldo Atual <span className="text-red-600">*</span>
          </label>
          <input
            id="campo-saldo"
            type="text"
            inputMode="decimal"
            value={saldoText}
            onChange={(e) => handleSaldoChange(e.target.value)}
            placeholder="Ex.: 48"
            className={`w-full px-3.5 py-2 font-mono text-sm tabular-nums text-slate-900 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
              errors.saldoAtual ? 'border-red-500' : 'border-slate-300'
            }`}
          />
          {errors.saldoAtual && <p className="text-xs text-red-600">{errors.saldoAtual}</p>}
        </div>

        <div className={`${canManageStatus ? 'md:col-span-4' : 'md:col-span-12'} space-y-1.5`}>
          <label htmlFor="campo-rua-palete" className="block text-xs font-semibold text-slate-700">
            Rua / Palete <span className="text-red-600">*</span>
          </label>
          <input
            id="campo-rua-palete"
            type="text"
            list="ruas-paletes-conhecidos"
            maxLength={FIELD_LIMITS.ruaPaleteMax}
            value={form.ruaPalete}
            onChange={(e) => handleFieldChange('ruaPalete', e.target.value)}
            placeholder="Ex.: Rua 04 · Palete B12"
            className={`w-full px-3.5 py-2 text-sm text-slate-900 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 ${
              errors.ruaPalete ? 'border-red-500' : 'border-slate-300'
            }`}
          />
          <datalist id="ruas-paletes-conhecidos">
            {knownLocations.map((loc) => (
              <option key={loc} value={loc} />
            ))}
          </datalist>
          {errors.ruaPalete && <p className="text-xs text-red-600">{errors.ruaPalete}</p>}
        </div>

        {canManageStatus && (
          <>
            <div className="md:col-span-4 space-y-1.5">
              <label htmlFor="campo-status" className="block text-xs font-semibold text-slate-700">
                Observação
              </label>
              <select
                id="campo-status"
                value={form.statusTratativa}
                onChange={(e) =>
                  handleFieldChange('statusTratativa', e.target.value as StatusTratativa)
                }
                className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
              >
                {(Object.keys(STATUS_LABELS) as StatusTratativa[]).map((statusKey) => (
                  <option key={statusKey} value={statusKey}>
                    {STATUS_LABELS[statusKey]}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-4 space-y-1.5">
              <label htmlFor="campo-kanban" className="block text-xs font-semibold text-slate-700">
                Etapa Kanban
              </label>
              <select
                id="campo-kanban"
                value={form.etapaKanban || 'lote_ajustado'}
                onChange={(e) =>
                  handleFieldChange('etapaKanban', e.target.value as EtapaKanban)
                }
                className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
              >
                {ETAPA_KANBAN_ORDER.map((stageKey) => (
                  <option key={stageKey} value={stageKey}>
                    {ETAPA_KANBAN_LABELS[stageKey]}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="md:col-span-12 space-y-1.5">
          <label htmlFor="campo-obs" className="block text-xs font-semibold text-slate-700">
            Notas Adicionais (opcional)
          </label>
          <textarea
            id="campo-obs"
            rows={2}
            maxLength={FIELD_LIMITS.observacoesMax}
            value={form.observacoes || ''}
            onChange={(e) => handleFieldChange('observacoes', e.target.value)}
            placeholder="Motivo da retenção, número da NF de devolução ou estado das embalagens..."
            className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 resize-none"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-slate-100">
        {!editingItem ? (
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={keepAdding}
              onChange={(e) => setKeepAdding(e.target.checked)}
              className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span>Manter Rua / Palete e limpar formulário para o próximo item</span>
          </label>
        ) : (
          <span className="text-xs text-slate-500">
            Editando registro existente no Depósito 14
          </span>
        )}

        <div className="flex items-center gap-3 shrink-0">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancelar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setForm(EMPTY_FORM);
                setSaldoText('');
                setErrors({});
                setSavedBanner(null);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Limpar</span>
            </button>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {editingItem ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>
              {submitting
                ? 'Salvando...'
                : editingItem
                  ? 'Salvar Alterações'
                  : 'Cadastrar Item'}
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}

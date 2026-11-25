import { Timestamp } from 'firebase/firestore';

export type StatusTratativa = 'nenhuma' | 'falta' | 'sobra' | 'avaria';
export type EtapaKanban = 'lote_ajustado' | 'retirado_da_reserva' | 'remessa_realizada';
export type OrigemCadastro = 'manual' | 'planilha';

export const DEPOSITO_PADRAO = 'Depósito 14' as const;
export const ADMIN_EMAIL = 'paula.alves@plantebemtec.com.br' as const;

export function isUserAdmin(
  email: string | null | undefined,
  emailVerified: boolean | undefined,
): boolean {
  return Boolean(emailVerified && email === ADMIN_EMAIL);
}

export const FIELD_LIMITS = {
  descricaoMin: 1,
  descricaoMax: 200,
  unidadeMin: 1,
  unidadeMax: 30,
  loteMin: 1,
  loteMax: 80,
  ruaPaleteMin: 1,
  ruaPaleteMax: 80,
  observacoesMax: 500,
  saldoMin: 0,
  saldoMax: 10000000,
  nomeArquivoMax: 200,
} as const;

export const VALID_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const STANDARD_UNITS = [
  'UN',
  'CX',
  'KG',
  'G',
  'L',
  'ML',
  'PCT',
  'FD',
  'SC',
  'PT',
  'BD',
  'DZ',
] as const;

export interface ExpiredItem {
  id: string;
  descricao: string;
  unidade: string;
  lote: string;
  dataValidade: string;
  saldoAtual: number;
  ruaPalete: string;
  deposito: typeof DEPOSITO_PADRAO;
  statusTratativa: StatusTratativa;
  etapaKanban: EtapaKanban;
  origemCadastro: OrigemCadastro;
  observacoes?: string;
  importBatchId?: string;
  ownerId: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ExpiredItemInput {
  descricao: string;
  unidade: string;
  lote: string;
  dataValidade: string;
  saldoAtual: number;
  ruaPalete: string;
  statusTratativa: StatusTratativa;
  etapaKanban?: EtapaKanban;
  observacoes?: string;
}

export interface ImportBatch {
  id: string;
  nomeArquivo: string;
  totalLinhas: number;
  deposito: typeof DEPOSITO_PADRAO;
  ownerId: string;
  createdAt: Timestamp | null;
}

export const STATUS_LABELS: Record<StatusTratativa, string> = {
  nenhuma: 'Sem observação',
  falta: 'Falta',
  sobra: 'Sobra',
  avaria: 'Avaria',
};

export function normalizeObservacaoStatus(value: unknown): StatusTratativa {
  if (value === 'falta' || value === 'sobra' || value === 'avaria' || value === 'nenhuma') {
    return value;
  }
  return 'nenhuma';
}

export const ETAPA_KANBAN_ORDER: EtapaKanban[] = [
  'lote_ajustado',
  'retirado_da_reserva',
  'remessa_realizada',
];

export const ETAPA_KANBAN_LABELS: Record<EtapaKanban, string> = {
  lote_ajustado: 'Ajustar Lote',
  retirado_da_reserva: 'Retirado da Reserva',
  remessa_realizada: 'Remessa Realizada',
};

export interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof ExpiredItemInput, string>>;
}

export function sanitizeItemInput(input: ExpiredItemInput): ExpiredItemInput {
  return {
    descricao: input.descricao.trim().slice(0, FIELD_LIMITS.descricaoMax),
    unidade: input.unidade.trim().toUpperCase().slice(0, FIELD_LIMITS.unidadeMax),
    lote: input.lote.trim().slice(0, FIELD_LIMITS.loteMax),
    dataValidade: input.dataValidade.trim().slice(0, 10),
    saldoAtual: Number.isFinite(input.saldoAtual)
      ? Math.min(FIELD_LIMITS.saldoMax, Math.max(FIELD_LIMITS.saldoMin, Math.round(input.saldoAtual * 1000) / 1000))
      : 0,
    ruaPalete: input.ruaPalete.trim().slice(0, FIELD_LIMITS.ruaPaleteMax),
    statusTratativa: normalizeObservacaoStatus(input.statusTratativa),
    etapaKanban: input.etapaKanban || 'lote_ajustado',
    observacoes: input.observacoes ? input.observacoes.trim().slice(0, FIELD_LIMITS.observacoesMax) : '',
  };
}

export function validateExpiredItemInput(
  raw: ExpiredItemInput,
  options?: { allowBlankFields?: boolean },
): ValidationResult {
  const data = sanitizeItemInput(raw);
  const errors: Partial<Record<keyof ExpiredItemInput, string>> = {};
  const allowBlank = Boolean(options?.allowBlankFields);

  if (!allowBlank && (!data.descricao || data.descricao.length < FIELD_LIMITS.descricaoMin)) {
    errors.descricao = 'Informe a descrição do produto.';
  } else if (data.descricao.length > FIELD_LIMITS.descricaoMax) {
    errors.descricao = `Máximo de ${FIELD_LIMITS.descricaoMax} caracteres.`;
  }

  if (!allowBlank && (!data.unidade || data.unidade.length < FIELD_LIMITS.unidadeMin)) {
    errors.unidade = 'Informe a unidade (ex.: UN, CX, KG).';
  } else if (data.unidade.length > FIELD_LIMITS.unidadeMax) {
    errors.unidade = `Máximo de ${FIELD_LIMITS.unidadeMax} caracteres.`;
  }

  if (!allowBlank && (!data.lote || data.lote.length < FIELD_LIMITS.loteMin)) {
    errors.lote = 'Informe o lote.';
  } else if (data.lote.length > FIELD_LIMITS.loteMax) {
    errors.lote = `Máximo de ${FIELD_LIMITS.loteMax} caracteres.`;
  }

  if (data.dataValidade) {
    if (!VALID_DATE_REGEX.test(data.dataValidade)) {
      errors.dataValidade = 'Data inválida (use AAAA-MM-DD).';
    } else {
      const parsed = new Date(`${data.dataValidade}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        errors.dataValidade = 'Data de validade inexistente.';
      }
    }
  } else if (!allowBlank) {
    errors.dataValidade = 'Data inválida (use AAAA-MM-DD).';
  }

  if (!Number.isFinite(raw.saldoAtual) || raw.saldoAtual < FIELD_LIMITS.saldoMin) {
    if (!allowBlank || (Number.isFinite(raw.saldoAtual) && raw.saldoAtual < FIELD_LIMITS.saldoMin)) {
      errors.saldoAtual = 'Saldo deve ser maior ou igual a zero.';
    }
  } else if (raw.saldoAtual > FIELD_LIMITS.saldoMax) {
    errors.saldoAtual = 'Saldo excede o limite permitido.';
  }

  if (!allowBlank && (!data.ruaPalete || data.ruaPalete.length < FIELD_LIMITS.ruaPaleteMin)) {
    errors.ruaPalete = 'Informe a Rua / Palete.';
  } else if (data.ruaPalete.length > FIELD_LIMITS.ruaPaleteMax) {
    errors.ruaPalete = `Máximo de ${FIELD_LIMITS.ruaPaleteMax} caracteres.`;
  }

  if (data.observacoes && data.observacoes.length > FIELD_LIMITS.observacoesMax) {
    errors.observacoes = `Máximo de ${FIELD_LIMITS.observacoesMax} caracteres.`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function getMissingItemFields(data: ExpiredItemInput, rawSaldoWasBlank = false): string[] {
  const missing: string[] = [];
  if (!data.descricao.trim()) missing.push('Descrição');
  if (!data.unidade.trim()) missing.push('Unidade');
  if (!data.lote.trim()) missing.push('Lote');
  if (!data.dataValidade.trim()) missing.push('Validade');
  if (rawSaldoWasBlank) missing.push('Saldo');
  if (!data.ruaPalete.trim()) missing.push('Rua/Palete');
  return missing;
}

export function formatIsoToBrDate(isoDate: string): string {
  if (!isoDate) return '—';
  if (!VALID_DATE_REGEX.test(isoDate)) return isoDate;
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export function getExpirationDeltaDays(isoDate: string): number | null {
  if (!VALID_DATE_REGEX.test(isoDate)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function formatExpirationStatus(isoDate: string): {
  label: string;
  severity: 'critical' | 'warning' | 'upcoming';
} {
  if (!isoDate || !isoDate.trim()) {
    return { label: 'Sem validade', severity: 'upcoming' };
  }
  const days = getExpirationDeltaDays(isoDate);
  if (days === null) {
    return { label: 'Data inválida', severity: 'warning' };
  }
  if (days < 0) {
    const abs = Math.abs(days);
    return {
      label: abs === 1 ? 'Vencido há 1 dia' : `Vencido há ${abs} dias`,
      severity: abs >= 30 ? 'critical' : 'warning',
    };
  }
  if (days === 0) {
    return { label: 'Vence hoje', severity: 'critical' };
  }
  if (days <= 15) {
    return { label: `Vence em ${days} d`, severity: 'warning' };
  }
  return { label: `Em ${days} d`, severity: 'upcoming' };
}

export function formatNumberPtBr(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 3,
  }).format(value);
}

export type MotivoSaida =
  | 'descarte'
  | 'devolucao_fornecedor'
  | 'doacao'
  | 'transferencia'
  | 'consumo_interno'
  | 'ajuste_inventario';

export const MOTIVO_SAIDA_LABELS: Record<MotivoSaida, string> = {
  descarte: 'Descarte / Destruição',
  devolucao_fornecedor: 'Devolução ao Fornecedor',
  doacao: 'Doação',
  transferencia: 'Transferência',
  consumo_interno: 'Consumo Interno',
  ajuste_inventario: 'Ajuste de Inventário',
};

export type StatusRecolhimento = 'aguardando_recolhimento' | 'recolhido';

export const STATUS_RECOLHIMENTO_LABELS: Record<StatusRecolhimento, string> = {
  aguardando_recolhimento: 'Aguardando recolhimento',
  recolhido: 'Recolhido',
};

export function normalizeStatusRecolhimento(value: unknown): StatusRecolhimento {
  return value === 'recolhido' ? 'recolhido' : 'aguardando_recolhimento';
}

export const EXIT_FIELD_LIMITS = {
  responsavelMin: 1,
  responsavelMax: 120,
  documentoRefMax: 100,
  observacoesMax: 500,
  recolhidoPorMax: 120,
  observacaoRecolhimentoMax: 300,
} as const;

export interface ItemExit {
  id: string;
  itemId: string;
  descricao: string;
  unidade: string;
  lote: string;
  dataValidade: string;
  ruaPalete: string;
  quantidadeSaida: number;
  saldoAnterior: number;
  saldoPosterior: number;
  motivoSaida: MotivoSaida;
  dataSaida: string;
  responsavel: string;
  documentoRef?: string;
  observacoes?: string;
  statusRecolhimento: StatusRecolhimento;
  recolhidoPor?: string;
  recolhidoPorUid?: string;
  recolhidoEm?: Timestamp | null;
  observacaoRecolhimento?: string;
  deposito: typeof DEPOSITO_PADRAO;
  ownerId: string;
  createdAt: Timestamp | null;
}

export interface ItemExitInput {
  itemId: string;
  quantidadeSaida: number;
  motivoSaida: MotivoSaida;
  dataSaida: string;
  responsavel: string;
  documentoRef?: string;
  observacoes?: string;
  novoStatusTratativa: StatusTratativa;
}

export interface ExitValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof ItemExitInput, string>>;
}

export function validateItemExitInput(
  raw: ItemExitInput,
  availableBalance: number,
): ExitValidationResult {
  const errors: Partial<Record<keyof ItemExitInput, string>> = {};

  if (!raw.itemId) {
    errors.itemId = 'Selecione um item do Depósito 14.';
  }

  if (!Number.isFinite(raw.quantidadeSaida) || raw.quantidadeSaida <= 0) {
    errors.quantidadeSaida = 'Informe uma quantidade maior que zero.';
  } else if (raw.quantidadeSaida > availableBalance) {
    errors.quantidadeSaida = `Quantidade excede o saldo disponível (${formatNumberPtBr(availableBalance)}).`;
  } else if (raw.quantidadeSaida > FIELD_LIMITS.saldoMax) {
    errors.quantidadeSaida = 'Quantidade excede o limite permitido.';
  }

  if (!VALID_DATE_REGEX.test(raw.dataSaida.trim())) {
    errors.dataSaida = 'Informe uma data de saída válida.';
  }

  const resp = raw.responsavel.trim();
  if (!resp || resp.length < EXIT_FIELD_LIMITS.responsavelMin) {
    errors.responsavel = 'Informe o responsável pela retirada.';
  } else if (resp.length > EXIT_FIELD_LIMITS.responsavelMax) {
    errors.responsavel = `Máximo de ${EXIT_FIELD_LIMITS.responsavelMax} caracteres.`;
  }

  if (raw.documentoRef && raw.documentoRef.trim().length > EXIT_FIELD_LIMITS.documentoRefMax) {
    errors.documentoRef = `Máximo de ${EXIT_FIELD_LIMITS.documentoRefMax} caracteres.`;
  }

  if (raw.observacoes && raw.observacoes.trim().length > EXIT_FIELD_LIMITS.observacoesMax) {
    errors.observacoes = `Máximo de ${EXIT_FIELD_LIMITS.observacoesMax} caracteres.`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}


import { User } from 'firebase/auth';
import {
  FileSpreadsheet,
  History,
  Kanban,
  Keyboard,
  LayoutList,
  LogOut,
  MapPin,
  PackageMinus,
  Shield,
  Warehouse,
  X,
} from 'lucide-react';
import { formatNumberPtBr } from '../types/inventory';

export type WorkspaceTab = 'lista' | 'kanban' | 'saidas' | 'manual' | 'planilha' | 'historico';

interface LocationSummary {
  ruaPalete: string;
  count: number;
  saldo: number;
}

interface SidebarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  totalItens: number;
  totalExits: number;
  pendingCollectionCount?: number;
  totalBatches: number;
  topLocations: LocationSummary[];
  activeLocationFilter: string;
  onSelectLocationFilter: (loc: string) => void;
  user: User;
  isAdmin: boolean;
  realIsAdmin: boolean;
  previewTeamMode: boolean;
  onTogglePreviewTeamMode: () => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  totalItens,
  totalExits,
  pendingCollectionCount = 0,
  totalBatches,
  topLocations,
  activeLocationFilter,
  onSelectLocationFilter,
  user,
  isAdmin,
  realIsAdmin,
  previewTeamMode,
  onTogglePreviewTeamMode,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const allNavItems: {
    id: WorkspaceTab;
    label: string;
    icon: typeof LayoutList;
    count?: number;
    pendingCount?: number;
    adminOnly?: boolean;
  }[] = [
    { id: 'lista', label: 'Itens Vencidos', icon: LayoutList, count: totalItens },
    { id: 'kanban', label: 'Kanban Operacional', icon: Kanban, count: totalItens, adminOnly: true },
    {
      id: 'saidas',
      label: 'Saídas Registradas',
      icon: PackageMinus,
      count: totalExits,
      pendingCount: pendingCollectionCount,
    },
    { id: 'manual', label: 'Cadastro Manual', icon: Keyboard },
    { id: 'planilha', label: 'Extrair de Planilha', icon: FileSpreadsheet, adminOnly: true },
    { id: 'historico', label: 'Importações', icon: History, count: totalBatches, adminOnly: true },
  ];

  const navItems = allNavItems.filter((item) => isAdmin || !item.adminOnly);

  const content = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64">
      <div className="flex items-center justify-between px-5 h-14 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Warehouse className="w-5 h-5 text-blue-700 shrink-0" />
          <span className="font-display text-base font-bold text-slate-900 tracking-tight whitespace-nowrap truncate">
            Depósito 14
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Fechar menu"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <nav aria-label="Navegação principal" className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-2.5 whitespace-nowrap truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {typeof item.pendingCount === 'number' && item.pendingCount > 0 && (
                    <span
                      title={`${item.pendingCount} aguardando recolhimento`}
                      className={`font-mono text-[11px] font-semibold tabular-nums ${
                        isActive ? 'text-amber-300' : 'text-amber-700'
                      }`}
                    >
                      {item.pendingCount} pend.
                    </span>
                  )}
                  {typeof item.count === 'number' && (
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        isActive ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </nav>

        {topLocations.length > 0 && (
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <div className="px-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Endereços (Rua / Palete)</span>
              {activeLocationFilter && (
                <button
                  type="button"
                  onClick={() => onSelectLocationFilter('')}
                  className="text-xs text-blue-700 hover:underline cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>
            <div className="space-y-0.5">
              {topLocations.map((loc) => {
                const selected = activeLocationFilter === loc.ruaPalete;
                return (
                  <button
                    key={loc.ruaPalete}
                    type="button"
                    onClick={() => {
                      onSelectLocationFilter(selected ? '' : loc.ruaPalete);
                      onSelectTab('lista');
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                      selected
                        ? 'bg-blue-50 text-blue-800 font-medium'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{loc.ruaPalete}</span>
                    </span>
                    <span className="font-mono text-slate-500 tabular-nums shrink-0 ml-2">
                      {formatNumberPtBr(loc.saldo)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-200 space-y-2 shrink-0">
        <div className="px-2 py-1 min-w-0 space-y-0.5">
          <p className="text-xs font-medium text-slate-900 truncate">
            {user.displayName || 'Operador'}
          </p>
          <p className="text-xs text-slate-500 truncate">{user.email}</p>
          <p className="text-[11px] font-medium text-blue-700 truncate">
            {isAdmin ? 'Administradora · Acesso Total' : 'Equipe · Cadastro e Saída'}
          </p>
        </div>

        {realIsAdmin && (
          <button
            type="button"
            onClick={onTogglePreviewTeamMode}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              previewTeamMode
                ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {previewTeamMode ? 'Voltar para Administradora' : 'Simular visão da Equipe'}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onSignOut}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span>Sair da conta</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/30"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
}

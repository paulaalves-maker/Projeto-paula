import { useEffect, useMemo, useRef, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import {
  ArrowUpRight,
  CheckCircle2,
  FileSpreadsheet,
  MapPin,
  Menu,
  PackageMinus,
  Plus,
  X,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExitsHistoryView } from './components/ExitsHistoryView';
import { ImportHistoryView } from './components/ImportHistoryView';
import { InventoryPresetFilter, InventoryTable } from './components/InventoryTable';
import { ItemDetailDrawer } from './components/ItemDetailDrawer';
import { KanbanBoardView } from './components/KanbanBoardView';
import { LoginScreen } from './components/LoginScreen';
import { ManualEntryForm } from './components/ManualEntryForm';
import { RegisterExitModal } from './components/RegisterExitModal';
import { Sidebar, WorkspaceTab } from './components/Sidebar';
import { SpreadsheetImporter } from './components/SpreadsheetImporter';
import { auth } from './firebase';
import {
  bulkDeleteExpiredItems,
  bulkDeleteItemExits,
  bulkUpdateKanbanStage,
  bulkUpdateStatus,
  confirmExitCollection,
  createManualExpiredItem,
  deleteAllSpreadsheetImports,
  deleteExpiredItem,
  deleteImportBatch,
  deleteItemExit,
  importSpreadsheetItemsBatch,
  registerItemExit,
  reopenExitCollection,
  reverseItemExit,
  subscribeExpiredItems,
  subscribeImportBatches,
  subscribeItemExits,
  updateExpiredItem,
  updateItemKanbanStage,
  updateItemStatus,
} from './services/inventoryService';
import {
  EtapaKanban,
  ExpiredItem,
  ExpiredItemInput,
  ImportBatch,
  ItemExit,
  ItemExitInput,
  StatusTratativa,
  formatNumberPtBr,
  isUserAdmin,
  normalizeStatusRecolhimento,
} from './types/inventory';

function WarehouseWorkspace() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('lista');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [previewTeamMode, setPreviewTeamMode] = useState(false);

  const [items, setItems] = useState<ExpiredItem[]>([]);
  const [exits, setExits] = useState<ItemExit[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingExits, setLoadingExits] = useState(true);
  const [firestoreError, setFirestoreError] = useState<Error | null>(null);

  const [locationFilter, setLocationFilter] = useState('');
  const [showLocationsBar, setShowLocationsBar] = useState(false);
  const [presetFilter, setPresetFilter] = useState<InventoryPresetFilter | null>(null);
  const [inspectingItemId, setInspectingItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ExpiredItem | null>(null);
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [exitTargetItem, setExitTargetItem] = useState<ExpiredItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 2800);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        setItems([]);
        setExits([]);
        setBatches([]);
        setLoadingData(false);
        setLoadingExits(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoadingData(true);
    setLoadingExits(true);
    setFirestoreError(null);

    let unsubItems: (() => void) | undefined;
    let unsubExits: (() => void) | undefined;
    let unsubBatches: (() => void) | undefined;

    try {
      unsubItems = subscribeExpiredItems(
        user.uid,
        user.email,
        user.emailVerified,
        (nextItems) => {
          setItems(nextItems);
          setLoadingData(false);
        },
        (err) => {
          setLoadingData(false);
          setFirestoreError(err instanceof Error ? err : new Error(String(err)));
        },
      );

      unsubExits = subscribeItemExits(
        user.uid,
        user.email,
        user.emailVerified,
        (nextExits) => {
          setExits(nextExits);
          setLoadingExits(false);
        },
        (err) => {
          setLoadingExits(false);
          setFirestoreError(err instanceof Error ? err : new Error(String(err)));
        },
      );

      unsubBatches = subscribeImportBatches(
        user.uid,
        user.email,
        user.emailVerified,
        (nextBatches) => {
          setBatches(nextBatches);
        },
      );
    } catch (err) {
      setLoadingData(false);
      setLoadingExits(false);
      setFirestoreError(err instanceof Error ? err : new Error(String(err)));
    }

    return () => {
      if (unsubItems) unsubItems();
      if (unsubExits) unsubExits();
      if (unsubBatches) unsubBatches();
    };
  }, [user]);

  if (firestoreError) {
    throw firestoreError;
  }

  const metrics = useMemo(() => {
    let saldoTotal = 0;
    let ocorrencias = 0;
    let hasAvailableForExit = false;
    const locationsMap = new Map<string, { count: number; saldo: number }>();

    for (const item of items) {
      saldoTotal += item.saldoAtual;
      if (item.saldoAtual > 0) hasAvailableForExit = true;
      if (
        item.statusTratativa === 'falta' ||
        item.statusTratativa === 'sobra' ||
        item.statusTratativa === 'avaria'
      ) {
        ocorrencias += 1;
      }

      const locKey = item.ruaPalete || 'Sem endereço';
      const prev = locationsMap.get(locKey) || { count: 0, saldo: 0 };
      locationsMap.set(locKey, {
        count: prev.count + 1,
        saldo: prev.saldo + item.saldoAtual,
      });
    }

    const totalSaidasQtd = exits.reduce((acc, ex) => acc + ex.quantidadeSaida, 0);
    const pendingCollectionCount = exits.filter(
      (ex) => normalizeStatusRecolhimento(ex.statusRecolhimento) === 'aguardando_recolhimento',
    ).length;

    const allLocations = Array.from(locationsMap.entries())
      .map(([ruaPalete, stats]) => ({ ruaPalete, ...stats }))
      .sort((a, b) => b.saldo - a.saldo);

    const topLocations = allLocations.slice(0, 8);

    return {
      totalRegistros: items.length,
      saldoTotal,
      ocorrencias,
      totalEnderecos: locationsMap.size,
      totalSaidasQtd,
      pendingCollectionCount,
      hasAvailableForExit,
      topLocations,
      allLocations,
      knownLocations: Array.from(locationsMap.keys()).sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    };
  }, [items, exits]);

  const inspectingItem = useMemo(
    () => (inspectingItemId ? items.find((i) => i.id === inspectingItemId) || null : null),
    [items, inspectingItemId],
  );

  const realIsAdmin = isUserAdmin(user?.email, user?.emailVerified);
  const effectiveIsAdmin = realIsAdmin && !previewTeamMode;

  useEffect(() => {
    if (!effectiveIsAdmin && (activeTab === 'kanban' || activeTab === 'planilha' || activeTab === 'historico')) {
      setActiveTab('lista');
    }
  }, [effectiveIsAdmin, activeTab]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500">Carregando sessão...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const tabTitles: Record<WorkspaceTab, string> = {
    lista: 'Itens Vencidos',
    kanban: 'Kanban Operacional',
    saidas: 'Saídas Registradas',
    manual: 'Cadastro Manual',
    planilha: 'Extração de Planilha',
    historico: 'Histórico de Importações',
  };

  async function handleManualCreate(data: ExpiredItemInput) {
    if (!user) return;
    await createManualExpiredItem(user.uid, data);
    showToast('Item cadastrado no Depósito 14.');
  }

  async function handleEditSave(data: ExpiredItemInput) {
    if (!editingItem) return;
    await updateExpiredItem(editingItem.id, data);
    setEditingItem(null);
    showToast('Cadastro do item atualizado.');
  }

  async function handleSpreadsheetImport(fileName: string, rows: ExpiredItemInput[]) {
    if (!user) return 0;
    const res = await importSpreadsheetItemsBatch(user.uid, fileName, rows);
    showToast(`${res.importedCount} ${res.importedCount === 1 ? 'item importado' : 'itens importados'}.`);
    return res.importedCount;
  }

  function openExitModalForItem(item: ExpiredItem | null) {
    setExitTargetItem(item);
    setExitModalOpen(true);
  }

  async function handleConfirmExit(input: ItemExitInput) {
    if (!user) return;
    await registerItemExit(user.uid, input);
    showToast('Solicitação de saída registrada; aguardando recolhimento.');
  }

  function applyKpiFilter(status: 'todos' | 'ocorrencias', onlyWithBalance: boolean) {
    setActiveTab('lista');
    setPresetFilter({ status, onlyWithBalance, nonce: Date.now() });
  }

  const collectorDisplayName = user.displayName || user.email || '';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        totalItens={items.length}
        totalExits={exits.length}
        pendingCollectionCount={metrics.pendingCollectionCount}
        totalBatches={batches.length}
        topLocations={metrics.topLocations}
        activeLocationFilter={locationFilter}
        onSelectLocationFilter={setLocationFilter}
        user={user}
        isAdmin={effectiveIsAdmin}
        realIsAdmin={realIsAdmin}
        previewTeamMode={previewTeamMode}
        onTogglePreviewTeamMode={() => setPreviewTeamMode((v) => !v)}
        onSignOut={() => signOut(auth)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu lateral"
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-md"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 whitespace-nowrap hidden sm:inline">
                Depósito 14
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {tabTitles[activeTab]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!metrics.hasAvailableForExit}
              onClick={() => openExitModalForItem(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PackageMinus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Registrar Saída</span>
              <span className="sm:hidden">Saída</span>
            </button>
            {effectiveIsAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('planilha')}
                className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'planilha'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Extrair Planilha</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Cadastro</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1360px] w-full mx-auto space-y-6">
          <section
            aria-label="Resumo do Depósito 14"
            className="bg-white border border-slate-200 rounded-xl overflow-hidden"
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
              <button
                type="button"
                onClick={() => applyKpiFilter('todos', true)}
                title="Filtrar itens com saldo disponível"
                className="p-4 sm:px-5 text-left hover:bg-slate-50 transition-colors group cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-500 group-hover:text-slate-700">
                    Saldo Atual em Depósito
                  </p>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-700 transition-colors shrink-0" />
                </div>
                <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                  {formatNumberPtBr(metrics.saldoTotal)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('saidas')}
                title="Abrir histórico de saídas e conferência de recolhimento"
                className="p-4 sm:px-5 text-left hover:bg-slate-50 transition-colors group cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-500 group-hover:text-slate-700">
                    Saídas Registradas
                  </p>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-700 transition-colors shrink-0" />
                </div>
                <div className="mt-1 flex items-baseline gap-2.5">
                  <p className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                    {formatNumberPtBr(metrics.totalSaidasQtd)}
                  </p>
                  {metrics.pendingCollectionCount > 0 && (
                    <span className="text-xs font-medium text-amber-700 whitespace-nowrap">
                      {metrics.pendingCollectionCount}{' '}
                      {metrics.pendingCollectionCount === 1 ? 'a recolher' : 'a recolher'}
                    </span>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={() => applyKpiFilter('ocorrencias', false)}
                title="Filtrar itens com falta, sobra ou avaria"
                className="p-4 sm:px-5 text-left hover:bg-slate-50 transition-colors group cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-500 group-hover:text-slate-700">
                    Falta / Sobra / Avaria
                  </p>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-amber-700 transition-colors shrink-0" />
                </div>
                <p className="mt-1 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
                  {metrics.ocorrencias}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setShowLocationsBar((v) => !v)}
                aria-expanded={showLocationsBar}
                title="Explorar ruas e paletes ocupados"
                className={`p-4 sm:px-5 text-left transition-colors group cursor-pointer ${
                  showLocationsBar ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-500 group-hover:text-slate-700">
                    Ruas / Paletes Ocupados
                  </p>
                  <MapPin
                    className={`w-3.5 h-3.5 transition-colors shrink-0 ${
                      showLocationsBar
                        ? 'text-blue-700'
                        : 'text-slate-300 group-hover:text-blue-700'
                    }`}
                  />
                </div>
                <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                  {metrics.totalEnderecos}
                </p>
              </button>
            </div>

            {showLocationsBar && metrics.allLocations.length > 0 && (
              <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-600 mr-1">
                  Filtrar por endereço:
                </span>
                {metrics.allLocations.map((loc) => {
                  const selected = locationFilter === loc.ruaPalete;
                  return (
                    <button
                      key={loc.ruaPalete}
                      type="button"
                      onClick={() => {
                        setLocationFilter(selected ? '' : loc.ruaPalete);
                        if (activeTab !== 'lista' && activeTab !== 'kanban') {
                          setActiveTab('lista');
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                        selected
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100/60'
                      }`}
                    >
                      <span className="font-mono">{loc.ruaPalete}</span>
                      <span
                        className={`font-mono text-[11px] tabular-nums ${
                          selected ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        {formatNumberPtBr(loc.saldo)}
                      </span>
                    </button>
                  );
                })}
                {locationFilter && (
                  <button
                    type="button"
                    onClick={() => setLocationFilter('')}
                    className="text-xs font-medium text-blue-700 hover:underline ml-1 cursor-pointer"
                  >
                    Limpar filtro
                  </button>
                )}
              </div>
            )}
          </section>

          {activeTab === 'lista' && (
            <InventoryTable
              items={items}
              loading={loadingData}
              locationFilter={locationFilter}
              canEdit={effectiveIsAdmin}
              currentUserLabel={user.displayName || user.email || undefined}
              presetFilter={presetFilter}
              onClearLocationFilter={() => setLocationFilter('')}
              onInspectItem={(item) => setInspectingItemId(item.id)}
              onEditItem={(item) => setEditingItem(item)}
              onRegisterExit={(item) => openExitModalForItem(item)}
              onChangeStatus={async (id, status: StatusTratativa) => {
                await updateItemStatus(id, status);
                showToast('Observação atualizada.');
              }}
              onChangeKanbanStage={async (id, stage: EtapaKanban) => {
                await updateItemKanbanStage(id, stage);
                showToast('Etapa Kanban atualizada.');
              }}
              onDeleteItem={async (id) => {
                await deleteExpiredItem(id);
                showToast('Item excluído.');
              }}
              onBulkUpdateStatus={async (ids, status) => {
                await bulkUpdateStatus(ids, status);
                showToast('Observação atualizada em lote.');
              }}
              onBulkUpdateKanbanStage={async (ids, stage) => {
                await bulkUpdateKanbanStage(ids, stage);
                showToast('Etapa Kanban atualizada em lote.');
              }}
              onBulkDelete={async (ids) => {
                await bulkDeleteExpiredItems(ids);
                showToast('Itens selecionados excluídos.');
              }}
              onGoManual={() => setActiveTab('manual')}
              onGoSpreadsheet={() => setActiveTab('planilha')}
            />
          )}

          {activeTab === 'kanban' && effectiveIsAdmin && (
            <KanbanBoardView
              items={items}
              loading={loadingData}
              locationFilter={locationFilter}
              onClearLocationFilter={() => setLocationFilter('')}
              onInspectItem={(item) => setInspectingItemId(item.id)}
              onMoveStage={async (id, nextStage) => {
                await updateItemKanbanStage(id, nextStage);
                showToast('Cartão movido no Kanban.');
              }}
              onBulkMoveStage={async (ids, nextStage) => {
                await bulkUpdateKanbanStage(ids, nextStage);
                showToast('Cartões movidos em lote.');
              }}
              onEditItem={(item) => setEditingItem(item)}
              onRegisterExit={(item) => openExitModalForItem(item)}
              onGoManual={() => setActiveTab('manual')}
              onGoSpreadsheet={() => setActiveTab('planilha')}
            />
          )}

          {activeTab === 'saidas' && (
            <ExitsHistoryView
              exits={exits}
              loading={loadingExits}
              hasAvailableItems={metrics.hasAvailableForExit}
              canReverse={effectiveIsAdmin}
              defaultCollectorName={collectorDisplayName}
              onOpenNewExit={() => openExitModalForItem(null)}
              onConfirmCollection={async (exitId, recolhidoPor, observacaoRecolhimento) => {
                await confirmExitCollection(exitId, user.uid, recolhidoPor, observacaoRecolhimento);
                showToast('Recolhimento confirmado pela separação.');
              }}
              onReopenCollection={async (exitId) => {
                await reopenExitCollection(exitId);
                showToast('Conferência de recolhimento reaberta.');
              }}
              onReverseExit={async (ex) => {
                await reverseItemExit(ex);
                showToast('Saída estornada e saldo devolvido.');
              }}
              onDeleteExit={async (exitId) => {
                await deleteItemExit(exitId);
                showToast('Registro de saída excluído.');
              }}
              onBulkDeleteExits={async (exitIds) => {
                await bulkDeleteItemExits(exitIds);
                showToast('Registros de saída excluídos.');
              }}
            />
          )}

          {activeTab === 'manual' && (
            <ManualEntryForm
              knownLocations={metrics.knownLocations}
              canManageStatus={effectiveIsAdmin}
              onSubmit={handleManualCreate}
            />
          )}

          {activeTab === 'planilha' && effectiveIsAdmin && (
            <SpreadsheetImporter
              existingBatchesCount={batches.length}
              onImportItems={handleSpreadsheetImport}
              onReplaceAllImports={async () => {
                const res = await deleteAllSpreadsheetImports();
                showToast('Importações anteriores removidas.');
                return res;
              }}
              onCompleteNavigate={() => setActiveTab('lista')}
              onGoHistory={() => setActiveTab('historico')}
            />
          )}

          {activeTab === 'historico' && effectiveIsAdmin && (
            <ImportHistoryView
              batches={batches}
              items={items}
              exits={exits}
              onGoImport={() => setActiveTab('planilha')}
              onDeleteBatch={async (batchId) => {
                const res = await deleteImportBatch(batchId);
                showToast('Importação excluída.');
                return res;
              }}
              onDeleteAllImports={async () => {
                const res = await deleteAllSpreadsheetImports();
                showToast('Todas as importações foram excluídas.');
                return res;
              }}
            />
          )}
        </main>
      </div>

      <ItemDetailDrawer
        item={inspectingItem}
        exits={exits}
        canEdit={effectiveIsAdmin}
        defaultCollectorName={collectorDisplayName}
        onClose={() => setInspectingItemId(null)}
        onRegisterExit={(item) => openExitModalForItem(item)}
        onEditItem={(item) => setEditingItem(item)}
        onConfirmExitCollection={async (exitId, recolhidoPor) => {
          await confirmExitCollection(exitId, user.uid, recolhidoPor);
          showToast('Recolhimento confirmado pela separação.');
        }}
        onChangeStatus={async (id, status) => {
          await updateItemStatus(id, status);
          showToast('Observação atualizada.');
        }}
        onChangeKanbanStage={async (id, stage) => {
          await updateItemKanbanStage(id, stage);
          showToast('Etapa Kanban atualizada.');
        }}
      />

      {editingItem && effectiveIsAdmin && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Editar item vencido"
        >
          <div className="relative w-full max-w-3xl my-8">
            <button
              type="button"
              onClick={() => setEditingItem(null)}
              aria-label="Fechar janela de edição"
              className="absolute right-4 top-4 p-1.5 text-slate-400 hover:text-slate-900 rounded-md z-10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <ManualEntryForm
              editingItem={editingItem}
              knownLocations={metrics.knownLocations}
              onSubmit={handleEditSave}
              onCancel={() => setEditingItem(null)}
            />
          </div>
        </div>
      )}

      {exitModalOpen && (
        <RegisterExitModal
          items={items}
          initialItem={exitTargetItem}
          defaultResponsavel={user.displayName || user.email || ''}
          onConfirm={handleConfirmExit}
          onClose={() => {
            setExitModalOpen(false);
            setExitTargetItem(null);
          }}
        />
      )}

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 bg-slate-900 text-white text-xs font-medium px-3.5 py-2.5 rounded-lg border border-slate-800 shadow-sm flex items-center gap-2.5 animate-[toastIn_150ms_cubic-bezier(0.16,1,0.3,1)] print:hidden"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            aria-label="Dispensar aviso"
            className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WarehouseWorkspace />
    </ErrorBoundary>
  );
}

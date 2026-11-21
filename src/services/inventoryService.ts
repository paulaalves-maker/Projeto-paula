import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../firebase';
import {
  ADMIN_EMAIL,
  DEPOSITO_PADRAO,
  ETAPA_KANBAN_ORDER,
  EXIT_FIELD_LIMITS,
  EtapaKanban,
  ExpiredItem,
  ExpiredItemInput,
  FIELD_LIMITS,
  ImportBatch,
  ItemExit,
  ItemExitInput,
  MotivoSaida,
  StatusTratativa,
  VALID_DATE_REGEX,
  normalizeObservacaoStatus,
  sanitizeItemInput,
} from '../types/inventory';

function generateSafeId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${randomPart}`.slice(0, 64);
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function subscribeExpiredItems(
  _uid: string,
  _userEmail: string | null | undefined,
  _emailVerified: boolean | undefined,
  onData: (items: ExpiredItem[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  const colRef = collection(db, 'expiredItems');
  const q = query(colRef, where('deposito', '==', DEPOSITO_PADRAO));

  return onSnapshot(
    q,
    (snapshot) => {
      const records: ExpiredItem[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          descricao: String(d.descricao ?? ''),
          unidade: 'unidade' in d ? String(d.unidade ?? '') : 'UN',
          lote: String(d.lote ?? ''),
          dataValidade: String(d.dataValidade ?? ''),
          saldoAtual: Number(d.saldoAtual ?? 0),
          ruaPalete: String(d.ruaPalete ?? ''),
          deposito: DEPOSITO_PADRAO,
          statusTratativa: normalizeObservacaoStatus(d.statusTratativa),
          etapaKanban: ETAPA_KANBAN_ORDER.includes(d.etapaKanban as EtapaKanban)
            ? (d.etapaKanban as EtapaKanban)
            : 'lote_ajustado',
          origemCadastro: d.origemCadastro === 'planilha' ? 'planilha' : 'manual',
          observacoes: typeof d.observacoes === 'string' ? d.observacoes : '',
          importBatchId: typeof d.importBatchId === 'string' ? d.importBatchId : undefined,
          ownerId: String(d.ownerId ?? ''),
          createdAt: d.createdAt ?? null,
          updatedAt: d.updatedAt ?? null,
        };
      });
      records.sort((a, b) => {
        const ta = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const tb = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return tb - ta;
      });
      onData(records);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, 'expiredItems');
    },
  );
}

export function subscribeImportBatches(
  _uid: string,
  userEmail: string | null | undefined,
  emailVerified: boolean | undefined,
  onData: (batches: ImportBatch[]) => void,
): () => void {
  const isAdmin = Boolean(emailVerified && userEmail === ADMIN_EMAIL);
  if (!isAdmin) {
    onData([]);
    return () => {};
  }

  const colRef = collection(db, 'importBatches');
  const q = query(colRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const batches: ImportBatch[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          nomeArquivo: String(d.nomeArquivo ?? ''),
          totalLinhas: Number(d.totalLinhas ?? 0),
          deposito: DEPOSITO_PADRAO,
          ownerId: String(d.ownerId ?? ''),
          createdAt: d.createdAt ?? null,
        };
      });
      batches.sort((a, b) => {
        const ta = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const tb = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return tb - ta;
      });
      onData(batches);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'importBatches');
    },
  );
}

export function subscribeItemExits(
  _uid: string,
  _userEmail: string | null | undefined,
  _emailVerified: boolean | undefined,
  onData: (exits: ItemExit[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  const colRef = collection(db, 'itemExits');
  const q = query(colRef, where('deposito', '==', DEPOSITO_PADRAO));

  return onSnapshot(
    q,
    (snapshot) => {
      const exits: ItemExit[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          itemId: String(d.itemId ?? ''),
          descricao: String(d.descricao ?? ''),
          unidade: 'unidade' in d ? String(d.unidade ?? '') : 'UN',
          lote: String(d.lote ?? ''),
          dataValidade: String(d.dataValidade ?? ''),
          ruaPalete: String(d.ruaPalete ?? ''),
          quantidadeSaida: Number(d.quantidadeSaida ?? 0),
          saldoAnterior: Number(d.saldoAnterior ?? 0),
          saldoPosterior: Number(d.saldoPosterior ?? 0),
          motivoSaida: (d.motivoSaida as MotivoSaida) || 'descarte',
          dataSaida: String(d.dataSaida ?? ''),
          responsavel: String(d.responsavel ?? ''),
          documentoRef: typeof d.documentoRef === 'string' ? d.documentoRef : '',
          observacoes: typeof d.observacoes === 'string' ? d.observacoes : '',
          deposito: DEPOSITO_PADRAO,
          ownerId: String(d.ownerId ?? ''),
          createdAt: d.createdAt ?? null,
        };
      });
      exits.sort((a, b) => {
        const ta = a.createdAt ? a.createdAt.toMillis() : Date.now();
        const tb = b.createdAt ? b.createdAt.toMillis() : Date.now();
        return tb - ta;
      });
      onData(exits);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, 'itemExits');
    },
  );
}

export async function createManualExpiredItem(uid: string, rawInput: ExpiredItemInput): Promise<string> {
  const data = sanitizeItemInput(rawInput);
  const itemId = generateSafeId('item');
  const docRef = doc(db, 'expiredItems', itemId);

  const payload: Record<string, unknown> = {
    descricao: data.descricao,
    unidade: data.unidade,
    lote: data.lote,
    dataValidade: data.dataValidade,
    saldoAtual: data.saldoAtual,
    ruaPalete: data.ruaPalete,
    deposito: DEPOSITO_PADRAO,
    statusTratativa: data.statusTratativa,
    etapaKanban: data.etapaKanban || 'lote_ajustado',
    origemCadastro: 'manual',
    ownerId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (data.observacoes) {
    payload.observacoes = data.observacoes;
  }

  try {
    await setDoc(docRef, payload);
    return itemId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `expiredItems/${itemId}`);
  }
}

export async function updateExpiredItem(itemId: string, rawInput: ExpiredItemInput): Promise<void> {
  const data = sanitizeItemInput(rawInput);
  const docRef = doc(db, 'expiredItems', itemId);

  try {
    await updateDoc(docRef, {
      descricao: data.descricao,
      unidade: data.unidade,
      lote: data.lote,
      dataValidade: data.dataValidade,
      saldoAtual: data.saldoAtual,
      ruaPalete: data.ruaPalete,
      statusTratativa: data.statusTratativa,
      etapaKanban: data.etapaKanban || 'lote_ajustado',
      observacoes: data.observacoes || '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `expiredItems/${itemId}`);
  }
}

export async function updateItemStatus(itemId: string, statusTratativa: StatusTratativa): Promise<void> {
  const docRef = doc(db, 'expiredItems', itemId);
  try {
    await updateDoc(docRef, {
      statusTratativa,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `expiredItems/${itemId}`);
  }
}

export async function updateItemKanbanStage(itemId: string, etapaKanban: EtapaKanban): Promise<void> {
  const docRef = doc(db, 'expiredItems', itemId);
  try {
    await updateDoc(docRef, {
      etapaKanban,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `expiredItems/${itemId}`);
  }
}

export async function bulkUpdateKanbanStage(itemIds: string[], etapaKanban: EtapaKanban): Promise<void> {
  const CHUNK_SIZE = 400;
  try {
    for (let i = 0; i < itemIds.length; i += CHUNK_SIZE) {
      const chunk = itemIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const id of chunk) {
        batch.update(doc(db, 'expiredItems', id), {
          etapaKanban,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'expiredItems');
  }
}

export async function bulkUpdateStatus(itemIds: string[], statusTratativa: StatusTratativa): Promise<void> {
  const CHUNK_SIZE = 400;
  try {
    for (let i = 0; i < itemIds.length; i += CHUNK_SIZE) {
      const chunk = itemIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const id of chunk) {
        batch.update(doc(db, 'expiredItems', id), {
          statusTratativa,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'expiredItems');
  }
}

export async function deleteExpiredItem(itemId: string): Promise<void> {
  const exitsQuery = query(
    collection(db, 'itemExits'),
    where('deposito', '==', DEPOSITO_PADRAO),
  );
  try {
    const exitsSnap = await getDocs(exitsQuery);
    const refsToDelete = exitsSnap.docs
      .filter((d) => d.data().itemId === itemId)
      .map((d) => d.ref);
    refsToDelete.push(doc(db, 'expiredItems', itemId));

    const CHUNK_SIZE = 400;
    for (let i = 0; i < refsToDelete.length; i += CHUNK_SIZE) {
      const chunk = refsToDelete.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const ref of chunk) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `expiredItems/${itemId}`);
  }
}

export async function bulkDeleteExpiredItems(itemIds: string[]): Promise<void> {
  const targetIds = new Set(itemIds);
  const exitsQuery = query(
    collection(db, 'itemExits'),
    where('deposito', '==', DEPOSITO_PADRAO),
  );
  const CHUNK_SIZE = 400;
  try {
    const exitsSnap = await getDocs(exitsQuery);
    const exitRefs = exitsSnap.docs
      .filter((d) => targetIds.has(String(d.data().itemId ?? '')))
      .map((d) => d.ref);
    const itemRefs = itemIds.map((id) => doc(db, 'expiredItems', id));
    const allRefs = [...exitRefs, ...itemRefs];

    for (let i = 0; i < allRefs.length; i += CHUNK_SIZE) {
      const chunk = allRefs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const ref of chunk) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'expiredItems');
  }
}

export async function deleteImportBatch(batchId: string): Promise<{
  deletedItems: number;
  deletedExits: number;
}> {
  const itemsQuery = query(
    collection(db, 'expiredItems'),
    where('deposito', '==', DEPOSITO_PADRAO),
  );
  const exitsQuery = query(
    collection(db, 'itemExits'),
    where('deposito', '==', DEPOSITO_PADRAO),
  );

  try {
    const [itemsSnap, exitsSnap] = await Promise.all([
      getDocs(itemsQuery),
      getDocs(exitsQuery),
    ]);

    const batchItemDocs = itemsSnap.docs.filter((d) => d.data().importBatchId === batchId);
    const batchItemIds = new Set(batchItemDocs.map((d) => d.id));
    const itemRefs = batchItemDocs.map((d) => d.ref);
    const exitRefs = exitsSnap.docs
      .filter((d) => batchItemIds.has(String(d.data().itemId ?? '')))
      .map((d) => d.ref);

    const refsToDelete = [...exitRefs, ...itemRefs, doc(db, 'importBatches', batchId)];

    const CHUNK_SIZE = 400;
    for (let i = 0; i < refsToDelete.length; i += CHUNK_SIZE) {
      const chunk = refsToDelete.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const ref of chunk) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    return {
      deletedItems: itemRefs.length,
      deletedExits: exitRefs.length,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `importBatches/${batchId}`);
  }
}

export async function deleteAllSpreadsheetImports(): Promise<{
  deletedItems: number;
  deletedBatches: number;
  deletedExits: number;
}> {
  const itemsQuery = query(
    collection(db, 'expiredItems'),
    where('deposito', '==', DEPOSITO_PADRAO),
  );
  const exitsQuery = query(
    collection(db, 'itemExits'),
    where('deposito', '==', DEPOSITO_PADRAO),
  );
  const batchesQuery = query(collection(db, 'importBatches'));

  try {
    const [itemsSnap, exitsSnap, batchesSnap] = await Promise.all([
      getDocs(itemsQuery),
      getDocs(exitsQuery),
      getDocs(batchesQuery),
    ]);

    const remainingManualIds = new Set<string>();
    const itemRefs: ReturnType<typeof doc>[] = [];

    for (const d of itemsSnap.docs) {
      const data = d.data();
      if (data.origemCadastro === 'planilha' || Boolean(data.importBatchId)) {
        itemRefs.push(d.ref);
      } else {
        remainingManualIds.add(d.id);
      }
    }

    const exitRefs = exitsSnap.docs
      .filter((d) => !remainingManualIds.has(String(d.data().itemId ?? '')))
      .map((d) => d.ref);
    const batchRefs = batchesSnap.docs.map((d) => d.ref);
    const allRefs = [...exitRefs, ...itemRefs, ...batchRefs];

    const CHUNK_SIZE = 400;
    for (let i = 0; i < allRefs.length; i += CHUNK_SIZE) {
      const chunk = allRefs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const ref of chunk) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    return {
      deletedItems: itemRefs.length,
      deletedBatches: batchRefs.length,
      deletedExits: exitRefs.length,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'importBatches');
  }
}

export async function importSpreadsheetItemsBatch(
  uid: string,
  fileName: string,
  items: ExpiredItemInput[],
): Promise<{ batchId: string; importedCount: number }> {
  const safeFileName = (fileName.trim() || 'planilha.xlsx').slice(0, FIELD_LIMITS.nomeArquivoMax);
  const batchId = generateSafeId('batch');
  const batchDocRef = doc(db, 'importBatches', batchId);

  const CHUNK_SIZE = 380;
  try {
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      if (i === 0) {
        batch.set(batchDocRef, {
          nomeArquivo: safeFileName,
          totalLinhas: items.length,
          deposito: DEPOSITO_PADRAO,
          ownerId: uid,
          createdAt: serverTimestamp(),
        });
      }

      for (const rawItem of chunk) {
        const clean = sanitizeItemInput(rawItem);
        const safeDate = VALID_DATE_REGEX.test(clean.dataValidade) ? clean.dataValidade : '';
        const itemId = generateSafeId('item');
        const itemRef = doc(db, 'expiredItems', itemId);
        const payload: Record<string, unknown> = {
          descricao: clean.descricao,
          unidade: clean.unidade,
          lote: clean.lote,
          dataValidade: safeDate,
          saldoAtual: clean.saldoAtual,
          ruaPalete: clean.ruaPalete,
          deposito: DEPOSITO_PADRAO,
          statusTratativa: clean.statusTratativa,
          etapaKanban: clean.etapaKanban || 'lote_ajustado',
          origemCadastro: 'planilha',
          importBatchId: batchId,
          ownerId: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (clean.observacoes) {
          payload.observacoes = clean.observacoes;
        }
        batch.set(itemRef, payload);
      }

      await batch.commit();
    }

    return { batchId, importedCount: items.length };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `importBatches/${batchId}`);
  }
}

export async function registerItemExit(uid: string, input: ItemExitInput): Promise<string> {
  const exitId = generateSafeId('exit');
  const itemRef = doc(db, 'expiredItems', input.itemId);
  const exitRef = doc(db, 'itemExits', exitId);
  const qty = roundQuantity(input.quantidadeSaida);

  try {
    await runTransaction(db, async (transaction) => {
      const itemSnap = await transaction.get(itemRef);
      if (!itemSnap.exists()) {
        throw new Error('Item não encontrado no Depósito 14.');
      }

      const itemData = itemSnap.data();
      const saldoAnterior = roundQuantity(Number(itemData.saldoAtual ?? 0));
      if (qty <= 0 || qty > saldoAnterior) {
        throw new Error(
          `Quantidade de saída (${qty}) superior ao saldo disponível (${saldoAnterior}).`,
        );
      }

      const saldoPosterior = roundQuantity(Math.max(0, saldoAnterior - qty));
      const nowServer = serverTimestamp();

      const exitPayload: Record<string, unknown> = {
        itemId: input.itemId,
        descricao: String(itemData.descricao ?? '').slice(0, FIELD_LIMITS.descricaoMax),
        unidade: ('unidade' in itemData ? String(itemData.unidade ?? '') : 'UN').slice(
          0,
          FIELD_LIMITS.unidadeMax,
        ),
        lote: String(itemData.lote ?? '').slice(0, FIELD_LIMITS.loteMax),
        dataValidade: String(itemData.dataValidade ?? '').slice(0, 10),
        ruaPalete: String(itemData.ruaPalete ?? '').slice(0, FIELD_LIMITS.ruaPaleteMax),
        quantidadeSaida: qty,
        saldoAnterior,
        saldoPosterior,
        motivoSaida: input.motivoSaida,
        dataSaida: input.dataSaida.trim().slice(0, 10),
        responsavel: input.responsavel.trim().slice(0, EXIT_FIELD_LIMITS.responsavelMax),
        deposito: DEPOSITO_PADRAO,
        ownerId: uid,
        createdAt: nowServer,
      };

      const docRefText = input.documentoRef?.trim().slice(0, EXIT_FIELD_LIMITS.documentoRefMax);
      if (docRefText) {
        exitPayload.documentoRef = docRefText;
      }

      const obsText = input.observacoes?.trim().slice(0, EXIT_FIELD_LIMITS.observacoesMax);
      if (obsText) {
        exitPayload.observacoes = obsText;
      }

      transaction.update(itemRef, {
        saldoAtual: saldoPosterior,
        statusTratativa: input.novoStatusTratativa,
        updatedAt: nowServer,
      });

      transaction.set(exitRef, exitPayload);
    });

    return exitId;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('não encontrado') || error.message.includes('superior ao saldo'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `itemExits/${exitId}`);
  }
}

export async function reverseItemExit(exit: ItemExit): Promise<void> {
  const exitRef = doc(db, 'itemExits', exit.id);
  const itemRef = doc(db, 'expiredItems', exit.itemId);

  try {
    await runTransaction(db, async (transaction) => {
      const itemSnap = await transaction.get(itemRef);
      if (itemSnap.exists()) {
        const currentSaldo = roundQuantity(Number(itemSnap.data().saldoAtual ?? 0));
        const restoredSaldo = roundQuantity(
          Math.min(FIELD_LIMITS.saldoMax, currentSaldo + exit.quantidadeSaida),
        );
        const nextStatus = normalizeObservacaoStatus(itemSnap.data().statusTratativa);

        transaction.update(itemRef, {
          saldoAtual: restoredSaldo,
          statusTratativa: nextStatus,
          updatedAt: serverTimestamp(),
        });
      }

      transaction.delete(exitRef);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `itemExits/${exit.id}`);
  }
}

export async function deleteItemExit(exitId: string): Promise<void> {
  const exitRef = doc(db, 'itemExits', exitId);
  try {
    await deleteDoc(exitRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `itemExits/${exitId}`);
  }
}

export async function bulkDeleteItemExits(exitIds: string[]): Promise<void> {
  const CHUNK_SIZE = 400;
  try {
    for (let i = 0; i < exitIds.length; i += CHUNK_SIZE) {
      const chunk = exitIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const id of chunk) {
        batch.delete(doc(db, 'itemExits', id));
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'itemExits');
  }
}


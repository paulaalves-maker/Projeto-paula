# Especificação de Segurança — Depósito 14 (Controle de Itens Vencidos)

## Invariantes de Dados
1. **Identidade & Propriedade**: Todo documento em `/expiredItems/{itemId}` e `/importBatches/{batchId}` pertence ao usuário autenticado (`ownerId == request.auth.uid`), com verificação de e-mail (`request.auth.token.email_verified == true`).
2. **Integridade de Campos**: Nenhum campo não autorizado ("shadow field") é aceito na criação (`hasAll` + `hasOnly`) ou atualização (`affectedKeys().hasOnly(...)`).
3. **Imutabilidade**: `ownerId`, `createdAt`, `deposito` e `origemCadastro` não podem ser alterados após a criação.
4. **Integridade Temporal**: `createdAt` e `updatedAt` devem corresponder estritamente a `request.time`.
5. **Limites Volumétricos**: Strings possuem limites explícitos de `.size()` e `saldoAtual` deve ser número `>= 0` e `<= 10000000`. IDs de documentos respeitam `^[a-zA-Z0-9_\-]+$` com tamanho máximo de 128 caracteres.
6. **Escopo de Listagem**: `allow list` exige `resource.data.ownerId == request.auth.uid` ou administrador verificado por token (`email_verified == true`), sem chamadas `get()`/`exists()` em consultas de lista.

## Matriz de Ataques ("Dirty Dozen")
1. Usuário não autenticado tentando criar/ler/atualizar item -> `PERMISSION_DENIED`.
2. Usuário autenticado com `email_verified == false` tentando gravar -> `PERMISSION_DENIED`.
3. Criação com `ownerId` de outro usuário (Identity Spoofing) -> `PERMISSION_DENIED`.
4. Criação com campo fantasma (`isAdmin: true` ou `extra: 1`) -> `PERMISSION_DENIED`.
5. Criação com `createdAt` forjado pelo cliente diferente de `request.time` -> `PERMISSION_DENIED`.
6. Criação com `dataValidade` não-vazia fora do padrão `YYYY-MM-DD` -> `PERMISSION_DENIED`.
7. Criação com `saldoAtual` negativo (`-5`) ou string (`"10"`) -> `PERMISSION_DENIED`.
8. Criação com `descricao` acima de 200 caracteres (Resource Poisoning) -> `PERMISSION_DENIED`.
9. ID de documento inválido (ex: 200 chars ou caracteres inválidos) -> `PERMISSION_DENIED`.
10. Atualização tentando alterar `ownerId` ou `createdAt` -> `PERMISSION_DENIED`.
11. Atualização de usuário B em documento pertencente ao usuário A -> `PERMISSION_DENIED`.
12. Query `list` sem filtro de propriedade por usuário não-admin -> `PERMISSION_DENIED`.

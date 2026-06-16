## Objetivo

Tornar o drag-and-drop do Kanban à prova de falhas em dois cenários problemáticos:
1. Soltar o card fora de qualquer coluna (área inválida).
2. Múltiplas movimentações rápidas (cliques sucessivos / arrastar enquanto outro update ainda está pendente), que hoje causam corridas, posições incorretas e o erro de update no banco.

## Arquivo a alterar

- `src/routes/_authenticated/kanban.tsx` (somente este — UI + handlers; sem mudança de schema)

## Mudanças

### 1. Guardas no estado de drag
- Adicionar `useRef<boolean>` `isProcessingMove` para travar enquanto uma mutação está em andamento.
- Centralizar o reset dos estados (`dragging`, `draggingGroup`, `draggingFromCol`) em uma única função `resetDragState()` chamada em **todos** os caminhos (drop válido, drop inválido, `onDragEnd`, erro).

### 2. Handler `onDragEnd` global
- No container do board, adicionar `onDragEnd` que sempre chama `resetDragState()`. Garante limpeza mesmo quando o usuário solta fora.

### 3. Validação no `onDrop` da coluna
Antes de executar `move` / `moveMany` / `reorderInColumn`:
- Confirmar que `dragging` (ou `draggingGroup`) está setado; caso contrário, ignorar.
- Confirmar que o `column_id` alvo existe na lista de colunas.
- Se `isProcessingMove.current === true`, abortar o drop com um `toast.info("Aguarde…")` para evitar concorrência.
- `event.preventDefault()` + `event.stopPropagation()` apenas quando o alvo é válido.

### 4. Validação no `onDrop` do card (reorder)
- Ignorar drop se `targetCardId === dragging` (soltar em si mesmo).
- Ignorar se o card alvo não pertence à mesma coluna de origem (`draggingFromCol`).
- Se `draggingGroup` estiver ativo, ignorar reorder (grupo só move entre colunas).

### 5. Serialização das mutações
- Envolver `move`, `moveMany` e `reorderInColumn` num wrapper `safeMutate(fn)`:
  - `if (isProcessingMove.current) return;`
  - `isProcessingMove.current = true;`
  - `try { await fn(); } catch (e) { logger.error(...); toast.error("Falha ao mover card"); } finally { isProcessingMove.current = false; resetDragState(); queryClient.invalidateQueries(...); }`
- Garante: nunca duas writes paralelas, estado sempre limpo, UI sempre sincronizada após erro.

### 6. `reorderInColumn` — robustez
- Validar entradas: se `cards.length < 2`, retornar.
- Se `movingId === targetId`, retornar.
- Recalcular `sort_order` com passo seguro (`Math.floor(Date.now()/1000) - index`) para manter dentro do INTEGER e preservar a ordem.

### 7. Detalhes de UX
- Adicionar `onDragLeave` na coluna para limpar destaque visual quando o cursor sai.
- `onDragOver` continua com `preventDefault()` para permitir o drop, mas só nas zonas válidas (coluna e card da mesma coluna).

## Resultado esperado

- Soltar fora de uma coluna → nada acontece, estados resetam.
- Arrastar rapidamente vários cards → mutações são serializadas, sem corrida nem erro de SQL.
- Erros do servidor não deixam mais o card "preso" no estado de dragging.

# Pastas e Arquivos + Chat Organizador

Nova funcionalidade integrada ao Kanban de produção, sem alterar o fluxo atual de criação de cards a partir de vendas.

## 1. Banco de dados (migration)

Criar 3 tabelas no schema `public`, com GRANTs, RLS e policies.

### `project_folders`
- `id` uuid PK, `sale_id` uuid FK→sales, `kanban_card_id` uuid FK→service_orders
- `client_name` text, `service_type` text, `folder_name` text
- `google_drive_link` text null
- `created_by` uuid FK→auth.users
- `created_at`, `updated_at` timestamptz
- UNIQUE(`kanban_card_id`)

### `project_folder_files`
- `id`, `folder_id` FK→project_folders (on delete cascade)
- `sale_id`, `kanban_card_id`
- `file_name`, `file_url` (storage path), `file_type` (mime), `file_size` bigint
- `file_category` enum text: `roteiro | imagens | videos | pdfs | referencias | audios | entrega_final`
- `uploaded_by`, `created_at`

### `project_folder_messages`
- `id`, `folder_id`, `sale_id`, `kanban_card_id`
- `message` text null, `audio_url` text null, `file_url` text null, `file_id` uuid null FK→project_folder_files
- `sender_id`, `created_at`

### Trigger
- Ao inserir em `service_orders`, criar automaticamente uma `project_folder` com nome `"{cliente} - {serviço} - DD-MM-AAAA"` derivado do sale/customer/service_type.
- Backfill: gerar pastas para os service_orders já existentes.

### RLS (via `has_role` + joins)
- **Admin**: ALL em tudo.
- **Vendedor**: SELECT/INSERT onde `sale.seller_id` mapeia para ele (via `sellers.user_id`).
- **Produtor**: SELECT/INSERT onde `service_order.producer_id` mapeia para ele (via `producers.user_id`).
- DELETE em `project_folder_files`: apenas admin.

## 2. Storage

Bucket privado **`project-files`**. Estrutura: `{sale_id}/{categoria}/{filename}`.

Policies em `storage.objects` espelhando RLS das tabelas (admin tudo; vendedor/produtor escopo das suas vendas/cards; apenas admin deleta).

## 3. Server functions (`src/lib/project-folders.functions.ts`)

Todas com `requireSupabaseAuth`:
- `listFolders({ search?, sellerId?, producerId?, columnId? })`
- `getFolder({ folderId })` → folder + arquivos agrupados por categoria + mensagens
- `updateFolder({ folderId, google_drive_link })`
- `createSignedUploadUrl({ folderId, category, fileName, contentType })` → retorna URL assinada do Storage (upload direto do browser)
- `registerUploadedFile({ folderId, category, file_name, file_url, file_type, file_size })`
- `deleteFile({ fileId })` (admin)
- `sendMessage({ folderId, message?, file_id?, audio_url? })`
- `listMessages({ folderId })`
- `parseCommand({ folderId, text, pendingFileIds[] })` — interpreta comandos simples ("coloca em referências", "esse pdf é roteiro", "entrega final") e move/atribui categoria; sem IA externa, regex/keywords.

## 4. Rotas (TanStack, sob `_authenticated`)

- `src/routes/_authenticated/pastas-arquivos.tsx` — grid estilo Google Drive
  - busca por cliente, filtros (vendedor, produtor, coluna kanban)
  - card de pasta com: nome, cliente, serviço, qtd arquivos, botões "Abrir", "Copiar link interno", campo Google Drive
- `src/routes/_authenticated/pastas-arquivos.$folderId.tsx` — visão da pasta
  - colunas por categoria, ícones por tipo (imagem/pdf/vídeo/áudio/doc)
  - upload arrastar-soltar por categoria
- `src/routes/_authenticated/chat-organizador.tsx`
  - lista lateral de pastas (busca por cliente)
  - painel de chat: input texto, upload (imagem/pdf/vídeo/doc), gravação de áudio (MediaRecorder)
  - parser de comandos chama `parseCommand`
  - mensagens com preview do arquivo

## 5. Kanban (alterações mínimas em `src/routes/_authenticated/kanban.tsx`)

No card, adicionar dois botões ao lado dos existentes:
- **Abrir pasta da plataforma** → navega para `/pastas-arquivos/{folderId}` (consulta `project_folders` por `kanban_card_id`)
- **Adicionar link do Google Drive** → popover com input que salva em `project_folders.google_drive_link`

Não tocar em drag-and-drop nem na lógica de ordenação.

## 6. Sidebar (`src/components/app-sidebar.tsx`)

Adicionar dois itens:
- "Pastas e Arquivos" → `/pastas-arquivos` (ícone FolderOpen)
- "Chat Organizador" → `/chat-organizador` (ícone MessagesSquare)

## 7. Detalhes técnicos

- Upload: client gera signed URL via server fn, faz PUT direto no Storage, depois chama `registerUploadedFile`.
- Áudio do chat: `MediaRecorder` → blob webm → upload em `{sale_id}/audios/chat-{timestamp}.webm`.
- Parser de comandos: keywords pt-BR → categoria (`roteiro`, `imagens/imagem`, `vídeos/video`, `pdfs/pdf`, `referências/referencia`, `áudios/audio`, `entrega final`). "monta pasta pra X" só confirma que a pasta existe (já é criada por trigger).
- Ícones de arquivo: lucide (FileImage, FileVideo, FileAudio, FileText, File).
- Permissões na UI: ocultar botão deletar para não-admin (via `has_role`).

## Arquivos a criar/editar

**Criar:**
- migration (tabelas, trigger, RLS, backfill)
- bucket `project-files` (privado) + policies storage
- `src/lib/project-folders.functions.ts`
- `src/routes/_authenticated/pastas-arquivos.tsx`
- `src/routes/_authenticated/pastas-arquivos.$folderId.tsx`
- `src/routes/_authenticated/chat-organizador.tsx`
- `src/components/project-folders/folder-card.tsx`
- `src/components/project-folders/file-tile.tsx`
- `src/components/project-folders/audio-recorder.tsx`

**Editar:**
- `src/components/app-sidebar.tsx` (2 itens)
- `src/routes/_authenticated/kanban.tsx` (2 botões no card — sem mexer no DnD)

## Confirmações antes de implementar

1. **Trigger automático**: criar pasta no momento em que o `service_order` é inserido (recomendado) — OK?
2. **Backfill**: gerar pastas para todos os cards já existentes do Kanban — OK?
3. **Tamanho máximo de upload**: 50 MB por arquivo — OK?

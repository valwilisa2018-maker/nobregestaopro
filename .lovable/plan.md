## Objetivo

Criar o novo módulo **Transcrição de Áudio e Vídeo**, com uma experiência profissional para enviar arquivos, acompanhar o processamento, revisar o texto e exportar o resultado.

## O que será criado

### 1. Nova página de transcrição
- Nova opção **Transcrição** no menu **Operação**.
- Área de upload por clique ou arrastar e soltar.
- Suporte aos formatos mais comuns de áudio e vídeo, com validação clara de tipo e tamanho.
- Pré-visualização do arquivo selecionado, exibindo nome, formato, tamanho e duração quando disponível.
- Botões para trocar ou remover o arquivo antes de iniciar.

### 2. Processamento com Lovable AI
- Áudios serão enviados ao serviço de transcrição dedicado, com detecção automática do idioma.
- Vídeos terão a fala analisada pelo modelo multimodal compatível, sem expor chaves no navegador.
- O envio ficará protegido pelo login atual e terá mensagens de erro completas em português.
- Estados visuais distintos: aguardando arquivo, enviando, transcrevendo, concluído e erro.
- Limites serão verificados antes do envio para evitar arquivos vazios, incompatíveis ou grandes demais.

### 3. Área de resultado profissional
- Texto transcrito em um editor amplo e ajustável.
- Indicadores de palavras, caracteres e duração do arquivo.
- Ações para **copiar**, **baixar em TXT**, **limpar** e iniciar uma nova transcrição.
- O texto permanecerá editável para correções antes da cópia ou download.
- Layout responsivo, seguindo o visual premium atual da plataforma, sem alterar outras páginas.

### 4. Permissões e navegação
- Registrar o módulo no sistema existente de permissões para que administradores possam liberar ou bloquear acesso por usuário.
- Adicionar o item ao menu lateral respeitando automaticamente essas permissões.
- Criar título e descrição próprios da página.

## Detalhes técnicos

- Nova rota autenticada para a interface do módulo.
- Endpoint seguro no servidor para receber o arquivo e chamar a IA.
- Reaproveitar o login, os componentes visuais e as notificações em português já existentes.
- Atualizar o fluxo antigo de transcrição para o modelo e endpoint atuais, evitando o modelo obsoleto hoje presente no projeto.
- Nenhum arquivo será salvo permanentemente nesta primeira versão; ele será usado apenas durante a transcrição.
- Validar o resultado com um arquivo de fala real e testar a página em desktop e celular.

## Fora do escopo

- Biblioteca ou histórico permanente de transcrições.
- Identificação de diferentes locutores e marcação de tempo por palavra.
- Tradução automática ou geração de legendas SRT/VTT.

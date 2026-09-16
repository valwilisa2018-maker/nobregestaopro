# Montar o fluxo arrastando blocos (visual estilo tela enviada)

Hoje o fluxo é montado numa lista vertical de cartões. A ideia da imagem é um
quadro (canvas) escuro com blocos que você arrasta, conecta com linhas e edita
num painel à direita. Vou trocar a tela de montagem por esse formato, mantendo
exatamente as mesmas regras de envio, gatilhos e publicação que já funcionam.

## Como vai ficar a tela

Três áreas, na mesma página do fluxo:

```text
+--------------+------------------------------+---------------+
| BLOCOS       |  QUADRO (arrastar e ligar)   | PROPRIEDADES  |
| Início       |                              |               |
| Mensagem     |   [ INÍCIO ]---o             | Clique em um  |
| Esperar      |        |                     | bloco para    |
|   resposta   |   [ MENSAGEM ]---o           | editar        |
| Condição     |        |                     |               |
| Aguardar     |   [ CONDIÇÃO ] -- sim -->    |               |
| Atribuir     |               -- não -->     |               |
| Encaminhar   |                              |               |
| Encerrar     |                              |               |
+--------------+------------------------------+---------------+
```

- Coluna esquerda: lista de blocos disponíveis; clicar ou arrastar adiciona no
  quadro.
- Quadro: fundo escuro pontilhado, blocos coloridos por tipo com ícone e título,
  arrastar para posicionar, arrastar da bolinha de saída até outro bloco para
  ligar, linhas curvas entre eles, botão de zoom e "organizar automaticamente".
- Coluna direita: campos do bloco selecionado (texto da mensagem com botões de
  variáveis, tempo de espera, palavras da condição, modo de transferência) —
  os mesmos campos de hoje.
- Topo: nome do fluxo, status Ativo/Rascunho, "Salvar rascunho", "Publicar e
  ativar", excluir. As abas Gatilhos e Conversas continuam como estão.

## O que não muda

- Mesmos tipos de bloco, mesmas variáveis, mesma validação (o fluxo começa por
  uma mensagem, todo texto preenchido, condição com palavras).
- Mesma publicação por versões: conversas em andamento seguem na versão em que
  começaram.
- Nada muda no WhatsApp, Follow-up, clientes ou permissões.

## Blocos da imagem que não vou criar agora

Vídeo, Imagem, Áudio, Digitando, Gravando, Etiquetas e "Gerar IA" aparecem na
tela de referência, mas hoje o envio só suporta texto. Deixo de fora para não
criar botão que não envia nada; posso adicionar depois, um por um.

## Detalhes técnicos

- Nova pasta `src/components/workflow/canvas/` com o quadro, o cartão de bloco,
  as linhas de ligação e o painel de propriedades; sem biblioteca nova
  (arrastar com eventos de ponteiro, linhas em SVG).
- `WorkflowBlock` em `src/lib/workflow-shared.ts` ganha `x`/`y` opcionais para
  guardar a posição; blocos antigos sem posição recebem um layout automático em
  coluna ao abrir. As ligações continuam em `nextId`, `nextIfMatch`,
  `nextIfNoMatch` — nada de campo novo no banco.
- `src/routes/_authenticated/workflow.$workflowId.tsx` passa a renderizar o
  quadro na aba de montagem; `workflowSaveBlocks` e `validateBlocks` seguem
  iguais.

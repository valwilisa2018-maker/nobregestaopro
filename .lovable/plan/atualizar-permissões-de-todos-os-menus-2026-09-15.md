# Atualizar permissões de todos os menus

## Objetivo
Garantir que a tela de Usuários e Permissões exiba todos os menus atuais, inclusive os módulos novos, e que novos menus não fiquem fora da lista no futuro.

## Alterações
- Incluir **Medidor de Roteiro** nas permissões, junto com **Transcrição**, que já está cadastrada.
- Fazer o menu lateral usar a mesma lista central da tela de permissões, evitando diferenças entre menu e permissões.
- Manter as ações já definidas para cada módulo e não alterar regras de negócio.
- Atualizar os testes para confirmar os módulos novos e o vínculo entre caminhos e permissões.

## Resultado esperado
Todos os itens do menu aparecerão em Usuários e Permissões. Ao marcar ou desmarcar “Ver”, o item correspondente será exibido ou ocultado para aquele usuário.

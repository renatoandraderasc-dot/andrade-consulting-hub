# Medeiros — todos os mercadológicos e Compras até produto

## Objetivo
Garantir que as lojas Medeiros mostrem todos os mercadológicos existentes no sistema da loja, sem limitar a Açougue, Padaria e Hortifruti, e permitir detalhar Compras até cada produto.

## Alterações
- Centralizar a descoberta dos mercadológicos usando o cadastro e os relatórios reais da loja, preservando nomes equivalentes e permissões do usuário.
- Aplicar essa lista completa nas telas que exibem ou filtram mercadológicos: Dashboard, Metas, PIC, Compras, Estoque, Relatórios, Análise Anual, Capilaridade de Mix, Pricing/Repricing e configurações relacionadas.
- Remover listas fixas de três departamentos como fonte exclusiva; elas permanecerão apenas como valores iniciais quando a loja ainda não tiver dados.
- Ajustar Compras para usar a hierarquia real do Medeiros: Mercadológico 1 → Mercadológico 2 → Mercadológico 3 → Produto.
- Garantir que venda, CMV, compra, margem, excesso/saldo e exportação sejam calculados e exibidos também no nível produto.
- Manter as regras atuais de departamentos desativados na Configuração e de acesso restrito por usuário.

## Validação
- Conferir no Medeiros que todos os mercadológicos aparecem nos filtros e listas das telas afetadas.
- Conferir em Compras a abertura progressiva até produto e os totais de cada nível.
- Validar compilação, erros no navegador e comportamento em telas menores.

## Detalhes técnicos
- Ampliar os aliases de colunas DIRECTOR para os três níveis mercadológicos e código/descrição de produto.
- Preferir uma fonte compartilhada de departamentos para evitar regras divergentes entre telas.
- Carregar detalhes de produto somente por ação do usuário, sem criar consultas automáticas recorrentes.

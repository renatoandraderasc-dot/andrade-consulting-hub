# Estoque Dinâmico — vendas desde a última entrada

## Problema confirmado
O complemento de vendas foi removido. Porém, recolocar o ranking do período escolhido violaria a regra definida: compras seguem o filtro; vendas contam da última entrada de cada produto até D-1.

Os dados salvos do Araujo Ribeirão já têm vendas em 6.019 de 6.608 produtos, portanto não é correto afirmar que todos estão zerados. Para o produto 270410, a ponte entrega **primeira compra**, sem informar uma última entrada confiável. Usar essa data como última entrada também produziria números incorretos.

## Ajuste proposto
1. Verificar na ponte a fonte confiável da última entrada por produto e o contrato de vendas por produto/data.
2. Preservar compras em unidades totais exclusivamente no intervalo selecionado.
3. Quando o relatório de estoque não fornecer vendas, complementar cada produto da sua última entrada até D-1, sem usar o fim do filtro de compras.
4. Processar consultas sequencialmente e aproveitar dados salvos para não sobrecarregar a loja.
5. Recalcular quantidade vendida, valor vendido, progresso, saldo e ABC somente após obter dados válidos. Mostrar indisponibilidade em vez de inventar zero quando faltar a fonte.

## Validação
- Testar o exemplo de entrada em 30/09 com vendas até 27/10 independentemente do filtro de compras.
- Conferir o produto 270410 com dados reais e comparar com a loja.
- Garantir que falha de consulta não substitua resultados anteriores por zeros.

## Detalhes técnicos
O ajuste ficará separado do carregamento da página, usando os helpers compartilhados de relatórios e identificação de produtos. Se a ponte não expuser a última entrada ou as vendas necessárias, será preciso ajustar o serviço local da loja; não serão inferidas datas a partir de `primeira_compra`.

## Já concluído nesta revisão
- Fórmula original de metas restaurada, mantendo o fechamento de centavos e protegendo metas agregadas dos compradores; teste da função real aprovado em PostgreSQL descartável.
- Calendário com identidade estável dos campos; teste de preservação de foco e texto aprovado.
- Dashboard Financeiro sem dupla contagem de LOJA/GERAL; teste aprovado.
- Exportação com dimensões explícitas; captura de 768px validada em largura de celular.
- Alerta de exclusão de metas marcado como desatualizado: a função vigente não fazia a exclusão descrita.

A conferência das páginas protegidas com dados reais não foi possível pelas permissões da sessão disponível; os testes isolados e a compilação passaram.
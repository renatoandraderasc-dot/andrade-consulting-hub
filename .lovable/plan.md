# Análise Anual: trazer o MIX (códigos diferentes vendidos)

## O que está acontecendo

A linha de MIX fica vazia porque a tela pede um relatório chamado `vendas_produto_periodo`, que não existe nas lojas Nascimento (WebSac). A lista de relatórios dessas lojas tem `mix_positivacao_periodo`, `vendas_hierarquia_periodo` etc., mas não aquele. Como a falha é silenciosa (o MIX é opcional), a linha simplesmente aparece sem números.

Além disso, mesmo quando algum dado chegava, o mesmo número de MIX era colocado em todas as linhas do mês, o que faz o total ficar multiplicado quando se filtra por departamento/categoria.

## O que será feito

1. Passar a usar o relatório de positivação de mix (`mix_positivacao_periodo`) — o mesmo que o painel PIC já usa e que existe nas lojas Nascimento. Ele devolve, por dia e por departamento, quantos códigos diferentes foram vendidos pela primeira vez; somando o mês, tem-se a quantidade de códigos distintos vendidos no mês.
2. Manter o caminho antigo como alternativa: se a loja não publicar esse relatório, tenta a lista por produto (`vendas_produto_periodo` ou `vendas_hierarquia_periodo`) contando códigos distintos.
3. Guardar o MIX por mês **e por departamento**, para que os filtros de departamento/categoria e os totais somem corretamente, sem repetir o mesmo número em várias linhas.
4. Buscar ano a ano, em paralelo, com a barra de progresso do carrinho já usada na tela, e sem travar a tela caso a loja não tenha o dado.
5. O MIX continua aparecendo logo abaixo de LUCRO, no mesmo formato, e também nas exportações em Excel e PDF.

## Detalhes técnicos

- Arquivo: `src/pages/AnaliseAnual.tsx`, função `carregarMix`.
- Nova ordem de tentativa por loja: `mix_positivacao_periodo` → `vendas_produto_periodo` → `vendas_hierarquia_periodo`.
- Acumulador passa de `Map<"ano-mes", number>` para `Map<"ano-mes-departamento", number>`; o merge em `rows` casa por ano/mês/departamento (com a mesma normalização de departamento já usada na tela) e cai para rateio no `TOTAL` quando o relatório não trouxer departamento.
- Aliases lidos via `pick`: `mix`, `positivacao`, `qtd_itens`, `itens`, `codigos`.
- Sem mudanças em outras telas, no PIC ou no banco.

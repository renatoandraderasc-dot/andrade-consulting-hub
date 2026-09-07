# Corrigir o Mix da Análise Anual (lojas Nascimento)

## Por que apareceu 236 no açougue em janeiro e só 8 em agosto

O relatório usado para o Mix nas lojas Nascimento é de **positivação**: ele conta cada produto uma única vez, no dia da **primeira venda dentro do período consultado**.

Hoje a tela consulta o **ano inteiro de uma vez** (01/01 a 31/12). Resultado: todo produto que já vendeu em janeiro fica contado em janeiro e nunca mais aparece nos meses seguintes. Por isso janeiro concentra quase tudo (236 no açougue) e agosto fica com apenas os 8 produtos que venderam pela primeira vez no ano naquele mês.

Não é a loja vendendo menos itens: é a janela de consulta errada.

## Correção

Consultar o mesmo relatório **mês a mês** (do dia 1 ao último dia de cada mês; no mês corrente, até hoje). Assim cada mês conta os produtos distintos vendidos naquele mês, que é a definição de Mix usada no PIC.

- Janeiro continua correto; fevereiro em diante passa a mostrar o número real (esperado: valores na mesma ordem de grandeza entre os meses).
- Total do mês = soma dos departamentos daquele mês.
- Nada muda para as outras lojas nem nos demais indicadores da Análise Anual.

## Detalhes técnicos

Em `src/pages/AnaliseAnual.tsx`, função `carregarMixPositivacao`:

- Trocar o laço por ano por um laço por (ano, mês), gerando `inicio`/`fim` de cada mês; no mês atual o `fim` é a data de hoje. Meses futuros são ignorados.
- Executar as chamadas em lotes (ex.: 6 simultâneas) para não sobrecarregar a ponte do WebSac.
- Manter a agregação atual por departamento e o total por mês, e manter o `CartProgressOverlay`/estado de carregamento já existentes.
- Exportações (Excel/PDF) continuam iguais, apenas com os valores corrigidos.

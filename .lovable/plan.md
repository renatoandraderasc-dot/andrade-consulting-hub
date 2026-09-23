# Corrigir Estoque Dinâmico do Nascimento

## Objetivo
Eliminar a tela presa em “Validando seu acesso…”, impedir que a consulta fique parada em 95% e ajustar a tela para funcionar em janelas menores e celulares.

## Alterações
- Tornar a validação de acesso limitada por tempo e reaproveitar a sessão já confirmada, sem deixar uma tela preta indefinidamente.
- Proteger a consulta do Estoque Dinâmico com limite de espera, encerramento garantido e preservação dos últimos dados disponíveis quando a loja demorar.
- Remover a atualização automática desta tela para evitar novas consultas pesadas durante o uso.
- Ajustar filtros, calendário, indicadores, tabela e paginação para larguras menores, mantendo rolagem horizontal apenas nos dados detalhados.
- Validar a rota autenticada e o resultado em tela pequena e desktop.

## Limite
As mudanças serão restritas à validação de acesso compartilhada e à tela Estoque Dinâmico; nenhuma regra de cálculo será alterada.

# Jornada: execuções por loja, tarefas com lojas escolhidas e vínculos limpos

## O que muda

### 1. Nova tela "Execuções da Jornada" (`/jornada/execucoes`)
Visão de acompanhamento, uma linha por tarefa (template) da loja selecionada:

- Colunas: Tarefa, Perfil, Cadência, Período (data), Status, Avanço (itens feitos / total + barra), Responsável, Última atualização.
- Filtros no topo: Loja (só as lojas que o usuário pode ver), Perfil (só perfis dele, ou todos se for admin), Cadência, Período (dia/semana/mês navegável), Status.
- Resumo em cima: quantas a fazer, em andamento, concluídas e % de conclusão.
- Clicar numa linha abre a tarefa na tela da Jornada.
- Carrega na primeira abertura e no botão "Atualizar" (regra do Hub: nada de busca automática ao trocar filtro).

Isolamento: só aparecem execuções da loja escolhida, e só de perfis que o usuário tem marcados no próprio cadastro (admin global vê todos os perfis da loja).

### 2. Tarefa passa a valer para as lojas que você escolher
Hoje a tarefa nasce em todas as lojas (ou na loja do perfil). Passa a ter uma lista de lojas por tarefa:

- No editor de tarefa em Admin da Jornada: campo "Lojas onde esta tarefa vale", com caixas de seleção das lojas + opção "Todas as lojas da rede".
- A rotina automática só cria a tarefa nas lojas marcadas.
- Tarefas já existentes continuam valendo para todas as lojas até alguém escolher.

### 3. Vínculos só com o que foi marcado
- O usuário "Dourado" está ligado a 7 perfis que ele não marcou (vieram de uma carga antiga). Esses vínculos serão apagados, deixando só o que for marcado daqui em diante.
- Na Jornada, o seletor de perfil e as tarefas passam a considerar apenas perfis realmente vinculados ao usuário (admin global segue vendo tudo).

## Detalhes técnicos

- Migration: nova tabela `jornada_template_loja (template_id uuid FK, store_id uuid FK, PK composto)` com GRANTs (`authenticated` select/insert/delete, `service_role` all), RLS usando `jornada_tem_acesso_loja(store_id)` para leitura e `has_role(auth.uid(),'admin')` para escrita. Template sem nenhuma linha = vale para todas as lojas (retrocompatível).
- `supabase/functions/jornada-renovar/index.ts`: ao montar as execuções, carregar `jornada_template_loja` e, quando o template tiver lojas definidas, criar apenas nessas (mantendo o filtro atual de `perfil.store_id`).
- Limpeza de dados: `delete from jornada_perfil_usuario where user_id = '783ebcf0-…'` (os 7 vínculos não marcados).
- Nova página `src/pages/JornadaExecucoes.tsx` + rota em `src/App.tsx` e item no menu de Jornada em `ClientLayout`. Consulta `jornada_execucoes` por `store_id` + `periodo_ref`, junta `jornada_templates`/`jornada_perfis`, e conta `jornada_checklist_itens` em lotes de 200 (mesmo padrão de `Jornada.tsx`).
- `src/pages/AdminJornada.tsx`: no diálogo de tarefa, carregar/salvar as lojas selecionadas em `jornada_template_loja`; coluna "Lojas" na tabela de tarefas mostrando "Todas" ou a contagem.
- `src/pages/Jornada.tsx`: restringir `perfisVisiveis` a `meusPerfis` para quem não é admin global.

# Escala de Funcionários

## Entrega
- Adicionar o grupo **Escala** ao Hub com **Escala do Mês**, **Funcionários** e **Regras e Turnos**, usando a loja selecionada e as permissões existentes.
- Manter o motor enviado intacto: seus **17 testes passaram**. Toda geração e validação será feita no navegador, sem consultas ao sistema da loja e sem atualização automática.

## Escala do Mês
- Grade por departamento, nomes fixos, cores por status/turno, horários, travas, observações e totais exatos por funcionário.
- Gerar preservando células travadas; confirmar a substituição das demais. Mostrar avisos antes de gravar.
- Conformidade com erros, alertas e referências das regras; seleção de departamento e destaque da célula correspondente.
- Publicar com justificativa quando houver erros; reabrir aumentando a versão; consulta somente da escala publicada para quem não pode gerir.
- Exportar Excel e mural PDF por departamento, identificando versão e rascunho.

## Cadastros e configuração
- Funcionários com turnos, contratos, preferências de folga e admissão/desligamento; modelo Excel e importação com prévia e erros por linha.
- Ausências por período, sem CPF, CID ou diagnóstico.
- Regras da loja, turnos e duração líquida, cobertura semanal, feriados/picos e antecipações por loja.

## Cuidados necessários
- Os marcos chamados “EC 141/2026” no material **não tiveram vigência confirmada nas fontes oficiais consultadas**. As datas e limites enviados serão apresentados como **premissas configuráveis do planejamento**, não como garantia de cumprimento da legislação; validar sua adoção com contador/sindicato.
- Ajustar o SQL enviado apenas onde necessário para a segurança e compatibilidade do Hub: rascunhos restritos, referências de funcionários/turnos sempre da mesma loja, proteção da publicação e permissões explícitas.
- Não alterar acessos de outras pessoas ou módulos, nem modificar o motor para resolver diferenças legais.

## Detalhes técnicos
- Aplicar as mudanças de estrutura pela ferramenta de migração; usuários responsáveis serão UUIDs sem novas referências a tabelas de autenticação gerenciadas. Criar tabelas com GRANTs e RLS.
- Separar o cadastro inicial de marcos/feriados da mudança de estrutura e identificar os marcos fornecidos como premissas a validar.
- Criar `carregarContexto` com leitura paralela, precedência de datas da loja, paginação de alocações e histórico de 35 dias.
- Datas de escala como `YYYY-MM-DD` e horários `HH:MM`; mensagens do banco exibidas sem ocultar recusas.
- Gravar alocações em lotes de 500; editar apenas a célula selecionada e revalidar localmente.
- Preservar o bloqueio de edição de publicação no banco; a validação do motor continua local e não será apresentada como certificação legal do servidor.
- Conferir os testes originais, isolamento por loja, proteção de publicação e o fluxo autenticado de cadastrar, gerar, editar, publicar e consultar novamente.
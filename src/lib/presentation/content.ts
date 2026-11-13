export type ScreenKind = "hub" | "dashboard" | "goals" | "dre" | "agenda" | "purchases" | "comparison" | "schedule" | "operations" | "pricing" | "flyer" | "tv";

export type PresentationSlideData = {
  id: string;
  title: string;
  chapter: string;
  subtitle: string;
  points: string[];
  notes: string;
  screen?: ScreenKind;
  layout?: "cover" | "overview" | "closing";
};

export const presentationSlides: PresentationSlideData[] = [
  { id: "andrade", title: "Andrade Consultoria", chapter: "Apresentação", subtitle: "Inteligência comercial para supermercados.", points: ["Da informação à decisão. Da decisão à operação."], layout: "cover", notes: "Apresente a Andrade Consultoria e o propósito da plataforma: conectar a leitura dos números ao trabalho diário no supermercado. As telas desta apresentação são ilustrativas, sem informações de clientes." },
  { id: "ecossistema", title: "Uma visão completa da gestão", chapter: "Ecossistema", subtitle: "A loja, a equipe e os números no mesmo lugar.", points: [], layout: "overview", notes: "Percorra os seis pilares. Você pode selecionar um pilar para ir diretamente à demonstração. Não apresente resultados financeiros ou ganhos percentuais sem dados reais autorizados." },
  { id: "hub", title: "Hub de dados & conexões", chapter: "Dados e integração", subtitle: "Informação da loja, organizada para a gestão.", points: ["Conexões com VR, DIRECTOR e WebSac", "Histórico salvo para consultar novamente", "Atualização individual com progresso por loja"], screen: "hub", notes: "Explique que os relatórios utilizam as leituras completas mais recentes salvas no Hub. As atualizações ao sistema da loja são explícitas, com acompanhamento das pendências. Edições manuais são preservadas. O status nesta tela é apenas ilustrativo." },
  { id: "dashboard", title: "Dashboard & PIC", chapter: "Gestão comercial", subtitle: "O desempenho da loja e de cada departamento.", points: ["Faturamento, margem e ticket médio", "Realizado, meta e projeção separados", "PIC por departamento e visão para TV"], screen: "dashboard", notes: "Destaque a leitura de faturamento, margem, clientes e ticket. Mostre a comparação histórica em cinza, o desempenho por departamento e o PIC. Valores numéricos foram omitidos para preservar informações das lojas." },
  { id: "metas", title: "Metas & premiação", chapter: "Gestão comercial", subtitle: "Objetivos claros. Acompanhamento por equipe.", points: ["Metas por loja, mês e departamento", "Compradores e realizado de compras", "Premiação e ponderações individuais"], screen: "goals", notes: "Mostre como se relacionam as metas cadastradas, a sugestão analítica, o realizado e a premiação. A premiação é apresentada em reais e parametrizada por departamento. Não prometa uma regra universal de remuneração." },
  { id: "dre", title: "Controladoria & DRE", chapter: "Controladoria e financeiro", subtitle: "Do lançamento ao resultado da operação.", points: ["DRE comercial e financeira", "Cont Rede com meses selecionados", "Contas padronizadas e ajustes manuais preservados"], screen: "dre", notes: "Diferencie a visão comercial da financeira. Mostre a estrutura das contas e a seleção de meses no Cont Rede. Importações não devem apagar os ajustes feitos manualmente. Os campos sem números são espaços demonstrativos, não resultados da consultoria." },
  { id: "agenda", title: "Agenda financeira", chapter: "Controladoria e financeiro", subtitle: "Pagamentos, recebimentos e a visão do caixa.", points: ["Calendário financeiro por dia", "Detalhes por categoria e fornecedor", "Análise de concentração e riscos de caixa"], screen: "agenda", notes: "Apresente a agenda e sua análise financeira. Explique a possibilidade de abrir detalhes e identificar concentração de pagamentos. A agenda ilustrativa não representa obrigações de uma loja." },
  { id: "compras", title: "Compras & estoque dinâmico", chapter: "Compras e estoque", subtitle: "Acompanhar o que entra e o que vende.", points: ["Compras × Vendas por departamento", "Compras respeitam o período selecionado", "Vendas desde a última entrada até D−1"], screen: "purchases", notes: "No Estoque Dinâmico, as compras seguem o filtro de datas. As vendas de cada produto partem da sua última entrada verificada e vão até D−1, mesmo fora do filtro de compras. A unidade de compra não deve ser confundida com caixas." },
  { id: "comparativo", title: "Produtos & capilaridade", chapter: "Compras e estoque", subtitle: "Comparar períodos. Entender o mix.", points: ["Comparativo por departamento e produto", "Curva ABC, volume, margem e resultado", "Mix e produtos com margem baixa"], screen: "comparison", notes: "Apresente a comparação entre períodos e a leitura de mix, margem e volume. Os períodos fechados permanecem salvos no Hub e a tela deve preferir uma leitura completa mais recente. Não utilize números de clientes durante a palestra sem autorização." },
  { id: "escala", title: "Escala de funcionários", chapter: "Operação de loja", subtitle: "Pessoas, turnos e a rotina da loja.", points: ["Cadastro, horários, intervalos e ausências", "Geração com preservação das células travadas", "Revisão e publicação da escala"], screen: "schedule", notes: "Mostre os turnos com horários corretamente formatados e o fluxo de geração, revisão e publicação. Não afirme que a plataforma certifica conformidade legal. Regras e intervalos precisam ser revisados pelo responsável da loja. Nomes pessoais foram substituídos por funções." },
  { id: "operacao", title: "Recebimento & execução", chapter: "Operação de loja", subtitle: "A rotina acompanhada, do recebimento ao setor.", points: ["Validação de NF-e e conferência cega", "Checklists, fotos e temperaturas", "Jornada e histórico de execução"], screen: "operations", notes: "Explique que a validação da NF-e é separada da gravação no ERP e que a conferência cega não mostra a quantidade da nota. Nos checklists, foque no histórico, fotos e execução, sem demonstrar faixas de pontuação que estejam em discussão." },
  { id: "precos", title: "Re-PRICING & preços", chapter: "Marketing e preços", subtitle: "Concorrência e margem na mesma decisão.", points: ["Cruzamento das bases pelo EAN", "Comparação com preços concorrentes", "Simulação de preço e nova margem"], screen: "pricing", notes: "Mostre a comparação das bases de produtos, concorrentes e auxiliar. Explique a simulação de preço e margem. A coleta depende das fontes disponíveis e os preços demonstrativos não são ofertas reais." },
  { id: "encartes", title: "Encartes & campanhas", chapter: "Marketing e preços", subtitle: "Planejamento comercial que chega à comunicação.", points: ["Montagem manual com rascunho preservado", "Preço clube, margem e observações", "Calendário promocional e exportação"], screen: "flyer", notes: "Apresente a sugestão e a montagem manual, a ordenação dos itens, o preço clube e as observações. Mostre o calendário promocional e a exportação. As peças desta apresentação são ilustrativas, sem preços promocionais reais." },
  { id: "tv", title: "TV & comunicação de loja", chapter: "Marketing e preços", subtitle: "Ofertas e indicadores no ritmo da operação.", points: ["Programação independente por tela", "Artes lado a lado, sem distorção", "Produtos e preços na mesma faixa"], screen: "tv", notes: "Demonstre o gerenciador e a visualização lado a lado. A disposição depende das telas físicas cadastradas; esta prévia é ilustrativa e não presume a resolução de nenhuma TV de cliente. No PIC TV, a loja é a escolhida no login." },
  { id: "conversa", title: "Andrade Consultoria", chapter: "Vamos conversar", subtitle: "Gestão comercial, da estratégia ao dia a dia.", points: ["Renato Andrade", "andradeconsultoria.app", "WhatsApp · (11) 96602-1224"], layout: "closing", notes: "Retome os pilares e abra para perguntas. Mostre a marca do parceiro, caso adicionada, sem presumir o nome da empresa ou o tipo de parceria. Convide a conhecer o sistema com os canais de contato da Andrade Consultoria." },
];

export const presentationChapters = [
  { name: "Dados & integração", description: "Hub e conexões", slide: 2, icon: "database" },
  { name: "Gestão comercial", description: "Dashboard, PIC e metas", slide: 3, icon: "chart" },
  { name: "Controladoria", description: "DRE e agenda financeira", slide: 5, icon: "finance" },
  { name: "Compras & estoque", description: "Movimento, margem e mix", slide: 7, icon: "package" },
  { name: "Operação de loja", description: "Equipe e execução", slide: 9, icon: "people" },
  { name: "Marketing & preços", description: "Encarte, Re-PRICING e TV", slide: 11, icon: "tv" },
];

export function readSlideIndex(value: string | null, total = presentationSlides.length) {
  const number = Number(value ?? "1");
  return Number.isInteger(number) && number >= 1 && number <= total ? number - 1 : 0;
}

export function nextSlideIndex(current: number, direction: number, total = presentationSlides.length) {
  return Math.min(total - 1, Math.max(0, current + direction));
}
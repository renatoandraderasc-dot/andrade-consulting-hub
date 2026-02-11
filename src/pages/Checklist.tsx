import { useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, ArrowLeft, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import andradeLogo from "@/assets/andrade-logo.png";

interface ChecklistItem {
  id: number;
  text: string;
  checked: boolean;
  points: number;
}

interface ChecklistCategory {
  title: string;
  items: ChecklistItem[];
}

const initialCategories: ChecklistCategory[] = [
  {
    title: "Abertura da Loja",
    items: [
      { id: 1, text: "Verificar limpeza geral da loja", checked: false, points: 5 },
      { id: 2, text: "Conferir iluminação de todas as seções", checked: false, points: 3 },
      { id: 3, text: "Verificar funcionamento dos caixas", checked: false, points: 5 },
      { id: 4, text: "Conferir uniforme e apresentação da equipe", checked: false, points: 3 },
      { id: 5, text: "Verificar temperatura das câmaras frias", checked: false, points: 5 },
    ],
  },
  {
    title: "Estoque e Reposição",
    items: [
      { id: 6, text: "Verificar abastecimento das gôndolas", checked: false, points: 5 },
      { id: 7, text: "Conferir validade dos produtos perecíveis", checked: false, points: 5 },
      { id: 8, text: "Verificar estoque mínimo de produtos essenciais", checked: false, points: 4 },
      { id: 9, text: "Organizar depósito e área de recebimento", checked: false, points: 3 },
      { id: 10, text: "Conferir pedidos pendentes com fornecedores", checked: false, points: 4 },
    ],
  },
  {
    title: "Atendimento ao Cliente",
    items: [
      { id: 11, text: "Verificar disponibilidade de atendentes por seção", checked: false, points: 4 },
      { id: 12, text: "Conferir funcionamento do SAC / caixa de sugestões", checked: false, points: 3 },
      { id: 13, text: "Verificar sinalização e precificação correta", checked: false, points: 5 },
      { id: 14, text: "Acompanhar tempo de espera nos caixas", checked: false, points: 5 },
      { id: 15, text: "Verificar disponibilidade de sacolas e embalagens", checked: false, points: 3 },
    ],
  },
  {
    title: "Higiene e Segurança",
    items: [
      { id: 16, text: "Verificar limpeza dos banheiros", checked: false, points: 4 },
      { id: 17, text: "Conferir extintores e saídas de emergência", checked: false, points: 5 },
      { id: 18, text: "Verificar uso de EPIs pelos funcionários", checked: false, points: 4 },
      { id: 19, text: "Conferir higienização do setor de hortifruti", checked: false, points: 5 },
      { id: 20, text: "Verificar funcionamento das câmeras de segurança", checked: false, points: 4 },
    ],
  },
  {
    title: "Fechamento",
    items: [
      { id: 21, text: "Conferir fechamento dos caixas e sangrias", checked: false, points: 5 },
      { id: 22, text: "Verificar recolhimento de produtos do hortifruti", checked: false, points: 3 },
      { id: 23, text: "Conferir trancamento de portas e alarmes", checked: false, points: 5 },
      { id: 24, text: "Registrar ocorrências do dia", checked: false, points: 4 },
      { id: 25, text: "Planejar escala do próximo dia", checked: false, points: 4 },
    ],
  },
];

const getScoreColor = (percentage: number) => {
  if (percentage >= 80) return "text-green-400";
  if (percentage >= 50) return "text-yellow-400";
  return "text-red-400";
};

const getScoreLabel = (percentage: number) => {
  if (percentage >= 80) return "Excelente";
  if (percentage >= 50) return "Regular";
  return "Precisa Melhorar";
};

const Checklist = () => {
  const [categories, setCategories] = useState<ChecklistCategory[]>(initialCategories);

  const toggleItem = (categoryIndex: number, itemId: number) => {
    setCategories((prev) =>
      prev.map((cat, ci) =>
        ci === categoryIndex
          ? {
              ...cat,
              items: cat.items.map((item) =>
                item.id === itemId ? { ...item, checked: !item.checked } : item
              ),
            }
          : cat
      )
    );
  };

  const totalPoints = categories.reduce(
    (sum, cat) => sum + cat.items.reduce((s, item) => s + item.points, 0),
    0
  );

  const earnedPoints = categories.reduce(
    (sum, cat) =>
      sum + cat.items.filter((item) => item.checked).reduce((s, item) => s + item.points, 0),
    0
  );

  const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

  const resetAll = () => setCategories(initialCategories);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={andradeLogo} alt="Andrade Logo" className="h-10" />
          </Link>
          <Link
            to="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-body text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Site
          </Link>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-10 max-w-4xl">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="flex items-center justify-center gap-3 mb-3">
            <CheckSquare className="w-8 h-8 text-primary" />
            <h1 className="font-display text-3xl md:text-4xl font-bold">
              Checklist <span className="text-gradient-gold">Gerente de Supermercado</span>
            </h1>
          </div>
          <p className="text-muted-foreground font-body">
            Marque os itens concluídos e acompanhe sua pontuação diária.
          </p>
        </motion.div>

        {/* Score Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-6"
        >
          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${percentage * 2.64} 264`}
                  className="transition-all duration-500"
                />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center font-display text-xl font-bold ${getScoreColor(percentage)}`}>
                {percentage}%
              </span>
            </div>
            <div>
              <p className="font-body text-muted-foreground text-sm">Pontuação</p>
              <p className="font-display text-2xl font-bold">
                {earnedPoints} <span className="text-muted-foreground text-base font-body">/ {totalPoints} pts</span>
              </p>
              <p className={`font-body text-sm font-semibold ${getScoreColor(percentage)}`}>
                {getScoreLabel(percentage)}
              </p>
            </div>
          </div>
          <button
            onClick={resetAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 font-body text-sm transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Resetar
          </button>
        </motion.div>

        {/* Categories */}
        <div className="space-y-6">
          {categories.map((category, ci) => {
            const catTotal = category.items.reduce((s, i) => s + i.points, 0);
            const catEarned = category.items.filter((i) => i.checked).reduce((s, i) => s + i.points, 0);

            return (
              <motion.div
                key={category.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + ci * 0.05 }}
                className="bg-card border border-border rounded-2xl overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold">{category.title}</h2>
                  <span className="font-body text-sm text-muted-foreground">
                    {catEarned}/{catTotal} pts
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {category.items.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => toggleItem(ci, item.id)}
                        className="sr-only peer"
                      />
                      <div className="w-6 h-6 rounded-md border-2 border-muted-foreground peer-checked:border-primary peer-checked:bg-primary flex items-center justify-center shrink-0 transition-colors">
                        {item.checked && (
                          <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span
                        className={`font-body text-sm flex-1 transition-colors ${
                          item.checked ? "line-through text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {item.text}
                      </span>
                      <span className="font-body text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-full">
                        {item.points} pts
                      </span>
                    </label>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Checklist;

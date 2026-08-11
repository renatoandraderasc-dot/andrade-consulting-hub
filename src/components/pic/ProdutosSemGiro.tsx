import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ChevronDown, PackageX, TrendingDown } from "lucide-react";
import { useHierarquiaVendas, LinhaHierarquia } from "@/hooks/useHierarquiaVendas";

// ============================================================
// Produtos sem giro / em queda no mes corrente
// Compara o volume vendido do dia 1 ate o ultimo dia com dados
// contra o MESMO intervalo de dias dos 3 meses anteriores.
//  - "Nao vendidos": produto vendido nos meses anteriores e sem
//    volume no mes corrente.
//  - "Queda forte": volume atual pelo menos 10% abaixo da media
//    dos mesmos dias dos 3 meses anteriores.
// Agrupado por categoria (nivel 1), um bloco embaixo do outro.
// ============================================================

const QUEDA_MIN = 10; // %

const pad = (n: number) => String(n).padStart(2, "0");
const diasNoMes = (ano: number, mes: number) => new Date(ano, mes, 0).getDate();
const fmtVol = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

interface Props {
  storeId: string;
  ano: number;
  mes: number;
}

const chave = (l: LinhaHierarquia) => `${l.codigo || l.produto}`;

const ProdutosSemGiro = ({ storeId, ano, mes }: Props) => {
  const hoje = new Date();
  const mesCorrente = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
  const diaLimite = mesCorrente
    ? Math.max(1, hoje.getDate() - 1)
    : diasNoMes(ano, mes);

  const periodos = useMemo(() => {
    const lista: { inicio: string; fim: string }[] = [];
    for (let i = 0; i <= 3; i++) {
      const d = new Date(ano, mes - 1 - i, 1);
      const a = d.getFullYear();
      const m = d.getMonth() + 1;
      const fimDia = Math.min(diaLimite, diasNoMes(a, m));
      lista.push({ inicio: `${a}-${pad(m)}-01`, fim: `${a}-${pad(m)}-${pad(fimDia)}` });
    }
    return lista;
  }, [ano, mes, diaLimite]);

  const atual = useHierarquiaVendas(storeId, periodos[0].inicio, periodos[0].fim);
  const m1 = useHierarquiaVendas(storeId, periodos[1].inicio, periodos[1].fim);
  const m2 = useHierarquiaVendas(storeId, periodos[2].inicio, periodos[2].fim);
  const m3 = useHierarquiaVendas(storeId, periodos[3].inicio, periodos[3].fim);

  const loading = atual.loading || m1.loading || m2.loading || m3.loading;

  const categorias = useMemo(() => {
    if (!atual.linhas) return [];

    const somar = (linhas: LinhaHierarquia[] | null) => {
      const map = new Map<string, { linha: LinhaHierarquia; volume: number }>();
      for (const l of linhas ?? []) {
        const k = chave(l);
        const cur = map.get(k);
        if (cur) cur.volume += l.volume;
        else map.set(k, { linha: l, volume: l.volume });
      }
      return map;
    };

    const cur = somar(atual.linhas);
    const ants = [m1.linhas, m2.linhas, m3.linhas].map(somar);

    const chaves = new Set<string>();
    ants.forEach((a) => a.forEach((_, k) => chaves.add(k)));

    type Item = { produto: string; categoria: string; atualVol: number; mediaVol: number; queda: number };
    const semGiro: Item[] = [];
    const emQueda: Item[] = [];

    for (const k of chaves) {
      const historicos = ants
        .map((a) => a.get(k))
        .filter((x): x is { linha: LinhaHierarquia; volume: number } => !!x && x.volume > 0);
      if (historicos.length === 0) continue;

      const media = historicos.reduce((s, h) => s + h.volume, 0) / historicos.length;
      const atualItem = cur.get(k);
      const atualVol = atualItem?.volume ?? 0;
      const ref = atualItem?.linha ?? historicos[0].linha;
      const item: Item = {
        produto: ref.produto,
        categoria: ref.n1 || "SEM DEPARTAMENTO",
        atualVol,
        mediaVol: media,
        queda: media > 0 ? ((media - atualVol) / media) * 100 : 0,
      };

      if (atualVol <= 0) semGiro.push(item);
      else if (item.queda >= QUEDA_MIN) emQueda.push(item);
    }

    const nomes = [...new Set([...semGiro, ...emQueda].map((i) => i.categoria))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );

    return nomes.map((nome) => ({
      nome,
      semGiro: semGiro.filter((i) => i.categoria === nome).sort((a, b) => b.mediaVol - a.mediaVol),
      emQueda: emQueda.filter((i) => i.categoria === nome).sort((a, b) => b.queda - a.queda),
    }));
  }, [atual.linhas, m1.linhas, m2.linhas, m3.linhas]);

  if (!storeId) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.9 }}
      className="bg-card border border-border rounded-2xl overflow-hidden"
    >
      <div className="px-5 py-3 border-b border-border flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <div>
          <h2 className="font-heading font-bold text-base text-foreground">
            Produtos sem giro e em queda
          </h2>
          <p className="text-xs text-muted-foreground font-body">
            Volume do dia 1 ao dia {diaLimite} vs. os mesmos dias dos 3 meses anteriores
          </p>
        </div>
      </div>

      {loading && (
        <div className="p-6 text-sm text-muted-foreground font-body">Analisando produtos…</div>
      )}

      {!loading && categorias.length === 0 && (
        <div className="p-6 text-sm text-muted-foreground font-body">
          Nenhum produto sem giro ou em queda relevante no período.
        </div>
      )}

      {!loading && categorias.length > 0 && (
        <div className="divide-y divide-border">
          {categorias.map((c) => (
            <CategoriaBloco key={c.nome} {...c} />
          ))}
        </div>
      )}
    </motion.div>
  );
};

const CategoriaBloco = ({
  nome,
  semGiro,
  emQueda,
}: {
  nome: string;
  semGiro: { produto: string; mediaVol: number }[];
  emQueda: { produto: string; atualVol: number; mediaVol: number; queda: number }[];
}) => {
  const [aberto, setAberto] = useState(false);

  return (
    <div>
      <button
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/20 transition-colors"
      >
        <span className="font-heading font-semibold text-sm text-foreground">{nome}</span>
        <span className="flex items-center gap-3 text-xs font-body">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <PackageX className="w-3.5 h-3.5" /> {semGiro.length} sem giro
          </span>
          <span className="inline-flex items-center gap-1 text-red-500">
            <TrendingDown className="w-3.5 h-3.5" /> {emQueda.length} em queda
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
        </span>
      </button>

      {aberto && (
        <div className="px-5 pb-4 space-y-4">
          {semGiro.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-1 font-body">
                Não vendidos neste mês
              </h4>
              <table className="w-full text-xs font-body">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-1">Produto</th>
                    <th className="text-right py-1">Volume médio (3 meses)</th>
                  </tr>
                </thead>
                <tbody>
                  {semGiro.map((p, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="py-1 pr-2">{p.produto}</td>
                      <td className="py-1 text-right font-mono">{fmtVol(p.mediaVol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {emQueda.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-1 font-body">
                Queda de volume relevante
              </h4>
              <table className="w-full text-xs font-body">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-1">Produto</th>
                    <th className="text-right py-1">Atual</th>
                    <th className="text-right py-1">Média 3 meses</th>
                    <th className="text-right py-1">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {emQueda.map((p, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="py-1 pr-2">{p.produto}</td>
                      <td className="py-1 text-right font-mono">{fmtVol(p.atualVol)}</td>
                      <td className="py-1 text-right font-mono">{fmtVol(p.mediaVol)}</td>
                      <td className="py-1 text-right font-mono text-red-500">
                        -{p.queda.toFixed(1).replace(".", ",")}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProdutosSemGiro;

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Target, Save, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { carregarLojaLogin } from "@/lib/lojasPermitidas";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MESES, fmtBRL } from "@/lib/metasSugestao";
import { toast } from "@/hooks/use-toast";

export const LOJA_COMPRADOR = "LOJA";

export interface MetasComprador {
  meta_venda: number;
  meta_lucro: number;
  meta_compra: number;
  meta_pagamentos: number;
}

export const METAS_COMPRADOR_PADRAO: MetasComprador = {
  meta_venda: 0,
  meta_lucro: 0,
  meta_compra: 0,
  meta_pagamentos: 0,
};

const CAMPOS: { k: keyof MetasComprador; label: string; hint: string }[] = [
  { k: "meta_venda", label: "Meta de Faturamento (R$)", hint: "Venda total da loja no mês" },
  { k: "meta_lucro", label: "Meta de Arrecadação (R$)", hint: "Lucro bruto da loja no mês" },
  { k: "meta_compra", label: "Meta de Compra (R$)", hint: "Teto de compras no mês (Compras x Vendas)" },
  { k: "meta_pagamentos", label: "Teto de Pagamentos (R$)", hint: "Vazio ou zero = usa o CMV do mês" },
];

/** Lê as metas do comprador (linha LOJA em compras_meta) da loja/mês. */
export const carregarMetasComprador = async (
  storeId: string, ano: number, mes: number,
): Promise<MetasComprador | null> => {
  const { data } = await supabase.from("compras_meta")
    .select("meta_venda, meta_lucro, meta_compra, meta_pagamentos")
    .eq("store_id", storeId).eq("departamento", LOJA_COMPRADOR)
    .eq("ano", ano).eq("mes", mes).maybeSingle();
  if (!data) return null;
  return {
    meta_venda: Number(data.meta_venda) || 0,
    meta_lucro: Number((data as any).meta_lucro) || 0,
    meta_compra: Number(data.meta_compra) || 0,
    meta_pagamentos: Number((data as any).meta_pagamentos) || 0,
  };
};

const MetasCompradoresConfig = () => {
  const { user, isAdmin, isGlobalAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [ano, setAno] = useState(Number(hojeSP.slice(0, 4)));
  const [mes, setMes] = useState(Number(hojeSP.slice(5, 7)));
  const [metas, setMetas] = useState<MetasComprador>(METAS_COMPRADOR_PADRAO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/login");
    if (user && isAdmin) {
      carregarLojaLogin(user.id, isGlobalAdmin).then((data) => {
        if (!data?.length) return;
        const sid = sessionStorage.getItem("selectedStoreId");
        const p = data.find((s) => s.id === sid) || data[0];
        setStoreId(p.id); setStoreName(p.name);
      });
    }
  }, [user, isAdmin, isGlobalAdmin, authLoading]);

  useEffect(() => {
    if (!storeId) return;
    carregarMetasComprador(storeId, ano, mes).then((m) => setMetas(m ?? METAS_COMPRADOR_PADRAO));
  }, [storeId, ano, mes]);

  const salvar = async () => {
    if (!storeId) return;
    setSalvando(true);
    const { error } = await supabase.from("compras_meta").upsert({
      store_id: storeId,
      departamento: LOJA_COMPRADOR,
      ano, mes,
      meta_venda: metas.meta_venda,
      meta_lucro: metas.meta_lucro,
      meta_compra: metas.meta_compra,
      meta_pagamentos: metas.meta_pagamentos,
      gerado_em: new Date().toISOString(),
    } as any, { onConflict: "store_id,departamento,ano,mes" });
    setSalvando(false);
    toast(error
      ? { title: "Não foi possível salvar", description: error.message, variant: "destructive" }
      : { title: "Metas do comprador salvas" });
  };

  return (
    <ClientLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Target className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Configuração de Metas — Compradores</h1>
              <p className="text-sm text-muted-foreground">
                Metas mensais da loja que alimentam a tela de Pagamento de Compradores
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-10 items-center rounded-md border border-border bg-secondary px-3 text-sm font-medium">{storeName}</div>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{MESES.slice(1).map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{[ano - 2, ano - 1, ano, ano + 1].map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => navigate("/metas/premiacao/compradores")}>
              <ShoppingBag className="h-4 w-4 mr-1" /> Ver premiação
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h2 className="text-sm font-semibold">Metas de {MESES[mes]}/{ano} — {storeName}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAMPOS.map((f) => (
              <div key={f.k} className="space-y-1">
                <Label className="text-xs">{f.label}</Label>
                <div className="flex items-center gap-1">
                  <span className="shrink-0 text-xs text-muted-foreground">R$</span>
                  <Input
                    type="number" step="0.01" min="0"
                    value={metas[f.k]}
                    onChange={(e) => setMetas({ ...metas, [f.k]: Number(e.target.value) })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">{f.hint}</p>
                {metas[f.k] > 0 && <p className="text-[11px] font-medium text-primary">{fmtBRL(metas[f.k])}</p>}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={salvar} disabled={salvando || !storeId}>
              <Save className="h-4 w-4 mr-1" /> Salvar
            </Button>
            <p className="text-xs text-muted-foreground">
              Essas metas têm prioridade na tela de Pagamento de Compradores. Campos zerados caem nas fontes automáticas
              (metas cadastradas da loja, metas de compra por departamento e CMV).
            </p>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
};

export default MetasCompradoresConfig;

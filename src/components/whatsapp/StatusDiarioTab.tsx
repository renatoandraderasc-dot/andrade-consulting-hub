import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { LojaSimples } from "@/lib/lojasPermitidas";

export const ITENS_STATUS = [
  { id: "meta_dia", nome: "Bateu a meta do dia" },
  { id: "meta_mes", nome: "Meta do mês" },
  { id: "compras", nome: "Compras dia/semana/mês" },
  { id: "compras_vendas", nome: "Compras × Vendas do dia" },
  { id: "margem_negativa", nome: "Vendidos com prejuízo" },
  { id: "nao_vendidos", nome: "Venda diária que não vendeu" },
];

type Contato = { id: string; nome: string; telefone: string; store_id: string | null; status_itens: string[]; aviso_nota: boolean };
type Produto = { id: string; codigo: number; descricao: string | null };

export default function StatusDiarioTab({ lojas }: { lojas: LojaSimples[] }) {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loja, setLoja] = useState("");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [novo, setNovo] = useState({ codigo: "", descricao: "" });
  const [auto, setAuto] = useState<{ dias: number; produtos: { codigo: number; descricao: string; dias: number; pct: number }[] } | null>(null);
  const [carregandoAuto, setCarregandoAuto] = useState(false);
  const [testando, setTestando] = useState<string | null>(null);

  const carregar = async () => {
    const { data } = await supabase.from("whatsapp_contatos").select("id,nome,telefone,store_id,status_itens,aviso_nota").order("nome");
    setContatos((data as Contato[]) || []);
  };
  useEffect(() => { carregar(); }, []);
  useEffect(() => { if (!loja && lojas[0]) setLoja(lojas[0].id); }, [lojas, loja]);
  const carregarProdutos = async () => {
    if (!loja) return;
    const { data } = await supabase.from("whatsapp_produtos_diarios").select("id,codigo,descricao").eq("store_id", loja).order("codigo");
    setProdutos((data as Produto[]) || []);
  };
  useEffect(() => { carregarProdutos(); }, [loja]);
  useEffect(() => {
    if (!loja) return;
    let vivo = true;
    setAuto(null); setCarregandoAuto(true);
    supabase.functions.invoke("whatsapp-status", { body: { modo: "frequentes", store_id: loja } }).then(({ data, error }) => {
      if (!vivo) return;
      setCarregandoAuto(false);
      if (error || !data?.ok) { toast.error("Não foi possível analisar os últimos 60 dias"); return; }
      setAuto({ dias: data.dias, produtos: data.produtos });
    });
    return () => { vivo = false; };
  }, [loja]);

  const salvar = async (id: string, campos: Partial<Contato>) => {
    setContatos((cs) => cs.map((c) => (c.id === id ? { ...c, ...campos } : c)));
    const { error } = await supabase.from("whatsapp_contatos").update(campos).eq("id", id);
    if (error) toast.error(error.message);
  };
  const testar = async (c: Contato) => {
    if (!c.store_id) return toast.error("Escolha a loja do contato na aba Contatos");
    setTestando(c.id);
    const { data, error } = await supabase.functions.invoke("whatsapp-status", { body: { modo: "diario", contato_id: c.id } });
    setTestando(null);
    if (error || data?.error) return toast.error(String(data?.error || error?.message));
    toast.success(data.enviados ? `Resumo de ${data.dia} enviado para ${c.nome}` : "Nada enviado: marque ao menos um item");
  };
  const addProduto = async () => {
    const codigo = Number(novo.codigo);
    if (!loja || !codigo) return toast.error("Informe o código do produto");
    const { error } = await supabase.from("whatsapp_produtos_diarios").insert({ store_id: loja, codigo, descricao: novo.descricao.trim() || null });
    if (error) return toast.error(error.code === "23505" ? "Produto já está na lista" : error.message);
    setNovo({ codigo: "", descricao: "" });
    carregarProdutos();
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader><CardTitle>Resumo diário às 09:00</CardTitle>
          <p className="text-sm text-muted-foreground">Números do dia anterior, da loja escolhida para cada contato. Marque o que cada um recebe.</p>
        </CardHeader>
        <CardContent className="divide-y">
          {contatos.map((c) => (
            <div key={c.id} className="space-y-2 py-3">
              <div className="flex items-center gap-3">
                <span className="flex-1 font-medium">{c.nome}</span>
                <span className="text-sm text-muted-foreground">{lojas.find((l) => l.id === c.store_id)?.name ?? "sem loja"}</span>
                <Button size="sm" variant="outline" disabled={testando === c.id} onClick={() => testar(c)}><Send className="mr-1 h-3 w-3" />{testando === c.id ? "Enviando..." : "Enviar agora"}</Button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {ITENS_STATUS.map((i) => (
                  <label key={i.id} className="flex items-center gap-1.5">
                    <Checkbox checked={c.status_itens?.includes(i.id)} onCheckedChange={(v) => salvar(c.id, { status_itens: v ? [...(c.status_itens || []), i.id] : c.status_itens.filter((x) => x !== i.id) })} />{i.nome}
                  </label>
                ))}
                <label className="flex items-center gap-1.5 font-medium">
                  <Checkbox checked={c.aviso_nota} onCheckedChange={(v) => salvar(c.id, { aviso_nota: !!v })} />Aviso a cada entrada de nota
                </label>
              </div>
            </div>
          ))}
          {!contatos.length && <p className="py-4 text-sm text-muted-foreground">Cadastre contatos na aba Contatos.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Produtos de venda diária</CardTitle>
          <p className="text-sm text-muted-foreground">Lista automática: produtos que venderam em pelo menos 85% dos últimos 60 dias. O resumo avisa quando algum não vendeu no dia.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={loja} onValueChange={setLoja}>
            <SelectTrigger><SelectValue placeholder="Loja" /></SelectTrigger>
            <SelectContent>{lojas.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
              <span className="font-medium">Automáticos ({auto?.produtos.length ?? 0})</span>
              <span className="text-xs text-muted-foreground">{carregandoAuto ? "Analisando 60 dias…" : auto ? `${auto.dias} dias analisados` : ""}</span>
            </div>
            <div className="max-h-80 divide-y overflow-y-auto text-sm">
              {auto?.produtos.map((p) => (
                <div key={p.codigo} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="w-16 tabular-nums text-muted-foreground">{p.codigo}</span>
                  <span className="flex-1">{p.descricao}</span>
                  <span className="tabular-nums text-xs text-muted-foreground">{p.dias}/{auto.dias} dias · {Math.round(p.pct * 100)}%</span>
                </div>
              ))}
              {auto && !auto.produtos.length && <p className="px-3 py-2 text-muted-foreground">Nenhum produto vendeu em 85% dos dias salvos.</p>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Extras (opcional): adicione produtos que devem entrar mesmo fora da lista automática.</p>
          <div className="flex gap-2">
            <Input className="w-28" placeholder="Código" inputMode="numeric" value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value.replace(/\D/g, "") })} />
            <Input placeholder="Descrição" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addProduto()} />
            <Button size="icon" aria-label="Adicionar produto" onClick={addProduto}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="divide-y text-sm">
            {produtos.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-1.5">
                <span className="w-16 tabular-nums text-muted-foreground">{p.codigo}</span>
                <span className="flex-1">{p.descricao}</span>
                <Button size="icon" variant="ghost" aria-label="Remover produto" onClick={async () => { await supabase.from("whatsapp_produtos_diarios").delete().eq("id", p.id); carregarProdutos(); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {!produtos.length && <p className="py-2 text-muted-foreground">Nenhum extra.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

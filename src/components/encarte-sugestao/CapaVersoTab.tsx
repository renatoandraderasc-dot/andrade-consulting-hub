import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { chamarRelatorio, avisoRelatorio, pick, txt } from "@/lib/vrReport";
import { normalizarCodigos } from "./manualTypes";
import { CategoriaRow } from "./types";

type Posicao = "capa" | "verso" | "ambos" | "excluir";

interface Regra {
  id: string;
  store_id: string;
  tipo_alvo: string;
  codigo: string | null;
  ean: string | null;
  descricao: string | null;
  categoria_id: string | null;
  departamento: string | null;
  posicao: string;
  fixo: boolean;
  prioridade: number;
  tipo_faixa: string | null;
  slot_preferido: number | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  ativo: boolean;
  observacao: string | null;
}

interface Props {
  storeId: string;
  categorias: CategoriaRow[];
}

const POSICOES: { v: Posicao; label: string }[] = [
  { v: "capa", label: "Capa" },
  { v: "verso", label: "Verso" },
  { v: "ambos", label: "Ambos" },
  { v: "excluir", label: "Excluir" },
];

const CapaVersoTab = ({ storeId, categorias }: Props) => {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [modal, setModal] = useState(false);
  const [texto, setTexto] = useState("");
  const [posLote, setPosLote] = useState<Posicao>("capa");
  const [fixoLote, setFixoLote] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState("");
  const [posCategoria, setPosCategoria] = useState<Posicao>("capa");
  const [novoDep, setNovoDep] = useState("");
  const [posDep, setPosDep] = useState<Posicao>("verso");
  const [codigoLoja, setCodigoLoja] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    if (!storeId) return setRegras([]);
    const { data, error } = await supabase
      .from("encarte_posicao_regra").select("*").eq("store_id", storeId)
      .order("tipo_alvo").order("prioridade");
    if (error) return toast.error(error.message);
    setRegras((data ?? []) as Regra[]);
  }, [storeId]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (!storeId) return;
    supabase.from("store_vr_config").select("codigo_loja").eq("store_id", storeId).maybeSingle()
      .then(({ data }) => setCodigoLoja(data?.codigo_loja ?? null));
  }, [storeId]);

  const atualizar = async (id: string, patch: Partial<Regra>) => {
    setRegras((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("encarte_posicao_regra").update(patch).eq("id", id);
    if (error) { toast.error(error.message); carregar(); }
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from("encarte_posicao_regra").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRegras((prev) => prev.filter((r) => r.id !== id));
  };

  const adicionarProdutos = async () => {
    const codigos = normalizarCodigos(texto);
    if (!storeId) return toast.error("Escolha a loja");
    if (!codigos.length) return toast.error("Cole os códigos");
    setBuscando(true);
    const linhas: Partial<Regra>[] = [];
    for (let i = 0; i < codigos.length; i += 100) {
      const lote = codigos.slice(i, i + 100);
      const r = await chamarRelatorio(storeId, "encarte_manual", {
        loja: codigoLoja ?? "",
        codigos: lote.join(","),
        ref: new Date().toISOString().slice(0, 10),
      });
      const msg = avisoRelatorio(r);
      if (msg) toast.warning(msg);
      const dados = r.dados as Record<string, unknown>[];
      lote.forEach((cod, idx) => {
        const linha = dados.find((d) =>
          [pick(d, "codigo_digitado"), pick(d, "codigo"), pick(d, "ean")]
            .some((v) => String(v ?? "").trim() === cod)) ?? dados[idx];
        linhas.push({
          store_id: storeId, tipo_alvo: "produto",
          codigo: txt(pick(linha ?? {}, "codigo")) || cod,
          ean: txt(pick(linha ?? {}, "ean")) || null,
          descricao: txt(pick(linha ?? {}, "descricao")) || null,
          posicao: posLote, fixo: fixoLote,
        });
      });
    }
    const { error } = await supabase.from("encarte_posicao_regra").insert(linhas as never);
    setBuscando(false);
    if (error) return toast.error(error.message);
    setTexto(""); setModal(false); carregar();
    toast.success(`${linhas.length} regras cadastradas`);
  };

  const adicionarCategoria = async () => {
    if (!novaCategoria) return;
    const { error } = await supabase.from("encarte_posicao_regra").insert({
      store_id: storeId, tipo_alvo: "categoria", categoria_id: novaCategoria, posicao: posCategoria,
    });
    if (error) return toast.error(error.message);
    setNovaCategoria(""); carregar();
  };

  const adicionarDepartamento = async () => {
    if (!novoDep.trim()) return;
    const { error } = await supabase.from("encarte_posicao_regra").insert({
      store_id: storeId, tipo_alvo: "departamento", departamento: novoDep.trim(), posicao: posDep,
    });
    if (error) return toast.error(error.message);
    setNovoDep(""); carregar();
  };

  const produtos = useMemo(() => regras.filter((r) => r.tipo_alvo === "produto"), [regras]);
  const porCategoria = useMemo(() => regras.filter((r) => r.tipo_alvo === "categoria"), [regras]);
  const porDep = useMemo(() => regras.filter((r) => r.tipo_alvo === "departamento"), [regras]);

  const SelectPos = ({ value, onChange }: { value: string; onChange: (v: Posicao) => void }) => (
    <Select value={value} onValueChange={(v) => onChange(v as Posicao)}>
      <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
      <SelectContent>
        {POSICOES.map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  if (!storeId) {
    return <Card className="p-6 text-sm text-muted-foreground">Escolha uma loja para configurar as regras.</Card>;
  }

  return (
    <div className="space-y-4">
      <Accordion type="multiple" defaultValue={["produtos"]}>
        <AccordionItem value="produtos">
          <AccordionTrigger>Produtos fixos ({produtos.length})</AccordionTrigger>
          <AccordionContent>
            <Card className="p-4 space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setModal(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Adicionar produtos
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                      <th className="py-2 pr-2">Código</th>
                      <th className="py-2 pr-2">EAN</th>
                      <th className="py-2 pr-2">Descrição</th>
                      <th className="py-2 pr-2">Posição</th>
                      <th className="py-2 pr-2">Fixo</th>
                      <th className="py-2 pr-2">Prioridade</th>
                      <th className="py-2 pr-2">Faixa</th>
                      <th className="py-2 pr-2">Slot</th>
                      <th className="py-2 pr-2">Vigência</th>
                      <th className="py-2 pr-2">Ativo</th>
                      <th className="py-2 pr-2">Observação</th>
                      <th className="py-2 pr-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produtos.length === 0 && (
                      <tr><td colSpan={12} className="py-8 text-center text-muted-foreground">
                        Nenhum produto com regra de posição.
                      </td></tr>
                    )}
                    {produtos.map((r) => (
                      <tr key={r.id} className="border-b border-border/50">
                        <td className="py-1.5 pr-2 font-mono text-xs">{r.codigo}</td>
                        <td className="py-1.5 pr-2 font-mono text-xs">{r.ean ?? "—"}</td>
                        <td className="py-1.5 pr-2">{r.descricao ?? "—"}</td>
                        <td className="py-1.5 pr-2">
                          <SelectPos value={r.posicao} onChange={(v) => atualizar(r.id, { posicao: v })} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Switch checked={r.fixo} onCheckedChange={(v) => atualizar(r.id, { fixo: v })} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input
                            className="h-8 w-20" type="number" value={r.prioridade}
                            onChange={(e) => atualizar(r.id, { prioridade: Number(e.target.value) })}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Select
                            value={r.tipo_faixa ?? "qualquer"}
                            onValueChange={(v) => atualizar(r.id, { tipo_faixa: v === "qualquer" ? null : v })}
                          >
                            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="qualquer">Qualquer</SelectItem>
                              <SelectItem value="vermelho">Vermelho</SelectItem>
                              <SelectItem value="amarelo">Amarelo</SelectItem>
                              <SelectItem value="neutro">Neutro</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input
                            className="h-8 w-16" type="number" value={r.slot_preferido ?? ""}
                            onChange={(e) => atualizar(r.id, {
                              slot_preferido: e.target.value === "" ? null : Number(e.target.value),
                            })}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <div className="flex gap-1">
                            <Input
                              className="h-8 w-32" type="date" value={r.vigencia_inicio ?? ""}
                              onChange={(e) => atualizar(r.id, { vigencia_inicio: e.target.value || null })}
                            />
                            <Input
                              className="h-8 w-32" type="date" value={r.vigencia_fim ?? ""}
                              onChange={(e) => atualizar(r.id, { vigencia_fim: e.target.value || null })}
                            />
                          </div>
                        </td>
                        <td className="py-1.5 pr-2">
                          <Switch checked={r.ativo} onCheckedChange={(v) => atualizar(r.id, { ativo: v })} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input
                            className="h-8 w-40" value={r.observacao ?? ""}
                            onChange={(e) => setRegras((prev) => prev.map((x) => x.id === r.id ? { ...x, observacao: e.target.value } : x))}
                            onBlur={(e) => atualizar(r.id, { observacao: e.target.value || null })}
                          />
                        </td>
                        <td className="py-1.5 pr-2 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remover(r.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="categoria">
          <AccordionTrigger>Por categoria ({porCategoria.length})</AccordionTrigger>
          <AccordionContent>
            <Card className="p-4 space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label className="text-xs">Categoria</Label>
                  <Select value={novaCategoria} onValueChange={setNovaCategoria}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="Escolha a categoria" /></SelectTrigger>
                    <SelectContent>
                      {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <SelectPos value={posCategoria} onChange={setPosCategoria} />
                <Button size="sm" onClick={adicionarCategoria}>
                  <Plus className="w-4 h-4 mr-2" /> Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {porCategoria.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 border-b border-border/50 pb-2">
                    <span className="flex-1">
                      {categorias.find((c) => c.id === r.categoria_id)?.nome ?? "categoria removida"}
                    </span>
                    <SelectPos value={r.posicao} onChange={(v) => atualizar(r.id, { posicao: v })} />
                    <Switch checked={r.ativo} onCheckedChange={(v) => atualizar(r.id, { ativo: v })} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remover(r.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="departamento">
          <AccordionTrigger>Por departamento ({porDep.length})</AccordionTrigger>
          <AccordionContent>
            <Card className="p-4 space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label className="text-xs">Departamento</Label>
                  <Input
                    className="w-64" placeholder="Ex.: BAZAR"
                    value={novoDep} onChange={(e) => setNovoDep(e.target.value)}
                  />
                </div>
                <SelectPos value={posDep} onChange={setPosDep} />
                <Button size="sm" onClick={adicionarDepartamento}>
                  <Plus className="w-4 h-4 mr-2" /> Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {porDep.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 border-b border-border/50 pb-2">
                    <span className="flex-1">{r.departamento}</span>
                    <SelectPos value={r.posicao} onChange={(v) => atualizar(r.id, { posicao: v })} />
                    <Switch checked={r.ativo} onCheckedChange={(v) => atualizar(r.id, { ativo: v })} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remover(r.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar produtos</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Textarea
              rows={6} placeholder="Cole os códigos de barras ou reduzidos"
              value={texto} onChange={(e) => setTexto(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <div>
                <Label className="text-xs">Posição</Label>
                <SelectPos value={posLote} onChange={setPosLote} />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch checked={fixoLote} onCheckedChange={setFixoLote} />
                <span className="text-sm">Fixo no próximo encarte</span>
              </div>
              <Badge variant="secondary" className="ml-auto mt-5">
                {normalizarCodigos(texto).length} códigos
              </Badge>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={adicionarProdutos} disabled={buscando}>
              {buscando ? "Buscando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CapaVersoTab;

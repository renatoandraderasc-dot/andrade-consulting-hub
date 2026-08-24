import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, AlertTriangle, Store } from "lucide-react";
import { PLATAFORMAS, COLETOR_DISPONIVEL } from "./SitesCatalogoPanel";

interface SiteOpt {
  id: string;
  nome: string;
  host: string;
  plataforma: string;
  praca_esperada: string | null;
  cep_referencia: string;
  ultima_coleta: string | null;
  status_ultima_coleta: string | null;
  ativo: boolean;
}

interface Vinculo {
  id: string;
  apelido: string | null;
  prioridade: number;
  ativo: boolean;
  site: SiteOpt;
}

const dataHora = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const diasDesde = (s: string | null) =>
  s ? Math.floor((Date.now() - new Date(s).getTime()) / 86400000) : null;

const ClienteConcorrentesPanel = ({ storeId }: { storeId: string }) => {
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [catalogo, setCatalogo] = useState<SiteOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [siteSel, setSiteSel] = useState("");
  const [apelido, setApelido] = useState("");

  const [pedNome, setPedNome] = useState("");
  const [pedHost, setPedHost] = useState("");
  const [pedPlat, setPedPlat] = useState("vtex");
  const [pedCep, setPedCep] = useState("");

  const carregar = useCallback(async () => {
    if (!storeId) { setVinculos([]); return; }
    setLoading(true);
    const [{ data: vs, error }, { data: sites }] = await Promise.all([
      supabase
        .from("cliente_concorrentes")
        .select("id, apelido, prioridade, ativo, sites_concorrentes(id, nome, host, plataforma, praca_esperada, cep_referencia, ultima_coleta, status_ultima_coleta, ativo)")
        .eq("store_id", storeId)
        .order("prioridade"),
      supabase.from("sites_concorrentes").select("*").eq("ativo", true).order("nome"),
    ]);
    if (error) toast.error("Não foi possível carregar os concorrentes desta loja");
    setVinculos(
      ((vs || []) as unknown as (Omit<Vinculo, "site"> & { sites_concorrentes: SiteOpt })[])
        .filter((v) => v.sites_concorrentes)
        .map((v) => ({ id: v.id, apelido: v.apelido, prioridade: v.prioridade, ativo: v.ativo, site: v.sites_concorrentes })),
    );
    setCatalogo((sites as SiteOpt[]) || []);
    setLoading(false);
  }, [storeId]);

  useEffect(() => { carregar(); }, [carregar]);

  const vincular = async () => {
    if (!storeId) return toast.error("Selecione a loja");
    if (!siteSel) return toast.error("Escolha um site do catálogo");
    const { error } = await supabase.from("cliente_concorrentes").insert({
      store_id: storeId,
      site_concorrente_id: siteSel,
      apelido: apelido.trim() || null,
      prioridade: vinculos.length + 1,
    });
    if (error) return toast.error(error.message);
    toast.success("Concorrente adicionado");
    setOpen(false); setSiteSel(""); setApelido("");
    carregar();
  };

  const solicitar = async () => {
    const host = pedHost.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
    if (!pedNome.trim() || !host) return toast.error("Informe o nome e o endereço do site");
    const { error } = await supabase.from("sites_concorrentes").insert({
      nome: pedNome.trim(),
      host,
      plataforma: pedPlat,
      cep_referencia: pedCep.replace(/\D/g, ""),
      ativo: false,
    });
    if (error) return toast.error(error.message);
    toast.success("Solicitação registrada — o site será validado antes de liberar a coleta");
    setPedNome(""); setPedHost(""); setPedCep("");
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from("cliente_concorrentes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    carregar();
  };

  const renomear = async (id: string, valor: string) => {
    await supabase.from("cliente_concorrentes").update({ apelido: valor || null }).eq("id", id);
  };

  const disponiveis = catalogo.filter((s) => !vinculos.some((v) => v.site.id === s.id));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><Store className="w-4 h-4" /> Concorrentes desta loja</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2" disabled={!storeId}><Plus className="w-4 h-4" /> Adicionar concorrente</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Adicionar concorrente</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Site do catálogo</Label>
                  <Select value={siteSel} onValueChange={setSiteSel}>
                    <SelectTrigger><SelectValue placeholder={disponiveis.length ? "Selecione" : "Nenhum site disponível"} /></SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      {disponiveis.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome} — {s.host}{s.praca_esperada ? ` (${s.praca_esperada})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Apelido (opcional)</Label>
                  <Input value={apelido} onChange={(e) => setApelido(e.target.value)} placeholder="Como esta loja chama esse concorrente" />
                </div>
                <Button onClick={vincular} className="w-full">Adicionar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Concorrente</TableHead>
                <TableHead>Site</TableHead>
                <TableHead className="w-[130px]">Plataforma</TableHead>
                <TableHead className="w-[160px]">Praça</TableHead>
                <TableHead className="w-[220px]">Última coleta</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vinculos.map((v) => {
                const dias = diasDesde(v.site.ultima_coleta);
                const velha = dias === null || dias > 7;
                return (
                  <TableRow key={v.id}>
                    <TableCell>
                      <Input
                        defaultValue={v.apelido || v.site.nome}
                        onBlur={(e) => renomear(v.id, e.target.value.trim())}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{v.site.host}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={COLETOR_DISPONIVEL.has(v.site.plataforma) ? "secondary" : "outline"} className="text-[10px]">
                        {PLATAFORMAS.find((p) => p.value === v.site.plataforma)?.label || v.site.plataforma}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{v.site.praca_esperada || "—"}</TableCell>
                    <TableCell className="text-xs">
                      <span className={velha ? "text-amber-600 flex items-center gap-1" : "text-muted-foreground"}>
                        {velha && <AlertTriangle className="w-3.5 h-3.5" />}
                        {dataHora(v.site.ultima_coleta)}
                        {dias !== null && velha && <span>• há {dias} dias</span>}
                        {dias === null && <span>• nunca coletado</span>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remover(v.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && vinculos.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum concorrente vinculado a esta loja.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Solicitar novo site</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            O site passa por validação antes de ser liberado para coleta — assim evitamos cadastrar um endereço que o coletor não consegue ler.
          </p>
          <div className="grid gap-3 md:grid-cols-4 items-end">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={pedNome} onChange={(e) => setPedNome(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Endereço do site</Label>
              <Input value={pedHost} onChange={(e) => setPedHost(e.target.value)} placeholder="www.exemplo.com.br" />
            </div>
            <div>
              <Label className="text-xs">Plataforma (se souber)</Label>
              <Select value={pedPlat} onValueChange={setPedPlat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {PLATAFORMAS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Input value={pedCep} onChange={(e) => setPedCep(e.target.value)} placeholder="CEP da praça" />
              <Button variant="outline" onClick={solicitar}>Solicitar</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClienteConcorrentesPanel;

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Pencil, Plus, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { TIPOS_LANCAMENTO_V2, SUBCONTAS_V2 } from "./contRedeStructure";

interface MapRow {
  id: string;
  store_id: string | null;
  id_tipo: number;
  tipo: string;
  subtipo: string;
  descricao_vr: string | null;
}

interface Pendente {
  id_tipo: number;
  qtd: number;
  valor: number;
  exemplo: string;
}

interface Props {
  storeId: string;
}

const fmtCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const ClassificacaoVrTab = ({ storeId }: Props) => {
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState<MapRow[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [loading, setLoading] = useState(false);
  const [reimportando, setReimportando] = useState(false);
  const [meses, setMeses] = useState("3");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MapRow | null>(null);
  const [form, setForm] = useState({ id_tipo: "", tipo: "Despesas", subtipo: "" });

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const [{ data: maps }, { data: lanc }] = await Promise.all([
      supabase
        .from("vr_lancamento_map")
        .select("id, store_id, id_tipo, tipo, subtipo")
        .or(`store_id.eq.${storeId},store_id.is.null`)
        .order("id_tipo"),
      supabase
        .from("lancamentos")
        .select("valor, observacao")
        .eq("store_id", storeId)
        .eq("origem", "VR")
        .like("observacao", "NAO CLASSIFICADO%")
        .limit(20000),
    ]);

    setRows((maps as any[]) || []);

    const agg = new Map<number, Pendente>();
    ((lanc as any[]) || []).forEach(l => {
      const m = /tipo VR (\-?\d+)/.exec(l.observacao || "");
      const idTipo = m ? Number(m[1]) : -1;
      const cur = agg.get(idTipo) || { id_tipo: idTipo, qtd: 0, valor: 0 };
      cur.qtd += 1;
      cur.valor += Number(l.valor) || 0;
      agg.set(idTipo, cur);
    });
    setPendentes([...agg.values()].sort((a, b) => b.valor - a.valor));
    setLoading(false);
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const subcontas = useMemo(() => SUBCONTAS_V2[form.tipo] || [], [form.tipo]);

  const openNew = (idTipo?: number) => {
    setEditing(null);
    setForm({ id_tipo: idTipo != null ? String(idTipo) : "", tipo: "Despesas", subtipo: (SUBCONTAS_V2["Despesas"] || [])[0] || "" });
    setDialogOpen(true);
  };

  const openEdit = (r: MapRow) => {
    setEditing(r);
    setForm({ id_tipo: String(r.id_tipo), tipo: r.tipo, subtipo: r.subtipo });
    setDialogOpen(true);
  };

  const save = async () => {
    const idTipo = Number(form.id_tipo);
    if (!idTipo && idTipo !== 0) { toast.error("Informe o tipo do VR"); return; }
    if (!form.tipo || !form.subtipo) { toast.error("Escolha tipo e subtipo"); return; }

    // Editar linha "Desta loja" -> atualiza. Padrão ou novo -> cria exceção da loja.
    if (editing && editing.store_id) {
      const { error } = await supabase
        .from("vr_lancamento_map")
        .update({ tipo: form.tipo, subtipo: form.subtipo })
        .eq("id", editing.id);
      if (error) { toast.error("Erro ao salvar"); return; }
      toast.success("Mapeamento atualizado");
    } else {
      const { error } = await supabase
        .from("vr_lancamento_map")
        .upsert(
          { store_id: storeId, id_tipo: idTipo, tipo: form.tipo, subtipo: form.subtipo },
          { onConflict: "store_id,id_tipo" },
        );
      if (error) { toast.error("Erro ao salvar: " + error.message); return; }
      toast.success("Exceção criada para esta loja");
    }
    setDialogOpen(false);
    load();
  };

  const excluirExcecao = async (r: MapRow) => {
    const { error } = await supabase.from("vr_lancamento_map").delete().eq("id", r.id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Exceção removida — voltou ao padrão");
    load();
  };

  const reimportar = async () => {
    if (!storeId || !user) return;
    setReimportando(true);
    const { data, error } = await supabase.functions.invoke("importar-lancamentos-vr", {
      body: { store_id: storeId, user_id: user.id, meses_atras: Number(meses) },
    });
    setReimportando(false);
    if (error || (data as any)?.erro) {
      toast.error("Falha ao reimportar");
      return;
    }
    toast.success(`${(data as any)?.gravados ?? 0} lançamento(s) reprocessados`);
    load();
  };

  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">Acesso restrito a administradores.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-foreground">Classificação VR</h2>
        <p className="text-sm text-muted-foreground">
          De-para entre os tipos de despesa do VR e as contas da Cont Rede.
        </p>
      </div>

      {/* Pendentes */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Pendentes
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Lançamentos importados do VR sem classificação, agrupados pelo tipo do VR.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {pendentes.length === 0 ? (
            <p className="px-6 pb-4 text-sm text-muted-foreground">
              Nenhum lançamento pendente de classificação.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo VR</TableHead>
                  <TableHead className="text-right">Lançamentos</TableHead>
                  <TableHead className="text-right">Valor total</TableHead>
                  <TableHead className="w-[130px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentes.map(p => (
                  <TableRow key={p.id_tipo}>
                    <TableCell className="font-mono text-sm">{p.id_tipo}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{p.qtd}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmtCurrency(p.valor)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openNew(p.id_tipo)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Mapear
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Mapeamentos */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold">Mapeamentos</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
              </Button>
              <Button size="sm" onClick={() => openNew()}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Novo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">ID Tipo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Subtipo</TableHead>
                <TableHead className="w-[120px]">Origem</TableHead>
                <TableHead className="w-[110px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    Nenhum mapeamento cadastrado
                  </TableCell>
                </TableRow>
              ) : rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.id_tipo}</TableCell>
                  <TableCell className="text-sm">{r.tipo}</TableCell>
                  <TableCell className="text-sm">{r.subtipo}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.store_id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {r.store_id ? "Desta loja" : "Padrão"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {r.store_id && (
                      <Button variant="ghost" size="icon" onClick={() => excluirExcecao(r)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reimportar */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Select value={meses} onValueChange={setMeses}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 mês</SelectItem>
              <SelectItem value="3">3 meses</SelectItem>
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={reimportar} disabled={reimportando}>
            {reimportando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Reimportar período
          </Button>
          <span className="text-xs text-muted-foreground">
            Reprocessa os pagamentos do VR aplicando as classificações atuais.
          </span>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {editing?.store_id ? "Editar mapeamento da loja" : editing ? "Criar exceção desta loja" : "Novo mapeamento"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {editing && !editing.store_id && (
              <p className="text-xs text-amber-500">
                Este é um mapeamento padrão. Ao salvar, será criada uma exceção apenas para esta loja — o padrão não muda.
              </p>
            )}
            <div>
              <Label>ID do tipo no VR</Label>
              <Input
                type="number"
                value={form.id_tipo}
                disabled={!!editing}
                onChange={e => setForm(p => ({ ...p, id_tipo: e.target.value }))}
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={v => setForm(p => ({ ...p, tipo: v, subtipo: (SUBCONTAS_V2[v] || [])[0] || "" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_LANCAMENTO_V2.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subtipo</Label>
              <Select value={form.subtipo} onValueChange={v => setForm(p => ({ ...p, subtipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {subcontas.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

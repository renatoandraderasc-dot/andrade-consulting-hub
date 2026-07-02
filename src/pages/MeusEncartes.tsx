import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ClientLayout from "@/components/ClientLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy, Pencil, Trash2, Plus } from "lucide-react";
import { formatBRDate } from "@/lib/formatters";
import { THEMES, ThemeKey } from "@/lib/encarteThemes";

interface EncarteRow {
  id: string;
  nome: string;
  tema: string;
  validade_de: string | null;
  validade_ate: string | null;
  created_at: string;
}

const MeusEncartes = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<EncarteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("encartes").select("id,nome,tema,validade_de,validade_ate,created_at").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as EncarteRow[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const duplicar = async (id: string) => {
    const { data: orig } = await supabase.from("encartes").select("*").eq("id", id).single();
    if (!orig) return;
    const { id: _, created_at, updated_at, ...rest } = orig as any;
    const { data: novo, error } = await supabase.from("encartes").insert({ ...rest, nome: `${rest.nome} (cópia)` }).select().single();
    if (error) { toast.error(error.message); return; }
    const { data: itens } = await supabase.from("encarte_itens").select("*").eq("encarte_id", id);
    if (itens?.length) {
      const clones = itens.map((it: any) => { const { id, created_at, ...r } = it; return { ...r, encarte_id: novo.id }; });
      await supabase.from("encarte_itens").insert(clones);
    }
    toast.success("Encarte duplicado");
    load();
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este encarte? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("encartes").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Excluído"); load(); }
  };

  return (
    <ClientLayout>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Meus Encartes</h1>
            <p className="text-sm text-muted-foreground">Encartes salvos, reaproveite para as próximas semanas</p>
          </div>
          <Button onClick={() => navigate("/encartes/editor")}><Plus className="w-4 h-4 mr-2" /> Novo encarte</Button>
        </div>

        {loading && <div className="text-center p-8 text-muted-foreground">Carregando...</div>}
        {!loading && rows.length === 0 && (
          <Card className="p-12 text-center text-muted-foreground">
            Nenhum encarte ainda. <Button variant="link" onClick={() => navigate("/encartes/editor")}>Criar o primeiro</Button>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {rows.map((r) => {
            const t = THEMES[(r.tema as ThemeKey) in THEMES ? (r.tema as ThemeKey) : "ofertao"];
            return (
              <Card key={r.id} className="overflow-hidden">
                <div style={{ background: t.bg, height: 140, position: "relative", display: "flex", flexDirection: "column" }}>
                  <div style={{ background: t.headerBg, color: t.headerText, padding: "8px 12px", fontFamily: "Impact, sans-serif", fontSize: 18 }}>
                    {(r.nome || "Encarte").toUpperCase()}
                  </div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: t.titleText, fontFamily: "Impact, sans-serif", fontSize: 24 }}>
                    OFERTAS
                  </div>
                </div>
                <div className="p-3 space-y-1">
                  <div className="font-semibold truncate">{r.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {(r.validade_de || r.validade_ate) ? `Válido: ${formatBRDate(r.validade_de)} — ${formatBRDate(r.validade_ate)}` : "Sem validade"}
                  </div>
                  <div className="text-xs text-muted-foreground">Criado em {formatBRDate(r.created_at)}</div>
                  <div className="flex gap-1 pt-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/encartes/editor/${r.id}`)}><Pencil className="w-3 h-3 mr-1" /> Abrir</Button>
                    <Button size="sm" variant="outline" onClick={() => duplicar(r.id)}><Copy className="w-3 h-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => excluir(r.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </ClientLayout>
  );
};

export default MeusEncartes;

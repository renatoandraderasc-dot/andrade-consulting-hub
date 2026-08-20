import { useCallback, useEffect, useMemo, useState } from "react";
import ClientLayout from "@/components/ClientLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tags } from "lucide-react";
import MontagemTab from "@/components/encarte-sugestao/MontagemTab";
import ModeloTab from "@/components/encarte-sugestao/ModeloTab";
import ImpressaoTab from "@/components/encarte-sugestao/ImpressaoTab";
import {
  Alternativa, CalendarioRow, Face, ItemEncarte, ModeloRow,
} from "@/components/encarte-sugestao/types";

interface Store { id: string; name: string }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const diaDoMes = (dia: number) => {
  const hoje = new Date();
  const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  return iso(new Date(hoje.getFullYear(), hoje.getMonth(), Math.min(Math.max(dia, 1), ultimo)));
};

const EncarteSugestao = () => {
  const { user, isAdmin } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>(() => sessionStorage.getItem("selectedStoreId") || "");
  const [sistema, setSistema] = useState<string>("VR");
  const [calendarios, setCalendarios] = useState<CalendarioRow[]>([]);
  const [calendarioId, setCalendarioId] = useState("");
  const [modelos, setModelos] = useState<ModeloRow[]>([]);
  const [modeloId, setModeloId] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [itens, setItens] = useState<ItemEncarte[]>([]);
  const [alternativas, setAlternativas] = useState<Record<string, Alternativa[]>>({});
  const [encarteId, setEncarteId] = useState<string | null>(null);
  const [status, setStatus] = useState("rascunho");
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // lojas do usuário
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      let list: Store[] = [];
      if (isAdmin) {
        const { data } = await supabase.from("stores").select("id, name").order("name");
        list = data ?? [];
      } else {
        const { data: acesso } = await supabase
          .from("user_store_access").select("store_id")
          .eq("user_id", user.id).eq("approved", true);
        const ids = (acesso ?? []).map((a) => a.store_id);
        if (ids.length) {
          const { data } = await supabase.from("stores").select("id, name").in("id", ids).order("name");
          list = data ?? [];
        }
      }
      setStores(list);
      setStoreId((cur) => (cur && list.some((s) => s.id === cur) ? cur : (list[0]?.id ?? "")));
    };
    load();
  }, [user, isAdmin]);

  const carregarCalendario = useCallback(async () => {
    const { data } = await supabase
      .from("encarte_calendario")
      .select("id, nome, tipo_faixa, dia_inicio, dia_fim, agv_pct, ordem, modelo_id")
      .order("ordem");
    setCalendarios((data as CalendarioRow[]) ?? []);
  }, []);

  const carregarModelos = useCallback(async () => {
    const { data } = await supabase
      .from("encarte_modelo").select("id, nome, padrao").order("padrao", { ascending: false }).order("nome");
    const list = (data as ModeloRow[]) ?? [];
    setModelos(list);
    setModeloId((cur) => (cur && list.some((m) => m.id === cur) ? cur : (list[0]?.id ?? "")));
  }, []);

  useEffect(() => { carregarCalendario(); carregarModelos(); }, [carregarCalendario, carregarModelos]);

  // sistema da loja
  useEffect(() => {
    if (!storeId) return;
    supabase.from("store_vr_config").select("sistema").eq("store_id", storeId).maybeSingle()
      .then(({ data }) => setSistema((data?.sistema ?? "VR").toUpperCase()));
  }, [storeId]);

  // datas a partir do calendário escolhido
  useEffect(() => {
    const cal = calendarios.find((c) => c.id === calendarioId);
    if (!cal) return;
    setDataInicio(diaDoMes(cal.dia_inicio));
    setDataFim(diaDoMes(cal.dia_fim));
    if (cal.modelo_id) setModeloId(cal.modelo_id);
  }, [calendarioId, calendarios]);

  const trocarLoja = (id: string) => {
    setStoreId(id);
    sessionStorage.setItem("selectedStoreId", id);
    setItens([]); setAlternativas({}); setEncarteId(null); setStatus("rascunho"); setAviso(null);
  };

  const lojaVr = sistema !== "WEBSAC";
  const nomeEncarte = useMemo(
    () => calendarios.find((c) => c.id === calendarioId)?.nome ?? "",
    [calendarios, calendarioId],
  );

  const gerar = async (manterTravados: boolean) => {
    if (!storeId || !modeloId) { toast.error("Escolha a loja e o modelo"); return; }
    setLoading(true); setAviso(null);
    const travados = manterTravados ? itens.filter((i) => i.travado) : [];
    const { data, error } = await supabase.functions.invoke("sugerir-encarte", {
      body: {
        store_id: storeId, calendario_id: calendarioId || null, modelo_id: modeloId,
        data_inicio: dataInicio || null, data_fim: dataFim || null,
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const resp = data as Record<string, unknown>;
    if (resp?.erro) {
      const nomeLoja = stores.find((s) => s.id === storeId)?.name ?? "selecionada";
      setAviso(
        resp.erro === "relatorio_ausente"
          ? `A loja ${nomeLoja} ainda não tem o relatório encarte_base instalado na ponte de dados.`
          : String(resp.erro),
      );
      return;
    }
    const novos = ((resp?.itens as ItemEncarte[]) ?? []).map((i) => ({ ...i, travado: false, ciente: false }));
    const mesclados = manterTravados
      ? novos.map((n) => travados.find((t) => t.face === n.face && t.posicao === n.posicao) ?? n)
      : novos;
    setItens(mesclados);
    setAlternativas((resp?.alternativas as Record<string, Alternativa[]>) ?? {});
    setEncarteId(String(resp?.encarte_id ?? ""));
    setStatus("rascunho");
    const resumo = resp?.resumo as Record<string, number> | undefined;
    toast.success(
      `Sugestão gerada: ${resumo?.preenchidos ?? 0}/${resumo?.slots ?? 0} posições` +
      (resumo?.com_alerta ? ` · ${resumo.com_alerta} com alerta` : ""),
    );
  };

  const persistir = async (aprovar: boolean) => {
    if (!encarteId) { toast.error("Gere a sugestão antes de salvar"); return; }
    setSalvando(true);
    const { error: delErr } = await supabase.from("encarte_item").delete().eq("encarte_id", encarteId);
    if (delErr) { toast.error(delErr.message); setSalvando(false); return; }
    const linhas = itens.map((i, idx) => ({
      encarte_id: encarteId, ordem: idx + 1,
      face: i.face, posicao: i.posicao, tipo_faixa: i.tipo_faixa,
      departamento: i.departamento, categoria: i.categoria,
      codigo: i.codigo, descricao: i.descricao, ean: i.ean ?? null,
      custo: i.custo, pmz: i.pmz, venda_atual: i.venda_atual, margem_atual: i.margem_atual,
      preco_oferta: i.preco_oferta, margem_oferta: i.margem_oferta,
      estoque: i.estoque ?? null, giro_90d: i.giro_90d ?? null, volume_30d: i.volume_30d ?? null,
      score: i.score ?? null, origem: i.origem ?? "sugerido",
      motivo: (i.motivo ?? null) as never, alerta: i.alerta ?? null,
      ciente: !!i.ciente, travado: !!i.travado, aprovado: aprovar,
      observacao: i.observacao ?? null,
    }));
    const { error } = await supabase.from("encarte_item").insert(linhas);
    if (error) { toast.error(error.message); setSalvando(false); return; }
    if (aprovar) {
      const { error: e2 } = await supabase
        .from("encarte_gerado").update({ status: "aprovado" }).eq("id", encarteId);
      if (e2) { toast.error(e2.message); setSalvando(false); return; }
      setStatus("aprovado");
    }
    setSalvando(false);
    toast.success(aprovar ? "Encarte aprovado" : "Rascunho salvo");
  };

  const itensOrdenados = useMemo(
    () =>
      [...itens].sort((a, b) =>
        a.face === b.face ? a.posicao - b.posicao : a.face === "capa" ? -1 : 1,
      ),
    [itens],
  );

  return (
    <ClientLayout>
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-5">
        <div className="flex items-center gap-2">
          <Tags className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Sugestão de Encarte</h1>
            <p className="text-sm text-muted-foreground">
              Montagem assistida do encarte com dados ao vivo da loja.
            </p>
          </div>
        </div>

        <Tabs defaultValue="montagem">
          <TabsList>
            <TabsTrigger value="montagem">Montagem</TabsTrigger>
            {isAdmin && <TabsTrigger value="modelo">Modelo e calendário</TabsTrigger>}
            <TabsTrigger value="impressao">Impressão / Export</TabsTrigger>
          </TabsList>

          <TabsContent value="montagem" className="mt-4">
            <MontagemTab
              stores={stores}
              storeId={storeId}
              onStoreChange={trocarLoja}
              calendarios={calendarios}
              calendarioId={calendarioId}
              onCalendarioChange={setCalendarioId}
              modelos={modelos}
              modeloId={modeloId}
              onModeloChange={setModeloId}
              dataInicio={dataInicio}
              dataFim={dataFim}
              onDataInicio={setDataInicio}
              onDataFim={setDataFim}
              itens={itens}
              setItens={setItens}
              alternativas={alternativas}
              loading={loading}
              salvando={salvando}
              aviso={aviso}
              status={status}
              lojaVr={lojaVr}
              isAdmin={isAdmin}
              onGerar={gerar}
              onSalvar={() => persistir(false)}
              onAprovar={() => persistir(true)}
            />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="modelo" className="mt-4">
              <ModeloTab
                modelos={modelos}
                modeloId={modeloId}
                onModeloChange={setModeloId}
                onModelosChanged={carregarModelos}
                calendarios={calendarios}
                onCalendariosChanged={carregarCalendario}
              />
            </TabsContent>
          )}

          <TabsContent value="impressao" className="mt-4">
            <ImpressaoTab itens={itensOrdenados} nomeEncarte={nomeEncarte} />
          </TabsContent>
        </Tabs>
      </div>
    </ClientLayout>
  );
};

export default EncarteSugestao;

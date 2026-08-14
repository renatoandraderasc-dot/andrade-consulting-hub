import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface DetalheItem {
  periodo: string;
  linhas_api?: number;
  gravados?: number;
  erro?: string;
}
interface Pendente {
  id_tipo: number;
  lancamentos: number;
  valor: number;
  exemplo?: string;
}
interface Resultado {
  ok?: boolean;
  erro?: string;
  inicio?: string;
  fim?: string;
  gravados?: number;
  detalhe?: DetalheItem[];
  pendentes?: Pendente[];
}

interface Props {
  storeId: string;
  onImported?: () => void;
  onGoClassificacao?: () => void;
}

const fmtCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPeriodo = (p: string) => {
  const [a, m] = p.split("-");
  return `${m}/${a}`;
};

export const ImportarVrBlock = ({ storeId, onImported, onGoClassificacao }: Props) => {
  const { user, isAdmin } = useAuth();
  const [meses, setMeses] = useState("3");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  if (!isAdmin) return null;

  const importar = async () => {
    if (!storeId || !user) { toast.error("Selecione uma loja"); return; }
    setLoading(true);
    setResultado(null);

    const hoje = new Date();
    const fim = hoje.toISOString().slice(0, 10);
    const ini = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - Number(meses) + 1, 1))
      .toISOString().slice(0, 10);

    // Usa a edge function: cobre VR, WebSac e Oracle e tem fallback para
    // contas_a_pagar quando o conector nao publica pagamentos_periodo.
    const { data, error } = await supabase.functions.invoke("importar-lancamentos-vr", {
      body: { store_id: storeId, user_id: user.id, inicio: ini, fim },
    });
    setLoading(false);
    const payload = data as any;
    if (error || payload?.erro) {
      setResultado({ erro: error?.message || payload?.erro || "falha ao ler o sistema da loja" });
      toast.error("Falha ao ler os dados da loja");
      return;
    }
    setResultado({
      ok: true,
      inicio: ini,
      fim,
      gravados: payload?.gravados ?? 0,
      detalhe: payload?.detalhe ?? [{ periodo: ini.slice(0, 7), gravados: payload?.gravados ?? 0 }],
      pendentes: payload?.pendentes ?? [],
    });
    toast.success(`${payload?.gravados ?? 0} lançamento(s) atualizados`);
    onImported?.();
  };


  const pendentes = resultado?.pendentes ?? [];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          Dados do VR (automático)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Atualizar últimos:</span>
            <Select value={meses} onValueChange={setMeses} disabled={loading}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 mês</SelectItem>
                <SelectItem value="3">3 meses</SelectItem>
                <SelectItem value="6">6 meses</SelectItem>
                <SelectItem value="12">12 meses</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={importar} disabled={loading || !storeId}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {loading ? "Atualizando..." : "Atualizar agora"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          O banco busca sozinho os pagamentos quitados no VR (pela data de pagamento) a cada hora,
          sempre nas duas últimas competências. Este botão apenas força a leitura na hora — reler o
          mesmo período atualiza os lançamentos, não duplica.
        </p>


        {loading && (
          <p className="text-sm text-muted-foreground">
            Lendo o VR direto do banco — pode levar alguns segundos.
          </p>
        )}

        {resultado?.erro && (
          <div className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-500">
            {resultado.erro}
          </div>
        )}

        {resultado?.ok && (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-semibold text-foreground">{resultado.gravados ?? 0}</span>{" "}
              lançamento(s) gravados
              {resultado.inicio && resultado.fim && (
                <span className="text-muted-foreground"> · período {resultado.inicio} a {resultado.fim}</span>
              )}
            </p>

            <div className="rounded-md border border-border divide-y divide-border/60">
              {(resultado.detalhe ?? []).map((d, i) => (
                <div
                  key={i}
                  className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs ${d.erro ? "text-red-500 bg-red-500/5" : ""}`}
                >
                  <span className="font-medium">{fmtPeriodo(d.periodo)}</span>
                  {d.erro ? (
                    <span className="truncate">{d.erro}</span>
                  ) : (
                    <span className="text-muted-foreground font-mono">
                      {d.linhas_api ?? 0} linha(s) no VR · {d.gravados ?? 0} gravado(s)
                    </span>
                  )}
                </div>
              ))}
            </div>

            {pendentes.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold text-foreground">
                      {pendentes.length} tipos de despesa do VR ainda não estão classificados
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {pendentes.slice(0, 5).map(p => `tipo ${p.id_tipo} (${fmtCurrency(p.valor)})`).join(" · ")}
                      {pendentes.length > 5 ? " …" : ""}
                    </p>
                  </div>
                </div>
                {onGoClassificacao && (
                  <Button size="sm" variant="outline" onClick={onGoClassificacao}>
                    Ir para Classificação VR
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

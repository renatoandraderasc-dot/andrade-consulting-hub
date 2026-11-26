import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { buscarVendasHora } from "@/lib/escala/vendasHora";
import { excluirFeriado, salvarFeriado, salvarRegras, type DadosEscalaV2 } from "@/lib/escala-v2/dados";
import { FASES } from "@/lib/escala-v2/leis";
import { NOMES_DIA, NOMES_DIA_LONGO, dataNum, diaSemana, fmtDataBr, type RegrasLoja } from "@/lib/escala-v2/motor";

const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Opcao({ titulo, texto, checked, onChange, disabled }: { titulo: string; texto: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-start justify-between gap-4 p-3 ${disabled ? "opacity-60" : ""}`}>
      <span className="text-sm"><span className="font-medium block">{titulo}</span><span className="text-muted-foreground">{texto}</span></span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

interface Props {
  dados: DadosEscalaV2;
  recarregar: () => Promise<void>;
}

export default function AbaRegras({ dados, recarregar }: Props) {
  const [r, setR] = useState<RegrasLoja>(dados.regras);
  const [sujo, setSujo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lendo, setLendo] = useState("");
  const [novo, setNovo] = useState({ data: "", nome: "" });
  const pode = dados.podeGerir;
  useEffect(() => { setR(dados.regras); setSujo(false); }, [dados.regras]);
  const mudar = (patch: Partial<RegrasLoja>) => { setR(old => ({ ...old, ...patch })); setSujo(true); };

  const setores = useMemo(() => {
    const nomes = [...new Set([...dados.pessoas.filter(p => p.ativo).map(p => p.setor), ...r.setores.map(s => s.setor)])].sort((a, b) => a.localeCompare(b));
    return nomes.map(nome => r.setores.find(s => s.setor === nome) || { setor: nome, minimo: 1, antes_min: 0, depois_min: 0 });
  }, [dados.pessoas, r.setores]);
  const mudarSetor = (nome: string, patch: Partial<RegrasLoja["setores"][number]>) => mudar({ setores: setores.map(s => (s.setor === nome ? { ...s, ...patch } : s)) });
  const mudarDia = (dsem: number, patch: Partial<RegrasLoja["horario"][number]>) => mudar({ horario: r.horario.map((h, i) => (i === dsem ? { ...h, ...patch } : h)) });

  const mesIso = `${dados.ano}-${String(dados.mes).padStart(2, "0")}`;
  const feriadosMes = dados.feriados.filter(f => f.data.startsWith(mesIso));
  const feriadoLiberado = r.tem_cct && r.cct_feriado_autorizado;

  async function executar(fn: () => Promise<string | void>) {
    setBusy(true);
    try {
      const msg = await fn();
      if (msg) toast.success(msg);
      await recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  const salvar = () => executar(async () => { await salvarRegras(dados.storeId, { ...r, setores }, dados.instrucoes); return "Regras da loja salvas. Gere a escala de novo para aplicar."; });

  async function lerMovimento() {
    setLendo("Lendo a venda por hora das últimas 4 semanas…");
    try {
      const leitura = await buscarVendasHora(dados.storeId, 4, (feitas, total) => setLendo(`Lendo semana ${Math.min(feitas + 1, total)} de ${total}…`));
      if (!leitura.linhas.length) {
        toast.error(leitura.indisponivel ? "Esta loja ainda não publica o relatório de venda por hora." : leitura.offline ? "A loja está sem conexão com o sistema agora." : leitura.erro || "Não veio venda por hora no período.");
        return;
      }
      const porData = new Map<string, number>();
      for (const l of leitura.linhas) porData.set(l.data, (porData.get(l.data) || 0) + l.valor);
      const soma = new Array<number>(7).fill(0), qtd = new Array<number>(7).fill(0);
      for (const [data, valor] of porData) { const d = diaSemana(dataNum(data)); soma[d] += valor; qtd[d]++; }
      const media = soma.map((s, i) => (qtd[i] ? s / qtd[i] : 0));
      const abertos = media.filter(x => x > 0);
      const geral = abertos.reduce((s, x) => s + x, 0) / (abertos.length || 1);
      mudar({ pesos_dia: media.map(x => (x > 0 ? Math.round((x / geral) * 100) / 100 : 1)) });
      toast.success(`Movimento lido de ${fmtDataBr(leitura.inicio)} a ${fmtDataBr(leitura.fim)}. Confira e salve.`);
    } finally {
      setLendo("");
    }
  }

  return (
    <fieldset disabled={!pode} className="space-y-8 min-w-0">
      {!pode && <p className="text-sm text-muted-foreground">Só os responsáveis pela escala desta loja podem alterar as regras.</p>}

      <div className="grid xl:grid-cols-2 gap-8">
        <section>
          <h2 className="text-lg font-medium mb-1">1. Horário de funcionamento</h2>
          <p className="text-sm text-muted-foreground mb-3">Horário em que a loja fica aberta ao público.</p>
          <div className="border rounded-md divide-y">
            {ORDEM.map(dsem => {
              const h = r.horario[dsem];
              const aberto = !!(h?.abre && h?.fecha);
              return (
                <div key={dsem} className="grid grid-cols-[6rem_3rem_1fr_1fr] gap-3 px-3 py-2 items-center">
                  <span className="text-sm">{maiuscula(NOMES_DIA_LONGO[dsem])}</span>
                  <Switch aria-label={`${NOMES_DIA_LONGO[dsem]} aberto`} checked={aberto} onCheckedChange={v => mudarDia(dsem, v ? { abre: "08:00", fecha: "20:00" } : { abre: null, fecha: null })} />
                  {aberto ? (
                    <>
                      <Input aria-label={`Abre ${NOMES_DIA_LONGO[dsem]}`} type="time" value={h.abre || ""} onChange={e => mudarDia(dsem, { abre: e.target.value || null })} />
                      <Input aria-label={`Fecha ${NOMES_DIA_LONGO[dsem]}`} type="time" value={h.fecha || ""} onChange={e => mudarDia(dsem, { fecha: e.target.value || null })} />
                    </>
                  ) : <span className="col-span-2 text-sm text-muted-foreground">Fechada: conta como folga de todos</span>}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-1">2. Setores</h2>
          <p className="text-sm text-muted-foreground mb-3">Quantas pessoas, no mínimo, precisam estar no setor em cada turno, e se ele começa antes de a loja abrir (padaria, açougue) ou segue depois de fechar.</p>
          {!setores.length ? <p className="text-sm text-muted-foreground border rounded-md p-4">Os setores aparecem aqui depois que a equipe é cadastrada.</p> : (
            <div className="border rounded-md divide-y">
              <div className="grid grid-cols-[1fr_5rem_6rem_6rem] gap-3 px-3 py-2 text-xs text-muted-foreground"><span>Setor</span><span>Mínimo</span><span>Começa antes (min)</span><span>Fica depois (min)</span></div>
              {setores.map(s => (
                <div key={s.setor} className="grid grid-cols-[1fr_5rem_6rem_6rem] gap-3 px-3 py-2 items-center">
                  <span className="text-sm font-medium truncate" title={s.setor}>{s.setor}</span>
                  <Input aria-label={`Mínimo em ${s.setor}`} type="number" min={0} max={50} value={s.minimo} onChange={e => mudarSetor(s.setor, { minimo: Math.max(0, Number(e.target.value)) })} />
                  <Input aria-label={`${s.setor} começa antes`} type="number" min={0} max={240} step={15} value={s.antes_min} onChange={e => mudarSetor(s.setor, { antes_min: Math.max(0, Number(e.target.value)) })} />
                  <Input aria-label={`${s.setor} fica depois`} type="number" min={0} max={240} step={15} value={s.depois_min} onChange={e => mudarSetor(s.setor, { depois_min: Math.max(0, Number(e.target.value)) })} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-1">3. Movimento por dia da semana</h2>
        <p className="text-sm text-muted-foreground mb-3">1 é um dia normal; acima de 1, dia forte. A IA concentra as folgas nos dias fracos. A consulta ao sistema da loja só acontece quando você pede.</p>
        <div className="flex flex-wrap items-end gap-3">
          {ORDEM.map(dsem => (
            <div key={dsem} className="w-20 space-y-1.5">
              <Label>{NOMES_DIA[dsem]}</Label>
              <Input aria-label={`Movimento de ${NOMES_DIA_LONGO[dsem]}`} type="number" min={0.3} max={3} step={0.05} value={r.pesos_dia[dsem]} onChange={e => mudar({ pesos_dia: r.pesos_dia.map((x, i) => (i === dsem ? Math.min(3, Math.max(0.3, Number(e.target.value) || 1)) : x)) })} />
            </div>
          ))}
          <Button variant="outline" onClick={() => void lerMovimento()} disabled={!!lendo}><TrendingUp size={16} />{lendo || "Buscar no sistema da loja"}</Button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-1">4. Feriados de {String(dados.mes).padStart(2, "0")}/{dados.ano}</h2>
        <p className="text-sm text-muted-foreground mb-3">Os nacionais já vêm marcados. Cadastre os estaduais e municipais. No comércio, abrir em feriado depende de convenção coletiva (Lei 10.101/2000, art. 6º-A).</p>
        <div className="border rounded-md divide-y">
          {!feriadosMes.length && <p className="p-3 text-sm text-muted-foreground">Nenhum feriado neste mês.</p>}
          {feriadosMes.map(f => (
            <div key={f.data} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <span><span className="font-medium tabular-nums">{fmtDataBr(f.data)}</span> · {f.nome} <Badge variant="outline" className="ml-1">{f.origem === "nacional" ? "Nacional" : "Da loja"}</Badge></span>
              <span className="flex items-center gap-3">
                <span className="text-muted-foreground">{f.loja_abre ? (feriadoLiberado ? "Loja abre" : "Marcada para abrir, mas sem CCT: será tratada como fechada") : "Loja fechada"}</span>
                <Switch aria-label={`Loja abre em ${fmtDataBr(f.data)}`} checked={f.loja_abre} disabled={busy} onCheckedChange={v => void executar(async () => { await salvarFeriado(dados.storeId, { data: f.data, nome: f.nome, loja_abre: v }); })} />
                {f.origem === "loja" && f.id && <Button variant="ghost" size="icon" aria-label={`Excluir ${f.nome}`} disabled={busy} onClick={() => void executar(async () => { await excluirFeriado(f.id!); })}><Trash2 size={15} /></Button>}
              </span>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-3 p-3">
            <div className="space-y-1.5"><Label>Data</Label><Input type="date" min={`${mesIso}-01`} max={`${mesIso}-31`} value={novo.data} onChange={e => setNovo({ ...novo, data: e.target.value })} /></div>
            <div className="space-y-1.5 flex-1 min-w-48"><Label>Nome do feriado estadual ou municipal</Label><Input value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: Aniversário da cidade" /></div>
            <Button variant="outline" disabled={busy || !novo.data || !novo.nome.trim()} onClick={() => void executar(async () => { await salvarFeriado(dados.storeId, { ...novo, loja_abre: false }); setNovo({ data: "", nome: "" }); return "Feriado cadastrado."; })}><Plus size={16} />Adicionar</Button>
          </div>
        </div>
      </section>

      <div className="grid xl:grid-cols-2 gap-8">
        <section>
          <h2 className="text-lg font-medium mb-1">5. Jornada</h2>
          <p className="text-sm text-muted-foreground mb-3">As fases da lei são aplicadas sozinhas pela data: {FASES.slice(1).map(f => f.rotulo.split(" · ").slice(0, 2).join(", ")).join("; ")}.</p>
          <div className="border rounded-md divide-y">
            <Opcao titulo="Usar 5 dias de 8h24 na fase de 42 horas" texto="Permitido sem acordo coletivo por liminar do STF (ADIs 8.041 e 8.042), ainda sem julgamento final. Desligado, a escala usa 8h por dia e a semana fica em 40h." checked={r.jornada_8h24} onChange={v => mudar({ jornada_8h24: v })} />
            <Opcao titulo="Dar as duas folgas juntas quando possível" texto="A IA tenta emendar as folgas; quando a cobertura não permite, separa." checked={r.preferir_folgas_juntas} onChange={v => mudar({ preferir_folgas_juntas: v })} />
            <Opcao titulo="Revezar abertura e fechamento toda semana" texto="Desligado, cada pessoa mantém o mesmo turno no mês, o que dá rotina. Ligado, a troca só acontece quando cabe no descanso mínimo." checked={r.revezar_turnos} onChange={v => mudar({ revezar_turnos: v })} />
            <div className="p-3 space-y-1.5">
              <Label htmlFor="e2-antecipar">Adotar as duas folgas antes de 16/12/2026 (opcional)</Label>
              <Input id="e2-antecipar" type="date" className="max-w-48" max="2026-12-15" value={r.antecipar_desde || ""} onChange={e => mudar({ antecipar_desde: e.target.value || null })} />
              <p className="text-xs text-muted-foreground">Antecipar é permitido e simplifica a folha de dezembro. Vazio = segue o calendário da lei.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-1">6. Convenção coletiva</h2>
          <p className="text-sm text-muted-foreground mb-3">Ligue só o que estiver escrito na convenção ou no acordo coletivo da sua base. Na dúvida, deixe desligado: a escala fica na regra geral, que é a mais segura.</p>
          <div className="border rounded-md divide-y">
            <Opcao titulo="A loja tem convenção ou acordo coletivo com regras de jornada" texto="Libera as opções abaixo." checked={r.tem_cct} onChange={v => mudar({ tem_cct: v })} />
            <Opcao disabled={!r.tem_cct} titulo="Autoriza o trabalho em feriados" texto="Sem isso, todo feriado é tratado como loja fechada." checked={r.cct_feriado_autorizado} onChange={v => mudar({ cct_feriado_autorizado: v })} />
            <Opcao disabled={!r.tem_cct} titulo="Reduz o intervalo de refeição para 30 minutos" texto="O padrão é 1 hora para jornadas acima de 6 horas." checked={r.cct_intervalo_min === 30} onChange={v => mudar({ cct_intervalo_min: v ? 30 : null })} />
            <Opcao disabled={!r.tem_cct} titulo="Exige folga de domingo a cada 2 semanas para todos" texto="A regra geral do comércio é 1 domingo a cada 3 semanas." checked={r.domingo_cada_semanas === 2} onChange={v => mudar({ domingo_cada_semanas: v ? 2 : 3 })} />
            <Opcao disabled={!r.tem_cct} titulo="Permite distribuir as folgas ao longo do mês" texto="Só muda a conferência de escalas ajustadas à mão: passa a valer a média de 2 folgas por semana no mês. A IA continua gerando 2 folgas em toda semana." checked={r.cct_repousos_media_mensal} onChange={v => mudar({ cct_repousos_media_mensal: v })} />
            <Opcao disabled={!r.tem_cct} titulo="Tem acordo de compensação com até 10h no dia" texto="Só muda a conferência de ajustes feitos à mão. A IA não gera jornadas acima do padrão." checked={r.cct_diaria_max_min === 600} onChange={v => mudar({ cct_diaria_max_min: v ? 600 : null })} />
          </div>
        </section>
      </div>

      {pode && (
        <div className="sticky bottom-0 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-background/95 backdrop-blur border-t flex items-center gap-3">
          <Button onClick={() => void salvar()} disabled={busy || !sujo}><Save size={16} />Salvar regras da loja</Button>
          <span className="text-sm text-muted-foreground">{sujo ? "Há alterações não salvas." : "Tudo salvo."}</span>
        </div>
      )}
    </fieldset>
  );
}

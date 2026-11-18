import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, TrendingUp, UserPlus, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import ClientLayout from '@/components/ClientLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { EscalaTopo, Campo, Seletor, useEscala, mensagemErro, DEPARTAMENTOS } from '@/components/escala/EscalaShared';
import { MARCOS_PADRAO, marcoEfetivo } from '@/lib/escala/escala-motor';
import {
  dimensionar, montarCurva, planejarSetor, lerSetor, DIAS_SEMANA, DIAS_CURTO, TOLERANCIA,
  type CurvaVendas, type EntradaSetor, type HorarioSemana, type MarcoDim,
} from '@/lib/escala/dimensionamento';
import { buscarVendasHora } from '@/lib/escala/vendasHora';
import { aplicarDimensionamento, preverAplicacao } from '@/lib/escala/aplicarDimensionamento';

interface Guardado {
  setores: EntradaSetor[];
  horario: HorarioSemana;
  reserva: number;
  horasRef: number | null;
  curva: CurvaVendas | null;
  periodo: { inicio: string; fim: string } | null;
}

const HORARIO_PADRAO: HorarioSemana = Array.from({ length: 7 }, () => ({ abre: '08:00', fecha: '20:00' }));
const chave = (loja: string) => `escala-dimensionamento:${loja}`;
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];
const ORIGEM = { proprio: 'Venda do setor', loja: 'Venda da loja', uniforme: 'Sem curva' } as const;

function ler(loja: string): Guardado | null {
  try { const bruto = localStorage.getItem(chave(loja)); return bruto ? JSON.parse(bruto) as Guardado : null; } catch { return null; }
}
function gravar(loja: string, valor: Guardado) {
  try { localStorage.setItem(chave(loja), JSON.stringify(valor)); } catch { /* armazenamento indisponível: segue só em memória */ }
}
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const num1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export default function EscalaDimensionamento() {
  const state = useEscala();
  const { dados } = state;
  const [setores, setSetores] = useState<EntradaSetor[]>([]);
  const [horario, setHorario] = useState<HorarioSemana>(HORARIO_PADRAO);
  const [reserva, setReserva] = useState(10);
  const [horasRef, setHorasRef] = useState<number | null>(null);
  const [curva, setCurva] = useState<CurvaVendas | null>(null);
  const [periodo, setPeriodo] = useState<{ inicio: string; fim: string } | null>(null);
  const [alvo, setAlvo] = useState(1);
  const [mapa, setMapa] = useState('');
  const [lendo, setLendo] = useState<{ feitas: number; total: number } | null>(null);
  const [avisoVenda, setAvisoVenda] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pronto, setPronto] = useState('');

  // marcos legais a partir de hoje (o vigente + os próximos)
  const hoje = new Date().toISOString().slice(0, 10);
  const marcos = useMemo<MarcoDim[]>(() => {
    const legais = (dados?.ctx.marcos?.length ? dados.ctx.marcos : MARCOS_PADRAO).filter((m) => !m.store_id).sort((a, b) => a.vigencia_inicio.localeCompare(b.vigencia_inicio));
    const vigente = [...legais].reverse().find((m) => m.vigencia_inicio <= hoje) ?? legais[0];
    return [vigente, ...legais.filter((m) => m.vigencia_inicio > hoje)].filter(Boolean);
  }, [dados, hoje]);
  const marcoHoje = marcoEfetivo(hoje, dados?.ctx.marcos);
  const referencia = horasRef ?? marcoHoje.horas_semanais;
  const iAlvo = Math.min(alvo, marcos.length - 1);

  // carrega o que foi guardado para a loja, ou parte do cadastro de funcionários
  useEffect(() => {
    if (!dados || pronto === state.loja) return;
    const g = ler(state.loja);
    if (g) {
      setSetores(g.setores); setHorario(g.horario?.length === 7 ? g.horario : HORARIO_PADRAO); setReserva(g.reserva ?? 10);
      setHorasRef(g.horasRef ?? null); setCurva(g.curva ?? null); setPeriodo(g.periodo ?? null);
    } else {
      const contagem = new Map<string, number>();
      for (const f of dados.funcionarios) if (f.ativo) contagem.set(f.departamento, (contagem.get(f.departamento) || 0) + 1);
      const nomes = contagem.size ? [...contagem.keys()] : DEPARTAMENTOS.slice(0, 7);
      setSetores(nomes.map((departamento) => ({ departamento, quantidade: contagem.get(departamento) || 0, minimo: 1 })));
      setHorario(HORARIO_PADRAO); setReserva(10); setHorasRef(null); setCurva(null); setPeriodo(null);
    }
    setAvisoVenda(''); setPronto(state.loja);
  }, [dados, state.loja, pronto]);

  useEffect(() => {
    if (pronto === state.loja) gravar(state.loja, { setores, horario, reserva, horasRef, curva, periodo });
  }, [setores, horario, reserva, horasRef, curva, periodo, pronto, state.loja]);

  const resultado = useMemo(
    () => dimensionar(setores, horario, curva, { horas_referencia: referencia, marcos, reserva: reserva / 100 }),
    [setores, horario, curva, referencia, marcos, reserva],
  );
  const planos = useMemo(
    () => resultado.setores.map((s) => planejarSetor(s, horario, marcos[iAlvo], { reserva: reserva / 100, intervalo_min: dados?.ctx.config.intervalo_min_minutos ?? 60 })),
    [resultado, horario, marcos, iAlvo, reserva, dados],
  );
  const total = resultado.totais[iAlvo];
  const setorMapa = resultado.setores.find((s) => s.departamento === mapa) ?? resultado.setores.find((s) => s.quantidade > 0) ?? resultado.setores[0];
  const horasVisiveis = useMemo(() => {
    const abertas = Array.from({ length: 24 }, (_, h) => h).filter((h) => resultado.setores.some((s) => s.postos.some((d) => d[h] > 0)));
    return abertas.length ? abertas : [];
  }, [resultado]);
  const maiorBarra = Math.max(1, ...resultado.setores.flatMap((s) => [s.quantidade, s.marcos[iAlvo]?.exato || 0]));
  const picoMapa = Math.max(1, ...(setorMapa?.postos.flat() || [1]));
  const quantidades = Object.fromEntries(setores.map((s) => [s.departamento.trim(), Math.max(0, Math.floor(s.quantidade || 0))]));
  const previsao = dados ? preverAplicacao(dados, planos, quantidades) : [];

  function mudarSetor(i: number, patch: Partial<EntradaSetor>) { setSetores((old) => old.map((s, k) => (k === i ? { ...s, ...patch } : s))); }
  function mudarDia(dow: number, patch: Partial<HorarioSemana[number]>) { setHorario((old) => old.map((d, k) => (k === dow ? { ...d, ...patch } : d))); }

  async function buscarMovimento() {
    setAvisoVenda(''); setLendo({ feitas: 0, total: 4 });
    try {
      const r = await buscarVendasHora(state.loja, 4, (feitas, t) => setLendo({ feitas, total: t }));
      if (r.linhas.length) {
        setCurva(montarCurva(r.linhas)); setPeriodo({ inicio: r.inicio, fim: r.fim });
        if (r.semanasComFalha) setAvisoVenda(`${r.semanasComFalha} semana(s) não puderam ser lidas; o cálculo usa as demais.`);
        toast.success('Movimento por hora carregado.');
      } else if (r.indisponivel) setAvisoVenda('Esta loja ainda não publica o relatório de venda por hora (vendas_hora_periodo). O cálculo segue dividindo as horas por igual.');
      else if (r.offline) setAvisoVenda('A loja está sem conexão com o sistema agora. O cálculo segue dividindo as horas por igual.');
      else setAvisoVenda(r.erro || 'Nenhuma venda por hora encontrada nas últimas 4 semanas.');
    } catch (error) { mensagemErro(error); } finally { setLendo(null); }
  }

  async function aplicar() {
    if (!dados) return;
    setBusy(true);
    try {
      const r = await aplicarDimensionamento(state.loja, dados, planos, quantidades);
      setConfirmar(false);
      toast.success(`${r.turnos} turnos, ${r.posicoesCriadas} posições novas e ${r.coberturas} coberturas gravados. Abra a Escala do Mês e clique em Gerar escala.`);
      await state.carregar();
    } catch (error) { mensagemErro(error); } finally { setBusy(false); }
  }

  return <ClientLayout storeName={state.nomeLoja}><div className="escala-area w-full p-4 md:p-6"><EscalaTopo state={state} titulo="Dimensionamento do Quadro" />
    {state.loading ? <p className="text-muted-foreground py-12">Carregando…</p> : dados && <div className="space-y-8">

      <section className="grid lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-medium mb-1">1. Pessoas por setor</h2>
          <p className="text-sm text-muted-foreground mb-3">Informe quantas pessoas trabalham hoje em cada setor. O mínimo é quantas precisam estar no setor enquanto a loja está aberta.</p>
          <div className="border rounded-md divide-y">
            <div className="grid grid-cols-[1fr_5.5rem_5.5rem_2.5rem] gap-2 px-3 py-2 text-xs text-muted-foreground"><span>Setor</span><span>Pessoas</span><span>Mínimo</span><span /></div>
            {setores.map((s, i) => <div key={i} className="grid grid-cols-[1fr_5.5rem_5.5rem_2.5rem] gap-2 px-3 py-2 items-center">
              <Input aria-label="Nome do setor" value={s.departamento} onChange={(e) => mudarSetor(i, { departamento: e.target.value })} />
              <Input aria-label={`Pessoas em ${s.departamento}`} type="number" min={0} value={s.quantidade} onChange={(e) => mudarSetor(i, { quantidade: Number(e.target.value) })} />
              <Input aria-label={`Mínimo em ${s.departamento}`} type="number" min={0} value={s.minimo ?? 1} onChange={(e) => mudarSetor(i, { minimo: Number(e.target.value) })} />
              <Button variant="ghost" size="icon" aria-label={`Remover ${s.departamento}`} onClick={() => setSetores((old) => old.filter((_, k) => k !== i))}><Trash2 size={16} /></Button>
            </div>)}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setSetores((old) => [...old, { departamento: '', quantidade: 0, minimo: 1 }])}><Plus size={16} />Adicionar setor</Button>
        </div>

        <div>
          <h2 className="text-lg font-medium mb-1">2. Horário de funcionamento</h2>
          <p className="text-sm text-muted-foreground mb-3">Horário em que a loja fica aberta ao público em cada dia.</p>
          <div className="border rounded-md divide-y">
            {ORDEM_DIAS.map((dow) => { const d = horario[dow]; const aberto = !!(d?.abre && d.fecha); return <div key={dow} className="grid grid-cols-[6rem_3rem_1fr_1fr] gap-3 px-3 py-2 items-center">
              <span className="text-sm">{DIAS_SEMANA[dow]}</span>
              <Switch aria-label={`${DIAS_SEMANA[dow]} aberto`} checked={aberto} onCheckedChange={(v) => mudarDia(dow, v ? { abre: '08:00', fecha: '20:00' } : { abre: null, fecha: null })} />
              {aberto ? <><Input aria-label={`Abre ${DIAS_SEMANA[dow]}`} type="time" value={d.abre || ''} onChange={(e) => mudarDia(dow, { abre: e.target.value || null })} /><Input aria-label={`Fecha ${DIAS_SEMANA[dow]}`} type="time" value={d.fecha || ''} onChange={(e) => mudarDia(dow, { fecha: e.target.value || null })} /></> : <span className="col-span-2 text-sm text-muted-foreground">Fechado</span>}
            </div>; })}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setHorario((old) => old.map((d, dow) => (dow === 0 ? d : { ...old[1] })))}>Copiar segunda para terça a sábado</Button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-1">3. Movimento da loja</h2>
        <p className="text-sm text-muted-foreground mb-3">A venda por hora das últimas 4 semanas mostra onde a loja precisa de mais gente. A consulta só acontece quando você pede.</p>
        <div className="flex flex-wrap items-end gap-4">
          <Button onClick={() => void buscarMovimento()} disabled={!!lendo}><TrendingUp size={16} />{lendo ? `Lendo semana ${Math.min(lendo.feitas + 1, lendo.total)} de ${lendo.total}…` : curva ? 'Atualizar venda por hora' : 'Buscar venda por hora'}</Button>
          <div className="w-56"><Campo label="Quadro atual foi montado para"><Seletor label="Jornada de referência" value={String(referencia)} onChange={(v) => setHorasRef(Number(v))} options={[44, 42, 40].map((h) => ({ value: String(h), label: `${h}h por semana` }))} /></Campo></div>
          <div className="w-44"><Campo label="Reserva férias e faltas (%)"><Input type="number" min={0} max={50} value={reserva} onChange={(e) => setReserva(Number(e.target.value))} /></Campo></div>
          {marcos.length > 1 && <div className="w-80"><Campo label="Calcular para a regra"><Seletor label="Regra alvo" value={String(iAlvo)} onChange={(v) => setAlvo(Number(v))} options={marcos.map((m, i) => ({ value: String(i), label: `${m.horas_semanais}h · ${m.folgas_semanais} folga(s)${i ? ` · a partir de ${br(m.vigencia_inicio || '')}/${(m.vigencia_inicio || '').slice(0, 4)}` : ' · hoje'}` }))} /></Campo></div>}
        </div>
        <div className="flex flex-wrap gap-2 mt-3 text-sm">
          {curva && periodo ? <Badge variant="secondary">Venda por hora de {br(periodo.inicio)} a {br(periodo.fim)} · {curva.dias} dias</Badge> : <Badge variant="outline">Sem venda por hora: horas divididas por igual</Badge>}
        </div>
        {avisoVenda && <p role="status" className="text-sm text-warning mt-2">{avisoVenda}</p>}
      </section>

      {total && <section>
        <h2 className="text-lg font-medium mb-3">4. Precisa contratar?</h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          {[['Quadro informado', String(total.quadro), ''], [`Necessário com ${total.marco.horas_semanais}h`, num1(total.necessario_exato), 'pessoas em tempo integral'], ['A contratar', String(total.contratar), total.contratar_por_setor > total.contratar ? `dividindo pessoas entre setores; sem dividir, ${total.contratar_por_setor}` : ''], ['Horas que faltam por semana', num1(total.falta_horas), 'somando os setores com falta']].map(([label, value, nota]) => <div key={label} className="border rounded-md p-4 bg-card"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-2xl font-semibold tabular-nums mt-2 ${label === 'A contratar' && total.contratar > 0 ? 'text-destructive' : ''}`}>{value}</div>{nota && <div className="text-xs text-muted-foreground mt-1">{nota}</div>}</div>)}
        </div>

        <div className="border rounded-md p-4 mb-5 space-y-3">
          {resultado.setores.map((s) => { const m = s.marcos[iAlvo]; return <div key={s.departamento} className="grid grid-cols-[9rem_1fr] sm:grid-cols-[12rem_1fr] gap-3 items-center">
            <div className="text-sm font-medium truncate" title={s.departamento}>{s.departamento}</div>
            <div className="space-y-1">
              {([['Tem', s.quantidade, 'bg-muted-foreground/50'], ['Precisa', m.exato, m.falta_pessoas > TOLERANCIA ? 'bg-destructive' : 'bg-success']] as const).map(([rotulo, valor, cor]) => <div key={rotulo} className="flex items-center gap-2">
                <span className="w-14 text-xs text-muted-foreground">{rotulo}</span>
                <div className={`h-4 rounded-sm ${cor}`} style={{ width: `${Math.max(valor ? 2 : 0, (valor / maiorBarra) * 70)}%` }} />
                <span className="text-sm tabular-nums font-medium">{num1(valor)}{rotulo === 'Precisa' && Math.abs(m.falta_pessoas) > TOLERANCIA ? ` (${m.falta_pessoas > 0 ? '+' : ''}${num1(m.falta_pessoas)})` : ''}</span>
              </div>)}
            </div>
          </div>; })}
        </div>

        <div className="overflow-x-auto border rounded-md mb-5"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="p-3">Setor</th><th className="p-3">Curva usada</th><th className="p-3 text-right">Tem</th>{marcos.map((m, i) => <th key={i} className="p-3 text-right">Precisa com {m.horas_semanais}h</th>)}<th className="p-3 text-right">Venda por pessoa-hora</th></tr></thead><tbody>
          {resultado.setores.map((s) => <tr key={s.departamento} className="border-b last:border-0"><td className="p-3 font-medium">{s.departamento}</td><td className="p-3 text-muted-foreground">{ORIGEM[s.origem]}</td><td className="p-3 text-right tabular-nums">{s.quantidade}</td>{s.marcos.map((m, i) => <td key={i} className={`p-3 text-right tabular-nums ${m.falta_pessoas > TOLERANCIA ? 'text-destructive font-medium' : ''}`}>{num1(m.exato)}{m.falta_pessoas > TOLERANCIA ? ` (+${num1(m.falta_pessoas)})` : ''}</td>)}<td className="p-3 text-right tabular-nums">{s.produtividade_atual ? moeda(s.produtividade_atual) : '—'}</td></tr>)}
        </tbody></table></div>

        <ul className="space-y-1 text-sm">{resultado.setores.map((s) => <li key={s.departamento}>{lerSetor(s, iAlvo)}</li>)}</ul>
        <p className="text-xs text-muted-foreground mt-3">Conta: horas que o quadro entrega hoje (pessoas × jornada de referência, menos a reserva) divididas pelo novo limite semanal. O mínimo por hora aberta entra como piso. A falta pode ser coberta com contratação, hora extra dentro do limite legal ou jornada parcial. É estimativa de planejamento, não parecer legal.</p>
      </section>}

      {setorMapa && horasVisiveis.length > 0 && <section>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3"><div><h2 className="text-lg font-medium">5. Pessoas necessárias por hora</h2><p className="text-sm text-muted-foreground">Quanto mais forte a cor, mais gente o setor precisa naquela hora.</p></div><div className="w-60"><Seletor label="Setor do mapa" value={setorMapa.departamento} onChange={setMapa} options={resultado.setores.map((s) => ({ value: s.departamento, label: s.departamento }))} /></div></div>
        <div className="overflow-x-auto border rounded-md"><table className="text-xs border-collapse w-full"><thead><tr><th className="p-2 text-left bg-card sticky left-0">Dia</th>{horasVisiveis.map((h) => <th key={h} className="p-2 font-normal text-muted-foreground min-w-10">{h}h</th>)}</tr></thead><tbody>
          {ORDEM_DIAS.map((dow) => <tr key={dow}><th className="p-2 text-left font-medium bg-card sticky left-0">{DIAS_CURTO[dow]}</th>{horasVisiveis.map((h) => { const v = setorMapa.postos[dow][h]; return <td key={h} className="p-0.5"><div className="h-9 rounded-sm flex items-center justify-center tabular-nums" title={`${DIAS_SEMANA[dow]} ${h}h: ${num1(v)} pessoa(s)`} style={v > 0 ? { backgroundColor: `hsl(var(--escala-destaque) / ${0.12 + 0.78 * (v / picoMapa)})`, color: v / picoMapa > 0.55 ? 'hsl(var(--escala-status-ink))' : undefined } : undefined}>{v > 0 ? Math.max(1, Math.round(v)) : ''}</div></td>; })}</tr>)}
        </tbody></table></div>
      </section>}

      {planos.some((p) => p.turnos.length) && <section>
        <h2 className="text-lg font-medium mb-1">6. Turnos sugeridos para o quadro atual</h2>
        <p className="text-sm text-muted-foreground mb-3">Jornada de {marcos[iAlvo].horas_semanais}h em {7 - marcos[iAlvo].folgas_semanais} dias. Ao aplicar, os turnos, as posições que faltam no cadastro e a cobertura mínima por dia são gravados; a escala em si é gerada na tela Escala do Mês, que valida as regras legais.</p>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {planos.filter((p) => p.turnos.length).map((p) => <div key={p.departamento} className="border rounded-md p-4">
            <div className="font-medium mb-2">{p.departamento}</div>
            <ul className="text-sm space-y-1">{p.turnos.map((t) => <li key={t.codigo} className="flex justify-between gap-3 tabular-nums"><span>{t.codigo} · {t.inicio}–{t.fim}</span><span className="text-muted-foreground">{t.pessoas} {t.pessoas === 1 ? 'pessoa' : 'pessoas'}</span></li>)}</ul>
            <div className="text-xs text-muted-foreground mt-3">Mínimo por dia: {ORDEM_DIAS.map((dow) => `${DIAS_CURTO[dow]} ${p.cobertura.find((c) => c.dia_semana === dow)?.minimo ?? 0}`).join(' · ')}</div>
            {p.avisos.map((a, i) => <p key={i} className="text-xs text-warning mt-2">{a}</p>)}
          </div>)}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          {dados.podeGerir ? <Button onClick={() => setConfirmar(true)}><WandSparkles size={16} />Aplicar na escala</Button> : <p className="text-sm text-muted-foreground">Só os responsáveis pela escala desta loja podem aplicar.</p>}
          <Link className="text-sm hover:text-primary" to="/escala">Ir para a Escala do Mês</Link>
        </div>
      </section>}
    </div>}

    <Dialog open={confirmar} onOpenChange={setConfirmar}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Aplicar na escala</DialogTitle><DialogDescription>Turnos com o mesmo código são atualizados. Funcionários que já têm turno não são alterados.</DialogDescription></DialogHeader>
      <div className="max-h-80 overflow-auto space-y-3 text-sm">{previsao.map((p) => <div key={p.departamento} className="border-b pb-2 last:border-0"><div className="font-medium">{p.departamento}</div><div className="text-muted-foreground">{p.turnos.join(' · ')}</div>{p.posicoesNovas > 0 && <div className="flex items-center gap-1"><UserPlus size={14} />{p.posicoesNovas} {p.posicoesNovas === 1 ? 'posição nova' : 'posições novas'} no cadastro ({p.cadastrados} cadastrados, {p.informados} informados), com nome provisório para você trocar.</div>}{p.semTurno > 0 && <div>{p.semTurno} funcionário(s) sem turno recebem um turno.</div>}</div>)}</div>
      <DialogFooter><Button variant="outline" onClick={() => setConfirmar(false)}>Cancelar</Button><Button disabled={busy} onClick={() => void aplicar()}>Confirmar e gravar</Button></DialogFooter></DialogContent></Dialog>
  </div></ClientLayout>;
}

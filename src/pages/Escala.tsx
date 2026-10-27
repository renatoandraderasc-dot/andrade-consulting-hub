import { useMemo, useState } from 'react';
import { CalendarDays, Download, LockKeyhole, Printer, ShieldCheck, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import ClientLayout from '@/components/ClientLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { EscalaTopo, Campo, Seletor, useEscala, mensagemErro, MESES } from '@/components/escala/EscalaShared';
import { gerarEscala, validarEscala, marcoEfetivo, diasDoMes, numParaData, diaSemana, NOMES_DIA, minParaHhmm, type Alocacao, type StatusDia, type ResultadoGeracao } from '@/lib/escala/escala-motor';
import type { AlocacaoRow } from '@/lib/escala/carregarContexto';
import { exportarExcel, imprimirMural, SIGLAS } from '@/lib/escala/exportar';

const STATUS: { value: StatusDia; label: string }[] = [{value:'TRABALHO',label:'Trabalho'},{value:'FOLGA',label:'Folga'},{value:'FOLGA_COMP',label:'Folga compensatória'},{value:'FERIAS',label:'Férias'},{value:'ATESTADO',label:'Atestado'},{value:'AFASTADO',label:'Afastado'},{value:'FERIADO',label:'Feriado'}];
export default function Escala() {
  const state = useEscala();
  const { dados } = state;
  const [dep, setDep] = useState('todos');
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<(Alocacao & { observacao?: string | null }) | null>(null);
  const [geracao, setGeracao] = useState<ResultadoGeracao | null>(null);
  const [publicar, setPublicar] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  const [conformidade, setConformidade] = useState(false);
  const [busy, setBusy] = useState(false);
  const validacao = useMemo(() => dados ? validarEscala(dados.ctx) : null, [dados]);
  const dias = diasDoMes(state.ano, state.mes);
  const departamentos = [...new Set(dados?.funcionarios.map(f => f.departamento) || [])];
  const editable = dados?.podeGerir && dados.periodo?.status !== 'publicada';
  async function executar(fn: () => Promise<void>) { setBusy(true); try { await fn(); } catch (error) { mensagemErro(error); } finally { setBusy(false); } }
  async function periodoRascunho() {
    if (!dados) throw new Error('Carregue a escala.');
    if (dados.periodo) return dados.periodo;
    const result = await supabase.from('escala_periodos').insert({ store_id: state.loja, ano: state.ano, mes: state.mes }).select().single();
    if (result.error) throw result.error;
    return result.data;
  }
  async function salvarGeracao() {
    if (!dados || !geracao) return;
    await executar(async () => {
      const p = await periodoRascunho();
      const meta = await supabase.from('escala_periodos').update({ gerado_em: new Date().toISOString(), gerado_por: state.user?.id, erros: geracao.validacao.erros, alertas: geracao.validacao.alertas }).eq('id', p.id);
      if (meta.error) throw meta.error;
      const removed = await supabase.from('escala_alocacoes').delete().eq('periodo_id', p.id).eq('travado', false);
      if (removed.error) throw removed.error;
      const rows = geracao.alocacoes.filter(a => !a.travado).map(a => ({ ...a, store_id: state.loja, periodo_id: p.id }));
      for (let i = 0; i < rows.length; i += 500) {
        const result = await supabase.from('escala_alocacoes').insert(rows.slice(i, i + 500));
        if (result.error) throw result.error;
      }
      setGeracao(null); toast.success('Escala gerada e salva. Células travadas preservadas.'); await state.carregar();
    });
  }
  async function salvarCelula() {
    if (!dados || !edit) return;
    await executar(async () => {
      const p = await periodoRascunho();
      const result = await supabase.from('escala_alocacoes').upsert({ ...edit, store_id: state.loja, periodo_id: p.id, origem: 'manual' }, { onConflict: 'funcionario_id,data' }).select().single();
      if (result.error) throw result.error;
      const lista = [...dados.alocacoes.filter(a => !(a.funcionario_id === edit.funcionario_id && a.data === edit.data)), result.data];
      state.setDados({ ...dados, periodo: p, alocacoes: lista, ctx: { ...dados.ctx, alocacoes: lista } });
      setEdit(null); toast.success('Célula salva.');
    });
  }
  async function transicao(status: 'publicada' | 'rascunho') {
    if (!dados?.periodo || !validacao) return;
    await executar(async () => {
      const result = await supabase.from('escala_periodos').update({ status, erros: validacao.erros, alertas: validacao.alertas, justificativa_publicacao: justificativa || null }).eq('id', dados.periodo?.id || '');
      if (result.error) throw result.error;
      setPublicar(false); setJustificativa(''); toast.success(status === 'publicada' ? 'Escala publicada.' : 'Escala reaberta em nova versão.'); await state.carregar();
    });
  }
  const inicio = numParaData(dias[0]);
  const chips = dados ? dias.map(n => ({ data: numParaData(n), marco: marcoEfetivo(numParaData(n), dados.ctx.marcos) })).filter((x, i, arr) => i === 0 || x.marco.horas_semanais !== arr[i-1].marco.horas_semanais || x.marco.folgas_semanais !== arr[i-1].marco.folgas_semanais) : [];
  return <ClientLayout storeName={state.nomeLoja}><div className="escala-area w-full p-4 md:p-6"><EscalaTopo state={state} titulo="Escala do Mês" />
    {state.loading ? <p className="text-muted-foreground py-12">Carregando escala…</p> : dados && <>
      <div className="flex flex-wrap items-center gap-2 mb-5"><Badge variant="outline">{dados.periodo?.status === 'publicada' ? `Publicada em ${dados.periodo.publicado_em?.slice(0,10)} · v${dados.periodo.versao}` : `Rascunho v${dados.periodo?.versao || 1}`}</Badge>{chips.map(c => <Badge key={c.data} variant="secondary">{chips.length > 1 ? `A partir de ${c.data.slice(8)}/${c.data.slice(5,7)}: ` : ''}{c.marco.horas_semanais}h · {c.marco.folgas_semanais} folga(s)</Badge>)}</div>
      {!dados.podeGerir && dados.periodo?.status !== 'publicada' ? <div className="text-center py-20"><CalendarDays className="mx-auto text-muted-foreground mb-3" size={40} /><h2>Escala em elaboração</h2></div> : <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">{[['Funcionários na escala',String(validacao?.resumo.length || 0)],['Horas previstas',minParaHhmm(validacao?.resumo.reduce((s,r) => s+r.minutos_trabalhados,0) || 0)],['Hora extra estimada',minParaHhmm(validacao?.resumo.reduce((s,r) => s+r.minutos_acima_limite,0) || 0)],['Pendências',`${validacao?.erros || 0} erros · ${validacao?.alertas || 0} alertas`]].map(([label,value]) => <div key={label} className="border rounded-md p-4 bg-card"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold tabular-nums mt-2">{value}</div></div>)}</div>
      <div className="flex flex-wrap gap-2 mb-5">{editable && <Button disabled={busy || !dados.funcionarios.length} onClick={() => setGeracao(gerarEscala(dados.ctx))}><WandSparkles size={16} />Gerar escala</Button>}{dados.podeGerir && dados.periodo && <Button variant="outline" disabled={busy} onClick={() => dados.periodo?.status === 'publicada' ? void transicao('rascunho') : setPublicar(true)}>{dados.periodo.status === 'publicada' ? 'Reabrir' : 'Publicar'}</Button>}<Button variant="outline" onClick={() => exportarExcel(dados)} disabled={!dados.alocacoes.length}><Download size={16} />Excel</Button><Button variant="outline" onClick={() => imprimirMural(dados,state.nomeLoja,MESES[state.mes-1])} disabled={!dados.alocacoes.length}><Printer size={16} />Imprimir mural</Button><Button variant="outline" onClick={() => setConformidade(true)}><ShieldCheck size={16} />Conformidade</Button><div className="w-60 ml-auto"><Seletor label="Departamento" value={dep} onChange={setDep} options={[{value:'todos',label:'Todos os departamentos'},...departamentos.map(d => ({value:d,label:d}))]} /></div></div>
      {!dados.funcionarios.length ? <p className="text-muted-foreground py-12">Nenhum funcionário cadastrado nesta loja.</p> : <div className="overflow-x-auto border rounded-md max-h-[65vh]"><table className="escala-grade text-xs border-collapse w-full"><thead className="sticky top-0 z-20"><tr><th className="sticky left-0 z-30 bg-card p-3 text-left min-w-48">Funcionário</th>{dias.map(n => <th key={n} className={`p-2 min-w-12 ${diaSemana(n)===0 || dados.datas.some(d => d.data===numParaData(n)&&d.tipo==='feriado') ? 'escala-dia-especial' : 'bg-card'}`}>{numParaData(n).slice(8)}<span className="block font-normal text-muted-foreground">{NOMES_DIA[diaSemana(n)]}</span></th>)}{['Horas','Folgas','Dom.','HE'].map(t => <th key={t} className="bg-card p-2 min-w-16">{t}</th>)}</tr></thead><tbody>
      {departamentos.filter(d => dep==='todos'||dep===d).map(d => { const fs=dados.funcionarios.filter(f=>f.departamento===d); return <Group key={d}>
        <tr><td colSpan={dias.length+5} className="bg-muted p-2"><Button variant="ghost" size="sm" onClick={() => setRecolhidos(old => { const next=new Set(old); next.has(d)?next.delete(d):next.add(d); return next; })}>{recolhidos.has(d)?'▸':'▾'} {d} · {fs.length} pessoas</Button></td></tr>
        {!recolhidos.has(d) && fs.map(f => { const resumo=validacao?.resumo.find(r=>r.funcionario_id===f.id); return <tr key={f.id}><th className="sticky left-0 z-10 bg-card p-3 text-left border-b font-medium">{f.nome}</th>{dias.map(n => { const data=numParaData(n); const a=dados.alocacoes.find(x=>x.funcionario_id===f.id&&x.data===data); const vs=validacao?.violacoes.filter(v=>v.funcionario_id===f.id&&v.data===data)||[]; const turno=dados.turnos.find(t=>t.id===a?.turno_id); return <td id={`escala-${f.id}-${data}`} key={n} className="p-1 border-b"><Button variant="ghost" className={`escala-celula h-11 w-full px-1 text-xs ${a ? `escala-${a.status.toLowerCase()}` : ''} ${vs.some(v=>v.nivel==='erro')?'escala-erro':vs.some(v=>v.nivel==='alerta')?'escala-alerta':''}`} style={turno && a?.status==='TRABALHO' ? {'--turno-cor': turno.cor} as React.CSSProperties : undefined} title={[a?.observacao, ...vs.map(v=>v.mensagem)].filter(Boolean).join('\n')} aria-label={`${f.nome}, ${data}, ${a ? STATUS.find(s=>s.value===a.status)?.label : 'Sem alocação'}`} onClick={() => editable && setEdit(a || {funcionario_id:f.id,data,status:'TRABALHO',turno_id:f.turno_padrao_id})}>{a ? a.status==='TRABALHO' ? turno?.codigo||'T' : SIGLAS[a.status] : '—'}{a?.travado && <LockKeyhole size={10} />}</Button></td>; })}<td className="p-2 text-center">{minParaHhmm(resumo?.minutos_trabalhados||0)}</td><td className="p-2 text-center">{resumo?.folgas||0}</td><td className="p-2 text-center">{resumo?.domingos_folga||0}</td><td className="p-2 text-center">{minParaHhmm(resumo?.minutos_acima_limite||0)}</td></tr>; })}
        {!recolhidos.has(d) && <tr><th className="sticky left-0 bg-card p-2 text-left">Cobertura</th>{dias.map(n => {const trabalhando=dados.alocacoes.filter(a=>a.data===numParaData(n)&&a.status==='TRABALHO'&&fs.some(f=>f.id===a.funcionario_id)).length; const minimo=Math.max(0,...dados.cobertura.filter(c=>c.departamento===d&&c.dia_semana===diaSemana(n)).map(c=>c.minimo)); return <td key={n} className={`text-center p-2 ${trabalhando<minimo?'text-destructive':'text-muted-foreground'}`}>{trabalhando}/{minimo}</td>;})}<td colSpan={4}/></tr>}
      </Group>;})}</tbody></table></div>}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-4">{STATUS.filter(s=>s.value!=='TRABALHO').map(s=><span key={s.value}><b>{SIGLAS[s.value]}</b> {s.label}</span>)}</div>
      </>}
      {dados.config?.cct_vigencia_fim && dados.config.cct_vigencia_fim < numParaData(dias[0]+30) && <p className="text-warning mt-4">Confira a vigência da CCT: {dados.config.cct_vigencia_fim}.</p>}
    </>}
    <Dialog open={!!geracao} onOpenChange={open=>!open&&setGeracao(null)}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Gerar escala</DialogTitle><DialogDescription>As células não travadas serão substituídas. Células travadas serão mantidas.</DialogDescription></DialogHeader><div className="max-h-72 overflow-auto space-y-2 text-sm">{geracao?.avisos.map((v,i)=><p key={i}>{v.mensagem}</p>)}<p>{geracao?.validacao.erros} erros · {geracao?.validacao.alertas} alertas</p></div><DialogFooter><Button variant="outline" onClick={()=>setGeracao(null)}>Cancelar</Button><Button disabled={busy} onClick={()=>void salvarGeracao()}>Confirmar e salvar</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!edit} onOpenChange={open=>!open&&setEdit(null)}><DialogContent><DialogHeader><DialogTitle>Editar {edit?.data}</DialogTitle><DialogDescription>{dados?.funcionarios.find(f=>f.id===edit?.funcionario_id)?.nome}</DialogDescription></DialogHeader>{edit && <div className="space-y-4"><Campo label="Status"><Seletor label="Status da célula" value={edit.status} onChange={v=>setEdit({...edit,status:v as StatusDia})} options={STATUS}/></Campo>{edit.status==='TRABALHO' && <><Campo label="Turno"><Seletor label="Turno da célula" value={edit.turno_id||'personalizado'} onChange={v=>setEdit({...edit,turno_id:v==='personalizado'?null:v,inicio:null,fim:null,intervalo_min:null})} options={[{value:'personalizado',label:'Horário personalizado'},...(dados?.turnos.filter(t=>t.ativo)||[]).map(t=>({value:t.id,label:`${t.codigo} · ${t.inicio}–${t.fim}`}))]}/></Campo><div className="grid grid-cols-3 gap-2"><Campo label="Início opcional"><Input aria-label="Início personalizado" type="time" value={edit.inicio||''} onChange={e=>setEdit({...edit,inicio:e.target.value||null})}/></Campo><Campo label="Fim opcional"><Input aria-label="Fim personalizado" type="time" value={edit.fim||''} onChange={e=>setEdit({...edit,fim:e.target.value||null})}/></Campo><Campo label="Intervalo (min)"><Input type="number" min={0} value={edit.intervalo_min??''} onChange={e=>setEdit({...edit,intervalo_min:e.target.value?Number(e.target.value):null})}/></Campo></div></>}<div className="flex items-center justify-between"><span>Travar esta célula</span><Switch checked={!!edit.travado} onCheckedChange={v=>setEdit({...edit,travado:v})}/></div><Campo label="Observação"><Textarea value={edit.observacao||''} onChange={e=>setEdit({...edit,observacao:e.target.value})}/></Campo></div>}<DialogFooter><Button disabled={busy} onClick={()=>void salvarCelula()}>Salvar célula</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={publicar} onOpenChange={setPublicar}><DialogContent><DialogHeader><DialogTitle>Publicar escala</DialogTitle><DialogDescription>{validacao?.erros} erros e {validacao?.alertas} alertas na validação do planejamento.</DialogDescription></DialogHeader><Campo label={validacao?.erros ? 'Justificativa obrigatória' : 'Justificativa (opcional)'}><Textarea value={justificativa} onChange={e=>setJustificativa(e.target.value)}/></Campo><DialogFooter><Button disabled={busy || (!!validacao?.erros&&!justificativa.trim())} onClick={()=>void transicao('publicada')}>Confirmar publicação</Button></DialogFooter></DialogContent></Dialog>
    <Sheet open={conformidade} onOpenChange={setConformidade}><SheetContent className="overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>Conformidade</SheetTitle><SheetDescription>Validação das regras configuradas; não substitui avaliação legal.</SheetDescription></SheetHeader><div className="space-y-4 mt-5">{[...new Set(validacao?.violacoes.map(v=>v.regra)||[])].map(regra=><details key={regra} open={regra!=='feriado_trabalhado'}><summary className="font-medium">{regra.replaceAll('_',' ')} · {validacao?.violacoes.filter(v=>v.regra===regra).length}</summary>{validacao?.violacoes.filter(v=>v.regra===regra&&(dep==='todos'||v.departamento===dep||!v.departamento)).map((v,i)=><Button key={i} variant="ghost" className="h-auto block text-left whitespace-normal w-full py-3" onClick={()=>{setConformidade(false); if(v.funcionario_id&&v.data) setTimeout(()=>document.getElementById(`escala-${v.funcionario_id}-${v.data}`)?.scrollIntoView({block:'center',inline:'center'}),200);}}><span className={v.nivel==='erro'?'text-destructive':v.nivel==='alerta'?'text-warning':'text-muted-foreground'}>{v.mensagem}</span><span className="block text-xs text-muted-foreground mt-1">{v.base_legal}</span></Button>)}</details>)}</div></SheetContent></Sheet>
  </div></ClientLayout>;
}
import { Fragment } from 'react';
const Group = Fragment;
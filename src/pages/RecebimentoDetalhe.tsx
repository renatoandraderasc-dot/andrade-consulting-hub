import { useEffect,useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { ReceiptShell,useReceiptStore,Status,Justification,TabelaResponsiva } from '@/components/recebimento/Shared';
import ListaCega from '@/components/recebimento/ListaCega';
import Validacao from '@/components/recebimento/Validacao';
import { readHeaders,invokeReceipt,brl,dataBR,cnpjBR,type Criterio } from '@/lib/recebimento';
import { SAFE_CRITERIA_COLUMNS,podeContar,podeAprovar,podeEntrar } from '@/lib/recebimentoRules';
export default function RecebimentoDetalhe(){
 const {id=''}=useParams();const {data:store}=useReceiptStore();const {user,isAdmin,isGlobalAdmin}=useAuth();const nav=useNavigate();const qc=useQueryClient();
 const [step,setStep]=useState<'validacao'|'contagem'|'resultado'>('validacao'),[round,setRound]=useState(1),[targets,setTargets]=useState<{ean:string;descricao:string}[]>([]),[busy,setBusy]=useState(false),[modal,setModal]=useState<{acao:string;criterio?:number}|null>(null),[entry,setEntry]=useState<any>(null),[dry,setDry]=useState<any>(null),[recount,setRecount]=useState<any>(null),[xmlRead,setXmlRead]=useState<boolean|undefined>();
 const header=useQuery({queryKey:['receipt-header',user?.id,store?.id,id],enabled:!!store?.websac,queryFn:async()=>{const rows=await readHeaders(store?.id||'',id);if(!rows[0])throw new Error('Recebimento não encontrado nesta loja.');return rows[0];}});
 const rec=header.data;
 const criteria=useQuery({queryKey:['receipt-criteria',user?.id,store?.id,id,step==='contagem'?'safe':'full'],enabled:!!rec,queryFn:async()=>{const {data,error}=await supabase.from('recebimento_criterios').select(step==='contagem'?SAFE_CRITERIA_COLUMNS:'*').eq('recebimento_id',id).order('criterio');if(error)throw error;return (data||[]) as unknown as Criterio[];}});
 const items=useQuery({queryKey:['receipt-items',user?.id,store?.id,id],enabled:!!rec&&step!=='contagem',queryFn:async()=>{const {data,error}=await supabase.from('recebimento_itens').select('*').eq('recebimento_id',id).order('seq_xml');if(error)throw error;return data||[];}});
 const events=useQuery({queryKey:['receipt-events',user?.id,store?.id,id],enabled:!!rec&&step!=='contagem',queryFn:async()=>{const {data,error}=await supabase.from('recebimento_eventos').select('id,evento,criado_em,usuario_id').eq('recebimento_id',id).order('criado_em',{ascending:false});if(error)throw error;return data||[];}});
 const config=useQuery({queryKey:['receipt-config',store?.id],enabled:!!store?.websac,queryFn:async()=>{const {data,error}=await supabase.from('recebimento_config').select('*').eq('store_id',store?.id||'').maybeSingle();if(error)throw error;return data;}});
 // No buyer role exists in the published role model; store-scoped supervisor and admin are the management profiles.
 const buyer=isAdmin;
 useEffect(()=>{if(rec&&['APROVADA','APROVADA_COM_RESSALVA','ENTRADA_CONFIRMADA','ENTRADA_PENDENTE_SUPERVISOR','CANCELADA'].includes(rec.estado))setStep('resultado');},[rec?.estado]);
 async function refresh(){await header.refetch();await criteria.refetch();if(step!=='contagem'){await items.refetch();await events.refetch();}}
 async function action(acao:string,just?:string,criterio?:number,entrada=false,modo='gravar'){
  if(!store||!rec||busy)return;setBusy(true);try{
   if(acao==='aprovar'&&!config.data)throw new Error('Configure a entrada automática nos Parâmetros antes de aprovar a primeira nota.');
   const r=await invokeReceipt(store.id,acao,{recebimento_id:id,...(acao==='validar'?{chave:rec.chave}:{}),...(just?{justificativa:just}:{}),...(criterio?{criterio}:{}),...(entrada?{modo}:{})},entrada);
   if(entrada&&modo==='ensaio')setDry(r);else if(r.entrada||entrada)setEntry(r.entrada||r);
   if(r.erro&&!entrada)throw new Error(r.erro);
   if(acao==='validar'&&r.nota)setXmlRead(r.nota.xml_lido);
   setModal(null);await refresh();qc.invalidateQueries({queryKey:['receipt-queue',store.id]});
   if(!r.erro)toast.success(r.mensagem||'Recebimento atualizado.');
  }catch(e){toast.error((e as Error).message);}finally{setBusy(false);}
 }
 async function startCount(nextRound=round,nextTargets=targets){
   setTargets(nextTargets);setRound(nextRound);setEntry(null);setDry(null);setRecount(null);
   // Remove invoice payloads from query cache before mounting the blind component.
   qc.removeQueries({queryKey:['receipt-items',user?.id,store?.id,id]});
   qc.removeQueries({queryKey:['receipt-criteria',user?.id,store?.id,id,'full']});
   setStep('contagem');
 }
 const cs=criteria.data||[], c5=cs.find(c=>c.criterio===5), detail=(c5?.detalhe||{}) as any;
 const resultRows=(detail.itens||[]).slice().sort((a:any,b:any)=>Number(a.situacao==='OK')-Number(b.situacao==='OK'));
 const warnings=cs.some(c=>c.resultado==='AVISO');
 const confirmed=rec?.estado==='ENTRADA_CONFIRMADA'||entry?.estado==='ENTRADA_CONFIRMADA';
 const occurrence=resultRows.filter((r:any)=>r.situacao!=='OK').map((r:any)=>`${r.descricao}: ${r.situacao}, nota ${r.qtd_nota}, contagem ${r.qtd_contada}`).concat(((cs.find(c=>c.criterio===3)?.detalhe||{}) as any).divergentes?.filter((r:any)=>r.situacao==='PRECO_DIVERGE').map((r:any)=>`${r.descricao}: preço nota ${brl(r.preco_xml)} × pedido ${brl(r.preco_pedido)}`)||[]);
 return <ReceiptShell title="Recebimento de NF-e" busy={busy} onRefresh={()=>void refresh()}>{header.isLoading?<p>Carregando recebimento…</p>:header.error?<p role="alert" className="text-destructive">{header.error.message}</p>:rec&&<>
  <div className="flex flex-wrap gap-3 justify-between border-b border-border pb-4"><div><h2 className="text-xl">NF {rec.numero_nf} · Série {rec.serie}</h2><p className="font-medium mt-1">{rec.nome_emitente}</p><p className="text-sm text-muted-foreground">{cnpjBR(rec.cnpj_emitente)} · Emissão {dataBR(rec.data_emissao)}</p></div><div><Status value={rec.estado}/>{step!=='contagem'&&<p className="mt-2 font-semibold">{brl(rec.total_nf)} · {items.data?.length ?? '—'} itens</p>}</div></div>
  <div className="flex gap-3 text-sm border-b border-border pb-3">{['Validação','Contagem','Resultado'].map((s,i)=><span key={s} className={step===['validacao','contagem','resultado'][i]?'font-semibold text-primary':'text-muted-foreground'}>{i+1} · {s}</span>)}</div>
  {step!=='contagem'&&(xmlRead===false||cs.some(c=>c.criterio===4&&(c.detalhe as any)?.sem_duplicata_no_xml))&&<p className="p-3 bg-warning/10 text-warning rounded-md">XML não lido — prazos da nota indisponíveis</p>}
  {rec.estado==='AGUARDANDO_NFE'?<Card className="p-5 bg-warning/10 border-warning/30"><h2>NF-e ainda não chegou da SEFAZ</h2><Button onClick={()=>action('validar')} disabled={busy} className="mt-3">Tentar de novo</Button></Card>:step==='contagem'?<ListaCega key={`${id}-${round}`} id={id} store={store?.id||''} round={round} targets={targets} onRefresh={()=>{}} onClosed={r=>{setRecount(r);setStep('resultado');qc.invalidateQueries({queryKey:['receipt-criteria']});}}/>:step==='validacao'?<>
   <Validacao criterios={cs} busy={busy} canBuyer={buyer} canSupervisor={isAdmin} cnpj={rec.cnpj_emitente||''} nome={rec.nome_emitente||''} onCiente={n=>setModal({acao:'ciente',criterio:n})} onRevalidate={()=>action('validar')}/>
   {criteria.error&&<p role="alert">{criteria.error.message}</p>}
   {rec.estado==='BLOQUEADA'&&<div className="p-4 bg-destructive/10 text-destructive rounded-md"><p>{cs.filter(c=>c.resultado==='BLOQUEIO').map(c=>(c.detalhe as any)?.motivo).join(' · ')}</p>{isAdmin&&<Button variant="destructive" className="mt-3" disabled={busy} onClick={()=>setModal({acao:'cancelar'})}>Cancelar recebimento</Button>}</div>}
   <footer className="fixed bottom-0 left-0 right-0 border-t border-border bg-background p-4 z-30"><Button size="lg" className="w-full sm:w-auto" disabled={busy||!podeContar(cs)} onClick={()=>{const previous=Number(((cs.find(c=>c.criterio===5)?.detalhe||{}) as any).rodada||1);void startCount(previous);}}>Ir para contagem</Button>{c5&&c5.resultado!=='PENDENTE'&&<Button variant="outline" className="ml-2" onClick={()=>setStep('resultado')}>Ver resultado</Button>}</footer>
  </>:<section className="space-y-5">
   <div className="flex flex-wrap gap-2">{cs.map(c=><div key={c.criterio} className="flex gap-2 items-center"><span className="text-sm">{c.criterio}</span><Status value={c.resultado}/></div>)}</div>
   {confirmed?<Card className="p-6 bg-success/10 border-success/30"><h2 className="text-xl text-success">Entrada confirmada</h2><p className="mt-2">NF {rec.numero_nf} · WebSac {entry?.idnotafiscal||rec.idnotafiscal_entrada}</p><Button className="mt-4" onClick={()=>nav('/recebimento')}>Voltar à fila</Button></Card>:<>
    {rec.estado==='CANCELADA'?<p className="text-destructive">Recebimento cancelado · {rec.justificativa}</p>:<>
    {entry&&(entry.erro||entry.estado==='ENTRADA_PENDENTE_SUPERVISOR')&&<Card className={`p-4 ${entry.estado==='ENTRADA_PENDENTE_SUPERVISOR'?'border-warning text-warning':'border-destructive text-destructive'}`}><h3>{entry.estado==='ENTRADA_PENDENTE_SUPERVISOR'?'Entrada pendente de supervisor':'Não foi possível dar entrada'}</h3><p className="mt-2">{entry.motivo||entry.erro}</p>{entry.log&&<details className="mt-3"><summary>Passos da entrada</summary><pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(entry.log,null,2)}</pre></details>}{isAdmin&&<Button className="mt-3" disabled={busy} onClick={()=>action('entrada',undefined,undefined,true)}>Tentar de novo</Button>}</Card>}
    {rec.estado==='ENTRADA_PENDENTE_SUPERVISOR'&&!entry&&<p className="p-4 bg-warning/10 text-warning">{rec.justificativa || 'Resolva a pendência no WebSac e tente novamente.'}</p>}
    <TabelaResponsiva headers={['Produto','Qtd. nota','Qtd. contada','Diferença','Situação']} rows={resultRows.map((r:any)=>[r.descricao,r.qtd_nota,r.qtd_contada,r.diferenca,<Status value={r.situacao}/>])}/>
    {recount?.pode_recontar&&recount.divergentes>0&&<Button variant="outline" disabled={busy} onClick={()=>startCount(Number(recount.rodada)+1,recount.targets)}>Recontar só os divergentes</Button>}
    {occurrence.length>0&&<Card className="p-4 border-warning/30"><h3>Ocorrência para o comprador</h3><p className="text-sm whitespace-pre-wrap mt-2">{`NF ${rec.numero_nf} · ${rec.nome_emitente}\n${occurrence.join('\n')}`}</p><Button variant="outline" asChild className="mt-3"><a target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Ocorrência NF ${rec.numero_nf} · ${rec.nome_emitente}\n${occurrence.join('\n')}`)}`}>Enviar por WhatsApp</a></Button></Card>}
    <div className="flex flex-wrap gap-3">{!['APROVADA','APROVADA_COM_RESSALVA','ENTRADA_PENDENTE_SUPERVISOR'].includes(rec.estado)&&<Button size="lg" disabled={busy||!podeAprovar(cs,isAdmin)||config.isLoading} onClick={()=>warnings?setModal({acao:'aprovar'}):action('aprovar')}>{warnings?'Aprovar com ressalva':config.data?.entrada_automatica?'Aprovar e dar entrada':'Aprovar'}</Button>}{podeEntrar(rec.estado,isAdmin)&&<Button size="lg" disabled={busy} onClick={()=>action('entrada',undefined,undefined,true)}>Dar entrada agora</Button>}{isGlobalAdmin&&<Button variant="outline" disabled={busy} onClick={()=>action('ensaio',undefined,undefined,true,'ensaio')}>Ensaiar entrada</Button>}<Button variant="outline" onClick={()=>setStep('validacao')}>Ver validação</Button>{isAdmin&&<Button variant="destructive" disabled={busy} onClick={()=>setModal({acao:'cancelar'})}>Cancelar recebimento</Button>}</div>
    </>}
   </>}
   <details className="border-t border-border pt-3"><summary>Histórico do recebimento</summary>{events.data?.map(e=><p key={e.id} className="text-sm mt-2">{dataBR(e.criado_em)} {new Date(e.criado_em).toLocaleTimeString('pt-BR')} · {e.evento}</p>)}</details>
  </section>}
  {modal&&<Justification title={modal.acao==='ciente'?'Estou ciente':modal.acao==='cancelar'?'Cancelar recebimento':'Aprovar com ressalva'} busy={busy} onClose={()=>setModal(null)} onConfirm={v=>action(modal.acao,v,modal.criterio)}/>}
  {dry&&<Dialog open onOpenChange={o=>!o&&setDry(null)}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogTitle>Ensaio de entrada</DialogTitle><DialogDescription>{dry.mensagem || dry.erro || dry.motivo || 'Formulário montado sem gravar.'}</DialogDescription><TabelaResponsiva headers={['Campo','Valor']} rows={Object.entries(dry.form||{}).map(([k,v])=>[k,String(v)])}/><details><summary>Passos do ensaio</summary><pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(dry.log,null,2)}</pre></details></DialogContent></Dialog>}
 </>}</ReceiptShell>;
}

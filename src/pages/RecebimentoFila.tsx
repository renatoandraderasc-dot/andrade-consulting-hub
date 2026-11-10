import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import { Camera, Keyboard, RefreshCw, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Tabs,TabsList,TabsTrigger,TabsContent } from '@/components/ui/tabs';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { ReceiptShell,useReceiptStore,Status,TabelaResponsiva } from '@/components/recebimento/Shared';
import Scanner from '@/components/recebimento/Scanner';
import { readHeaders,invokeReceipt,brl,dataBR } from '@/lib/recebimento';
import { chamarRelatorio,avisoRelatorio,pick } from '@/lib/vrReport';
export default function RecebimentoFila(){
  const {data:store}=useReceiptStore(); const navigate=useNavigate();
  const [scanner,setScanner]=useState(false),[manual,setManual]=useState(false),[key,setKey]=useState(''),[busy,setBusy]=useState(false);
  const queue=useQuery({queryKey:['receipt-queue',store?.id],enabled:!!store?.websac,queryFn:()=>readHeaders(store?.id || '')});
  const pending=useQuery({queryKey:['receipt-sefaz',store?.id],enabled:!!store?.websac,queryFn:async()=>{const r=await chamarRelatorio(store?.id || '', 'nfe_pendentes_recebimento',{inicio:format(subDays(new Date(),6),'yyyy-MM-dd'),fim:format(new Date(),'yyyy-MM-dd')});const err=avisoRelatorio(r);if(err)throw new Error(err);return r.dados;}});
  async function validate(chave:string){if(!store || busy)return;setScanner(false);setManual(false);setBusy(true);try{const r=await invokeReceipt(store.id,'validar',{chave});if(r.erro)throw new Error(r.erro);await queue.refetch();const id=r.recebimento_id||r.recebimento?.id;if(id)navigate(`/recebimento/${id}`);else toast.info(r.mensagem || 'Nota já recebida.');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
  async function sync(){if(!store)return;setBusy(true);try{const r=await invokeReceipt(store.id,'sincronizar');if(r.erro)throw new Error(r.erro);toast.success(`${r.confirmadas || 0} entradas confirmadas`);await queue.refetch();}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
  const active=(queue.data||[]).filter(r=>['AGUARDANDO_NFE','EM_VALIDACAO','EM_CONTAGEM','BLOQUEADA','APROVADA','APROVADA_COM_RESSALVA','ENTRADA_PENDENTE_SUPERVISOR'].includes(r.estado));
  return <ReceiptShell title="Recebimento de NF-e" busy={busy||queue.isFetching||pending.isFetching} onRefresh={()=>{void queue.refetch();void pending.refetch();}}>
    <div className="flex flex-col sm:flex-row gap-3"><Button size="lg" className="h-16 text-lg" disabled={busy} onClick={()=>setScanner(true)}><Camera className="mr-3 w-6 h-6"/>Escanear DANFE</Button><Button variant="ghost" size="lg" onClick={()=>setManual(true)} disabled={busy}><Keyboard className="mr-2 w-4 h-4"/>Digitar chave</Button><Button variant="outline" onClick={sync} disabled={busy} className="sm:ml-auto"><RefreshCw className="mr-2 w-4 h-4"/>Atualizar status</Button></div>
    {busy&&<p role="status">Processando recebimento…</p>}
    <Tabs defaultValue="ongoing"><TabsList className="w-full sm:w-auto"><TabsTrigger value="ongoing">Em andamento ({active.length})</TabsTrigger><TabsTrigger value="sefaz">Chegaram da SEFAZ</TabsTrigger></TabsList><TabsContent value="ongoing"><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{active.map(r=><Card key={r.id} className="p-4 space-y-3"><div className="flex justify-between gap-2"><h2>NF {r.numero_nf} / {r.serie}</h2><Status value={r.estado}/></div><p className="font-medium">{r.nome_emitente || 'Fornecedor não identificado'}</p><div className="flex justify-between text-sm"><strong>{brl(r.total_nf)}</strong><span className="text-muted-foreground">há {Math.max(0,Math.floor((Date.now()-Date.parse(r.iniciado_em))/60000))} min</span></div>{r.estado==='AGUARDANDO_NFE'&&<div className="p-3 bg-warning/10 text-warning rounded-md"><p>NF-e ainda não chegou da SEFAZ</p><Button variant="outline" className="mt-2" disabled={busy} onClick={()=>validate(r.chave)}>Tentar de novo</Button></div>}<Button variant="outline" className="w-full" onClick={()=>navigate(`/recebimento/${r.id}`)}>Abrir recebimento<ArrowRight className="ml-2 w-4 h-4"/></Button></Card>)}</div>{!active.length&&!queue.isLoading&&<p className="py-12 text-center text-muted-foreground">Nenhum recebimento em andamento.</p>}{queue.error&&<p role="alert">{queue.error.message}</p>}</TabsContent><TabsContent value="sefaz">{pending.isLoading&&<p>Consultando SEFAZ…</p>}{pending.error&&<p role="alert" className="text-destructive">{pending.error.message}</p>}<TabelaResponsiva headers={['Nota','Emitente','Emissão','Total','Ação']} rows={(pending.data||[]).map(r=>[pick(r,'numnotafiscal','numero_nf'),pick(r,'nome_emitente'),dataBR(pick(r,'dataemissao')),brl(pick(r,'total')),<Button disabled={busy} onClick={()=>validate(String(pick(r,'chave','chavenfe','chaveacesso')||''))}>Iniciar recebimento</Button>])}/></TabsContent></Tabs>
    {scanner&&<Scanner danfe onClose={()=>setScanner(false)} onRead={validate}/>}{manual&&<Dialog open onOpenChange={setManual}><DialogContent><DialogTitle>Digitar chave da NF-e</DialogTitle><DialogDescription>Informe os 44 dígitos da DANFE.</DialogDescription><Input aria-label="Chave da NF-e" inputMode="numeric" value={key} onChange={e=>setKey(e.target.value.replace(/\D/g,'').slice(0,44))}/><p className="text-xs text-muted-foreground">{key.length}/44 dígitos</p><Button disabled={key.length!==44||busy} onClick={()=>validate(key)}>Validar nota</Button></DialogContent></Dialog>}
  </ReceiptShell>;
}

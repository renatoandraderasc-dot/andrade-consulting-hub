import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import ClientLayout from '@/components/ClientLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw, ScanLine, CheckCircle2, AlertTriangle, Ban, Clock } from 'lucide-react';
export function useReceiptStore() {
  const { user } = useAuth();
  const sid = sessionStorage.getItem('selectedStoreId') || '';
  return useQuery({ queryKey:['receipt-store', user?.id, sid], enabled:!!user && !!sid, queryFn:async () => {
    const [s,c] = await Promise.all([supabase.from('stores').select('id,name').eq('id',sid).single(), supabase.from('store_vr_config').select('sistema').eq('store_id',sid).maybeSingle()]);
    if(s.error) throw s.error; if(c.error) throw c.error;
    return {id:sid,name:s.data.name,websac:c.data?.sistema?.toUpperCase() === 'WEBSAC'};
  }});
}
export function ReceiptShell({children,title,busy,onRefresh}: {children:ReactNode;title:string;busy?:boolean;onRefresh?:()=>void}) {
  const {data:store,isLoading,error} = useReceiptStore();
  const {isGlobalAdmin} = useAuth();
  return <ClientLayout storeName={store?.name}><div className="w-full p-4 md:p-6 space-y-6 pb-28"><div className="flex flex-wrap gap-3 items-start justify-between"><div><h1 className="text-2xl">{title}</h1><p className="text-sm text-muted-foreground mt-1">{store?.name || 'Selecione uma loja'}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/recebimento"><ScanLine className="w-4 h-4 mr-2"/>Fila</Link></Button><Button variant="outline" asChild><Link to="/recebimento/painel">Painel</Link></Button>{isGlobalAdmin && <Button variant="outline" asChild><Link to="/admin/recebimento">Parâmetros</Link></Button>}{onRefresh && <Button onClick={onRefresh} disabled={busy || !store?.websac}><RefreshCw className={`mr-2 w-4 h-4 ${busy?'animate-spin':''}`}/>Atualizar</Button>}</div></div>{isLoading ? <p>Carregando loja…</p> : error ? <p role="alert">{error.message}</p> : !store?.websac ? <p className="border border-border p-6 rounded-md text-muted-foreground">Disponível apenas para lojas WebSac</p> : children}</div></ClientLayout>;
}
const labels:Record<string,string> = {AGUARDANDO_NFE:'Aguardando NF-e',EM_VALIDACAO:'Em validação',EM_CONTAGEM:'Em contagem',BLOQUEADA:'Bloqueada',APROVADA:'Aprovada',APROVADA_COM_RESSALVA:'Aprovada com ressalva',ENTRADA_CONFIRMADA:'Entrada confirmada',ENTRADA_PENDENTE_SUPERVISOR:'Pendente de supervisor',CANCELADA:'Cancelada',OK:'OK',AVISO:'Aviso',BLOQUEIO:'Bloqueio',PENDENTE:'Pendente',FALTA:'Falta',SOBRA:'Sobra',NAO_CONTADO:'Não contado',FORA_DA_NOTA:'Fora da nota',ANTECIPADO:'Antecipado',PARCELA_EXTRA:'Parcela extra'};
export function Status({value}: {value:string}) {
  const good=['OK','ENTRADA_CONFIRMADA','APROVADA'].includes(value), bad=['BLOQUEIO','BLOQUEADA','CANCELADA'].includes(value), warn=['AVISO','AGUARDANDO_NFE','APROVADA_COM_RESSALVA','ENTRADA_PENDENTE_SUPERVISOR','FALTA','SOBRA','NAO_CONTADO','FORA_DA_NOTA','ANTECIPADO','PARCELA_EXTRA'].includes(value);
  const Icon=good?CheckCircle2:bad?Ban:warn?AlertTriangle:Clock;
  return <Badge variant="outline" className={`gap-1 whitespace-normal ${good?'bg-success/10 text-success border-success/30':bad?'bg-destructive/10 text-destructive border-destructive/30':warn?'bg-warning/10 text-warning border-warning/30':'bg-muted text-muted-foreground'}`}><Icon className="w-3 h-3 shrink-0"/>{labels[value] || value}</Badge>;
}
export function Justification({title,onConfirm,onClose,busy}: {title:string;onConfirm:(v:string)=>void;onClose:()=>void;busy:boolean}) {
  const [v,setV]=useState('');
  return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent><DialogTitle>{title}</DialogTitle><DialogDescription>Registre o motivo para continuar.</DialogDescription><Textarea aria-label="Justificativa" value={v} onChange={e=>setV(e.target.value)} placeholder="Justificativa (mínimo 5 caracteres)"/><Button disabled={busy || v.trim().length<5} onClick={()=>onConfirm(v.trim())}>Confirmar</Button></DialogContent></Dialog>;
}
export function TabelaResponsiva({headers,rows}: {headers:string[];rows:ReactNode[][]}) {
  return <><div className="hidden md:block overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border">{headers.map(h=><th key={h} className="text-left py-3 px-3 text-muted-foreground font-medium">{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i} className="border-b border-border">{r.map((c,j)=><td key={j} className="px-3 py-3 align-top tabular-nums">{c}</td>)}</tr>)}</tbody></table></div><div className="md:hidden space-y-3">{rows.map((r,i)=><div key={i} className="rounded-md border border-border p-3 space-y-2">{r.map((c,j)=><div key={j} className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground shrink-0">{headers[j]}</span><div className="text-right min-w-0 break-words">{c}</div></div>)}</div>)}</div>{!rows.length&&<p className="p-6 text-center text-muted-foreground">Nenhum registro.</p>}</>;
}
export function FiltrosMobile({children}: {children:ReactNode}) {return <details open className="border-y border-border py-3"><summary className="font-medium cursor-pointer mb-3">Filtros</summary><div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{children}</div></details>;}

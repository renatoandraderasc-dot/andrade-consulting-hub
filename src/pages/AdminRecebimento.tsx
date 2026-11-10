import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ReceiptShell,useReceiptStore } from '@/components/recebimento/Shared';
import { RECEBIMENTO_DEFAULTS } from '@/lib/recebimentoRules';
export default function AdminRecebimento(){
 const {data:store}=useReceiptStore();const {isGlobalAdmin}=useAuth();const [draft,setDraft]=useState<typeof RECEBIMENTO_DEFAULTS|null>(null),[busy,setBusy]=useState(false);
 const config=useQuery({queryKey:['receipt-config',store?.id],enabled:!!store?.websac&&isGlobalAdmin,queryFn:async()=>{const {data,error}=await supabase.from('recebimento_config').select('*').eq('store_id',store?.id||'').maybeSingle();if(error)throw error;return data;}});
 const value=draft||config.data||RECEBIMENTO_DEFAULTS;
 const nums=[['dias_max_emissao','Dias máximos de emissão'],['tolerancia_prazo','Tolerância de prazo (dias)'],['tolerancia_preco','Tolerância de preço (%)'],['tolerancia_qtd','Tolerância de quantidade (%)'],['recontagens','Recontagens']] as const;
 async function save(){if(!store||!isGlobalAdmin)return;if(nums.some(([k])=>!Number.isFinite(value[k])||value[k]<0)){toast.error('Informe valores válidos, iguais ou maiores que zero.');return;}setBusy(true);try{const {error}=await supabase.from('recebimento_config').upsert({store_id:store.id,...value,atualizado_em:new Date().toISOString()});if(error)throw error;await config.refetch();setDraft(null);toast.success('Parâmetros salvos.');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
 return <ReceiptShell title="Parâmetros de recebimento" busy={busy||config.isFetching} onRefresh={()=>{setDraft(null);void config.refetch();}}>{!isGlobalAdmin?<p>Somente administradores podem alterar estes parâmetros.</p>:<><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{nums.map(([k,label])=><label key={k} className="text-sm space-y-2"><span>{label}</span><Input type="number" min="0" step={k==='tolerancia_preco'||k==='tolerancia_qtd'?'0.01':'1'} value={value[k]} onChange={e=>setDraft({...value,[k]:Number(e.target.value)})}/></label>)}</div><div className="divide-y divide-border border-y border-border"><label className="flex items-center justify-between py-4"><span>Exigir pedido</span><Switch checked={value.exigir_pedido} onCheckedChange={v=>setDraft({...value,exigir_pedido:v})}/></label><label className="flex items-center justify-between py-4"><div><p>Entrada automática</p><p className="text-sm text-muted-foreground">Desligada: aprovação separada da entrada no WebSac.</p></div><Switch checked={value.entrada_automatica} onCheckedChange={v=>setDraft({...value,entrada_automatica:v})}/></label></div>{config.error&&<p role="alert">{config.error.message}</p>}<Button onClick={save} disabled={busy||config.isLoading}>Salvar parâmetros</Button></>}</ReceiptShell>;
}

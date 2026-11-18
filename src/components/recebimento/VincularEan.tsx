import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import type { ReceiptIdentity } from '@/lib/recebimentoIdentidade';
import { invokeReceipt } from '@/lib/recebimento';
import { avisoVinculo } from '@/lib/recebimentoVinculo';
export default function VincularEan({store,id,round,ean,unknown,items,onClose,onLinked}:{store:string;id:string;round:number;ean:string;unknown:boolean;items:ReceiptIdentity[];onClose:()=>void;onLinked:()=>Promise<void>}) {
  const [save,setSave]=useState(true),[busy,setBusy]=useState(false),[selected,setSelected]=useState<number|null>(null);
  async function link(){if(selected==null||busy)return;setBusy(true);try{
    const r=await invokeReceipt(store,'vincular_ean',{recebimento_id:id,rodada:round,ean,seq_xml:selected,gravar_websac:unknown&&save});
    if(r.erro)throw new Error(r.erro);
    const message=avisoVinculo(r.websac ?? null);if(message.sucesso)toast.success(message.texto);else toast.warning(message.texto);
    await onLinked();onClose();
  }catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
  return <Dialog open onOpenChange={open=>!open&&!busy&&onClose()}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogTitle>É este item da nota</DialogTitle><DialogDescription>EAN bipado {ean}</DialogDescription>
    <div role="radiogroup" aria-label="Item da nota" className="space-y-2">{items.map(item=><label key={item.id} className="flex gap-3 border border-border rounded-md p-3 cursor-pointer"><input type="radio" name="item-nota" value={item.seq_xml} checked={selected===item.seq_xml} disabled={busy} onChange={()=>setSelected(item.seq_xml)}/><span className="min-w-0 break-words"><span className="block font-semibold">{item.descricao_produto || '— não cadastrado'}</span><span className="block text-sm">{item.descricao_xml}</span><span className="block text-xs text-muted-foreground break-all">EAN da nota: {item.ean || '—'} · EANs cadastrados: {item.eans_cadastro || '—'}</span><span className="block text-xs text-muted-foreground">Ref. fornecedor: {item.cprod || '—'} · Ref. cadastro: {item.ref_cadastro || '—'}</span></span></label>)}</div>
    {unknown&&<label className="flex gap-3 items-start text-sm"><Checkbox checked={save} disabled={busy} onCheckedChange={v=>setSave(v===true)}/>Cadastrar este código no produto no WebSac</label>}
    <Button disabled={selected==null||busy} onClick={()=>void link()}>{busy?'Vinculando…':'Confirmar vínculo'}</Button>
  </DialogContent></Dialog>;
}
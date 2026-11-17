import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { identityCounted, type IdentityCount, type ReceiptIdentity } from '@/lib/recebimentoIdentidade';
import { TabelaResponsiva } from './Shared';

export default function IdentidadesNota({items,counts,round,busy,onUse}: {
  items:ReceiptIdentity[];counts:IdentityCount[];round:number;busy:boolean;onUse:(item:ReceiptIdentity)=>void;
}) {
  return <TabelaResponsiva headers={['Descrição da nota','Descrição do sistema','EAN do XML','EANs cadastrados','Ref. fornecedor (nota)','Ref. no cadastro','Status','Ações']} mobileSecondaryColumns={[0,2,3,4,5]} mobilePrimaryColumn={1} rows={items.map(item => {
    const counted = identityCounted(item,counts,round);
    return [item.descricao_xml || '—',item.descricao_produto ? <span className="font-semibold">{item.descricao_produto}</span> : <span className="text-warning">— não cadastrado</span>,<span className="break-all">{item.ean || '—'}</span>,<span className="break-all">{item.eans_cadastro || '—'}</span>,item.cprod || '—',item.ref_cadastro || '',<Badge variant="outline" className={counted?'bg-success/10 text-success border-success/30':'bg-muted text-muted-foreground border-border'}>{counted?'Contado':'Pendente'}</Badge>,<Button type="button" variant="outline" size="sm" disabled={busy || !item.ean} onClick={()=>onUse(item)}>Usar EAN</Button>];
  })}/>;
}
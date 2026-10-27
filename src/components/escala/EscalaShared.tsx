import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { carregarDadosEscala, type DadosEscala } from '@/lib/escala/carregarContexto';

export const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export const DEPARTAMENTOS = ['Frente de Caixa','Açougue','Padaria','Hortifruti','Frios','Mercearia','Reposição','Recebimento','Prevenção de Perdas','Administrativo'];
export function mensagemErro(error: unknown) {
  toast.error(typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Não foi possível salvar. Tente novamente.');
}
export function useEscala() {
  const { user, isGlobalAdmin } = useAuth();
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [loja, setLoja] = useState(sessionStorage.getItem('selectedStoreId') || '');
  const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);
  const [dados, setDados] = useState<DadosEscala | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const serial = useRef(0);
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      let query = supabase.from('stores').select('id,name').order('name');
      if (!isGlobalAdmin) {
        const acc = await supabase.from('user_store_access').select('store_id').eq('user_id', user.id).eq('approved', true);
        if (acc.error) throw acc.error;
        query = query.in('id', (acc.data || []).map(a => a.store_id));
      }
      const result = await query;
      if (result.error) throw result.error;
      if (!active) return;
      const list = result.data || [];
      setLojas(list);
      setLoja(atual => list.some(s => s.id === atual) ? atual : list[0]?.id || '');
      if (!list.length) { setLoading(false); setErro('Nenhuma loja autorizada.'); }
    })().catch(error => { if (active) { mensagemErro(error); setLoading(false); } });
    return () => { active = false; };
  }, [user, isGlobalAdmin]);
  const carregar = useCallback(async () => {
    if (!loja || !lojas.some(s => s.id === loja)) return;
    const request = ++serial.current;
    setLoading(true); setErro(''); setDados(null);
    try { const result = await carregarDadosEscala(loja, ano, mes); if (request === serial.current) setDados(result); }
    catch (error) { if (request === serial.current) { setErro('Não foi possível carregar a escala.'); mensagemErro(error); } }
    finally { if (request === serial.current) setLoading(false); }
  }, [loja, lojas, ano, mes]);
  useEffect(() => { void carregar(); return () => { serial.current++; }; }, [carregar]);
  function mudarLoja(id: string) { sessionStorage.setItem('selectedStoreId', id); setLoja(id); }
  function navegar(delta: number) {
    let next = mes + delta, year = ano;
    if (next < 1) { next = 12; year--; } if (next > 12) { next = 1; year++; }
    setAno(year); setMes(next);
  }
  return { user, isGlobalAdmin, ano, mes, loja, lojas, dados, setDados, loading, erro, carregar, mudarLoja, navegar, nomeLoja: lojas.find(s => s.id === loja)?.name || '' };
}
export type EscalaState = ReturnType<typeof useEscala>;
export function Seletor({ value, onChange, options, label, disabled }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; disabled?: boolean }) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label} className="min-w-0"><SelectValue placeholder={label} /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
}
export function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
export function EscalaTopo({ state, titulo }: { state: EscalaState; titulo: string }) {
  return <div className="space-y-4 border-b pb-5 mb-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-muted-foreground text-sm"><CalendarDays size={16} /> Escala</div><h1 className="text-2xl mt-1">{titulo}</h1></div><Button variant="outline" onClick={() => void state.carregar()} disabled={state.loading}><RefreshCw size={16} className={state.loading ? 'animate-spin' : ''} />Atualizar</Button></div>
    <div className="flex flex-wrap items-center gap-3"><div className="w-full sm:w-72"><Seletor label="Loja da escala" value={state.loja} onChange={state.mudarLoja} options={state.lojas.map(s => ({ value: s.id, label: s.name }))} /></div><div className="flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => state.navegar(-1)}><ChevronLeft size={18} /></Button><span className="w-40 text-center font-medium">{MESES[state.mes - 1]} {state.ano}</span><Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => state.navegar(1)}><ChevronRight size={18} /></Button></div></div>
    <nav className="flex flex-wrap gap-4 text-sm"><Link className="hover:text-primary" to="/escala">Escala do Mês</Link><Link className="hover:text-primary" to="/escala/funcionarios">Funcionários e Ausências</Link>{state.dados?.podeGerir && <Link className="hover:text-primary" to="/admin/escala">Regras e Turnos</Link>}</nav>
    <p className="text-xs text-muted-foreground">Marcos futuros são premissas de planejamento. Confirme a legislação e a CCT com contador/sindicato.</p>
    {state.erro && <p role="alert" className="text-destructive">{state.erro}</p>}
  </div>;
}
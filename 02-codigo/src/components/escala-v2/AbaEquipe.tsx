import { useMemo, useState } from "react";
import { CalendarOff, ClipboardPaste, Download, Pencil, Plus, Trash2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  desativarPessoa, excluirAusencia, importarDaEscalaAtual, salvarAusencia, salvarPessoa, salvarPessoasEmLote,
  type DadosEscalaV2, type PessoaForm,
} from "@/lib/escala-v2/dados";
import { NOMES_DIA_LONGO, fmtDataBr, type Ausencia, type TurnoPreferido } from "@/lib/escala-v2/motor";

const SETORES_SUGERIDOS = ["Frente de Caixa", "Açougue", "Padaria", "Hortifruti", "Frios", "Mercearia", "Reposição", "Recebimento", "Prevenção de Perdas", "Administrativo"];
const TURNOS: { value: TurnoPreferido; label: string }[] = [
  { value: "auto", label: "Automático (a IA decide)" },
  { value: "abertura", label: "Abertura" },
  { value: "intermediario", label: "Intermediário" },
  { value: "fechamento", label: "Fechamento" },
];
const TIPOS_AUS: { value: Ausencia["tipo"]; label: string }[] = [{ value: "FER", label: "Férias" }, { value: "AT", label: "Atestado" }, { value: "AF", label: "Afastamento" }];
const VAZIO: PessoaForm = { nome: "", setor: "", cargo: null, turno: "auto", folga_fixa: null, carga_semanal: null, nascimento: null, aprendiz: false, domingo_quinzenal: false, admissao: null, desligamento: null, ativo: true };

function Campo({ label, children, dica }: { label: string; children: React.ReactNode; dica?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}{dica && <p className="text-xs text-muted-foreground">{dica}</p>}</div>;
}

interface Props {
  dados: DadosEscalaV2;
  recarregar: () => Promise<void>;
}

export default function AbaEquipe({ dados, recarregar }: Props) {
  const [form, setForm] = useState<PessoaForm | null>(null);
  const [lote, setLote] = useState<string | null>(null);
  const [aus, setAus] = useState<{ pessoa_id: string; tipo: Ausencia["tipo"]; inicio: string; fim: string } | null>(null);
  const [busca, setBusca] = useState("");
  const [busy, setBusy] = useState(false);
  const pode = dados.podeGerir;
  const ativos = useMemo(() => dados.pessoas.filter(p => p.ativo), [dados.pessoas]);
  const setores = useMemo(() => [...new Set([...ativos.map(p => p.setor), ...SETORES_SUGERIDOS])], [ativos]);
  const visiveis = ativos.filter(p => !busca.trim() || `${p.nome} ${p.setor}`.toLowerCase().includes(busca.trim().toLowerCase()));
  const nomeDe = (id: string) => dados.pessoas.find(p => p.id === id)?.nome || "Funcionário";

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

  const linhasLote = (lote || "").split("\n").map(l => l.split(/[;\t]/).map(x => x.trim())).filter(c => c[0] && c[1]).map(c => ({ nome: c[0], setor: c[1] }));

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-medium">Equipe</h2>
            <p className="text-sm text-muted-foreground">Basta o nome e o setor. O resto é opcional e só serve para a escala respeitar casos especiais.</p>
          </div>
          {pode && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => void executar(async () => { const n = await importarDaEscalaAtual(dados.storeId, dados.pessoas); return n ? `${n} funcionário(s) copiado(s) da Escala atual.` : "Nenhum funcionário novo para copiar da Escala atual."; })}><Download size={16} />Copiar da Escala atual</Button>
              <Button variant="outline" onClick={() => setLote("")}><ClipboardPaste size={16} />Colar lista</Button>
              <Button onClick={() => setForm({ ...VAZIO })}><Plus size={16} />Adicionar</Button>
            </div>
          )}
        </div>
        {ativos.length > 8 && <Input className="max-w-xs mb-3" placeholder="Buscar por nome ou setor" value={busca} onChange={e => setBusca(e.target.value)} />}
        {!ativos.length ? (
          <div className="border rounded-md p-8 text-center text-sm text-muted-foreground">Nenhum funcionário cadastrado nesta loja.</div>
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="p-3">Nome</th><th className="p-3">Setor</th><th className="p-3">Turno</th><th className="p-3">Folga fixa</th><th className="p-3">Jornada</th><th className="p-3">Casos especiais</th>{pode && <th className="p-3 w-24" />}</tr></thead>
              <tbody>
                {visiveis.map(p => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="p-3 font-medium">{p.nome}{p.cargo && <span className="block text-xs font-normal text-muted-foreground">{p.cargo}</span>}</td>
                    <td className="p-3">{p.setor}</td>
                    <td className="p-3">{p.turno === "auto" ? <span className="text-muted-foreground">Automático</span> : TURNOS.find(t => t.value === p.turno)?.label}</td>
                    <td className="p-3">{p.folga_fixa === null ? <span className="text-muted-foreground">Sem</span> : NOMES_DIA_LONGO[p.folga_fixa]}</td>
                    <td className="p-3 tabular-nums">{p.carga_semanal ? `${p.carga_semanal}h/sem` : <span className="text-muted-foreground">Limite legal</span>}</td>
                    <td className="p-3"><div className="flex flex-wrap gap-1">{p.aprendiz && <Badge variant="secondary">Aprendiz</Badge>}{p.domingo_quinzenal && <Badge variant="secondary">Domingo quinzenal</Badge>}{p.nascimento && <Badge variant="outline">Nasc. {fmtDataBr(p.nascimento)}/{p.nascimento.slice(0, 4)}</Badge>}</div></td>
                    {pode && (
                      <td className="p-3 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" aria-label={`Editar ${p.nome}`} onClick={() => setForm({ ...p })}><Pencil size={15} /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Registrar ausência de ${p.nome}`} onClick={() => setAus({ pessoa_id: p.id, tipo: "FER", inicio: "", fim: "" })}><CalendarOff size={15} /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Desligar ${p.nome}`} disabled={busy} onClick={() => { if (window.confirm(`Tirar ${p.nome} das próximas escalas? As escalas já feitas não mudam.`)) void executar(async () => { await desativarPessoa(p.id); return `${p.nome} saiu das próximas escalas.`; }); }}><UserMinus size={15} /></Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pode && (
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <div>
              <h2 className="text-lg font-medium">Férias, atestados e afastamentos</h2>
              <p className="text-sm text-muted-foreground">A IA não escala ninguém nesses dias e avisa se as férias começam perto de um feriado.</p>
            </div>
            <Button variant="outline" disabled={!ativos.length} onClick={() => setAus({ pessoa_id: ativos[0]?.id || "", tipo: "FER", inicio: "", fim: "" })}><Plus size={16} />Registrar ausência</Button>
          </div>
          {!dados.ausencias.length ? <p className="text-sm text-muted-foreground">Nenhuma ausência registrada perto deste mês.</p> : (
            <ul className="border rounded-md divide-y">
              {dados.ausencias.map(a => (
                <li key={a.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span><span className="font-medium">{nomeDe(a.pessoa_id)}</span> · {TIPOS_AUS.find(t => t.value === a.tipo)?.label} · {fmtDataBr(a.inicio)} a {fmtDataBr(a.fim)}/{a.fim.slice(0, 4)}</span>
                  <Button variant="ghost" size="icon" aria-label="Excluir ausência" disabled={busy} onClick={() => void executar(async () => { await excluirAusencia(a.id); })}><Trash2 size={15} /></Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Dialog open={!!form} onOpenChange={o => !o && setForm(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form?.id ? "Editar funcionário" : "Adicionar funcionário"}</DialogTitle><DialogDescription>Só nome e setor são obrigatórios.</DialogDescription></DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Campo label="Nome"><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} autoFocus /></Campo>
                <Campo label="Setor"><Input list="e2-setores" value={form.setor} onChange={e => setForm({ ...form, setor: e.target.value })} /><datalist id="e2-setores">{setores.map(s => <option key={s} value={s} />)}</datalist></Campo>
                <Campo label="Turno">
                  <Select value={form.turno} onValueChange={v => setForm({ ...form, turno: v as TurnoPreferido })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TURNOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
                </Campo>
                <Campo label="Folga fixa na semana">
                  <Select value={form.folga_fixa === null ? "sem" : String(form.folga_fixa)} onValueChange={v => setForm({ ...form, folga_fixa: v === "sem" ? null : Number(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sem">Sem folga fixa</SelectItem>{[1, 2, 3, 4, 5, 6, 0].map(d => <SelectItem key={d} value={String(d)}>{NOMES_DIA_LONGO[d]}</SelectItem>)}</SelectContent></Select>
                </Campo>
                <Campo label="Horas por semana no contrato" dica="Deixe vazio para o limite legal. Preencha para meio período (ex.: 30).">
                  <Input type="number" min={4} max={44} step={0.5} value={form.carga_semanal ?? ""} onChange={e => setForm({ ...form, carga_semanal: e.target.value ? Number(e.target.value) : null })} />
                </Campo>
                <Campo label="Data de nascimento" dica="Só para menores de 18: não entram em horário noturno.">
                  <Input type="date" value={form.nascimento || ""} onChange={e => setForm({ ...form, nascimento: e.target.value || null })} />
                </Campo>
                <Campo label="Cargo (opcional)"><Input value={form.cargo || ""} onChange={e => setForm({ ...form, cargo: e.target.value })} /></Campo>
                <Campo label="Admissão (opcional)"><Input type="date" value={form.admissao || ""} onChange={e => setForm({ ...form, admissao: e.target.value || null })} /></Campo>
              </div>
              <label className="flex items-start justify-between gap-4"><span className="text-sm"><span className="font-medium block">Aprendiz</span><span className="text-muted-foreground">Jornada de até 6h por dia (CLT art. 432).</span></span><Switch checked={form.aprendiz} onCheckedChange={v => setForm({ ...form, aprendiz: v })} /></label>
              <label className="flex items-start justify-between gap-4"><span className="text-sm"><span className="font-medium block">Folga de domingo a cada duas semanas</span><span className="text-muted-foreground">Revezamento quinzenal previsto para as empregadas no art. 386 da CLT. Para os demais vale 1 domingo a cada 3 semanas.</span></span><Switch checked={form.domingo_quinzenal} onCheckedChange={v => setForm({ ...form, domingo_quinzenal: v })} /></label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button disabled={busy || !form?.nome.trim() || !form?.setor.trim()} onClick={() => form && void executar(async () => { await salvarPessoa(dados.storeId, form); setForm(null); return "Funcionário salvo."; })}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lote !== null} onOpenChange={o => !o && setLote(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Colar lista de funcionários</DialogTitle><DialogDescription>Uma pessoa por linha, no formato Nome; Setor. Também aceita duas colunas copiadas do Excel.</DialogDescription></DialogHeader>
          <Textarea rows={10} placeholder={"Maria Souza; Padaria\nJoão Lima; Açougue"} value={lote || ""} onChange={e => setLote(e.target.value)} />
          <p className="text-sm text-muted-foreground">{linhasLote.length} {linhasLote.length === 1 ? "pessoa reconhecida" : "pessoas reconhecidas"}.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLote(null)}>Cancelar</Button>
            <Button disabled={busy || !linhasLote.length} onClick={() => void executar(async () => { const n = await salvarPessoasEmLote(dados.storeId, linhasLote); setLote(null); return `${n} funcionário(s) adicionado(s).`; })}>Adicionar {linhasLote.length || ""}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!aus} onOpenChange={o => !o && setAus(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar ausência</DialogTitle><DialogDescription>Férias, atestado ou afastamento em dias corridos.</DialogDescription></DialogHeader>
          {aus && (
            <div className="space-y-4">
              <Campo label="Funcionário">
                <Select value={aus.pessoa_id} onValueChange={v => setAus({ ...aus, pessoa_id: v })}><SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger><SelectContent>{ativos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} · {p.setor}</SelectItem>)}</SelectContent></Select>
              </Campo>
              <Campo label="Tipo">
                <Select value={aus.tipo} onValueChange={v => setAus({ ...aus, tipo: v as Ausencia["tipo"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPOS_AUS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
              </Campo>
              <div className="grid grid-cols-2 gap-4">
                <Campo label="Primeiro dia"><Input type="date" value={aus.inicio} onChange={e => setAus({ ...aus, inicio: e.target.value, fim: aus.fim && aus.fim >= e.target.value ? aus.fim : e.target.value })} /></Campo>
                <Campo label="Último dia"><Input type="date" min={aus.inicio} value={aus.fim} onChange={e => setAus({ ...aus, fim: e.target.value })} /></Campo>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAus(null)}>Cancelar</Button>
            <Button disabled={busy || !aus?.pessoa_id || !aus.inicio || !aus.fim || aus.fim < aus.inicio} onClick={() => aus && void executar(async () => { await salvarAusencia(dados.storeId, aus); setAus(null); return "Ausência registrada. Gere a escala de novo para aplicar."; })}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

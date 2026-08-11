import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Search, Plus, Eye, EyeOff, Shield, ShieldOff, Trash2, Lock,
  Ban, CheckCircle, Mail, Edit2, Store as StoreIcon, KeySquare, X, RefreshCw,
} from "lucide-react";
import ClientLayout from "@/components/ClientLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { APP_MODULES } from "@/lib/modules";

interface ManagedUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  profile: { user_id: string; full_name: string | null; blocked: boolean } | null;
  roles: string[];
  stores: { user_id: string; store_id: string; approved: boolean; stores: { name: string } | null }[];
  modules: { user_id: string; module: string; allowed: boolean }[];
}

interface Store { id: string; name: string; }

const AdminUsers = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/login");
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin]);

  const call = async (action: string, payload: any = {}) => {
    const { data, error } = await supabase.functions.invoke("admin-users", { body: { action, payload } });
    if (error || data?.error) throw new Error(data?.error || error?.message);
    return data;
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const [{ users }, { data: storesData }] = await Promise.all([
        call("list"),
        supabase.from("stores").select("*").order("name"),
      ]);
      setUsers(users);
      setStores(storesData || []);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) =>
      u.email?.toLowerCase().includes(q) ||
      u.profile?.full_name?.toLowerCase().includes(q)
    );
  }, [users, search]);

  if (authLoading || loading) {
    return (
      <ClientLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <p className="text-muted-foreground font-body">Carregando...</p>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <Users className="w-7 h-7 text-primary" />
              <h1 className="font-display text-3xl font-bold">Gerenciar Usuários</h1>
            </div>
            <p className="text-muted-foreground font-body text-sm mt-1">Cadastros completos — acessos, senhas, papéis e status.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={refresh} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border text-sm font-body hover:bg-accent">
              <RefreshCw className="w-4 h-4" /> Atualizar
            </button>
            <button onClick={() => setCreating(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-body font-semibold hover:opacity-90">
              <Plus className="w-4 h-4" /> Novo usuário
            </button>
          </div>
        </motion.div>

        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou e-mail..." className="pl-9" />
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-border text-xs font-body font-semibold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-4">Usuário</div>
            <div className="col-span-2">Papel</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Último acesso</div>
            <div className="col-span-2 text-right">Ações</div>
          </div>
          {filtered.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground font-body">Nenhum usuário encontrado.</p>
          )}
          {filtered.map((u) => {
            const isAdminUser = u.roles.includes("admin");
            const blocked = u.profile?.blocked;
            return (
              <div key={u.id} className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-border last:border-0 items-center hover:bg-accent/40 transition-colors">
                <div className="col-span-4 min-w-0">
                  <p className="font-body text-sm font-semibold truncate">{u.profile?.full_name || "—"}</p>
                  <p className="font-body text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <div className="col-span-2">
                  {isAdminUser ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-body font-semibold">
                      <Shield className="w-3 h-3" /> Admin
                    </span>
                  ) : (
                    <span className="text-xs font-body text-muted-foreground">Usuário</span>
                  )}
                </div>
                <div className="col-span-2">
                  {blocked ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/15 text-red-500 text-xs font-body font-semibold">
                      <Ban className="w-3 h-3" /> Bloqueado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/15 text-green-600 dark:text-green-400 text-xs font-body font-semibold">
                      <CheckCircle className="w-3 h-3" /> Ativo
                    </span>
                  )}
                </div>
                <div className="col-span-2 text-xs font-body text-muted-foreground">
                  {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("pt-BR") : "Nunca"}
                </div>
                <div className="col-span-2 flex justify-end gap-1">
                  <button onClick={() => setEditing(u)} title="Editar" className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {creating && (
        <CreateUserDialog
          stores={stores}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); refresh(); }}
          call={call}
        />
      )}

      {editing && (
        <EditUserDialog
          user={editing}
          stores={stores}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
          call={call}
        />
      )}
    </ClientLayout>
  );
};

// ----------------- Create Dialog -----------------
const CreateUserDialog = ({ stores, onClose, onCreated, call }: any) => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [isAdminFlag, setIsAdminFlag] = useState(false);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [modules, setModules] = useState<string[]>(APP_MODULES.filter(m => !m.key.startsWith("admin_") && m.key !== "vtex_collector" && m.key !== "websac_sync").map(m => m.key));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!email || !password) { toast({ title: "Preencha email e senha", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await call("create", { email, password, full_name: fullName, is_admin: isAdminFlag, store_ids: storeIds, modules });
      toast({ title: "Usuário criado!" });
      onCreated();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Novo usuário</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nome completo</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <div>
            <Label>Senha</Label>
            <div className="relative">
              <Input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={isAdminFlag} onCheckedChange={(v) => setIsAdminFlag(!!v)} />
            <span className="font-body text-sm">Conceder papel de Administrador</span>
          </label>

          <div>
            <p className="font-body text-sm font-semibold mb-2 flex items-center gap-2"><StoreIcon className="w-4 h-4" /> Lojas autorizadas</p>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border border-border rounded-lg">
              {stores.map((s: Store) => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer text-sm font-body">
                  <Checkbox checked={storeIds.includes(s.id)} onCheckedChange={(v) => setStoreIds(v ? [...storeIds, s.id] : storeIds.filter(x => x !== s.id))} />
                  {s.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <p className="font-body text-sm font-semibold flex items-center gap-2"><KeySquare className="w-4 h-4" /> Módulos visíveis</p>
              <button
                type="button"
                onClick={() => setModules(["pic", "pic_percentual"])}
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-body font-semibold hover:bg-accent"
              >
                Perfil PIC VISUALIZADOR
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-border rounded-lg">
              {APP_MODULES.map((m) => (
                <label key={m.key} className="flex items-center gap-2 cursor-pointer text-sm font-body">
                  <Checkbox checked={modules.includes(m.key)} onCheckedChange={(v) => setModules(v ? [...modules, m.key] : modules.filter(x => x !== m.key))} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border font-body text-sm">Cancelar</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-body text-sm font-semibold disabled:opacity-50">
            {saving ? "Criando..." : "Criar usuário"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ----------------- Edit Dialog -----------------
const EditUserDialog = ({ user, stores, onClose, onSaved, call }: any) => {
  const { toast } = useToast();
  const [fullName, setFullName] = useState(user.profile?.full_name || "");
  const [email, setEmail] = useState(user.email);
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [isAdminFlag, setIsAdminFlag] = useState(user.roles.includes("admin"));
  const [blocked, setBlocked] = useState(!!user.profile?.blocked);
  const [storeIds, setStoreIds] = useState<string[]>(user.stores.filter((s: any) => s.approved).map((s: any) => s.store_id));
  const [moduleKeys, setModuleKeys] = useState<string[]>(user.modules.filter((m: any) => m.allowed).map((m: any) => m.module));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const ops: Promise<any>[] = [];
      if (fullName !== user.profile?.full_name || email !== user.email) {
        ops.push(call("update_user", { user_id: user.id, full_name: fullName, email: email !== user.email ? email : undefined }));
      }
      if (newPassword) ops.push(call("set_password", { user_id: user.id, password: newPassword }));
      if (isAdminFlag !== user.roles.includes("admin")) ops.push(call("set_admin", { user_id: user.id, is_admin: isAdminFlag }));
      if (blocked !== !!user.profile?.blocked) ops.push(call("set_blocked", { user_id: user.id, blocked }));
      ops.push(call("set_stores", { user_id: user.id, store_ids: storeIds }));
      ops.push(call("set_modules", { user_id: user.id, modules: APP_MODULES.map(m => ({ module: m.key, allowed: moduleKeys.includes(m.key) })) }));
      await Promise.all(ops);
      toast({ title: "Alterações salvas!" });
      onSaved();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const deleteUser = async () => {
    if (!confirm(`Excluir permanentemente ${user.email}? Esta ação não pode ser desfeita.`)) return;
    setSaving(true);
    try {
      await call("delete_user", { user_id: user.id });
      toast({ title: "Usuário excluído" });
      onSaved();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Edit2 className="w-5 h-5 text-primary" /> Editar usuário
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nome completo</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            <div><Label className="flex items-center gap-1"><Mail className="w-3 h-3" /> E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>

          <div>
            <Label className="flex items-center gap-1"><Lock className="w-3 h-3" /> Definir nova senha</Label>
            <div className="relative">
              <Input type={showPw ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Deixe em branco para manter a atual" className="pr-10" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground font-body mt-1">A senha atual é criptografada e não pode ser visualizada — apenas redefinida.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg border border-border">
              <Checkbox checked={isAdminFlag} onCheckedChange={(v) => setIsAdminFlag(!!v)} />
              <span className="font-body text-sm flex items-center gap-1"><Shield className="w-4 h-4" /> Administrador</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg border border-border">
              <Checkbox checked={blocked} onCheckedChange={(v) => setBlocked(!!v)} />
              <span className="font-body text-sm flex items-center gap-1"><Ban className="w-4 h-4" /> Bloquear acesso</span>
            </label>
          </div>

          <div>
            <p className="font-body text-sm font-semibold mb-2 flex items-center gap-2"><StoreIcon className="w-4 h-4" /> Lojas autorizadas</p>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border border-border rounded-lg">
              {stores.map((s: Store) => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer text-sm font-body">
                  <Checkbox checked={storeIds.includes(s.id)} onCheckedChange={(v) => setStoreIds(v ? [...storeIds, s.id] : storeIds.filter(x => x !== s.id))} />
                  {s.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <p className="font-body text-sm font-semibold flex items-center gap-2"><KeySquare className="w-4 h-4" /> Módulos visíveis</p>
              <button
                type="button"
                onClick={() => setModuleKeys(["pic", "pic_percentual"])}
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-body font-semibold hover:bg-accent"
              >
                Perfil PIC VISUALIZADOR
              </button>
            </div>
            <p className="text-xs text-muted-foreground font-body mb-2">Marque o que esse usuário pode acessar. Admin enxerga tudo independente desta lista. "PIC: somente %" oculta valores em R$ no PIC (análise por produto e volume continuam liberadas).</p>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-border rounded-lg">
              {APP_MODULES.map((m) => (
                <label key={m.key} className="flex items-center gap-2 cursor-pointer text-sm font-body">
                  <Checkbox checked={moduleKeys.includes(m.key)} onCheckedChange={(v) => setModuleKeys(v ? [...moduleKeys, m.key] : moduleKeys.filter(x => x !== m.key))} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground font-body space-y-1 pt-2 border-t border-border">
            <p>Criado em: {new Date(user.created_at).toLocaleString("pt-BR")}</p>
            <p>Último acesso: {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("pt-BR") : "Nunca"}</p>
            <p>E-mail confirmado: {user.email_confirmed_at ? "Sim" : "Não"}</p>
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <button onClick={deleteUser} disabled={saving} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/15 text-red-500 font-body text-sm font-semibold hover:bg-red-500/25 disabled:opacity-50">
            <Trash2 className="w-4 h-4" /> Excluir
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border font-body text-sm">Cancelar</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-body text-sm font-semibold disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminUsers;

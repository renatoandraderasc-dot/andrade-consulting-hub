import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save, Upload, Plus, Trash2, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { DEFAULT_CONTENT, SiteContent } from "@/hooks/useSiteContent";
import { toast } from "@/hooks/use-toast";

const MAX_IMAGE_BYTES = 2_500_000; // ~2.5MB raw; base64 ~3.4MB

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

const Field = ({ label, value, onChange, textarea = false, rows = 3 }: any) => (
  <label className="block">
    <span className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</span>
    {textarea ? (
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    ) : (
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    )}
  </label>
);

const ImagePicker = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => {
  const onFile = async (f?: File | null) => {
    if (!f) return;
    if (f.size > MAX_IMAGE_BYTES) {
      toast({ title: "Imagem muito grande", description: "Use uma imagem de até ~2.5MB." });
      return;
    }
    const url = await fileToDataUrl(f);
    onChange(url);
  };
  return (
    <div>
      <span className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</span>
      <div className="flex items-center gap-3">
        <div className="w-24 h-16 rounded-md border border-border bg-card flex items-center justify-center overflow-hidden">
          {value ? (
            <img src={value} alt="preview" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-secondary text-sm cursor-pointer hover:bg-secondary/70">
          <Upload className="w-4 h-4" />
          Enviar
          <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {value && (
          <button
            onClick={() => onChange("")}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-border text-sm text-danger hover:bg-danger/10"
          >
            <Trash2 className="w-4 h-4" /> Remover
          </button>
        )}
      </div>
    </div>
  );
};

const Section = ({ title, children }: any) => (
  <section className="bg-card border border-border rounded-lg p-5 space-y-4">
    <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
    <div className="grid md:grid-cols-2 gap-4">{children}</div>
  </section>
);

const AdminSite = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [content, setContent] = useState<SiteContent>(DEFAULT_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return navigate("/login");
    if (!isAdmin) return navigate("/dashboard");
    (async () => {
      const raw = (data?.data as Partial<SiteContent>) || {};
      const merged = { ...DEFAULT_CONTENT, ...raw } as SiteContent;
      setContent({
        ...DEFAULT_CONTENT,
        ...merged,
        navbar: { ...DEFAULT_CONTENT.navbar, ...(merged.navbar || {}) },
        hero: { ...DEFAULT_CONTENT.hero, ...(merged.hero || {}) },
        services: {
          ...DEFAULT_CONTENT.services,
          ...(merged.services || {}),
          items: merged.services?.items?.length ? merged.services.items : DEFAULT_CONTENT.services.items,
        },
        stats: merged.stats?.length ? merged.stats : DEFAULT_CONTENT.stats,
        about: {
          ...DEFAULT_CONTENT.about,
          ...(merged.about || {}),
          differentials: merged.about?.differentials?.length ? merged.about.differentials : DEFAULT_CONTENT.about.differentials,
        },
        contact: { ...DEFAULT_CONTENT.contact, ...(merged.contact || {}) },
        footer: { ...DEFAULT_CONTENT.footer, ...(merged.footer || {}) },
      });
      setLoading(false);
    })();
  }, [user, isAdmin, authLoading]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("site_content")
      .upsert({ id: "home", data: content as any, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Salvo com sucesso", description: "As alterações já aparecem na página inicial." });
    }
  };

  const patch = (fn: (c: SiteContent) => SiteContent) => setContent((c) => fn(structuredClone(c)));

  if (authLoading || loading) {
    return (
      <ClientLayout>
        <div className="p-8 text-muted-foreground">Carregando…</div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="container mx-auto px-6 py-6 max-w-[1100px]">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground">Página Inicial — Editor</h1>
            <p className="text-muted-foreground text-sm">Edite textos e imagens do site público. Só você (admin) vê esta tela.</p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>

        <div className="space-y-6">
          <Section title="Menu / Navbar">
            <Field label="Link — Serviços" value={content.navbar.linkServicos} onChange={(v: string) => patch((c) => ((c.navbar.linkServicos = v), c))} />
            <Field label="Link — Sobre" value={content.navbar.linkSobre} onChange={(v: string) => patch((c) => ((c.navbar.linkSobre = v), c))} />
            <Field label="Link — Contato" value={content.navbar.linkContato} onChange={(v: string) => patch((c) => ((c.navbar.linkContato = v), c))} />
            <Field label="Link — Clientes" value={content.navbar.linkClientes} onChange={(v: string) => patch((c) => ((c.navbar.linkClientes = v), c))} />
            <Field label="Botão — Fale Conosco" value={content.navbar.ctaFale} onChange={(v: string) => patch((c) => ((c.navbar.ctaFale = v), c))} />
          </Section>

          <Section title="Hero (topo)">
            <Field label="Eyebrow (cima do título)" value={content.hero.eyebrow} onChange={(v: string) => patch((c) => ((c.hero.eyebrow = v), c))} />
            <div />
            <Field label="Título — 1ª linha" value={content.hero.titleLine1} onChange={(v: string) => patch((c) => ((c.hero.titleLine1 = v), c))} />
            <Field label="Título — 2ª linha (destaque)" value={content.hero.titleLine2} onChange={(v: string) => patch((c) => ((c.hero.titleLine2 = v), c))} />
            <Field label="Subtítulo" value={content.hero.subtitle} textarea onChange={(v: string) => patch((c) => ((c.hero.subtitle = v), c))} />
            <div className="grid gap-3">
              <Field label="Botão principal" value={content.hero.ctaPrimary} onChange={(v: string) => patch((c) => ((c.hero.ctaPrimary = v), c))} />
              <Field label="Botão secundário" value={content.hero.ctaSecondary} onChange={(v: string) => patch((c) => ((c.hero.ctaSecondary = v), c))} />
            </div>
            <div className="md:col-span-2">
              <ImagePicker label="Imagem de fundo do Hero" value={content.hero.backgroundImage} onChange={(v) => patch((c) => ((c.hero.backgroundImage = v), c))} />
            </div>
          </Section>

          <Section title="Serviços">
            <Field label="Eyebrow" value={content.services.eyebrow} onChange={(v: string) => patch((c) => ((c.services.eyebrow = v), c))} />
            <div />
            <Field label="Título — prefixo" value={content.services.titlePrefix} onChange={(v: string) => patch((c) => ((c.services.titlePrefix = v), c))} />
            <Field label="Título — destaque" value={content.services.titleAccent} onChange={(v: string) => patch((c) => ((c.services.titleAccent = v), c))} />
            <div className="md:col-span-2 space-y-3">
              {content.services.items.map((it, i) => (
                <div key={i} className="border border-border rounded-md p-3 space-y-2 bg-background/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Serviço {i + 1}</span>
                    <button
                      onClick={() => patch((c) => ((c.services.items = c.services.items.filter((_, k) => k !== i)), c))}
                      className="text-danger text-xs inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remover
                    </button>
                  </div>
                  <Field label="Título" value={it.title} onChange={(v: string) => patch((c) => ((c.services.items[i].title = v), c))} />
                  <Field label="Descrição" value={it.description} textarea rows={2} onChange={(v: string) => patch((c) => ((c.services.items[i].description = v), c))} />
                </div>
              ))}
              <button
                onClick={() => patch((c) => ((c.services.items = [...c.services.items, { title: "Novo serviço", description: "Descrição" }]), c))}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-4 h-4" /> Adicionar serviço
              </button>
            </div>
          </Section>

          <Section title="Números (Stats)">
            <div className="md:col-span-2 grid md:grid-cols-2 gap-3">
              {content.stats.map((s, i) => (
                <div key={i} className="border border-border rounded-md p-3 bg-background/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Indicador {i + 1}</span>
                    <button
                      onClick={() => patch((c) => ((c.stats = c.stats.filter((_, k) => k !== i)), c))}
                      className="text-danger text-xs inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remover
                    </button>
                  </div>
                  <Field label="Valor" value={s.value} onChange={(v: string) => patch((c) => ((c.stats[i].value = v), c))} />
                  <Field label="Rótulo" value={s.label} onChange={(v: string) => patch((c) => ((c.stats[i].label = v), c))} />
                </div>
              ))}
              <button
                onClick={() => patch((c) => ((c.stats = [...c.stats, { value: "0", label: "Novo" }]), c))}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-4 h-4" /> Adicionar indicador
              </button>
            </div>
          </Section>

          <Section title="Sobre (Quem somos)">
            <Field label="Eyebrow" value={content.about.eyebrow} onChange={(v: string) => patch((c) => ((c.about.eyebrow = v), c))} />
            <div />
            <Field label="Título — prefixo" value={content.about.titlePrefix} onChange={(v: string) => patch((c) => ((c.about.titlePrefix = v), c))} />
            <Field label="Título — destaque" value={content.about.titleAccent} onChange={(v: string) => patch((c) => ((c.about.titleAccent = v), c))} />
            <div className="md:col-span-2">
              <Field label="Texto principal" value={content.about.body} textarea rows={4} onChange={(v: string) => patch((c) => ((c.about.body = v), c))} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">Diferenciais</span>
              {content.about.differentials.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={d}
                    onChange={(e) => patch((c) => ((c.about.differentials[i] = e.target.value), c))}
                    className="flex-1 bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button onClick={() => patch((c) => ((c.about.differentials = c.about.differentials.filter((_, k) => k !== i)), c))} className="text-danger p-2">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => patch((c) => ((c.about.differentials = [...c.about.differentials, "Novo diferencial"]), c))}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-4 h-4" /> Adicionar diferencial
              </button>
            </div>
            <Field label="Selo — título (ex. AC)" value={content.about.badgeTitle} onChange={(v: string) => patch((c) => ((c.about.badgeTitle = v), c))} />
            <Field label="Selo — subtítulo" value={content.about.badgeSubtitle} onChange={(v: string) => patch((c) => ((c.about.badgeSubtitle = v), c))} />
            <div className="md:col-span-2">
              <ImagePicker label="Imagem (substitui o selo AC se enviada)" value={content.about.image} onChange={(v) => patch((c) => ((c.about.image = v), c))} />
            </div>
          </Section>

          <Section title="Contato">
            <Field label="Eyebrow" value={content.contact.eyebrow} onChange={(v: string) => patch((c) => ((c.contact.eyebrow = v), c))} />
            <div />
            <Field label="Título — prefixo" value={content.contact.titlePrefix} onChange={(v: string) => patch((c) => ((c.contact.titlePrefix = v), c))} />
            <Field label="Título — destaque" value={content.contact.titleAccent} onChange={(v: string) => patch((c) => ((c.contact.titleAccent = v), c))} />
            <Field label="Título — sufixo" value={content.contact.titleSuffix} onChange={(v: string) => patch((c) => ((c.contact.titleSuffix = v), c))} />
            <div />
            <Field label="Texto" value={content.contact.body} textarea onChange={(v: string) => patch((c) => ((c.contact.body = v), c))} />
            <div className="grid gap-3">
              <Field label="Telefone (exibido)" value={content.contact.phone} onChange={(v: string) => patch((c) => ((c.contact.phone = v), c))} />
              <Field label="E-mail" value={content.contact.email} onChange={(v: string) => patch((c) => ((c.contact.email = v), c))} />
              <Field label="Endereço" value={content.contact.address} onChange={(v: string) => patch((c) => ((c.contact.address = v), c))} />
            </div>
            <Field label="WhatsApp (apenas números, com DDI+DDD)" value={content.contact.whatsappNumber} onChange={(v: string) => patch((c) => ((c.contact.whatsappNumber = v), c))} />
            <Field label="Botão WhatsApp" value={content.contact.ctaWhatsapp} onChange={(v: string) => patch((c) => ((c.contact.ctaWhatsapp = v), c))} />
          </Section>

          <Section title="Rodapé">
            <Field label="Proprietário" value={content.footer.owner} onChange={(v: string) => patch((c) => ((c.footer.owner = v), c))} />
            <Field label="Texto de direitos" value={content.footer.rights} onChange={(v: string) => patch((c) => ((c.footer.rights = v), c))} />
          </Section>

          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
};

export default AdminSite;

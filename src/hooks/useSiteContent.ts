import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SiteContent = {
  navbar: {
    linkServicos: string;
    linkSobre: string;
    linkContato: string;
    linkClientes: string;
    ctaFale: string;
  };
  hero: {
    eyebrow: string;
    titleLine1: string;
    titleLine2: string;
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
    backgroundImage: string; // data URL or empty for default
  };
  services: {
    eyebrow: string;
    titlePrefix: string;
    titleAccent: string;
    items: { title: string; description: string }[];
  };
  stats: { value: string; label: string }[];
  about: {
    eyebrow: string;
    titlePrefix: string;
    titleAccent: string;
    body: string;
    differentials: string[];
    badgeTitle: string;
    badgeSubtitle: string;
    image: string; // optional data URL
  };
  contact: {
    eyebrow: string;
    titlePrefix: string;
    titleAccent: string;
    titleSuffix: string;
    body: string;
    phone: string;
    email: string;
    address: string;
    whatsappNumber: string;
    ctaWhatsapp: string;
  };
  footer: {
    owner: string;
    rights: string;
  };
};

export const DEFAULT_CONTENT: SiteContent = {
  navbar: {
    linkServicos: "Serviços",
    linkSobre: "Sobre",
    linkContato: "Contato",
    linkClientes: "Entrar",
    ctaFale: "Fale Conosco",
  },
  hero: {
    eyebrow: "Excelência em Consultoria Empresarial",
    titleLine1: "Andrade",
    titleLine2: "Consultoria",
    subtitle:
      "Transformamos desafios em oportunidades. Estratégia, gestão e resultados para o crescimento sustentável do seu negócio.",
    ctaPrimary: "Agende uma Conversa",
    ctaSecondary: "Nossos Serviços",
    backgroundImage: "",
  },
  services: {
    eyebrow: "O que fazemos",
    titlePrefix: "Nossos",
    titleAccent: "Serviços",
    items: [
      { title: "Planejamento Estratégico", description: "Definimos metas claras e caminhos eficientes para posicionar sua empresa à frente da concorrência." },
      { title: "Gestão Financeira", description: "Otimização de custos, análise de viabilidade e estruturação financeira para decisões mais inteligentes." },
      { title: "Gestão de Pessoas", description: "Desenvolvimento de lideranças, cultura organizacional e processos de RH alinhados aos resultados." },
      { title: "Crescimento & Vendas", description: "Estratégias comerciais, funis de vendas e processos escaláveis para impulsionar sua receita." },
    ],
  },
  stats: [
    { value: "70", label: "Empresas Atendidas" },
    { value: "98%", label: "Satisfação dos Clientes" },
    { value: "12", label: "Anos de Experiência" },
    { value: "R$50M+", label: "Em Resultados Gerados" },
  ],
  about: {
    eyebrow: "Quem somos",
    titlePrefix: "Parceiros do seu",
    titleAccent: "crescimento",
    body: "A Andrade Consultoria nasceu da paixão por transformar negócios. Com mais de uma década de atuação, ajudamos empresas de todos os portes a alcançar seu verdadeiro potencial através de estratégias inteligentes e execução impecável.",
    differentials: [
      "Metodologia própria com foco em resultados mensuráveis",
      "Equipe multidisciplinar com experiência no mercado",
      "Acompanhamento contínuo e relatórios de progresso",
      "Soluções personalizadas para cada tipo de negócio",
    ],
    badgeTitle: "AC",
    badgeSubtitle: "Excelência em Consultoria",
    image: "",
  },
  contact: {
    eyebrow: "Vamos conversar",
    titlePrefix: "Pronto para",
    titleAccent: "transformar",
    titleSuffix: "seu negócio?",
    body: "Entre em contato e descubra como podemos ajudar sua empresa a alcançar novos patamares de sucesso.",
    phone: "(11) 96602-1224",
    email: "renatoandrade@hotmail.com",
    address: "São Paulo, SP",
    whatsappNumber: "5511966021224",
    ctaWhatsapp: "Fale Conosco pelo WhatsApp",
  },
  footer: {
    owner: "Renato Andrade Silva Cunha",
    rights: "Andrade Consultoria. Todos os direitos reservados.",
  },
};

function deepMerge<T>(base: T, patch: any): T {
  if (Array.isArray(base)) return (patch ?? base) as T;
  if (base && typeof base === "object") {
    const out: any = { ...base };
    if (patch && typeof patch === "object") {
      for (const k of Object.keys(patch)) {
        out[k] = deepMerge((base as any)[k], patch[k]);
      }
    }
    return out;
  }
  return (patch ?? base) as T;
}

export function useSiteContent() {
  const [content, setContent] = useState<SiteContent>(DEFAULT_CONTENT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.from("site_content").select("data").eq("id", "home").maybeSingle();
      if (mounted) {
        setContent(deepMerge(DEFAULT_CONTENT, data?.data || {}));
        setLoading(false);
      }
    })();
    const channel = supabase
      .channel("site_content_home")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_content", filter: "id=eq.home" }, (payload: any) => {
        setContent(deepMerge(DEFAULT_CONTENT, payload.new?.data || {}));
      })
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { content, loading };
}

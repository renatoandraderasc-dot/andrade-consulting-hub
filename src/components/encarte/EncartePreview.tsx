import { forwardRef } from "react";
import { THEMES, FORMATOS, ThemeKey, FormatoKey } from "@/lib/encarteThemes";
import { Encarte, EncarteItem } from "@/lib/encarteTypes";
import { formatBRDate, splitPrice } from "@/lib/formatters";

interface Props {
  encarte: Encarte;
  itens: EncarteItem[];
  scale?: number;
}

const StarburstPrice = ({ valor, unidade, theme }: { valor: number; unidade: string; theme: ReturnType<typeof getTheme> }) => {
  const { inteiro, centavos } = splitPrice(valor);
  return (
    <div style={{ position: "relative", width: 190, height: 190, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg viewBox="0 0 200 200" width="190" height="190" style={{ position: "absolute", inset: 0, filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.25))" }}>
        <polygon
          points="100,4 116,44 158,20 152,66 196,72 164,104 198,138 152,144 160,190 118,164 100,200 82,164 40,190 48,144 2,138 36,104 4,72 48,66 42,20 84,44"
          fill={theme.splashFill}
          stroke={theme.splashText}
          strokeWidth="3"
        />
      </svg>
      <div style={{ position: "relative", color: theme.splashText, textAlign: "center", lineHeight: 1, fontFamily: "'Impact','Arial Narrow','Arial Black',sans-serif" }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>R$</div>
        <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: -2 }}>{inteiro}</div>
        <div style={{ fontSize: 22, fontWeight: 900 }}>,{centavos} <span style={{ fontSize: 14 }}>/{unidade}</span></div>
      </div>
    </div>
  );
};

function getTheme(key: string) {
  return THEMES[(key as ThemeKey) in THEMES ? (key as ThemeKey) : "ofertao"];
}

export const EncartePreview = forwardRef<HTMLDivElement, Props>(({ encarte, itens, scale = 0.55 }, ref) => {
  const theme = getTheme(encarte.tema);
  const formato = FORMATOS[(encarte.formato as FormatoKey) in FORMATOS ? (encarte.formato as FormatoKey) : "a4"];
  const colunas = Math.max(2, Math.min(4, encarte.colunas || 3));

  return (
    <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: formato.width * scale, height: formato.height * scale }}>
      <div
        ref={ref}
        style={{
          width: formato.width,
          height: formato.height,
          background: theme.bg,
          fontFamily: "'DM Sans', system-ui, sans-serif",
          color: theme.cardText,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        }}
      >
        {/* Header */}
        <div style={{ background: theme.headerBg, color: theme.headerText, padding: "24px 32px", display: "flex", alignItems: "center", gap: 20 }}>
          {encarte.loja_logo_url && (
            <img src={encarte.loja_logo_url} crossOrigin="anonymous" alt="logo" style={{ height: 80, width: 80, objectFit: "contain", background: "#fff", borderRadius: 8, padding: 4 }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Impact','Arial Narrow',sans-serif", fontSize: 44, fontWeight: 900, lineHeight: 1, letterSpacing: -1 }}>
              {(encarte.loja_nome || "SUPERMERCADO").toUpperCase()}
            </div>
            {encarte.loja_endereco && <div style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>{encarte.loja_endereco}</div>}
          </div>
        </div>

        <div style={{ padding: "20px 32px 8px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Impact','Arial Narrow',sans-serif", fontSize: 78, fontWeight: 900, color: theme.titleText, lineHeight: 1, letterSpacing: -2 }}>
            {(encarte.titulo || "OFERTAS DA SEMANA").toUpperCase()}
          </div>
          {(encarte.validade_de || encarte.validade_ate) && (
            <div style={{ display: "inline-block", marginTop: 12, background: theme.accent, color: theme.splashText, padding: "8px 24px", borderRadius: 999, fontWeight: 700, fontSize: 18 }}>
              VÁLIDO DE {formatBRDate(encarte.validade_de)} A {formatBRDate(encarte.validade_ate)}
            </div>
          )}
        </div>

        {/* Grid */}
        <div style={{ flex: 1, padding: 24, display: "grid", gridTemplateColumns: `repeat(${colunas}, 1fr)`, gap: 16, alignContent: "start" }}>
          {itens.map((it) => {
            const p = it.produto;
            const span = it.destaque ? Math.min(2, colunas) : 1;
            return (
              <div
                key={it.id || it.ordem}
                style={{
                  gridColumn: `span ${span}`,
                  background: theme.cardBg,
                  color: theme.cardText,
                  borderRadius: 14,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  border: `3px solid ${theme.accent}`,
                  position: "relative",
                  minHeight: 320,
                }}
              >
                {p?.imagem_url ? (
                  <img src={p.imagem_url} crossOrigin="anonymous" alt={p.descricao} style={{ height: 140, maxWidth: "100%", objectFit: "contain" }} />
                ) : (
                  <div style={{ height: 140, width: "100%", background: "#eee", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 12 }}>SEM FOTO</div>
                )}
                <div style={{ fontWeight: 800, textAlign: "center", fontSize: span > 1 ? 22 : 16, lineHeight: 1.15, textTransform: "uppercase", minHeight: 40 }}>
                  {p?.descricao || "Produto"}
                </div>
                {it.preco_de && (
                  <div style={{ textDecoration: "line-through", opacity: 0.7, fontSize: 16, fontWeight: 600 }}>
                    de R$ {it.preco_de.toFixed(2).replace(".", ",")}
                  </div>
                )}
                <StarburstPrice valor={it.preco_oferta} unidade={p?.unidade || "un"} theme={theme} />
                {it.observacao && <div style={{ fontSize: 12, opacity: 0.8, textAlign: "center" }}>{it.observacao}</div>}
              </div>
            );
          })}
          {itens.length === 0 && (
            <div style={{ gridColumn: `span ${colunas}`, textAlign: "center", padding: 60, color: theme.titleText, opacity: 0.7 }}>
              Adicione produtos no painel ao lado
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ background: theme.headerBg, color: theme.headerText, padding: "16px 32px", fontSize: 13, textAlign: "center", lineHeight: 1.4 }}>
          {encarte.loja_telefone && <div style={{ fontWeight: 700, fontSize: 18 }}>📞 {encarte.loja_telefone}</div>}
          {encarte.loja_endereco && <div style={{ opacity: 0.9 }}>{encarte.loja_endereco}</div>}
          <div style={{ marginTop: 8, opacity: 0.8, fontSize: 11 }}>
            Imagens meramente ilustrativas. Ofertas válidas enquanto durarem os estoques. Reservamo-nos o direito de corrigir eventuais erros de digitação.
          </div>
        </div>
      </div>
    </div>
  );
});

EncartePreview.displayName = "EncartePreview";

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Produto } from "@/lib/encarteTypes";

interface Props {
  onSelect: (p: Produto) => void;
}

export const ProdutoAutocomplete = ({ onSelect }: Props) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Produto[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("produtos")
        .select("*")
        .or(`descricao.ilike.%${q}%,codigo_interno.ilike.%${q}%,ean.ilike.%${q}%`)
        .limit(15);
      setResults((data as Produto[]) || []);
      setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative">
      <Input
        placeholder="Buscar produto por descrição, código ou EAN..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-80 overflow-auto">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0"
              onClick={() => { onSelect(p); setQ(""); setResults([]); setOpen(false); }}
            >
              <div className="font-medium">{p.descricao}</div>
              <div className="text-xs text-muted-foreground">
                {p.codigo_interno && `Cód: ${p.codigo_interno}`} {p.ean && ` · EAN: ${p.ean}`} {p.preco_regular && ` · R$ ${p.preco_regular.toFixed(2).replace(".", ",")}`}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, Upload, RefreshCw, Download } from "lucide-react";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  categoria: string;
  onCategoriaChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  margemRange: string;
  onMargemRangeChange: (v: string) => void;
  categorias: string[];
  onImport: () => void;
  onExport: (format: "csv" | "xlsx") => void;
  onRefresh: () => void;
}

const RepricingFilters = ({
  search, onSearchChange,
  categoria, onCategoriaChange,
  status, onStatusChange,
  margemRange, onMargemRangeChange,
  categorias,
  onImport, onExport, onRefresh,
}: Props) => {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por produto, código ou categoria..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={categoria} onValueChange={onCategoriaChange}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="maior">Acima</SelectItem>
            <SelectItem value="menor">Abaixo</SelectItem>
            <SelectItem value="igual">Igual</SelectItem>
          </SelectContent>
        </Select>

        <Select value={margemRange} onValueChange={onMargemRangeChange}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Faixa Margem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="0-20">0% - 20%</SelectItem>
            <SelectItem value="20-35">20% - 35%</SelectItem>
            <SelectItem value="35-50">35% - 50%</SelectItem>
            <SelectItem value="50+">50%+</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onImport}>
          <Upload className="w-4 h-4 mr-1" /> Importar Produtos
        </Button>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-1" /> Atualizar Concorrência
        </Button>
        <Button variant="outline" size="sm" onClick={() => onExport("csv")}>
          <Download className="w-4 h-4 mr-1" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => onExport("xlsx")}>
          <Download className="w-4 h-4 mr-1" /> Excel
        </Button>
      </div>
    </div>
  );
};

export default RepricingFilters;

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Check, X } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

interface FileUploadPanelProps {
  label: string;
  description: string;
  expectedColumns: string[];
  onDataLoaded: (data: Record<string, unknown>[]) => void;
  loaded: boolean;
  rowCount: number;
}

const parseFile = (file: File): Promise<Record<string, unknown>[]> => {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv" || ext === "txt") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: "UTF-8",
        complete: (r) => resolve(r.data as Record<string, unknown>[]),
        error: (e) => reject(e),
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
          resolve(json);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  });
};

const FileUploadCard = ({ label, description, expectedColumns, onDataLoaded, loaded, rowCount }: FileUploadPanelProps) => {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    try {
      const data = await parseFile(file);
      setFileName(file.name);
      onDataLoaded(data);
    } catch {
      setFileName("");
    }
  };

  return (
    <Card className={`border-2 transition-colors ${dragging ? "border-primary bg-primary/5" : loaded ? "border-green-500/40 bg-green-500/5" : "border-dashed border-border"}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
          {label}
          {loaded && <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20 text-[10px]"><Check className="w-3 h-3 mr-1" />{rowCount} linhas</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">{description}</p>
        <p className="text-[10px] text-muted-foreground mb-2">Colunas esperadas: <span className="font-mono">{expectedColumns.join(", ")}</span></p>

        <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />

        <div
          className="border border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:bg-muted/30 transition-colors"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
        >
          {fileName ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <Check className="w-4 h-4 text-green-600" />
              <span className="text-foreground font-medium">{fileName}</span>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); setFileName(""); onDataLoaded([]); }}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Upload className="w-5 h-5 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Arraste ou clique para enviar</p>
              <p className="text-[10px] text-muted-foreground">.csv, .xlsx, .xls</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default FileUploadCard;

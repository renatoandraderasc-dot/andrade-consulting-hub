import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Trash2, Camera, Save } from "lucide-react";
import andradeLogo from "@/assets/andrade-logo.png";

interface Department {
  id: string;
  name: string;
  sort_order: number;
}

interface Question {
  id: string;
  department_id: string;
  text: string;
  points: number;
  sort_order: number;
  requires_photo: boolean;
}

const AdminQuestions = () => {
  const { isAdmin } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [newText, setNewText] = useState("");
  const [newPoints, setNewPoints] = useState(5);
  const [newRequiresPhoto, setNewRequiresPhoto] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [{ data: depts }, { data: qs }] = await Promise.all([
      supabase.from("departments").select("*").order("sort_order"),
      supabase.from("checklist_questions").select("*").order("sort_order"),
    ]);
    setDepartments(depts || []);
    setQuestions(qs || []);
    if (depts && depts.length > 0 && !selectedDept) {
      setSelectedDept(depts[0].id);
    }
    setLoading(false);
  };

  const addQuestion = async () => {
    if (!newText.trim() || !selectedDept) return;
    const maxOrder = questions
      .filter((q) => q.department_id === selectedDept)
      .reduce((max, q) => Math.max(max, q.sort_order), 0);

    const { error } = await supabase.from("checklist_questions").insert({
      department_id: selectedDept,
      text: newText.trim(),
      points: newPoints,
      sort_order: maxOrder + 1,
      requires_photo: newRequiresPhoto,
    });

    if (!error) {
      setNewText("");
      setNewPoints(5);
      setNewRequiresPhoto(false);
      fetchData();
    }
  };

  const deleteQuestion = async (id: string) => {
    await supabase.from("checklist_questions").delete().eq("id", id);
    fetchData();
  };

  const updateQuestion = async (id: string, updates: Partial<Question>) => {
    await supabase.from("checklist_questions").update(updates).eq("id", id);
    fetchData();
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Acesso restrito a administradores.</p>
      </div>
    );
  }

  const filteredQuestions = questions.filter((q) => q.department_id === selectedDept);

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/checklist" className="flex items-center gap-2">
            <img src={andradeLogo} alt="Logo" className="h-10" />
          </Link>
          <Link to="/checklist" className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-body text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar ao Checklist
          </Link>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-10 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="font-display text-3xl font-bold mb-2">
            Gerenciar <span className="text-gradient-gold">Perguntas</span>
          </h1>
          <p className="text-muted-foreground font-body">Adicione, edite ou remova perguntas do checklist.</p>
        </motion.div>

        {/* Department tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {departments.map((dept) => (
            <button
              key={dept.id}
              onClick={() => setSelectedDept(dept.id)}
              className={`px-4 py-2 rounded-lg font-body text-sm transition-colors ${
                selectedDept === dept.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {dept.name}
            </button>
          ))}
        </div>

        {/* Add question form */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <h2 className="font-display text-lg font-semibold mb-4">Nova Pergunta</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-body">Texto da pergunta</Label>
              <Input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Ex: Verificar limpeza do setor" />
            </div>
            <div className="flex gap-4 items-end flex-wrap">
              <div className="space-y-2">
                <Label className="font-body">Pontos</Label>
                <Input type="number" value={newPoints} onChange={(e) => setNewPoints(Number(e.target.value))} className="w-24" min={1} max={10} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input type="checkbox" checked={newRequiresPhoto} onChange={(e) => setNewRequiresPhoto(e.target.checked)} className="rounded" />
                <Camera className="w-4 h-4 text-muted-foreground" />
                <span className="font-body text-sm">Exigir foto</span>
              </label>
              <button
                onClick={addQuestion}
                className="bg-gradient-gold text-primary-foreground font-body font-semibold px-5 py-2 rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" /> Adicionar
              </button>
            </div>
          </div>
        </div>

        {/* Questions list */}
        <div className="space-y-3">
          {loading ? (
            <p className="text-muted-foreground font-body text-center py-8">Carregando...</p>
          ) : filteredQuestions.length === 0 ? (
            <p className="text-muted-foreground font-body text-center py-8">Nenhuma pergunta neste departamento.</p>
          ) : (
            filteredQuestions.map((q, i) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-4"
              >
                <div className="flex-1 space-y-2">
                  <Input
                    value={q.text}
                    onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                    className="bg-transparent border-none font-body text-sm"
                  />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Input
                    type="number"
                    value={q.points}
                    onChange={(e) => updateQuestion(q.id, { points: Number(e.target.value) })}
                    className="w-16 text-center"
                    min={1}
                    max={10}
                  />
                  <label className="cursor-pointer" title="Exigir foto">
                    <input
                      type="checkbox"
                      checked={q.requires_photo}
                      onChange={(e) => updateQuestion(q.id, { requires_photo: e.target.checked })}
                      className="sr-only peer"
                    />
                    <Camera className={`w-5 h-5 ${q.requires_photo ? "text-primary" : "text-muted-foreground"}`} />
                  </label>
                  <button onClick={() => deleteQuestion(q.id)} className="text-destructive hover:text-destructive/80 transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminQuestions;

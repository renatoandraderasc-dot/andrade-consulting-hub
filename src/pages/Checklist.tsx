import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckSquare, ArrowLeft, RotateCcw, Camera, LogOut, Settings } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  requires_photo: boolean;
}

interface CheckState {
  [questionId: string]: {checked: boolean;photoUrl?: string;};
}

const getScoreColor = (pct: number) => {
  if (pct >= 80) return "text-green-400";
  if (pct >= 50) return "text-yellow-400";
  return "text-red-400";
};

const getScoreLabel = (pct: number) => {
  if (pct >= 80) return "Excelente";
  if (pct >= 50) return "Regular";
  return "Precisa Melhorar";
};

const Checklist = () => {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [checkState, setCheckState] = useState<CheckState>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    const [{ data: depts }, { data: qs }] = await Promise.all([
    supabase.from("departments").select("*").order("sort_order"),
    supabase.from("checklist_questions").select("*").order("sort_order")]
    );
    setDepartments(depts || []);
    setQuestions(qs || []);
    if (depts && depts.length > 0 && !selectedDept) {
      setSelectedDept(depts[0].id);
    }
    setLoading(false);
  };

  const toggleCheck = (qId: string) => {
    setCheckState((prev) => ({
      ...prev,
      [qId]: { ...prev[qId], checked: !prev[qId]?.checked }
    }));
  };

  const handlePhotoUpload = async (qId: string, file: File) => {
    setUploading(qId);
    const path = `${user!.id}/${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage.
    from("checklist-photos").
    upload(path, file);

    if (!error && data) {
      const { data: urlData } = supabase.storage.
      from("checklist-photos").
      getPublicUrl(data.path);
      setCheckState((prev) => ({
        ...prev,
        [qId]: { ...prev[qId], checked: true, photoUrl: urlData.publicUrl }
      }));
    }
    setUploading(null);
  };

  const deptQuestions = questions.filter((q) => q.department_id === selectedDept);
  const totalPoints = deptQuestions.reduce((s, q) => s + q.points, 0);
  const earnedPoints = deptQuestions.
  filter((q) => checkState[q.id]?.checked).
  reduce((s, q) => s + q.points, 0);
  const percentage = totalPoints > 0 ? Math.round(earnedPoints / totalPoints * 100) : 0;

  const resetAll = () => setCheckState({});

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>);

  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={andradeLogo} alt="Logo" className="h-10" />
          </Link>
          <div className="flex items-center gap-4">
            {isAdmin &&
            <Link
              to="/admin/questions"
              className="flex items-center gap-1 text-primary font-body text-sm hover:opacity-80 transition-opacity">

                <Settings className="w-4 h-4" /> Gerenciar
              </Link>
            }
            <Link
              to="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-body text-sm transition-colors">

              <ArrowLeft className="w-4 h-4" /> Site
            </Link>
            <button
              onClick={signOut}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-body text-sm transition-colors">

              <LogOut className="w-4 h-4" /> Sair
            </button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-10 max-w-4xl">
        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <CheckSquare className="w-8 h-8 text-primary" />
            <h1 className="font-display text-3xl md:text-4xl font-bold">
              Checklist <span className="text-gradient-gold">Supermercado Maninho</span>
            </h1>
          </div>
          <p className="text-muted-foreground font-body">
            Selecione o departamento e marque os itens concluídos.
          </p>
        </motion.div>

        {/* Department tabs */}
        <div className="flex gap-2 mb-6 flex-wrap justify-center">
          {departments.map((dept) =>
          <button
            key={dept.id}
            onClick={() => setSelectedDept(dept.id)}
            className={`px-5 py-2.5 rounded-xl font-body text-sm font-semibold transition-all ${
            selectedDept === dept.id ?
            "bg-gradient-gold text-primary-foreground shadow-lg" :
            "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"}`
            }>

              {dept.name}
            </button>
          )}
        </div>

        {/* Score Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-6">

          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--primary))" strokeWidth="8"
                  strokeLinecap="round" strokeDasharray={`${percentage * 2.64} 264`}
                  className="transition-all duration-500" />

              </svg>
              <span className={`absolute inset-0 flex items-center justify-center font-display text-xl font-bold ${getScoreColor(percentage)}`}>
                {percentage}%
              </span>
            </div>
            <div>
              <p className="font-body text-muted-foreground text-sm">Pontuação</p>
              <p className="font-display text-2xl font-bold">
                {earnedPoints} <span className="text-muted-foreground text-base font-body">/ {totalPoints} pts</span>
              </p>
              <p className={`font-body text-sm font-semibold ${getScoreColor(percentage)}`}>
                {getScoreLabel(percentage)}
              </p>
            </div>
          </div>
          <button
            onClick={resetAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 font-body text-sm transition-colors">

            <RotateCcw className="w-4 h-4" /> Resetar
          </button>
        </motion.div>

        {/* Questions */}
        {deptQuestions.length === 0 ?
        <p className="text-muted-foreground font-body text-center py-12">
            Nenhuma pergunta cadastrada neste departamento.
          </p> :

        <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-display text-lg font-semibold">
                {departments.find((d) => d.id === selectedDept)?.name}
              </h2>
            </div>
            <div className="divide-y divide-border">
              {deptQuestions.map((q) => {
              const state = checkState[q.id] || { checked: false };
              return (
                <div key={q.id} className="px-6 py-4">
                    <label className="flex items-center gap-4 cursor-pointer">
                      <input
                      type="checkbox"
                      checked={state.checked}
                      onChange={() => toggleCheck(q.id)}
                      className="sr-only peer" />

                      <div className="w-6 h-6 rounded-md border-2 border-muted-foreground peer-checked:border-primary peer-checked:bg-primary flex items-center justify-center shrink-0 transition-colors">
                        {state.checked &&
                      <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                      }
                      </div>
                      <span className={`font-body text-sm flex-1 transition-colors ${state.checked ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {q.text}
                      </span>
                      <span className="font-body text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-full">
                        {q.points} pts
                      </span>
                    </label>

                    {/* Photo upload */}
                    {q.requires_photo &&
                  <div className="ml-10 mt-3">
                        {state.photoUrl ?
                    <div className="flex items-center gap-3">
                            <img src={state.photoUrl} alt="Foto" className="w-20 h-20 rounded-lg object-cover border border-border" />
                            <span className="text-green-400 font-body text-xs">Foto enviada ✓</span>
                          </div> :

                    <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-primary font-body text-xs transition-colors">
                            <Camera className="w-4 h-4" />
                            {uploading === q.id ? "Enviando..." : "Enviar foto"}
                            <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePhotoUpload(q.id, file);
                        }} />

                          </label>
                    }
                      </div>
                  }
                  </div>);

            })}
            </div>
          </div>
        }
      </div>
    </div>);

};

export default Checklist;
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { CheckSquare, RotateCcw, Camera, Send, History, ClipboardList, User, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import ClientLayout from "@/components/ClientLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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

interface ScoreState {
  [questionId: string]: { score: number; photoUrl?: string; photoPath?: string };
}

interface SubmissionRecord {
  id: string;
  completed_at: string;
  department_name: string;
  store_name: string;
  user_name: string;
  total_score: number;
  max_score: number;
  answers: { text: string; score: number; max_points: number; photoUrl?: string | null }[];
}

const SCORE_OPTIONS = [5, 6, 7, 8, 9, 10];

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
  const { toast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [scoreState, setScoreState] = useState<ScoreState>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [storeName, setStoreName] = useState<string>("");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [accessApproved, setAccessApproved] = useState<boolean | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    const { data: access } = await supabase
      .from("user_store_access")
      .select("store_id, approved, stores(id, name)")
      .eq("user_id", user!.id)
      .limit(1);

    if (access && access.length > 0) {
      const a = access[0] as any;
      setAccessApproved(a.approved);
      setStoreId(a.store_id);
      setStoreName(a.stores?.name || "");
    } else {
      setAccessApproved(null);
    }

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

  const fetchHistory = async () => {
    if (!user) return;
    setLoadingHistory(true);

    const query = isAdmin
      ? supabase
          .from("checklist_submissions")
          .select("id, completed_at, department_id, store_id, user_id")
          .order("completed_at", { ascending: false })
          .limit(50)
      : supabase
          .from("checklist_submissions")
          .select("id, completed_at, department_id, store_id, user_id")
          .eq("user_id", user.id)
          .order("completed_at", { ascending: false })
          .limit(50);

    const { data: subs } = await query;
    if (!subs || subs.length === 0) {
      setSubmissions([]);
      setLoadingHistory(false);
      return;
    }

    // Fetch all answers for these submissions
    const subIds = subs.map((s) => s.id);
    const { data: allAnswers } = await supabase
      .from("checklist_answers")
      .select("submission_id, question_id, score, checked, photo_url, checklist_questions(text, points)")
      .in("submission_id", subIds);

    // Normaliza para caminho do bucket (dados antigos guardaram URL assinada expirada)
    const toPath = (v?: string | null) => {
      if (!v) return null;
      const marker = "/checklist-photos/";
      const i = v.indexOf(marker);
      const raw = i >= 0 ? v.slice(i + marker.length) : v;
      return raw.split("?")[0];
    };
    const paths = [...new Set((allAnswers || []).map((a: any) => toPath(a.photo_url)).filter(Boolean))] as string[];
    const signedMap: Record<string, string> = {};
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage.from("checklist-photos").createSignedUrls(paths, 3600);
      (signed || []).forEach((s: any) => {
        if (s.path && s.signedUrl) signedMap[s.path] = s.signedUrl;
      });
    }

    // Fetch store names
    const storeIds = [...new Set(subs.map((s) => s.store_id).filter(Boolean))] as string[];
    const { data: stores } = storeIds.length > 0
      ? await supabase.from("stores").select("id, name").in("id", storeIds)
      : { data: [] };

    // Fetch department names
    const deptIds = [...new Set(subs.map((s) => s.department_id))];
    const { data: depts } = await supabase.from("departments").select("id, name").in("id", deptIds);

    // Fetch user profiles
    const userIds = [...new Set(subs.map((s) => s.user_id))];
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);

    const storeMap = Object.fromEntries((stores || []).map((s) => [s.id, s.name]));
    const deptMap = Object.fromEntries((depts || []).map((d) => [d.id, d.name]));
    const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p.full_name || "Usuário"]));

    const records: SubmissionRecord[] = subs.map((sub) => {
      const subAnswers = (allAnswers || []).filter((a) => a.submission_id === sub.id);
      const totalScore = subAnswers.reduce((s, a) => {
        const pts = (a as any).checklist_questions?.points || 0;
        return s + pts;
      }, 0);
      // Use score if > 0, otherwise fall back to checked boolean for old data
      const earnedScore = subAnswers.reduce((s, a) => {
        const maxPts = (a as any).checklist_questions?.points || 0;
        if ((a as any).score > 0) return s + (a as any).score;
        if ((a as any).checked) return s + maxPts;
        return s;
      }, 0);

      return {
        id: sub.id,
        completed_at: sub.completed_at,
        department_name: deptMap[sub.department_id] || "N/A",
        store_name: sub.store_id ? storeMap[sub.store_id] || "N/A" : "N/A",
        user_name: profileMap[sub.user_id] || "Usuário",
        total_score: earnedScore,
        max_score: totalScore,
        answers: subAnswers.map((a) => ({
          text: (a as any).checklist_questions?.text || "",
          score: (a as any).score > 0 ? (a as any).score : ((a as any).checked ? (a as any).checklist_questions?.points || 0 : 0),
          max_points: (a as any).checklist_questions?.points || 0,
          photoUrl: (() => {
            const p = toPath((a as any).photo_url);
            return p ? signedMap[p] || null : null;
          })(),
        })),
      };
    });

    setSubmissions(records);
    setLoadingHistory(false);
  };

  const setScore = (qId: string, score: number) => {
    setScoreState((prev) => ({
      ...prev,
      [qId]: { ...prev[qId], score },
    }));
  };

  const handlePhotoUpload = async (qId: string, file: File) => {
    setUploading(qId);
    const path = `${user!.id}/${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage.from("checklist-photos").upload(path, file);
    if (!error && data) {
      // Store the path and get a signed URL for preview
      const { data: signedData } = await supabase.storage.from("checklist-photos").createSignedUrl(data.path, 3600);
      setScoreState((prev) => ({
        ...prev,
        [qId]: {
          ...prev[qId],
          score: prev[qId]?.score || 5,
          photoUrl: signedData?.signedUrl || undefined,
          photoPath: data.path,
        },
      }));
    } else {
      toast({ title: "Erro ao enviar foto", description: error?.message || "Tente novamente.", variant: "destructive" });
    }
    setUploading(null);
  };

  const handleSubmit = async () => {
    if (!user || !selectedDept) return;

    const deptQs = questions.filter((q) => q.department_id === selectedDept);
    const unanswered = deptQs.filter((q) => !scoreState[q.id] || scoreState[q.id].score === 0);
    if (unanswered.length > 0) {
      toast({ title: "Preencha todos os itens", description: `${unanswered.length} item(ns) sem nota.`, variant: "destructive" });
      return;
    }

    const semFoto = deptQs.filter((q) => q.requires_photo && !scoreState[q.id]?.photoPath);
    if (semFoto.length > 0) {
      toast({ title: "Foto obrigatória", description: `${semFoto.length} item(ns) exigem foto tirada na hora.`, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { data: submission, error: subError } = await supabase
        .from("checklist_submissions")
        .insert({
          user_id: user.id,
          department_id: selectedDept,
          store_id: storeId,
        })
        .select()
        .single();

      if (subError || !submission) throw subError;

      const answers = deptQs.map((q) => ({
        submission_id: submission.id,
        question_id: q.id,
        checked: (scoreState[q.id]?.score || 0) >= 5,
        score: scoreState[q.id]?.score || 0,
        photo_url: scoreState[q.id]?.photoUrl || null,
      }));

      const { error: ansError } = await supabase.from("checklist_answers").insert(answers);
      if (ansError) throw ansError;

      try {
        await supabase.functions.invoke("send-checklist-email", {
          body: { submission_id: submission.id },
        });
      } catch {
        // email failure is not critical
      }

      toast({
        title: "Checklist enviado!",
        description: `Departamento ${departments.find((d) => d.id === selectedDept)?.name} salvo com sucesso.`,
      });

      const resetKeys = deptQs.map((q) => q.id);
      setScoreState((prev) => {
        const next = { ...prev };
        resetKeys.forEach((k) => delete next[k]);
        return next;
      });
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err?.message || "Tente novamente.", variant: "destructive" });
    }
    setSubmitting(false);
  };

  const deptQuestions = questions.filter((q) => q.department_id === selectedDept);
  const maxPossible = deptQuestions.length * 10; // max score is 10 per question
  const earnedPoints = deptQuestions.reduce((s, q) => s + (scoreState[q.id]?.score || 0), 0);
  const percentage = maxPossible > 0 ? Math.round((earnedPoints / maxPossible) * 100) : 0;

  const resetAll = () => setScoreState({});

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  if (!isAdmin && accessApproved === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md text-center">
          <h2 className="font-display text-xl font-bold mb-2">Sem acesso</h2>
          <p className="text-muted-foreground font-body text-sm mb-4">
            Você ainda não está vinculado a nenhuma loja. Entre em contato com o administrador.
          </p>
          <button onClick={signOut} className="text-primary font-body text-sm hover:underline">Sair</button>
        </div>
      </div>
    );
  }

  if (!isAdmin && accessApproved === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md text-center">
          <h2 className="font-display text-xl font-bold mb-2">Acesso Pendente</h2>
          <p className="text-muted-foreground font-body text-sm mb-4">
            Seu acesso à loja <strong>{storeName}</strong> está aguardando aprovação do administrador.
          </p>
          <button onClick={signOut} className="text-primary font-body text-sm hover:underline">Sair</button>
        </div>
      </div>
    );
  }

  return (
    <ClientLayout storeName={storeName}>
      <div className="container mx-auto px-6 py-10 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <CheckSquare className="w-8 h-8 text-primary" />
            <h1 className="font-display text-3xl md:text-4xl font-bold">
              Checklist <span className="text-gradient-gold">{storeName || "Loja"}</span>
            </h1>
          </div>
        </motion.div>

        <Tabs defaultValue="checklist" className="w-full" onValueChange={(v) => { if (v === "historico") fetchHistory(); }}>
          <TabsList className="w-full mb-6">
            <TabsTrigger value="checklist" className="flex-1 gap-2">
              <ClipboardList className="w-4 h-4" /> Checklist
            </TabsTrigger>
            <TabsTrigger value="historico" className="flex-1 gap-2">
              <History className="w-4 h-4" /> Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="checklist">
            <p className="text-muted-foreground font-body text-center mb-6">Selecione o departamento e dê uma nota de 5 a 10 para cada item.</p>

            <div className="flex gap-2 mb-6 flex-wrap justify-center">
              {departments.map((dept) => (
                <button
                  key={dept.id}
                  onClick={() => setSelectedDept(dept.id)}
                  className={`px-5 py-2.5 rounded-xl font-body text-sm font-semibold transition-all ${
                    selectedDept === dept.id
                      ? "bg-gradient-gold text-primary-foreground shadow-lg"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                  }`}
                >
                  {dept.name}
                </button>
              ))}
            </div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-border rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="relative w-24 h-24">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                    <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--primary))" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${percentage * 2.64} 264`} className="transition-all duration-500" />
                  </svg>
                  <span className={`absolute inset-0 flex items-center justify-center font-display text-xl font-bold ${getScoreColor(percentage)}`}>{percentage}%</span>
                </div>
                <div>
                  <p className="font-body text-muted-foreground text-sm">Pontuação</p>
                  <p className="font-display text-2xl font-bold">{earnedPoints} <span className="text-muted-foreground text-base font-body">/ {maxPossible} pts</span></p>
                  <p className={`font-body text-sm font-semibold ${getScoreColor(percentage)}`}>{getScoreLabel(percentage)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={resetAll} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 font-body text-sm transition-colors">
                  <RotateCcw className="w-4 h-4" /> Resetar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || deptQuestions.length === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-gold text-primary-foreground font-body text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Send className="w-4 h-4" /> {submitting ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </motion.div>

            {deptQuestions.length === 0 ? (
              <p className="text-muted-foreground font-body text-center py-12">Nenhuma pergunta cadastrada neste departamento.</p>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="font-display text-lg font-semibold">{departments.find((d) => d.id === selectedDept)?.name}</h2>
                </div>
                <div className="divide-y divide-border">
                  {deptQuestions.map((q, idx) => {
                    const state = scoreState[q.id] || { score: 0 };
                    return (
                      <div key={q.id} className="px-6 py-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <span className="font-body text-sm flex-1 text-foreground">
                            <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                            {q.text}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {SCORE_OPTIONS.map((n) => (
                              <button
                                key={n}
                                onClick={() => setScore(q.id, n)}
                                className={`w-9 h-9 rounded-lg font-body text-sm font-bold transition-all ${
                                  state.score === n
                                    ? "bg-primary text-primary-foreground shadow-md scale-110"
                                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                        {q.requires_photo && (
                          <div className="ml-6 mt-3">
                            {state.photoUrl ? (
                              <div className="flex items-center gap-3">
                                <img src={state.photoUrl} alt="Foto" className="w-20 h-20 rounded-lg object-cover border border-border" />
                                <span className="text-green-400 font-body text-xs">Foto enviada ✓</span>
                              </div>
                            ) : (
                              <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-primary font-body text-xs transition-colors">
                                <Camera className="w-4 h-4" />
                                {uploading === q.id ? "Enviando..." : "Enviar foto"}
                                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) handlePhotoUpload(q.id, file); }} />
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="historico">
            {loadingHistory ? (
              <p className="text-muted-foreground font-body text-center py-12">Carregando histórico...</p>
            ) : submissions.length === 0 ? (
              <p className="text-muted-foreground font-body text-center py-12">Nenhum checklist enviado ainda.</p>
            ) : (
              <div className="space-y-4">
                {submissions.map((sub) => {
                  const pct = sub.max_score > 0 ? Math.round((sub.total_score / sub.max_score) * 100) : 0;
                  return (
                    <details key={sub.id} className="bg-card border border-border rounded-2xl overflow-hidden group">
                      <summary className="px-6 py-4 cursor-pointer hover:bg-accent/30 transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                          <div className="flex items-center gap-2 text-sm font-body">
                            <User className="w-4 h-4 text-primary" />
                            <span className="font-semibold">{sub.user_name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm font-body text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            {new Date(sub.completed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                          </div>
                          <span className="font-body text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-semibold">{sub.department_name}</span>
                          <span className="font-body text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">{sub.store_name}</span>
                          <span className={`font-display text-sm font-bold ml-auto ${getScoreColor(pct)}`}>{sub.total_score}/{sub.max_score} ({pct}%)</span>
                        </div>
                      </summary>
                      <div className="px-6 pb-4 border-t border-border">
                        <table className="w-full mt-3">
                          <thead>
                            <tr className="text-xs font-body text-muted-foreground">
                              <th className="text-left py-2">Item</th>
                              <th className="text-right py-2 w-24">Nota</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sub.answers.map((a, i) => (
                              <tr key={i} className="border-t border-border/50">
                                <td className="py-2 font-body text-sm text-foreground">{a.text}</td>
                                <td className="py-2 text-right">
                                  <span className={`font-display text-sm font-bold ${a.score >= 8 ? "text-green-400" : a.score >= 6 ? "text-yellow-400" : "text-red-400"}`}>
                                    {a.score}/{a.max_points}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ClientLayout>
  );
};

export default Checklist;

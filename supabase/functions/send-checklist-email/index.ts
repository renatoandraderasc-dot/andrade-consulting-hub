import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { submission_id } = await req.json();
    if (!submission_id) throw new Error("submission_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch submission with department and store
    const { data: submission } = await supabase
      .from("checklist_submissions")
      .select("*, departments(name), stores(name)")
      .eq("id", submission_id)
      .single();

    if (!submission) throw new Error("Submission not found");

    // Fetch answers with questions
    const { data: answers } = await supabase
      .from("checklist_answers")
      .select("*, checklist_questions(text, points)")
      .eq("submission_id", submission_id);

    // Fetch user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", submission.user_id)
      .single();

    const totalPoints = (answers || []).reduce((s: number, a: any) => s + (a.checklist_questions?.points || 0), 0);
    const earnedPoints = (answers || []).filter((a: any) => a.checked).reduce((s: number, a: any) => s + (a.checklist_questions?.points || 0), 0);
    const pct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

    const storeName = (submission as any).stores?.name || "N/A";
    const deptName = (submission as any).departments?.name || "N/A";
    const userName = profile?.full_name || "Usuário";
    const date = new Date(submission.completed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const itemsHtml = (answers || [])
      .map((a: any) => `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${a.checked ? "✅" : "❌"}</td><td style="padding:4px 8px;border:1px solid #ddd;">${a.checklist_questions?.text}</td><td style="padding:4px 8px;border:1px solid #ddd;">${a.checklist_questions?.points} pts</td></tr>`)
      .join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#b8860b;">Checklist Enviado</h2>
        <p><strong>Loja:</strong> ${storeName}</p>
        <p><strong>Departamento:</strong> ${deptName}</p>
        <p><strong>Usuário:</strong> ${userName}</p>
        <p><strong>Data:</strong> ${date}</p>
        <p><strong>Pontuação:</strong> ${earnedPoints}/${totalPoints} (${pct}%)</p>
        <table style="border-collapse:collapse;width:100%;margin-top:16px;">
          <thead><tr style="background:#f5f5f5;"><th style="padding:4px 8px;border:1px solid #ddd;">Status</th><th style="padding:4px 8px;border:1px solid #ddd;">Item</th><th style="padding:4px 8px;border:1px solid #ddd;">Pts</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
      </div>
    `;

    if (resendKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: "Andrade Checklist <onboarding@resend.dev>",
          to: ["renatoandraderasc@gmail.com"],
          subject: `Checklist ${deptName} - ${storeName} (${pct}%)`,
          html,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(supabaseUrl, serviceKey);

async function requireAdmin(authHeader: string | null) {
  if (!authHeader) throw new Error("No auth");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin");
  if (!roles || roles.length === 0) throw new Error("Forbidden: admin only");
  return user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAdmin(req.headers.get("Authorization"));
    const { action, payload } = await req.json();

    switch (action) {
      case "list": {
        // Listar todos os usuários
        const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const userIds = users.map((u) => u.id);
        const [{ data: profiles }, { data: roles }, { data: stores }, { data: modules }] = await Promise.all([
          admin.from("profiles").select("user_id, full_name, blocked").in("user_id", userIds),
          admin.from("user_roles").select("user_id, role").in("user_id", userIds),
          admin.from("user_store_access").select("user_id, store_id, approved, stores(name)").in("user_id", userIds),
          admin.from("user_module_access").select("user_id, module, allowed").in("user_id", userIds),
        ]);
        return Response.json(
          { users: users.map((u) => ({
            id: u.id,
            email: u.email,
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at,
            email_confirmed_at: u.email_confirmed_at,
            profile: profiles?.find((p) => p.user_id === u.id) || null,
            roles: roles?.filter((r) => r.user_id === u.id).map((r) => r.role) || [],
            stores: stores?.filter((s) => s.user_id === u.id) || [],
            modules: modules?.filter((m) => m.user_id === u.id) || [],
          })) },
          { headers: corsHeaders }
        );
      }
      case "create": {
        const { email, password, full_name, store_ids = [], modules = [], is_admin = false } = payload;
        const { data, error } = await admin.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { full_name },
        });
        if (error) throw error;
        const uid = data.user!.id;
        // Garantir profile/role (trigger handle_new_user já cria)
        await admin.from("profiles").upsert({ user_id: uid, full_name }, { onConflict: "user_id" });
        if (is_admin) {
          await admin.from("user_roles").upsert({ user_id: uid, role: "admin" }, { onConflict: "user_id,role" });
        }
        if (store_ids.length) {
          await admin.from("user_store_access").insert(
            store_ids.map((sid: string) => ({ user_id: uid, store_id: sid, approved: true }))
          );
        }
        if (modules.length) {
          await admin.from("user_module_access").insert(
            modules.map((m: string) => ({ user_id: uid, module: m, allowed: true }))
          );
        }
        return Response.json({ user: data.user }, { headers: corsHeaders });
      }
      case "set_password": {
        const { user_id, password } = payload;
        const { error } = await admin.auth.admin.updateUserById(user_id, { password });
        if (error) throw error;
        return Response.json({ ok: true }, { headers: corsHeaders });
      }
      case "update_user": {
        const { user_id, email, full_name } = payload;
        if (email) {
          const { error } = await admin.auth.admin.updateUserById(user_id, { email, email_confirm: true });
          if (error) throw error;
        }
        if (typeof full_name === "string") {
          await admin.from("profiles").update({ full_name }).eq("user_id", user_id);
        }
        return Response.json({ ok: true }, { headers: corsHeaders });
      }
      case "set_blocked": {
        const { user_id, blocked } = payload;
        await admin.from("profiles").update({ blocked }).eq("user_id", user_id);
        // Banir/desbanir sessão via auth admin
        await admin.auth.admin.updateUserById(user_id, {
          ban_duration: blocked ? "876000h" : "none",
        } as any);
        return Response.json({ ok: true }, { headers: corsHeaders });
      }
      case "set_admin": {
        const { user_id, is_admin } = payload;
        if (is_admin) {
          await admin.from("user_roles").upsert({ user_id, role: "admin" }, { onConflict: "user_id,role" });
        } else {
          await admin.from("user_roles").delete().eq("user_id", user_id).eq("role", "admin");
        }
        return Response.json({ ok: true }, { headers: corsHeaders });
      }
      case "set_modules": {
        const { user_id, modules } = payload as { user_id: string; modules: { module: string; allowed: boolean }[] };
        await admin.from("user_module_access").delete().eq("user_id", user_id);
        if (modules.length) {
          await admin.from("user_module_access").insert(
            modules.map((m) => ({ user_id, module: m.module, allowed: m.allowed }))
          );
        }
        return Response.json({ ok: true }, { headers: corsHeaders });
      }
      case "set_stores": {
        const { user_id, store_ids } = payload as { user_id: string; store_ids: string[] };
        await admin.from("user_store_access").delete().eq("user_id", user_id);
        if (store_ids.length) {
          await admin.from("user_store_access").insert(
            store_ids.map((sid) => ({ user_id, store_id: sid, approved: true }))
          );
        }
        return Response.json({ ok: true }, { headers: corsHeaders });
      }
      case "delete_user": {
        const { user_id } = payload;
        const { error } = await admin.auth.admin.deleteUser(user_id);
        if (error) throw error;
        return Response.json({ ok: true }, { headers: corsHeaders });
      }
      default:
        return Response.json({ error: "Unknown action" }, { status: 400, headers: corsHeaders });
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400, headers: corsHeaders });
  }
});

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createDemoState, isDemoState, type DemoState } from "@/lib/demo/model";
import { toast } from "sonner";

type DemoContextType = { state: DemoState; update: (change: (previous: DemoState) => DemoState) => void; reset: () => void; saving: boolean; ready: boolean; saveError: boolean };
const DemoContext = createContext<DemoContextType | null>(null);
export function DemoWorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, isDemo } = useAuth();
  const [state, setState] = useState<DemoState>(createDemoState);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const changed = useRef(false);
  const revision = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    setReady(false); changed.current = false;
    if (!isDemo || !user) return;
    let active = true;
    supabase.from("demo_workspaces").select("data").eq("user_id", user.id).single().then(({ data, error }) => {
      if (!active) return;
      if (error) { setSaveError(true); toast.error("Não foi possível abrir os dados salvos da demonstração."); return; }
      if (isDemoState(data.data)) setState(data.data);
      else { changed.current = true; revision.current += 1; setState(createDemoState()); }
      setSaveError(false); setReady(true);
    });
    return () => { active = false; };
  }, [isDemo, user?.id]);
  useEffect(() => {
    if (!isDemo || !user || !ready || !changed.current) return;
    const uid = user.id;
    const currentRevision = revision.current;
    setSaving(true);
    // Serialize writes: a slower save may never replace a more recent edit.
    queue.current = queue.current.catch(() => {}).then(async () => {
      const { data, error } = await supabase.from("demo_workspaces").update({ data: JSON.parse(JSON.stringify(state)), updated_at: new Date().toISOString() }).eq("user_id", uid).select("user_id").single();
      if (currentRevision !== revision.current) return;
      setSaving(false);
      setSaveError(!!error || !data);
      if (error || !data) toast.error("A alteração ainda não foi salva. Verifique sua conexão.");
    });
  }, [state, isDemo, user?.id, ready]);
  const update = (change: (previous: DemoState) => DemoState) => { changed.current = true; revision.current += 1; setState(change); };
  return <DemoContext.Provider value={{ state, update, reset: () => update(() => createDemoState()), saving, ready, saveError }}>{children}</DemoContext.Provider>;
}
export function useDemoWorkspace() {
  const value = useContext(DemoContext);
  if (!value) throw new Error("DemoWorkspaceProvider is required");
  return value;
}
-- =====================================================================
-- ESCALA V2 (Escala IA) — Andrade Consulting Hub
-- Cria SOMENTE objetos novos com prefixo escala2_.
-- Nenhuma tabela, função, política ou dado da Escala atual é alterado.
-- Pode ser aplicada mais de uma vez sem erro.
-- =====================================================================

-- ---------------------------------------------------------------- acesso
CREATE OR REPLACE FUNCTION public.escala2_tem_acesso(p_store uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.user_store_access WHERE user_id = auth.uid() AND store_id = p_store AND approved)
$$;

-- Gere a escala quem é admin, supervisor, ou tem o módulo "Escala IA"
-- (escala_v2) ou "Admin: Escala" (admin_escala) liberado na loja.
CREATE OR REPLACE FUNCTION public.escala2_pode_gerir(p_store uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR (public.escala2_tem_acesso(p_store)
          AND (public.is_supervisor(auth.uid())
               OR EXISTS (SELECT 1 FROM public.user_module_access
                           WHERE user_id = auth.uid() AND module IN ('escala_v2', 'admin_escala') AND allowed)))
$$;
REVOKE ALL ON FUNCTION public.escala2_tem_acesso(uuid), public.escala2_pode_gerir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala2_tem_acesso(uuid), public.escala2_pode_gerir(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- tabelas
CREATE TABLE IF NOT EXISTS public.escala2_regras (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  -- horário de funcionamento, setores, movimento por dia e opções de CCT (ver RegrasLoja no código)
  regras jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(regras) = 'object'),
  instrucoes_ia text CHECK (instrucoes_ia IS NULL OR length(instrucoes_ia) <= 4000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.escala2_pessoas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 120),
  setor text NOT NULL CHECK (length(trim(setor)) BETWEEN 1 AND 60),
  cargo text,
  turno text NOT NULL DEFAULT 'auto' CHECK (turno IN ('auto', 'abertura', 'intermediario', 'fechamento')),
  folga_fixa smallint CHECK (folga_fixa BETWEEN 0 AND 6),
  carga_semanal numeric(4,1) CHECK (carga_semanal BETWEEN 4 AND 44),
  nascimento date,
  aprendiz boolean NOT NULL DEFAULT false,
  domingo_quinzenal boolean NOT NULL DEFAULT false,
  admissao date,
  desligamento date,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_escala2_pessoas_store ON public.escala2_pessoas (store_id, setor, nome);

CREATE TABLE IF NOT EXISTS public.escala2_ausencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.escala2_pessoas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('FER', 'AT', 'AF')),
  inicio date NOT NULL,
  fim date NOT NULL CHECK (fim >= inicio),
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_escala2_ausencias_store ON public.escala2_ausencias (store_id, inicio, fim);

-- Feriados estaduais/municipais da loja e a decisão de abrir ou não em cada feriado.
-- Os feriados nacionais são calculados pelo sistema; aqui só entra o que a loja cadastra.
CREATE TABLE IF NOT EXISTS public.escala2_feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  data date NOT NULL,
  nome text NOT NULL,
  loja_abre boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, data)
);

CREATE TABLE IF NOT EXISTS public.escala2_meses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  ano smallint NOT NULL CHECK (ano BETWEEN 2024 AND 2100),
  mes smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicada')),
  erros int NOT NULL DEFAULT 0 CHECK (erros >= 0),
  alertas int NOT NULL DEFAULT 0 CHECK (alertas >= 0),
  parecer_ia text,
  gerada_em timestamptz,
  gerada_por uuid,
  publicada_em timestamptz,
  publicada_por uuid,
  justificativa text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, ano, mes)
);

CREATE TABLE IF NOT EXISTS public.escala2_dias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_id uuid NOT NULL REFERENCES public.escala2_meses(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.escala2_pessoas(id) ON DELETE CASCADE,
  data date NOT NULL,
  -- T trabalho · F folga · FR feriado · FER férias · AT atestado · AF afastado
  tipo text NOT NULL CHECK (tipo IN ('T', 'F', 'FR', 'FER', 'AT', 'AF')),
  inicio time,
  fim time,
  intervalo_min smallint CHECK (intervalo_min BETWEEN 0 AND 240),
  travado boolean NOT NULL DEFAULT false,
  manual boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (pessoa_id, data)
);
CREATE INDEX IF NOT EXISTS ix_escala2_dias_mes ON public.escala2_dias (mes_id);
CREATE INDEX IF NOT EXISTS ix_escala2_dias_store_data ON public.escala2_dias (store_id, data);

-- ---------------------------------------------------------------- permissões e RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['escala2_regras', 'escala2_pessoas', 'escala2_ausencias', 'escala2_feriados', 'escala2_meses', 'escala2_dias'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_ler', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_gerir', t);
    EXECUTE format('DROP POLICY IF EXISTS demo_production_isolation ON public.%I', t);
    -- contas de demonstração nunca enxergam dados reais (regra do Hub para toda tabela nova)
    EXECUTE format('CREATE POLICY demo_production_isolation ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_demo_account()) WITH CHECK (NOT public.is_demo_account())', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.escala2_pode_gerir(store_id)) WITH CHECK (public.escala2_pode_gerir(store_id))', t || '_gerir', t);
  END LOOP;
END $$;

-- Leitura por quem tem acesso à loja: regras, equipe e feriados.
CREATE POLICY escala2_regras_ler ON public.escala2_regras FOR SELECT TO authenticated USING (public.escala2_tem_acesso(store_id));
CREATE POLICY escala2_pessoas_ler ON public.escala2_pessoas FOR SELECT TO authenticated USING (public.escala2_tem_acesso(store_id));
CREATE POLICY escala2_feriados_ler ON public.escala2_feriados FOR SELECT TO authenticated USING (public.escala2_tem_acesso(store_id));
-- Férias, atestados e afastamentos: só quem gere a escala (sem política de leitura ampla).
-- Escala do mês: quem gere vê sempre; os demais só depois de publicada.
CREATE POLICY escala2_meses_ler ON public.escala2_meses FOR SELECT TO authenticated
  USING (status = 'publicada' AND public.escala2_tem_acesso(store_id));
CREATE POLICY escala2_dias_ler ON public.escala2_dias FOR SELECT TO authenticated
  USING (public.escala2_tem_acesso(store_id)
         AND EXISTS (SELECT 1 FROM public.escala2_meses m WHERE m.id = mes_id AND m.status = 'publicada'));

-- ---------------------------------------------------------------- integridade
CREATE OR REPLACE FUNCTION public.escala2_validar_vinculos() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.escala2_pessoas WHERE id = NEW.pessoa_id AND store_id = NEW.store_id) THEN
    RAISE EXCEPTION 'Funcionário não pertence à loja informada.' USING errcode = 'P0001';
  END IF;
  IF TG_TABLE_NAME = 'escala2_dias' THEN
    IF NOT EXISTS (SELECT 1 FROM public.escala2_meses
                    WHERE id = NEW.mes_id AND store_id = NEW.store_id
                      AND ano = extract(year FROM NEW.data) AND mes = extract(month FROM NEW.data)) THEN
      RAISE EXCEPTION 'A data não pertence ao mês da escala informada.' USING errcode = 'P0001';
    END IF;
    IF NEW.tipo = 'T' AND (NEW.inicio IS NULL OR NEW.fim IS NULL) THEN
      RAISE EXCEPTION 'Dia de trabalho precisa de horário de entrada e saída.' USING errcode = 'P0001';
    END IF;
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS escala2_ausencias_vinculo ON public.escala2_ausencias;
CREATE TRIGGER escala2_ausencias_vinculo BEFORE INSERT OR UPDATE ON public.escala2_ausencias
  FOR EACH ROW EXECUTE FUNCTION public.escala2_validar_vinculos();
DROP TRIGGER IF EXISTS escala2_dias_vinculo ON public.escala2_dias;
CREATE TRIGGER escala2_dias_vinculo BEFORE INSERT OR UPDATE ON public.escala2_dias
  FOR EACH ROW EXECUTE FUNCTION public.escala2_validar_vinculos();

-- Escala publicada não muda: é preciso reabrir antes.
CREATE OR REPLACE FUNCTION public.escala2_bloqueia_publicada() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.escala2_meses
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.mes_id ELSE NEW.mes_id END FOR UPDATE;
  IF v_status = 'publicada' THEN
    RAISE EXCEPTION 'Escala publicada não pode ser alterada. Use Reabrir.' USING errcode = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS escala2_dias_bloqueio ON public.escala2_dias;
CREATE TRIGGER escala2_dias_bloqueio BEFORE INSERT OR UPDATE OR DELETE ON public.escala2_dias
  FOR EACH ROW EXECUTE FUNCTION public.escala2_bloqueia_publicada();

CREATE OR REPLACE FUNCTION public.escala2_mes_transicao() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'rascunho'; NEW.publicada_em := NULL; NEW.publicada_por := NULL;
    RETURN NEW;
  END IF;
  IF NEW.store_id <> OLD.store_id OR NEW.ano <> OLD.ano OR NEW.mes <> OLD.mes THEN
    RAISE EXCEPTION 'A loja e o mês da escala não podem ser alterados.' USING errcode = 'P0001';
  END IF;
  IF NEW.status = 'publicada' AND OLD.status <> 'publicada' THEN
    IF NOT EXISTS (SELECT 1 FROM public.escala2_dias WHERE mes_id = NEW.id) THEN
      RAISE EXCEPTION 'Gere a escala antes de publicar.' USING errcode = 'P0001';
    END IF;
    IF NEW.erros > 0 AND coalesce(trim(NEW.justificativa), '') = '' THEN
      RAISE EXCEPTION 'Escala com pendência legal só pode ser publicada com justificativa.' USING errcode = 'P0001';
    END IF;
    NEW.publicada_em := now(); NEW.publicada_por := auth.uid();
  ELSIF NEW.status = 'rascunho' THEN
    NEW.publicada_em := NULL; NEW.publicada_por := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS escala2_mes_transicao ON public.escala2_meses;
CREATE TRIGGER escala2_mes_transicao BEFORE INSERT OR UPDATE ON public.escala2_meses
  FOR EACH ROW EXECUTE FUNCTION public.escala2_mes_transicao();

CREATE OR REPLACE FUNCTION public.escala2_carimbo() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_TABLE_NAME = 'escala2_regras' THEN NEW.updated_by := auth.uid(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS escala2_regras_carimbo ON public.escala2_regras;
CREATE TRIGGER escala2_regras_carimbo BEFORE INSERT OR UPDATE ON public.escala2_regras
  FOR EACH ROW EXECUTE FUNCTION public.escala2_carimbo();
DROP TRIGGER IF EXISTS escala2_pessoas_carimbo ON public.escala2_pessoas;
CREATE TRIGGER escala2_pessoas_carimbo BEFORE UPDATE ON public.escala2_pessoas
  FOR EACH ROW EXECUTE FUNCTION public.escala2_carimbo();

-- ---------------------------------------------------------------- gravação da escala gerada
-- Troca, em uma única transação, todos os dias NÃO travados do mês pelos dias gerados.
-- Roda com as permissões de quem chamou (SECURITY INVOKER): o RLS continua valendo.
-- Só grava; não gera nem certifica nada.
CREATE OR REPLACE FUNCTION public.escala2_salvar(
  p_store uuid, p_ano integer, p_mes integer, p_dias jsonb,
  p_erros integer, p_alertas integer, p_parecer text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_mes uuid;
  v_status text;
  v_ini date := make_date(p_ano, p_mes, 1);
  v_fim date := (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date;
BEGIN
  IF NOT public.escala2_pode_gerir(p_store) THEN
    RAISE EXCEPTION 'Sem permissão para gerir a escala desta loja.' USING errcode = 'P0001';
  END IF;
  IF jsonb_typeof(p_dias) <> 'array' OR jsonb_array_length(p_dias) > 20000 THEN
    RAISE EXCEPTION 'Dias da escala inválidos.' USING errcode = 'P0001';
  END IF;
  INSERT INTO public.escala2_meses (store_id, ano, mes) VALUES (p_store, p_ano, p_mes)
    ON CONFLICT (store_id, ano, mes) DO NOTHING;
  SELECT id, status INTO v_mes, v_status FROM public.escala2_meses
   WHERE store_id = p_store AND ano = p_ano AND mes = p_mes FOR UPDATE;
  IF v_status = 'publicada' THEN
    RAISE EXCEPTION 'Reabra a escala antes de gerar novamente.' USING errcode = 'P0001';
  END IF;
  DELETE FROM public.escala2_dias WHERE mes_id = v_mes AND NOT travado;
  INSERT INTO public.escala2_dias (mes_id, store_id, pessoa_id, data, tipo, inicio, fim, intervalo_min, travado, manual)
  SELECT v_mes, p_store, (v->>'pessoa_id')::uuid, (v->>'data')::date, v->>'tipo',
         nullif(v->>'inicio', '')::time, nullif(v->>'fim', '')::time, nullif(v->>'intervalo_min', '')::smallint,
         false, false
    FROM jsonb_array_elements(p_dias) AS a(v)
   WHERE (v->>'data')::date BETWEEN v_ini AND v_fim
     AND NOT coalesce((v->>'travado')::boolean, false)
     AND EXISTS (SELECT 1 FROM public.escala2_pessoas p WHERE p.id = (v->>'pessoa_id')::uuid AND p.store_id = p_store)
  ON CONFLICT (pessoa_id, data) DO NOTHING;
  UPDATE public.escala2_meses
     SET gerada_em = now(), gerada_por = auth.uid(), erros = greatest(p_erros, 0), alertas = greatest(p_alertas, 0),
         parecer_ia = left(p_parecer, 8000)
   WHERE id = v_mes;
  RETURN v_mes;
END $$;
REVOKE ALL ON FUNCTION public.escala2_salvar(uuid, integer, integer, jsonb, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala2_salvar(uuid, integer, integer, jsonb, integer, integer, text) TO authenticated, service_role;

COMMENT ON TABLE public.escala2_dias IS 'Escala V2: um registro por funcionário e dia. A conferência legal é feita no aplicativo (src/lib/escala-v2); o banco só guarda.';
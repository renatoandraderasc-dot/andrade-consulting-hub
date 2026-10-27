CREATE FUNCTION public.escala_salvar_geracao(p_store uuid,p_ano integer,p_mes integer,p_alocacoes jsonb,p_erros integer,p_alertas integer) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ DECLARE pid uuid; st public.escala_status_periodo; total integer; offset_lote integer; BEGIN
IF NOT public.escala_pode_gerir(p_store) THEN RAISE EXCEPTION 'Sem permissão para gerir a escala desta loja.' USING errcode='P0001'; END IF;
IF jsonb_typeof(p_alocacoes)<>'array' THEN RAISE EXCEPTION 'Alocações inválidas.' USING errcode='P0001'; END IF;
INSERT INTO public.escala_periodos(store_id,ano,mes) VALUES(p_store,p_ano,p_mes) ON CONFLICT(store_id,ano,mes) DO NOTHING;
SELECT id,status INTO pid,st FROM public.escala_periodos WHERE store_id=p_store AND ano=p_ano AND mes=p_mes FOR UPDATE;
IF st='publicada' THEN RAISE EXCEPTION 'Reabra a escala antes de gerar novamente.' USING errcode='P0001'; END IF;
DELETE FROM public.escala_alocacoes WHERE periodo_id=pid AND NOT travado;
total:=jsonb_array_length(p_alocacoes); offset_lote:=0;
WHILE offset_lote<total LOOP
INSERT INTO public.escala_alocacoes(periodo_id,store_id,funcionario_id,data,status,turno_id,inicio,fim,intervalo_min,travado,origem)
SELECT pid,p_store,(v->>'funcionario_id')::uuid,(v->>'data')::date,(v->>'status')::public.escala_status_dia,nullif(v->>'turno_id','')::uuid,nullif(v->>'inicio','')::time,nullif(v->>'fim','')::time,(v->>'intervalo_min')::smallint,false,'auto'
FROM jsonb_array_elements(p_alocacoes) WITH ORDINALITY AS a(v,n) WHERE n>offset_lote AND n<=offset_lote+500 AND NOT coalesce((v->>'travado')::boolean,false)
AND NOT EXISTS(SELECT 1 FROM public.escala_alocacoes old WHERE old.funcionario_id=(v->>'funcionario_id')::uuid AND old.data=(v->>'data')::date AND old.travado);
offset_lote:=offset_lote+500; END LOOP;
UPDATE public.escala_periodos SET gerado_em=now(),gerado_por=auth.uid(),erros=p_erros,alertas=p_alertas WHERE id=pid; RETURN pid;
END $$;
REVOKE ALL ON FUNCTION public.escala_salvar_geracao(uuid,integer,integer,jsonb,integer,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.escala_salvar_geracao(uuid,integer,integer,jsonb,integer,integer) TO authenticated,service_role;
CREATE FUNCTION public.escala_periodo_exclusao() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF OLD.status='publicada' THEN RAISE EXCEPTION 'Reabra a escala antes de excluir o período.' USING errcode='P0001'; END IF; RETURN OLD; END $$;
CREATE TRIGGER escala_periodo_exclusao BEFORE DELETE ON public.escala_periodos FOR EACH ROW EXECUTE FUNCTION public.escala_periodo_exclusao();
CREATE OR REPLACE FUNCTION public.fn_classificar_lancamento(p_tipo_entrada text, p_descricao text, p_observacao text DEFAULT NULL::text)
 RETURNS TABLE(tipo text, subtipo text)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  padrao_tipo constant text := 'Despesas';
  padrao_sub  constant text := 'OUTRAS DESPESAS (ADMINISTRATIVA)';
  txt text;
  cod text;
BEGIN
  txt := lower(concat_ws(' ', p_descricao, p_observacao));
  txt := translate(txt, 'áàâãéêíóôõúç', 'aaaaeeiooouc');

  -- 0) Pagamento a orgao fiscal: nunca e compra de mercadoria, mesmo que o ERP diga.
  IF txt ~ '(ministerio da fazenda|receita federal|secretaria (de estado )?(da |de )?fazenda|sefaz|(^| )darf( |$)|(^| )gps( |$))' THEN
    IF coalesce(trim(p_tipo_entrada), '') <> '' THEN
      SELECT * INTO r FROM fn_classificar_conta(p_tipo_entrada);
      IF r.tipo <> 'Compra do Mês' AND NOT (r.tipo = padrao_tipo AND r.subtipo = padrao_sub) THEN
        RETURN QUERY SELECT r.tipo, r.subtipo; RETURN;
      END IF;
    END IF;
    SELECT * INTO r FROM fn_classificar_conta(regexp_replace(txt,
      'compra de mercadoria para revenda|compra c financeiro[^·]*|mercearia[^·]*|mini mercado[^·]*|supermercado[^·]*', '', 'g'));
    IF r.tipo <> 'Compra do Mês' AND NOT (r.tipo = padrao_tipo AND r.subtipo = padrao_sub) THEN
      RETURN QUERY SELECT r.tipo, r.subtipo; RETURN;
    END IF;
    cod := substring(txt from '(?:doc|darf) 0?(\d{4})(?:\s|$|·)');
    IF cod IN ('2023','8109','6912','8301') THEN RETURN QUERY SELECT 'Impostos','PIS'; RETURN; END IF;
    IF cod IN ('2172','5856','5960') THEN RETURN QUERY SELECT 'Impostos','COFINS'; RETURN; END IF;
    IF cod IN ('0211','0561','1708','3208','0588','5706') THEN RETURN QUERY SELECT 'Impostos','IRRF'; RETURN; END IF;
    IF cod IN ('2362','2089','2372','2484','6012','3373','5993') THEN RETURN QUERY SELECT 'Impostos','8 | IRPJ + CSLL'; RETURN; END IF;
    IF txt ~ '(^| )gps( |$)' THEN RETURN QUERY SELECT 'Despesas','INSS'; RETURN; END IF;
    RETURN QUERY SELECT 'Impostos','OUTROS IMPOSTOS (S/ VENDA)'; RETURN;
  END IF;

  -- 1) Tipo de entrada do ERP
  IF coalesce(trim(p_tipo_entrada), '') <> ''
     AND lower(trim(p_tipo_entrada)) NOT IN ('outros','outro','sem tipo','nao cadastrado','não cadastrado','sem classe','-') THEN
    SELECT * INTO r FROM fn_classificar_conta(p_tipo_entrada);
    IF NOT (r.tipo = padrao_tipo AND r.subtipo = padrao_sub) THEN
      RETURN QUERY SELECT r.tipo, r.subtipo; RETURN;
    END IF;
  END IF;

  -- 2) Texto
  IF coalesce(trim(p_descricao), '') <> '' OR coalesce(trim(p_observacao), '') <> '' THEN
    SELECT * INTO r FROM fn_classificar_conta(concat_ws(' ', p_descricao, p_observacao));
    IF NOT (r.tipo = padrao_tipo AND r.subtipo = padrao_sub) THEN
      RETURN QUERY SELECT r.tipo, r.subtipo; RETURN;
    END IF;
  END IF;

  IF coalesce(trim(p_descricao), '') <> '' THEN
    RETURN QUERY SELECT 'Compra do Mês', 'COMPRA DO MÊS'; RETURN;
  END IF;

  RETURN QUERY SELECT padrao_tipo, padrao_sub;
END;
$function$;
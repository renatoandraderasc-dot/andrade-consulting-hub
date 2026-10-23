CREATE OR REPLACE FUNCTION public.fn_classificar_tipo_extra(p text)
 RETURNS TABLE(tipo text, subtipo text) LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $f$
DECLARE n text;
BEGIN
  n := translate(lower(coalesce(p,'')), 'áàâãéêíóôõúç', 'aaaaeeiooouc');
  IF n ~ 'prefeitura|taxa dare|taxas? municipa|alvara' THEN RETURN QUERY SELECT 'Despesas','TRIBUTOS - MUNICIPAIS (AUTORIZAÇÕES)'; RETURN; END IF;
  IF n ~ 'certificado digital|junta comercial|serasa|cartorio' THEN RETURN QUERY SELECT 'Despesas','MAT. ESC. / CORREIOS / CARTÓRIOS'; RETURN; END IF;
  IF n ~ 'chaveiro|pedreiro|construcao' THEN RETURN QUERY SELECT 'Despesas','MANUTENÇÃO PREDIAL'; RETURN; END IF;
  IF n ~ 'capitalizacao' THEN RETURN QUERY SELECT 'Despesas','DIVERSOS FINANCEIROS'; RETURN; END IF;
  IF n ~ '^agencia|agencia de' THEN RETURN QUERY SELECT 'Despesas','AGÊNCIA/GRAVAÇÃO/LOCUÇÃO'; RETURN; END IF;
  IF n ~ 'assinatura|cartucho|impressora' THEN RETURN QUERY SELECT 'Despesas','SUPRIMENTOS'; RETURN; END IF;
  IF n ~ 'programa de incentivo|despes+as? com pessoal|despesas? pessoal|free ?lanc' THEN RETURN QUERY SELECT 'Despesas','OUTRAS DESPESAS (FUNCIONÁRIOS)'; RETURN; END IF;
  IF n ~ 'refeic' THEN RETURN QUERY SELECT 'Despesas','REFEITÓRIO'; RETURN; END IF;
  IF n ~ 'retirada socio' THEN RETURN QUERY SELECT 'Despesas','PRÓ-LABORE (1%)'; RETURN; END IF;
  IF n ~ '^ativo' THEN RETURN QUERY SELECT 'Despesas','IMOBILIZADO MÁQUINAS E EQUIPAMENTOS'; RETURN; END IF;
  IF n ~ 'cartao interno|sigacred' THEN RETURN QUERY SELECT 'Despesas','TAXAS COM P.O.S. e TEF e OUTROS GASTOS'; RETURN; END IF;
  IF n ~ 'veterinari' THEN RETURN QUERY SELECT 'Despesas','OUTRAS DESPESAS (ADMINISTRATIVA)'; RETURN; END IF;
  IF n ~ 'despesas? (geral|operac|administ)|outras despesas|^outras$|^servicos$' THEN RETURN QUERY SELECT 'Despesas','OUTRAS DESPESAS (ADMINISTRATIVA)'; RETURN; END IF;
  IF n ~ 'boleto de despesa' THEN RETURN QUERY SELECT 'Despesas','OUTRAS DESPESAS (ADMINISTRATIVA)'; RETURN; END IF;
  IF n ~ '^transporte$' THEN RETURN QUERY SELECT 'Despesas','FRETEIROS / ENTREGAS / BUSCAS MERCADORIAS'; RETURN; END IF;
END $f$;

CREATE OR REPLACE FUNCTION public.fn_classificar_lancamento(p_tipo_entrada text, p_descricao text, p_observacao text DEFAULT NULL::text)
 RETURNS TABLE(tipo text, subtipo text)
 LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  padrao_tipo constant text := 'Despesas';
  padrao_sub  constant text := 'OUTRAS DESPESAS (ADMINISTRATIVA)';
  txt text; cod text; te text;
BEGIN
  txt := translate(lower(concat_ws(' ', p_descricao, p_observacao)), 'áàâãéêíóôõúç', 'aaaaeeiooouc');
  te := CASE WHEN p_tipo_entrada ~* 'conforme dcto|^\s*-?\s*$|^(outros?|sem tipo|n[aã]o cadastrado|sem classe|dinheiro)$' THEN NULL ELSE p_tipo_entrada END;

  -- 0) Orgao fiscal: nunca compra de mercadoria
  IF txt ~ '(ministerio da fazenda|receita federal|secretaria (de estado )?(da |de )?fazenda|sefaz|(^| )darf( |$)|(^| )gps( |$))' THEN
    IF te IS NOT NULL THEN
      SELECT * INTO r FROM fn_classificar_conta(te);
      IF r.tipo <> 'Compra do Mês' AND NOT (r.tipo = padrao_tipo AND r.subtipo = padrao_sub) THEN
        RETURN QUERY SELECT r.tipo, r.subtipo; RETURN; END IF;
    END IF;
    SELECT * INTO r FROM fn_classificar_conta(regexp_replace(txt,
      'compra de mercadoria para revenda|compra c financeiro[^·]*|mercearia[^·]*|mini mercado[^·]*|supermercado[^·]*', '', 'g'));
    IF r.tipo <> 'Compra do Mês' AND NOT (r.tipo = padrao_tipo AND r.subtipo = padrao_sub) THEN
      RETURN QUERY SELECT r.tipo, r.subtipo; RETURN; END IF;
    cod := substring(txt from '(?:doc|darf) 0?(\d{4})(?:\s|$|·)');
    IF cod IN ('2023','8109','6912','8301') THEN RETURN QUERY SELECT 'Impostos','PIS'; RETURN; END IF;
    IF cod IN ('2172','5856','5960') THEN RETURN QUERY SELECT 'Impostos','COFINS'; RETURN; END IF;
    IF cod IN ('0211','0561','1708','3208','0588','5706') THEN RETURN QUERY SELECT 'Impostos','IRRF'; RETURN; END IF;
    IF cod IN ('2362','2089','2372','2484','6012','3373','5993') THEN RETURN QUERY SELECT 'Impostos','8 | IRPJ + CSLL'; RETURN; END IF;
    IF txt ~ '(^| )gps( |$)' THEN RETURN QUERY SELECT 'Despesas','INSS'; RETURN; END IF;
    RETURN QUERY SELECT 'Impostos','OUTROS IMPOSTOS (S/ VENDA)'; RETURN;
  END IF;

  -- 1) Tipo de entrada do ERP
  IF te IS NOT NULL THEN
    SELECT * INTO r FROM fn_classificar_tipo_extra(te);
    IF r.tipo IS NOT NULL THEN RETURN QUERY SELECT r.tipo, r.subtipo; RETURN; END IF;
    SELECT * INTO r FROM fn_classificar_conta(te);
    IF NOT (r.tipo = padrao_tipo AND r.subtipo = padrao_sub) THEN
      RETURN QUERY SELECT r.tipo, r.subtipo; RETURN; END IF;
  END IF;

  -- 2) Texto do beneficiario
  IF coalesce(trim(p_descricao), '') <> '' THEN
    SELECT * INTO r FROM fn_classificar_conta(p_descricao);
    IF NOT (r.tipo = padrao_tipo AND r.subtipo = padrao_sub) THEN
      RETURN QUERY SELECT r.tipo, r.subtipo; RETURN; END IF;
    -- 3) Fornecedor sem pista = compra de mercadoria
    IF te IS NULL THEN RETURN QUERY SELECT 'Compra do Mês', 'COMPRA DO MÊS'; RETURN; END IF;
  END IF;

  RETURN QUERY SELECT padrao_tipo, padrao_sub;
END;
$function$;
-- Classificacao deterministica de lancamentos da Controladoria.
-- Recebe o nome do tipo de entrada / conta bruta do ERP e devolve o destino
-- canonico (tipo + subconta) usado pela DRE da Cont Rede.
CREATE OR REPLACE FUNCTION public.fn_classificar_conta(p_nome text)
RETURNS TABLE(tipo text, subtipo text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  n text;
BEGIN
  n := lower(trim(coalesce(p_nome, '')));
  n := translate(n,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC');
  n := regexp_replace(n, '\s+', ' ', 'g');

  -- ===== COMPRA DE MERCADORIA / FORNECEDORES =====
  IF n ~ 'compra de mercadoria|compra mercadoria|mercadoria p/? ?revenda|para revenda|produtor rural|bonificacao|frete fornecedor|duplicata|fornecedor|nota fiscal de entrada|nf entrada' THEN
    RETURN QUERY SELECT 'Compra do Mês', 'COMPRA DO MÊS'; RETURN;
  END IF;

  -- ===== CMV / INSUMOS =====
  IF n ~ 'insumo.*acougue|acougue.*insumo' THEN RETURN QUERY SELECT 'CMV','MATERIAL PARA INSUMO AÇOUGUE'; RETURN; END IF;
  IF n ~ 'insumo.*padaria|padaria.*insumo' THEN RETURN QUERY SELECT 'CMV','MATERIAL PARA INSUMO PADARIA'; RETURN; END IF;
  IF n ~ 'c\.?m\.?v|custo da mercadoria' THEN RETURN QUERY SELECT 'CMV','CUSTO DA MERCADORIA VENDIDA'; RETURN; END IF;

  -- ===== IMPOSTOS =====
  IF n ~ 'icms' THEN RETURN QUERY SELECT 'Impostos','ICMS'; RETURN; END IF;
  IF n ~ '(^| )pis( |$)' THEN RETURN QUERY SELECT 'Impostos','PIS'; RETURN; END IF;
  IF n ~ 'cofins' THEN RETURN QUERY SELECT 'Impostos','COFINS'; RETURN; END IF;
  IF n ~ 'irpj|csll|imposto de renda' THEN RETURN QUERY SELECT 'Impostos','8 | IRPJ + CSLL'; RETURN; END IF;
  IF n ~ 'irrf' THEN RETURN QUERY SELECT 'Impostos','IRRF'; RETURN; END IF;
  IF n ~ 'simples nacional|( |^)das( |$)|imposto federal|imposto sobre venda|( |^)iss( |$)' THEN
    RETURN QUERY SELECT 'Impostos','OUTROS IMPOSTOS (S/ VENDA)'; RETURN; END IF;

  -- ===== PESSOAL =====
  IF n ~ 'adiantamento salarial|vale ?/?adiantamento|adiantamento de salario|vale salario' THEN RETURN QUERY SELECT 'Despesas','ADIANTAMENTO SALARIAL'; RETURN; END IF;
  IF n ~ '13 ?.? ?salario|decimo terceiro' THEN RETURN QUERY SELECT 'Despesas','13° SALÁRIO'; RETURN; END IF;
  IF n ~ 'rescis' THEN RETURN QUERY SELECT 'Despesas','RESCISÕES'; RETURN; END IF;
  IF n ~ 'ferias' THEN RETURN QUERY SELECT 'Despesas','FÉRIAS'; RETURN; END IF;
  IF n ~ 'fgts' THEN RETURN QUERY SELECT 'Despesas','FGTS'; RETURN; END IF;
  IF n ~ 'inss|previdencia' THEN RETURN QUERY SELECT 'Despesas','INSS'; RETURN; END IF;
  IF n ~ 'hora extra' THEN RETURN QUERY SELECT 'Despesas','HORA EXTRA'; RETURN; END IF;
  IF n ~ 'gratificacao|premiacao funcionario' THEN RETURN QUERY SELECT 'Despesas','COMPLEMENTO DE SALÁRIOS / DIFERENÇAS'; RETURN; END IF;
  IF n ~ 'salario|folha de pagamento|folha pagamento|remunerac' THEN RETURN QUERY SELECT 'Despesas','SALÁRIO LÍQUIDO (+ COMPRAS / - H.E.)'; RETURN; END IF;
  IF n ~ 'vale transporte|transporte funcionario' THEN RETURN QUERY SELECT 'Despesas','TRANSPORTE FUNCIONÁRIOS'; RETURN; END IF;
  IF n ~ 'vale alimentacao|vale refeicao|ticket|sodexo|alelo' THEN RETURN QUERY SELECT 'Despesas','VALE ALIMENTAÇÃO (VR)'; RETURN; END IF;
  IF n ~ 'assistencia medica|plano de saude|unimed|odonto' THEN RETURN QUERY SELECT 'Despesas','ASSISTÊNCIA MÉDICA'; RETURN; END IF;
  IF n ~ 'medicina ocupacional|exame admissional|pcmso|ppra|sesmt' THEN RETURN QUERY SELECT 'Despesas','MEDICINA OCUPACIONAL'; RETURN; END IF;
  IF n ~ 'uniforme' THEN RETURN QUERY SELECT 'Despesas','UNIFORMES'; RETURN; END IF;
  IF n ~ '( |^)epi( |$)|equipamento de protecao' THEN RETURN QUERY SELECT 'Despesas','COMPRA DE EPI'; RETURN; END IF;
  IF n ~ 'free ?lanc|diarista|mao de obra temporaria' THEN RETURN QUERY SELECT 'Despesas','DIARISTA'; RETURN; END IF;
  IF n ~ 'sindica' THEN RETURN QUERY SELECT 'Despesas','CONTRIBUIÇÃO SINDICAL'; RETURN; END IF;
  IF n ~ 'treinamento|curso' THEN RETURN QUERY SELECT 'Despesas','TREINAMENTOS'; RETURN; END IF;
  IF n ~ 'processo trabalhista|acao trabalhista|reclamatoria' THEN RETURN QUERY SELECT 'Despesas','PROCESSO TRABALHISTA'; RETURN; END IF;
  IF n ~ 'refeitorio|alimentacao|lanche' THEN RETURN QUERY SELECT 'Despesas','REFEITÓRIO'; RETURN; END IF;

  -- ===== SERVICOS PUBLICOS =====
  IF n ~ 'energia eletrica|energia|cpfl|enel|elektro|cemig|coelba|energisa' THEN RETURN QUERY SELECT 'Despesas','ENERGIA ELÉTRICA'; RETURN; END IF;
  IF n ~ 'agua e esgoto|( |^)agua( |$)|sabesp|saae|sanea|copasa' THEN RETURN QUERY SELECT 'Despesas','ÁGUA E ESGOTO'; RETURN; END IF;
  IF n ~ '( |^)gas( |$)|ultragaz|liquigas|supergasbras' THEN RETURN QUERY SELECT 'Despesas','GÁS'; RETURN; END IF;
  IF n ~ 'telefonia movel|telefonia celular|celular' THEN RETURN QUERY SELECT 'Despesas','TELEFONIA CELULAR'; RETURN; END IF;
  IF n ~ 'telefonia fixa|telefone' THEN RETURN QUERY SELECT 'Despesas','TELEFONIA FIXA'; RETURN; END IF;
  IF n ~ 'internet|link dedicado|banda larga|provedor|fibra' THEN RETURN QUERY SELECT 'Despesas','INTERNET'; RETURN; END IF;
  IF n ~ 'iptu' THEN RETURN QUERY SELECT 'Despesas','IPTU'; RETURN; END IF;
  IF n ~ 'inmetro|ipem|taxa de fiscalizacao|alvara|vigilancia sanitaria' THEN RETURN QUERY SELECT 'Despesas','INMETRO/OUTRAS TAXAS'; RETURN; END IF;
  IF n ~ 'procon' THEN RETURN QUERY SELECT 'Despesas','PROCON'; RETURN; END IF;

  -- ===== ALUGUEL =====
  IF n ~ 'aluguel estacionamento' THEN RETURN QUERY SELECT 'Despesas','ALUGUEL ESTÁCIONAMENTO'; RETURN; END IF;
  IF n ~ 'aluguel de maquina|aluguel de equipamento|aluguel equipamento|locacao de equipamento' THEN RETURN QUERY SELECT 'Despesas','ALUGUEL COM MÁQUINAS E EQUIPAMENTOS'; RETURN; END IF;
  IF n ~ 'aluguel|locacao predial|imobiliaria' THEN RETURN QUERY SELECT 'Despesas','ALUGUEL COM TERCEIROS (PREDIAL)'; RETURN; END IF;

  -- ===== FROTA / FRETE =====
  IF n ~ 'combustivel|gasolina|diesel|lubrificante' THEN RETURN QUERY SELECT 'Despesas','COMBUSTÍVEIS E LUBRIFICANTES'; RETURN; END IF;
  IF n ~ 'ipva|pedagio|licenciamento|multa de transito|detran' THEN RETURN QUERY SELECT 'Despesas','IPVA / PEDÁGIOS / LICENCIAMENTO/MULTAS'; RETURN; END IF;
  IF n ~ 'manutencao de veiculo|manutencao veiculo|oficina|pneu|autopec' THEN RETURN QUERY SELECT 'Despesas','MANUTENÇÃO DE VEÍCULOS'; RETURN; END IF;
  IF n ~ 'seguro.*(veiculo|automovel)|rastreador' THEN RETURN QUERY SELECT 'Despesas','SEGURO E MONITORAMENTO VEÍCULOS'; RETURN; END IF;
  IF n ~ 'frete|transportadora|entrega|carreto|logistica|carga e descarga|carregador|chapa' THEN RETURN QUERY SELECT 'Despesas','FRETEIROS / ENTREGAS / BUSCAS MERCADORIAS'; RETURN; END IF;

  -- ===== EMBALAGENS / USO E CONSUMO =====
  IF n ~ 'sacola|embalagem|bandeja|filme pvc|rotulo|etiqueta|bobina' THEN RETURN QUERY SELECT 'Despesas','SACOLAS / EMBALAGENS / BANDEJAS / ETC'; RETURN; END IF;
  IF n ~ 'material de limpeza|produto de limpeza|limpeza da loja' THEN RETURN QUERY SELECT 'Despesas','MATERIAL P/ LIMPEZA DA LOJA'; RETURN; END IF;
  IF n ~ 'material de escritorio|papelaria|cartorio|correio|sedex|expediente' THEN RETURN QUERY SELECT 'Despesas','MAT. ESC. / CORREIOS / CARTÓRIOS'; RETURN; END IF;
  IF n ~ 'uso e consumo|uso consumo|material de consumo|utensilio' THEN RETURN QUERY SELECT 'Despesas','MATERIAL DE USO E CONSUMO'; RETURN; END IF;
  IF n ~ 'material para manutencao|ferragem|hidraulica|( |^)tinta' THEN RETURN QUERY SELECT 'Despesas','MATERIAL PARA MANUTENÇÃO ADM/OPERACIONAL'; RETURN; END IF;

  -- ===== MANUTENCAO / LOJA =====
  IF n ~ 'refrigeracao|camara fria|climatizacao|ar condicionado' THEN RETURN QUERY SELECT 'Despesas','REFRIGERAÇÃO'; RETURN; END IF;
  IF n ~ 'manutencao de maquina|manutencao de equipamento|manutencao maquina|balanca|fatiador|conserto|manutencao eletrica' THEN RETURN QUERY SELECT 'Despesas','MANUTENÇÃO DE EQUIPAMENTOS - MÁQUINAS'; RETURN; END IF;
  IF n ~ 'manutencao predial|manutencao do predio|construcao mercado|obra|reforma|pintura|pedreiro' THEN RETURN QUERY SELECT 'Despesas','MANUTENÇÃO PREDIAL'; RETURN; END IF;
  IF n ~ 'dedetiza|desinsetiza|controle de praga|limpeza quimica' THEN RETURN QUERY SELECT 'Despesas','LIMPEZA QUIMICA / DEDETIZAÇÃO / LIMP. PRAÇA'; RETURN; END IF;

  -- ===== TERCEIROS / SERVICOS =====
  IF n ~ 'contabil' THEN RETURN QUERY SELECT 'Despesas','CONTABILIDADE'; RETURN; END IF;
  IF n ~ 'advocacia|advogad|juridic' THEN RETURN QUERY SELECT 'Despesas','ADVOCACIA'; RETURN; END IF;
  IF n ~ 'consultoria|assessoria' THEN RETURN QUERY SELECT 'Despesas','CONSULTORIA - MENSALIDADE'; RETURN; END IF;
  IF n ~ 'informatica|automacao|software|sistema|licenca|relogio de ponto|suporte tecnico|( |^)ti( |$)' THEN RETURN QUERY SELECT 'Despesas','TI'; RETURN; END IF;
  IF n ~ 'transporte de valores|prosegur|brinks|tecban|malote' THEN RETURN QUERY SELECT 'Despesas','TRANSPORTE DE VALORES - SEPARAÇÃO/CONTAGEM'; RETURN; END IF;
  IF n ~ 'vigilancia|seguranca|alarme|monitoramento|cftv|camera' THEN RETURN QUERY SELECT 'Despesas','SISTEMA MONITOR./CAMERAS E SOFTWARES'; RETURN; END IF;
  IF n ~ 'associac|apas|sincovaga|federacao' THEN RETURN QUERY SELECT 'Despesas','ASSOCIAÇÃO DE CLASSE'; RETURN; END IF;

  -- ===== MARKETING =====
  IF n ~ 'grafica|panfleto|encarte|jornal de oferta|impressao' THEN RETURN QUERY SELECT 'Despesas','GRÁFICA (IMPRESSÃO JORNAL DE OFERTAS)'; RETURN; END IF;
  IF n ~ 'cartazista' THEN RETURN QUERY SELECT 'Despesas','CARTAZISTA - M.O. TERCEIRIZADA'; RETURN; END IF;
  IF n ~ 'radio|locutor|locucao|spot|vinheta|carro de som' THEN RETURN QUERY SELECT 'Despesas','AGÊNCIA/GRAVAÇÃO/LOCUÇÃO'; RETURN; END IF;
  IF n ~ 'publicidade|propaganda|marketing|midia social|impulsionamento|trafego|anuncio' THEN RETURN QUERY SELECT 'Despesas','PUBLICIDADE'; RETURN; END IF;
  IF n ~ 'brinde|sorteio|promocao|doacao' THEN RETURN QUERY SELECT 'Despesas','AQUISIÇÃO BRINDES/PRODUTOS (PROMOÇÕES)'; RETURN; END IF;

  -- ===== FINANCEIRAS =====
  IF n ~ 'taxa de cartao|taxas de cartao|cielo|getnet|stone|pagseguro|adquirente|conciliacao cartoes' THEN RETURN QUERY SELECT 'Despesas','TAXAS DE CARTÕES'; RETURN; END IF;
  IF n ~ 'antecipacao' THEN RETURN QUERY SELECT 'Despesas','ANTECIPAÇÃO CARTÕES'; RETURN; END IF;
  IF n ~ 'consorcio' THEN RETURN QUERY SELECT 'Despesas','CONSÓRCIOS'; RETURN; END IF;
  IF n ~ 'leasing|financiamento|finame' THEN RETURN QUERY SELECT 'Despesas','FINANC/LEASING FROTA'; RETURN; END IF;
  IF n ~ 'emprestimo|capital de giro|amortizacao' THEN RETURN QUERY SELECT 'Despesas','EMPRÉSTIMOS'; RETURN; END IF;
  IF n ~ 'juros|encargo financeiro|( |^)mora( |$)|cheque especial' THEN RETURN QUERY SELECT 'Despesas','JUROS POR ATRASO DE DUPLICATAS'; RETURN; END IF;
  IF n ~ 'tarifa|manutencao de conta|cesta de servico|despesa bancaria|iof' THEN RETURN QUERY SELECT 'Despesas','TARIFAS/MANUTENÇÃO DE CONTA'; RETURN; END IF;
  IF n ~ 'cheque devolvido' THEN RETURN QUERY SELECT 'Despesas','CHEQUES DEVOLVIDOS DENTRO DO MÊS'; RETURN; END IF;
  IF n ~ 'seguro' THEN RETURN QUERY SELECT 'Despesas','SEGURO'; RETURN; END IF;

  -- ===== DIVERSAS / INVESTIMENTOS =====
  IF n ~ 'pro.?labore|retirada socio|distribuicao de lucro' THEN RETURN QUERY SELECT 'Despesas','PRÓ-LABORE (1%)'; RETURN; END IF;
  IF n ~ 'desconto' THEN RETURN QUERY SELECT 'Despesas','DESCONTOS / DOAÇÕES'; RETURN; END IF;
  IF n ~ 'ativo|imobilizado|aquisicao de equipamento|movel e utensilio|investimento' THEN RETURN QUERY SELECT 'Despesas','9 | INVESTIMENTOS (OUTROS)'; RETURN; END IF;
  IF n ~ 'perda|quebra' THEN RETURN QUERY SELECT 'Despesas','QUEBRA'; RETURN; END IF;
  IF n ~ 'convenio' THEN RETURN QUERY SELECT 'Despesas','CONVENIO MERCADO'; RETURN; END IF;
  IF n ~ 'devolucao' THEN RETURN QUERY SELECT 'Despesas','OUTRAS DESPESAS (COMERCIAL)'; RETURN; END IF;
  IF n ~ 'diretoria' THEN RETURN QUERY SELECT 'Despesas','OUTRAS DESPESAS (DIRETORIA)'; RETURN; END IF;
  IF n ~ 'servico|prestacao de servico|manutencao' THEN RETURN QUERY SELECT 'Despesas','OUTRAS DESPESAS (ADMINISTRATIVA)'; RETURN; END IF;

  -- Sem pista: cai numa conta real da DRE (nunca fica sem destino)
  RETURN QUERY SELECT 'Despesas', 'OUTRAS DESPESAS (ADMINISTRATIVA)';
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_classificar_conta(text) TO authenticated, service_role;

-- Aplica o destino canonico nos lancamentos de uma loja (ou de todas).
-- Respeita SEMPRE a edicao manual (classificacao_manual = true).
CREATE OR REPLACE FUNCTION public.fn_classificar_lancamentos(p_store_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contas text[];
  v_total integer := 0;
BEGIN
  IF p_store_id IS NOT NULL AND NOT (has_role(auth.uid(),'admin') OR is_supervisor(auth.uid()) OR tem_acesso_loja(p_store_id)) THEN
    RAISE EXCEPTION 'sem acesso a esta loja';
  END IF;
  IF p_store_id IS NULL AND NOT has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'somente administrador pode reclassificar todas as lojas';
  END IF;

  -- Contas validas da DRE: qualquer subconta ja usada por um de-para valido.
  WITH alvo AS (
    SELECT l.id,
           c.tipo AS novo_tipo,
           c.subtipo AS novo_subtipo
    FROM lancamentos l
    CROSS JOIN LATERAL fn_classificar_conta(
      coalesce(nullif(trim(l.tipo_entrada), ''), nullif(trim(l.subtipo), ''), l.descricao)
    ) c
    WHERE coalesce(l.classificacao_manual, false) = false
      AND (p_store_id IS NULL OR l.store_id = p_store_id)
      AND l.tipo <> 'Faturamento'
      AND l.tipo <> 'Recebimentos'
  ), atualizados AS (
    UPDATE lancamentos l
    SET tipo = a.novo_tipo,
        subtipo = a.novo_subtipo,
        updated_at = now()
    FROM alvo a
    WHERE l.id = a.id
      AND (l.tipo IS DISTINCT FROM a.novo_tipo OR l.subtipo IS DISTINCT FROM a.novo_subtipo)
    RETURNING 1
  )
  SELECT count(*) INTO v_total FROM atualizados;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_classificar_lancamentos(uuid) TO authenticated, service_role;
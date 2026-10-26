CREATE OR REPLACE FUNCTION public.fn_normalizar_lancamento()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE d text := upper(coalesce(NEW.descricao,''));
BEGIN
  IF coalesce(NEW.classificacao_manual,false) OR NEW.tipo NOT IN ('Compra do Mês','Despesas','Impostos') THEN
    RETURN NEW;
  END IF;

  -- Regras por fornecedor (Supermercado Santa Izabel)
  IF NEW.store_id = '0bd78cba-a25d-45e2-babe-55961267bd37'::uuid THEN
    IF NEW.tipo = 'Compra do Mês' THEN
      IF d ~ '^CEMIG' THEN NEW.tipo:='Despesas'; NEW.subtipo:='ENERGIA ELÉTRICA';
      ELSIF d ~ '^POSTO ' THEN NEW.tipo:='Despesas'; NEW.subtipo:='COMBUSTÍVEIS E LUBRIFICANTES';
      ELSIF d ~ '^VIPSOFT' THEN NEW.tipo:='Despesas'; NEW.subtipo:='SISTEMA MONITOR./CAMERAS E SOFTWARES';
      ELSIF d ~ '^MINAS AUTOMACAO' THEN NEW.tipo:='Despesas'; NEW.subtipo:='MANUTENÇÃO DE EQUIPAMENTOS - MÁQUINAS';
      ELSIF d ~ '^B E M GESTAO' THEN NEW.tipo:='Despesas'; NEW.subtipo:='PRÓ-LABORE (1%)';
      END IF;
    END IF;
    IF NEW.tipo = 'Despesas' THEN
      IF d ~ '^MAXIMUM ASS CONTABIL' THEN NEW.subtipo:='CONTABILIDADE';
      ELSIF d ~ '^W6 COMUNICACAO' THEN NEW.subtipo:='CARRO DE SOM';
      ELSIF d ~ '^(PROCESSA INFORMATICA|FSIST SISTEMAS|COMPEX TECNOLOGIA)' THEN NEW.subtipo:='TI';
      ELSIF d ~ '^LISTENX' THEN NEW.subtipo:='MENSALIDADE SOFTWARE WHATS/RÁDIO';
      ELSIF d ~ '^LUMME GESTAO TRIBUTARIA' THEN NEW.subtipo:='DIAGNÓSTICO FISCAL (PIS E COFINS)';
      ELSIF d ~ '^SANTA CASA MISERICORDIA' THEN NEW.subtipo:='ASSISTÊNCIA MÉDICA';
      ELSIF d ~ '^CONFIANCA PRESTACOES' THEN NEW.subtipo:='LIMPEZA QUIMICA / DEDETIZAÇÃO / LIMP. PRAÇA';
      END IF;
    END IF;
  END IF;

  -- Nomes brutos do sistema da loja -> contas oficiais da DRE (todas as lojas)
  IF NEW.tipo = 'Compra do Mês' THEN NEW.subtipo := 'COMPRA DO MÊS';
  ELSIF NEW.subtipo IN ('ICMS A RECOLHER','ICMS ANTECIPACAO','ICMS ST') THEN NEW.tipo:='Impostos'; NEW.subtipo:='ICMS';
  ELSIF NEW.subtipo = 'ISS' THEN NEW.tipo:='Impostos'; NEW.subtipo:='OUTROS IMPOSTOS (S/ VENDA)';
  ELSE
    NEW.subtipo := CASE NEW.subtipo
      WHEN 'SALÁRIO' THEN 'SALÁRIO LÍQUIDO (+ COMPRAS / - H.E.)'
      WHEN 'ALUGUEL' THEN 'ALUGUEL COM TERCEIROS (PREDIAL)'
      WHEN 'EMPRÉSTIMO' THEN 'EMPRÉSTIMOS'
      WHEN 'FERIAS' THEN 'FÉRIAS'
      WHEN 'FGTS A RECOLHER' THEN 'FGTS'
      WHEN 'FGTS A RECISORIO' THEN 'FGTS'
      WHEN 'PROLABORE SOCIO' THEN 'PRÓ-LABORE (1%)'
      WHEN 'MENSALIDADE ASSOCIAÇÃO' THEN 'ASSOCIAÇÃO DE CLASSE'
      WHEN 'MÃO DE OBRA FREE LANCE' THEN 'OUTRAS DESPESAS (FUNCIONÁRIOS)'
      WHEN 'BRINDES E DOAÇÕES' THEN 'AQUISIÇÃO BRINDES/PRODUTOS (PROMOÇÕES)'
      WHEN 'SEGURO DE IMÓVEIS' THEN 'SEGURO'
      WHEN 'SEGURO DE AUTOMÓVEL' THEN 'SEGURO E MONITORAMENTO VEÍCULOS'
      WHEN 'DEVOLUÇÃO CLIENTE PREÇO ERRADO' THEN 'OUTRAS DESPESAS (COMERCIAL)'
      WHEN 'SERVIÇOS' THEN 'OUTRAS DESPESAS (ADMINISTRATIVA)'
      WHEN 'DINHEIRO' THEN 'OUTRAS DESPESAS (ADMINISTRATIVA)'
      ELSE NEW.subtipo END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_normalizar_lancamento ON public.lancamentos;
CREATE TRIGGER trg_normalizar_lancamento
BEFORE INSERT OR UPDATE OF tipo, subtipo, descricao ON public.lancamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_normalizar_lancamento();
-- ============================================================
-- Andrade Hub — Recebimento de NF-e: tabelas no Supabase do Hub
-- Cole no chat do Lovable. Idempotente (IF NOT EXISTS).
-- ============================================================

-- Parâmetros por loja (defaults do módulo)
CREATE TABLE IF NOT EXISTS public.recebimento_config (
  store_id            uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  dias_max_emissao    int     NOT NULL DEFAULT 3,
  tolerancia_prazo    int     NOT NULL DEFAULT 2,     -- dias
  tolerancia_preco    numeric NOT NULL DEFAULT 1.0,   -- %
  tolerancia_qtd      numeric NOT NULL DEFAULT 0.0,   -- %
  recontagens         int     NOT NULL DEFAULT 1,
  exigir_pedido       boolean NOT NULL DEFAULT true,
  entrada_automatica  boolean NOT NULL DEFAULT true,  -- ao aprovar, chama websac-entrada (modo gravar)
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);

-- Um recebimento = uma NF-e escaneada em uma loja
CREATE TABLE IF NOT EXISTS public.recebimentos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  chave               char(44) NOT NULL,
  idnfeestabelec      int,
  numero_nf           int,
  serie               text,
  cnpj_emitente       char(14),
  nome_emitente       text,
  codfornec           int,
  data_emissao        date,
  total_nf            numeric,
  numpedido           int,                            -- pedido casado (ou criado)
  pedido_origem       text CHECK (pedido_origem IN ('websac','criado_hub','manual')),
  estado              text NOT NULL DEFAULT 'EM_VALIDACAO'
                      CHECK (estado IN ('AGUARDANDO_NFE','EM_VALIDACAO','EM_CONTAGEM','APROVADA',
                                        'APROVADA_COM_RESSALVA','ENTRADA_PENDENTE_SUPERVISOR','BLOQUEADA',
                                        'ENTRADA_CONFIRMADA','CANCELADA')),
  xml_resumo          jsonb,                          -- itens e duplicatas parseados do XML
  iniciado_por        uuid,
  iniciado_em         timestamptz NOT NULL DEFAULT now(),
  liberado_por        uuid,
  liberado_em         timestamptz,
  justificativa       text,
  idnotafiscal_entrada int,                           -- preenchido quando a nota aparece em notafiscal
  entrada_confirmada_em timestamptz,
  entrada_iniciada_em timestamptz,                    -- trava: gravação no WebSac em andamento (evita entrada em dobro)
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, chave)
);
ALTER TABLE public.recebimentos ADD COLUMN IF NOT EXISTS entrada_iniciada_em timestamptz;
CREATE INDEX IF NOT EXISTS recebimentos_store_estado_idx ON public.recebimentos (store_id, estado, iniciado_em DESC);

-- Resultado de cada critério (1 linha por critério por recebimento; re-validar sobrescreve)
CREATE TABLE IF NOT EXISTS public.recebimento_criterios (
  recebimento_id      uuid NOT NULL REFERENCES public.recebimentos(id) ON DELETE CASCADE,
  criterio            smallint NOT NULL CHECK (criterio BETWEEN 1 AND 5),
  nome                text NOT NULL,                  -- CNPJ | EMISSAO | PEDIDO | PRAZOS | LISTA_CEGA
  resultado           text NOT NULL CHECK (resultado IN ('OK','AVISO','BLOQUEIO','PENDENTE')),
  detalhe             jsonb,                          -- evidências (dias, parcelas, itens divergentes…)
  ciente_por          uuid,                           -- quem assumiu o aviso
  ciente_em           timestamptz,
  justificativa       text,
  avaliado_em         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recebimento_id, criterio)
);

-- Itens da nota × pedido (uma linha por item do XML)
CREATE TABLE IF NOT EXISTS public.recebimento_itens (
  id                  bigserial PRIMARY KEY,
  recebimento_id      uuid NOT NULL REFERENCES public.recebimentos(id) ON DELETE CASCADE,
  seq_xml             int NOT NULL,
  cprod               text,
  ean                 text,
  descricao_xml       text,
  qtd_xml             numeric NOT NULL,
  un_xml              text,
  preco_xml           numeric,
  codproduto          int,                            -- casado no WebSac
  descricao_produto   text,
  fator               numeric NOT NULL DEFAULT 1,     -- unidades por embalagem
  qtd_unidades        numeric GENERATED ALWAYS AS (qtd_xml * fator) STORED,
  qtd_pedido          numeric,
  preco_pedido        numeric,
  situacao_pedido     text CHECK (situacao_pedido IN ('OK','SEM_PEDIDO','QTD_DIVERGE','PRECO_DIVERGE','NAO_CASADO')),
  UNIQUE (recebimento_id, seq_xml)
);

-- Lista cega: cada leitura do conferente (não vê a nota)
CREATE TABLE IF NOT EXISTS public.lista_cega_itens (
  id                  bigserial PRIMARY KEY,
  recebimento_id      uuid NOT NULL REFERENCES public.recebimentos(id) ON DELETE CASCADE,
  rodada              smallint NOT NULL DEFAULT 1,    -- 1 = contagem, 2 = recontagem
  ean                 text NOT NULL,
  codproduto          int,
  descricao           text,
  qtd_contada         numeric NOT NULL,
  contado_por         uuid NOT NULL,
  contado_em          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lista_cega_receb_idx ON public.lista_cega_itens (recebimento_id, rodada);

-- Trilha (auditoria)
CREATE TABLE IF NOT EXISTS public.recebimento_eventos (
  id                  bigserial PRIMARY KEY,
  recebimento_id      uuid NOT NULL REFERENCES public.recebimentos(id) ON DELETE CASCADE,
  evento              text NOT NULL,                  -- SCAN, VALIDOU, CIENTE_EMISSAO, PEDIDO_CRIADO, CONTAGEM, RECONTAGEM, APROVOU, BLOQUEOU, ENTRADA_CONFIRMADA…
  detalhe             jsonb,
  usuario_id          uuid,
  criado_em           timestamptz NOT NULL DEFAULT now()
);

-- Cruzamento contagem × nota: calculado pela edge function recebimento (ação conferir) e gravado em
-- recebimento_criterios (criterio 5, detalhe.itens[]) — a tela lê de lá.

-- Painel: indicadores por loja/fornecedor
CREATE OR REPLACE VIEW public.v_recebimento_painel
WITH (security_invoker = true) AS
SELECT r.store_id, r.cnpj_emitente, r.nome_emitente, r.codfornec,
       date_trunc('month', r.iniciado_em)::date AS mes,
       COUNT(*)                                                       AS recebimentos,
       COUNT(*) FILTER (WHERE r.estado = 'ENTRADA_CONFIRMADA')       AS entradas,
       COUNT(*) FILTER (WHERE r.estado IN ('APROVADA_COM_RESSALVA','ENTRADA_PENDENTE_SUPERVISOR')) AS com_ressalva,
       COUNT(*) FILTER (WHERE r.estado = 'BLOQUEADA')                 AS bloqueadas,
       COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.recebimento_criterios k
                                       WHERE k.recebimento_id = r.id AND k.criterio = 5 AND k.resultado <> 'OK')) AS com_divergencia_contagem,
       ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(r.entrada_confirmada_em, r.liberado_em) - r.iniciado_em))/60)::numeric, 1) AS minutos_medios
  FROM public.recebimentos r
 GROUP BY 1,2,3,4,5;

-- RLS
ALTER TABLE public.recebimento_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimentos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimento_criterios  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimento_itens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lista_cega_itens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimento_eventos    ENABLE ROW LEVEL SECURITY;

-- Regra de escrita: quem decide estado, critérios e entrada são as edge functions (service role).
-- Pelo navegador o usuário só LÊ o recebimento e GRAVA a própria contagem da lista cega.
GRANT SELECT ON public.recebimentos, public.recebimento_criterios, public.recebimento_itens,
                public.recebimento_eventos, public.v_recebimento_painel TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.recebimento_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lista_cega_itens TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.lista_cega_itens_id_seq TO authenticated;
GRANT ALL ON public.recebimento_config, public.recebimentos, public.recebimento_criterios, public.recebimento_itens,
             public.lista_cega_itens, public.recebimento_eventos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.recebimento_itens_id_seq, public.lista_cega_itens_id_seq,
                               public.recebimento_eventos_id_seq TO service_role;

-- recebimentos: leitura por loja
DROP POLICY IF EXISTS recebimentos_sel ON public.recebimentos;
CREATE POLICY recebimentos_sel ON public.recebimentos FOR SELECT TO authenticated
  USING (public.tem_acesso_loja(store_id));

-- critérios, itens e trilha: leitura por loja (via recebimento)
DROP POLICY IF EXISTS recebimento_criterios_sel ON public.recebimento_criterios;
CREATE POLICY recebimento_criterios_sel ON public.recebimento_criterios FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recebimentos r WHERE r.id = recebimento_id AND public.tem_acesso_loja(r.store_id)));
DROP POLICY IF EXISTS recebimento_itens_sel ON public.recebimento_itens;
CREATE POLICY recebimento_itens_sel ON public.recebimento_itens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recebimentos r WHERE r.id = recebimento_id AND public.tem_acesso_loja(r.store_id)));
DROP POLICY IF EXISTS recebimento_eventos_sel ON public.recebimento_eventos;
CREATE POLICY recebimento_eventos_sel ON public.recebimento_eventos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recebimentos r WHERE r.id = recebimento_id AND public.tem_acesso_loja(r.store_id)));

-- lista cega: lê quem tem a loja; grava/edita/apaga só a própria linha e só enquanto EM_CONTAGEM
DROP POLICY IF EXISTS lista_cega_itens_sel ON public.lista_cega_itens;
CREATE POLICY lista_cega_itens_sel ON public.lista_cega_itens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recebimentos r WHERE r.id = recebimento_id AND public.tem_acesso_loja(r.store_id)));
DROP POLICY IF EXISTS lista_cega_itens_ins ON public.lista_cega_itens;
CREATE POLICY lista_cega_itens_ins ON public.lista_cega_itens FOR INSERT TO authenticated
  WITH CHECK (contado_por = auth.uid()
              AND EXISTS (SELECT 1 FROM public.recebimentos r WHERE r.id = recebimento_id
                             AND r.estado = 'EM_CONTAGEM' AND public.tem_acesso_loja(r.store_id)));
DROP POLICY IF EXISTS lista_cega_itens_upd ON public.lista_cega_itens;
CREATE POLICY lista_cega_itens_upd ON public.lista_cega_itens FOR UPDATE TO authenticated
  USING (contado_por = auth.uid()
         AND EXISTS (SELECT 1 FROM public.recebimentos r WHERE r.id = recebimento_id
                        AND r.estado = 'EM_CONTAGEM' AND public.tem_acesso_loja(r.store_id)))
  WITH CHECK (contado_por = auth.uid());
DROP POLICY IF EXISTS lista_cega_itens_del ON public.lista_cega_itens;
CREATE POLICY lista_cega_itens_del ON public.lista_cega_itens FOR DELETE TO authenticated
  USING (contado_por = auth.uid()
         AND EXISTS (SELECT 1 FROM public.recebimentos r WHERE r.id = recebimento_id
                        AND r.estado = 'EM_CONTAGEM' AND public.tem_acesso_loja(r.store_id)));

-- parâmetros da loja: todos da loja leem; só admin altera
DROP POLICY IF EXISTS recebimento_config_sel ON public.recebimento_config;
CREATE POLICY recebimento_config_sel ON public.recebimento_config FOR SELECT TO authenticated
  USING (public.tem_acesso_loja(store_id));
DROP POLICY IF EXISTS recebimento_config_ins ON public.recebimento_config;
CREATE POLICY recebimento_config_ins ON public.recebimento_config FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS recebimento_config_upd ON public.recebimento_config;
CREATE POLICY recebimento_config_upd ON public.recebimento_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Rollout seguro: nas lojas WebSac a entrada automática começa DESLIGADA; liga-se no admin depois do ensaio.
INSERT INTO public.recebimento_config (store_id, entrada_automatica)
SELECT c.store_id, false FROM public.store_vr_config c WHERE upper(coalesce(c.sistema, '')) = 'WEBSAC'
ON CONFLICT (store_id) DO NOTHING;

-- tem_acesso_loja(store_id) é a função já usada nas outras tabelas por loja do Hub.
-- Sem DELETE de recebimento: cancelamento é mudança de estado (edge function), nunca exclusão.

-- Módulo no menu: os módulos são registrados em código (src/lib/modules.ts), não em tabela.
-- O prompt do Lovable adiciona { key: "recebimento", label: "Recebimento de NF-e", path: "/recebimento" }
-- e o acesso por usuário segue em user_module_access como nos demais.


-- ============================================================
-- Andrade Hub — Recebimento de NF-e (Cliente Nascimento / WebSac)
-- 8 relatórios de LEITURA em public.websac_relatorios (UPSERT; sem CTE).
-- Parâmetros: {{loja}} {{chave}} {{cnpj}} {{codfornec}} {{numpedido}} {{ean}} {{inicio}} {{fim}}
-- ATENÇÃO (websac-proxy/montarSql): valor só com dígitos entra SEM aspas — por isso chave e
-- CNPJ usam lpad({{x}}::text, n, '0') para não perder zero à esquerda. Datas/textos ganham aspas.
-- ============================================================

-- ---------- nfe_recebida_por_chave ----------
-- A NF-e que a SEFAZ entregou ao WebSac (cabeçalho + XML completo)
INSERT INTO public.websac_relatorios (nome, descricao, sql) VALUES (
  'nfe_recebida_por_chave',
  'NF-e recebida da SEFAZ pela chave de acesso (cabeçalho + XML + status de entrada)',
$QQ$
SELECT n.idnfeestabelec,
       n.codestabelec,
       n.chavenfe,
       n.numnotafiscal,
       n.serie,
       n.cnpj                                   AS cnpj_emitente,
       n.nome                                   AS nome_emitente,
       n.dataemissao,
       CURRENT_DATE - n.dataemissao             AS dias_emissao,
       n.total,
       n.status,
       n.evento,
       n.finalidade,
       n.fornecedorverificado,
       n.pedidoverificado,
       n.permitevincularapedido,
       n.statusromaneio,
       (SELECT string_agg(p.numpedido::text, ',')
          FROM public.notafiscaleletronicaestabelecimentopedido p
         WHERE p.idnfeestabelec = n.idnfeestabelec)        AS pedidos_vinculados,
       (SELECT nf.idnotafiscal FROM public.notafiscal nf
         WHERE nf.chavenfe = n.chavenfe AND nf.operacao = 'CP'
         ORDER BY nf.idnotafiscal DESC LIMIT 1)             AS idnotafiscal_entrada,
       (SELECT nf.dtentrega FROM public.notafiscal nf
         WHERE nf.chavenfe = n.chavenfe AND nf.operacao = 'CP'
         ORDER BY nf.idnotafiscal DESC LIMIT 1)             AS dtentrada,
       -- XML em base64: a tela SQL 2.0 devolve HTML e o websac-proxy remove tudo que parece tag
       translate(encode(convert_to(n.xmlnfe::text, 'UTF8'), 'base64'), E'\n\r', '') AS xmlnfe_b64
  FROM public.notafiscaleletronicaestabelecimento n
 WHERE n.chavenfe = lpad({{chave}}::text,44,'0')
   AND n.codestabelec = {{loja}}
 ORDER BY n.idnfeestabelec DESC
 LIMIT 1
$QQ$)
ON CONFLICT (nome) DO UPDATE SET sql = EXCLUDED.sql, descricao = EXCLUDED.descricao, atualizado_em = now();

-- ---------- nfe_recebida_itens ----------
-- Itens como o WebSac já leu do XML (com o codproduto que ele casou, quando casou)
INSERT INTO public.websac_relatorios (nome, descricao, sql) VALUES (
  'nfe_recebida_itens',
  'Itens da NF-e recebida (leitura do WebSac) com produto casado, EAN e embalagem do fornecedor',
$QQ$
SELECT i.seqitem,
       i.codproduto,
       i.reffornec,
       i.descricao                              AS descricao_xml,
       i.codean                                 AS ean_xml,
       i.quantidade                             AS qtd_xml,
       i.preco                                  AS preco_xml,
       i.totalproduto,
       p.descricao                              AS descricao_produto,
       (SELECT pe.codean::text FROM public.produtoean pe
         WHERE pe.codproduto = i.codproduto ORDER BY pe.codean LIMIT 1) AS ean_cadastro,
       (SELECT pf.quantidade FROM public.prodfornec pf
         WHERE pf.codproduto = i.codproduto
           AND pf.codfornec = (SELECT f.codfornec FROM public.fornecedor f
                                WHERE regexp_replace(f.cpfcnpj,'[^0-9]','','g') = n.cnpj LIMIT 1)
         ORDER BY pf.principal DESC LIMIT 1)    AS fator_embalagem
  FROM public.itnotafiscaleletronicaestabelecimento i
  JOIN public.notafiscaleletronicaestabelecimento n ON n.idnfeestabelec = i.idnfeestabelec
  LEFT JOIN public.produto p ON p.codproduto = i.codproduto
 WHERE n.chavenfe = lpad({{chave}}::text,44,'0')
   AND n.codestabelec = {{loja}}
 ORDER BY i.seqitem
$QQ$)
ON CONFLICT (nome) DO UPDATE SET sql = EXCLUDED.sql, descricao = EXCLUDED.descricao, atualizado_em = now();

-- ---------- fornecedor_por_cnpj ----------
INSERT INTO public.websac_relatorios (nome, descricao, sql) VALUES (
  'fornecedor_por_cnpj',
  'Critério 1: fornecedor cadastrado/ativo pelo CNPJ do emitente (+ condição de pagamento e prazo padrão)',
$QQ$
SELECT f.codfornec,
       f.nome,
       f.razaosocial,
       f.cpfcnpj,
       f.status,
       f.codcondpagto,
       cp.descricao                             AS condpagto_descricao,
       cp.qtdeparcelas,
       f.codcomprador,
       f.tolera                                 AS tolerancia_cadastro,
       fe.diasentrega,
       (SELECT COUNT(*) FROM public.prefornecedor pf
         WHERE regexp_replace(pf.cpfcnpj,'[^0-9]','','g') = lpad({{cnpj}}::text,14,'0')
           AND pf.status <> 'C')                AS precadastros_pendentes
  FROM public.fornecedor f
  LEFT JOIN public.condpagto cp ON cp.codcondpagto = f.codcondpagto
  LEFT JOIN public.fornecestab fe ON fe.codfornec = f.codfornec AND fe.codestabelec = {{loja}}
 WHERE regexp_replace(f.cpfcnpj,'[^0-9]','','g') = lpad({{cnpj}}::text,14,'0')
    OR regexp_replace(COALESCE(f.cnpjsefaz,''),'[^0-9]','','g') = lpad({{cnpj}}::text,14,'0')
 ORDER BY (f.status = 'A') DESC, f.codfornec
 LIMIT 5
$QQ$)
ON CONFLICT (nome) DO UPDATE SET sql = EXCLUDED.sql, descricao = EXCLUDED.descricao, atualizado_em = now();

-- ---------- pedidos_abertos_fornecedor ----------
-- Critério 3: pedidos de compra do fornecedor ainda sem nota (últimos 60 dias)
INSERT INTO public.websac_relatorios (nome, descricao, sql) VALUES (
  'pedidos_abertos_fornecedor',
  'Critério 3: pedidos de compra em aberto do fornecedor na loja (sem NF vinculada), últimos 60 dias',
$QQ$
SELECT p.numpedido,
       p.dtemissao,
       p.dtentrega,
       p.status,
       p.codcondpagto,
       cp.descricao                             AS condpagto_descricao,
       cp.qtdeparcelas,
       p.parcelas,
       p.totalliquido,
       p.numeroitens,
       p.observacao,
       p.chavenfe                               AS chavenfe_vinculada,
       (SELECT COUNT(*) FROM public.notafiscal nf
         WHERE nf.numpedido = p.numpedido AND nf.codestabelec = p.codestabelec
           AND nf.operacao = 'CP')              AS notas_entradas
  FROM public.pedido p
  LEFT JOIN public.condpagto cp ON cp.codcondpagto = p.codcondpagto
 WHERE p.codestabelec = {{loja}}
   AND p.operacao = 'CP'
   AND p.tipoparceiro = 'F'
   AND p.codparceiro = {{codfornec}}
   AND p.dtemissao >= CURRENT_DATE - 60
   AND NOT EXISTS (SELECT 1 FROM public.notafiscal nf
                    WHERE nf.numpedido = p.numpedido AND nf.codestabelec = p.codestabelec
                      AND nf.operacao = 'CP' AND nf.status = 'A')
 ORDER BY p.dtemissao DESC
 LIMIT 20
$QQ$)
ON CONFLICT (nome) DO UPDATE SET sql = EXCLUDED.sql, descricao = EXCLUDED.descricao, atualizado_em = now();

-- ---------- pedido_itens ----------
INSERT INTO public.websac_relatorios (nome, descricao, sql) VALUES (
  'pedido_itens',
  'Itens de um pedido de compra (produto, EAN, qtd, fator, preço, já atendido)',
$QQ$
SELECT i.seqitem,
       i.codproduto,
       pr.descricao,
       (SELECT pe.codean::text FROM public.produtoean pe
         WHERE pe.codproduto = i.codproduto ORDER BY pe.codean LIMIT 1) AS ean,
       i.reffornec,
       i.quantidade,
       i.qtdeunidade                            AS fator,
       i.quantidade * COALESCE(NULLIF(i.qtdeunidade,0),1) AS qtd_unidades,
       i.preco,
       i.totalliquido,
       i.qtdeatendida,
       i.quantidadexml,
       i.quantidadeconf,
       i.conferidorecebimento,
       i.bonificado,
       i.status
  FROM public.itpedido i
  LEFT JOIN public.produto pr ON pr.codproduto = i.codproduto
 WHERE i.codestabelec = {{loja}}
   AND i.numpedido = {{numpedido}}
 ORDER BY i.seqitem
$QQ$)
ON CONFLICT (nome) DO UPDATE SET sql = EXCLUDED.sql, descricao = EXCLUDED.descricao, atualizado_em = now();

-- ---------- condpagto_detalhe ----------
-- Critério 4: dias de cada parcela da condição de pagamento
INSERT INTO public.websac_relatorios (nome, descricao, sql) VALUES (
  'condpagto_detalhe',
  'Critério 4: dias/percentual de cada parcela da condição de pagamento do pedido',
$QQ$
SELECT c.codcondpagto, c.descricao, c.tipo, c.qtdeparcelas, c.comentrada, c.diavencimento, c.diascarencia,
       c.dia1, c.percdia1, c.dia2, c.percdia2, c.dia3, c.percdia3, c.dia4, c.percdia4,
       c.dia5, c.percdia5, c.dia6, c.percdia6, c.dia7, c.percdia7, c.dia8, c.percdia8,
       c.dia9, c.percdia9, c.dia10, c.percdia10, c.dia11, c.percdia11, c.dia12, c.percdia12
  FROM public.condpagto c
 WHERE c.codcondpagto = (SELECT p.codcondpagto FROM public.pedido p
                          WHERE p.codestabelec = {{loja}} AND p.numpedido = {{numpedido}} LIMIT 1)
$QQ$)
ON CONFLICT (nome) DO UPDATE SET sql = EXCLUDED.sql, descricao = EXCLUDED.descricao, atualizado_em = now();

-- ---------- produto_por_ean ----------
-- Critério 5: leitura do EAN na lista cega
INSERT INTO public.websac_relatorios (nome, descricao, sql) VALUES (
  'produto_por_ean',
  'Critério 5: produto pelo EAN escaneado (lista cega)',
$QQ$
SELECT pe.codean::text                          AS ean,
       p.codproduto,
       p.descricao,
       d.nome                                   AS departamento,
       ps.sldatual                              AS estoque_atual
  FROM public.produtoean pe
  JOIN public.produto p ON p.codproduto = pe.codproduto
  LEFT JOIN public.departamento d ON d.coddepto = p.coddepto
  LEFT JOIN public.produtoestab ps ON ps.codproduto = p.codproduto AND ps.codestabelec = {{loja}}
 WHERE pe.codean = {{ean}}::numeric
 LIMIT 1
$QQ$)
ON CONFLICT (nome) DO UPDATE SET sql = EXCLUDED.sql, descricao = EXCLUDED.descricao, atualizado_em = now();

-- ---------- nfe_pendentes_recebimento ----------
-- Fila: NF-e recebidas da SEFAZ que ainda não viraram entrada (notafiscal)
INSERT INTO public.websac_relatorios (nome, descricao, sql) VALUES (
  'nfe_pendentes_recebimento',
  'Fila de recebimento: NF-e recebidas da SEFAZ sem entrada em notafiscal, no período',
$QQ$
SELECT n.idnfeestabelec,
       n.chavenfe,
       n.numnotafiscal,
       n.serie,
       n.cnpj                                   AS cnpj_emitente,
       n.nome                                   AS nome_emitente,
       n.dataemissao,
       CURRENT_DATE - n.dataemissao             AS dias_emissao,
       n.total,
       n.status,
       n.fornecedorverificado,
       n.pedidoverificado,
       (SELECT string_agg(p.numpedido::text, ',')
          FROM public.notafiscaleletronicaestabelecimentopedido p
         WHERE p.idnfeestabelec = n.idnfeestabelec)        AS pedidos_vinculados
  FROM public.notafiscaleletronicaestabelecimento n
 WHERE n.codestabelec = {{loja}}
   AND n.dataemissao BETWEEN {{inicio}} AND {{fim}}
   AND COALESCE(n.finalidade,'1') = '1'
   AND NOT EXISTS (SELECT 1 FROM public.notafiscal nf
                    WHERE nf.chavenfe = n.chavenfe AND nf.operacao = 'CP')
 ORDER BY n.dataemissao DESC, n.idnfeestabelec DESC
 LIMIT 300
$QQ$)
ON CONFLICT (nome) DO UPDATE SET sql = EXCLUDED.sql, descricao = EXCLUDED.descricao, atualizado_em = now();

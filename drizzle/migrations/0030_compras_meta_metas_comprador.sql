ALTER TABLE public.compras_meta
  ADD COLUMN meta_lucro numeric,
  ADD COLUMN meta_pagamentos numeric;
COMMENT ON COLUMN public.compras_meta.meta_lucro IS 'Meta de lucro (arrecadacao) da loja no mes, usada na premiacao de compradores (linha departamento=LOJA).';
COMMENT ON COLUMN public.compras_meta.meta_pagamentos IS 'Teto de pagamentos a fornecedores no mes, usado na premiacao de compradores (linha departamento=LOJA). Vazio = usa o CMV do mes.';


# Plano de Implementacao

Este plano cobre tres grandes funcionalidades solicitadas:

---

## 1. Salvar Checklist e Enviar Email

**Problema atual:** O checklist nao salva os dados no banco de dados. Os dados ficam apenas no estado local.

**Solucao:**
- Adicionar um botao "Enviar" no final do checklist de cada departamento
- Ao clicar, salvar uma `checklist_submission` e os `checklist_answers` correspondentes no banco
- Criar uma edge function `send-checklist-email` que envia um email de notificacao para `renatoandraderasc@gmail.com` com o resumo do checklist (loja, departamento, pontuacao, data/hora)
- A edge function usara o servico de email integrado do Lovable Cloud (Resend via Supabase)
- Sera necessario configurar a chave da API Resend como secret

---

## 2. Sistema de Lojas com Controle de Acesso

**Problema atual:** Nao existe conceito de "loja" no sistema. Todos os usuarios veem a mesma coisa.

**Solucao:**

### Banco de Dados
- Criar tabela `stores` com as 10 lojas listadas
- Criar tabela `user_store_access` para vincular usuarios a lojas, com campo `approved` (boolean) para controle de aprovacao pelo admin
- Adicionar `store_id` na tabela `checklist_submissions` para registrar de qual loja veio o checklist

### Fluxo do Usuario
- Na tela de cadastro (signup), adicionar um campo de selecao de loja
- Apos o cadastro, o usuario fica "pendente de aprovacao"
- O admin tem uma pagina para ver usuarios pendentes e aprovar/rejeitar
- Apos aprovado, o usuario faz login e ve apenas os dados da(s) loja(s) que tem acesso
- O titulo do checklist mostra o nome da loja do usuario

### Fluxo do Admin
- Nova pagina `/admin/users` para gerenciar usuarios e aprovar acessos
- Lista usuarios pendentes e permite aprovar/rejeitar

---

## 3. Dashboard Comercial

**Problema atual:** Nao existe dashboard.

**Solucao:**
- Criar nova pagina `/dashboard` com os seguintes cards/graficos usando a biblioteca Recharts (ja instalada):
  - **Faturamento x Margem** - Grafico de barras comparativo
  - **Atingimento de Meta** - Grafico de gauge/progresso
  - **Faturamento por Departamento** - Grafico de barras horizontal
  - **Produtos mais Vendidos** - Tabela/lista ranqueada
  - **Quantidade de Clientes** - Card com numero e grafico de tendencia
  - **Produtos com Menor Margem** - Tabela com destaque em vermelho
  - **Curva ABC por Categoria** - Grafico de Pareto (barras + linha)
  - **Faturamento de Promocao por Departamento** - Grafico de barras

- Como nao ha fonte de dados real para esses indicadores comerciais, o dashboard sera criado com **dados de exemplo (mock)** e estrutura pronta para receber dados reais futuramente (via tabelas ou API)
- Criar tabela `commercial_data` para armazenar os dados quando forem alimentados

---

## Detalhes Tecnicos

### Migracao do Banco de Dados

```text
Novas tabelas:
+------------------+     +---------------------+
| stores           |     | user_store_access   |
|------------------|     |---------------------|
| id (uuid, PK)    |     | id (uuid, PK)       |
| name (text)      |     | user_id (uuid, FK)  |
| created_at       |     | store_id (uuid, FK) |
+------------------+     | approved (boolean)  |
                          | created_at          |
                          +---------------------+

Alteracao:
checklist_submissions + store_id (uuid, FK -> stores)
```

Dados iniciais nas lojas:
- Supermercado Duminduim
- Supermercado Maninho
- Supermercado Nascimento Osasco
- Supermercado Nascimento Embu
- Supermercado F.silva
- Supermercado Carvalho Matriz
- Supermercado Carvalho Filial
- Supermercado Sempre Bom
- Supermercado Mais Voce
- Supermercado Santa Izabel

### RLS Policies
- `stores`: leitura publica para autenticados
- `user_store_access`: usuarios veem apenas seus proprios acessos; admins veem e gerenciam todos
- `checklist_submissions`: filtrado por `store_id` do usuario

### Edge Function: send-checklist-email
- Recebe: submission_id
- Busca dados da submission, respostas, loja, usuario
- Envia email formatado para renatoandraderasc@gmail.com
- Requer secret RESEND_API_KEY

### Novos Arquivos
- `src/pages/Dashboard.tsx` - Dashboard comercial
- `src/pages/AdminUsers.tsx` - Gerenciamento de usuarios/lojas
- `supabase/functions/send-checklist-email/index.ts` - Edge function de email

### Arquivos Modificados
- `src/pages/Login.tsx` - Adicionar selecao de loja no cadastro
- `src/pages/Checklist.tsx` - Botao enviar, salvar no banco, chamar edge function
- `src/App.tsx` - Novas rotas
- `src/components/Navbar.tsx` - Link para dashboard


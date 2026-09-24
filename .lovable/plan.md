# Recuperar velocidade, acesso administrativo e lojas

## Alterações
- Encerrar o login assim que a senha for validada, sem aguardar em sequência permissões, lojas e página inicial.
- Carregar a lista de lojas diretamente pelas regras de acesso do banco, sem depender da confirmação tardia do perfil administrativo.
- Aplicar a mesma fonte de lojas nas telas que usam a lista compartilhada.
- Remover a duplicidade de consultas de perfil durante a abertura da sessão.

## Validação
- Confirmar entrada rápida com uma sessão autenticada.
- Confirmar que o administrador recebe as 24 lojas cadastradas.
- Confirmar que usuários comuns continuam vendo somente lojas aprovadas.
- Verificar a página em computador e celular e confirmar que não há erros de compilação.

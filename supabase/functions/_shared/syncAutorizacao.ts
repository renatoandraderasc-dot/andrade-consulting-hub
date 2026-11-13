export function permiteSincronizar(admin: boolean, acessoAprovado: boolean, loja: string | undefined): boolean {
  return admin || (!!loja && acessoAprovado);
}
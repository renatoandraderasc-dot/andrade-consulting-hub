export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(`Carregar acessos: ${error.message}`);
    if (!data) throw new Error("Não foi possível carregar os acessos.");
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}
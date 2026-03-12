export interface Product {
  id: string;
  categoria: string;
  codigo: string;
  descricao: string;
  custo: number;
  precoAtual: number;
  margem: number;
  amplaConcorrente: number | null;
  baixaConcorrencia: number | null;
  direto: number | null;
  simulacao: number | null;
  status: "maior" | "menor" | "igual";
  confiancaMatch: number;
}

const categorias = [
  "Mercearia", "Bebidas", "Higiene", "Limpeza", "Frios", "Açougue",
  "Padaria", "Hortifrúti", "Laticínios", "Congelados",
];

export const mockProducts: Product[] = [
  { id: "1", categoria: "Mercearia", codigo: "10012", descricao: "Arroz Tipo 1 Camil 5kg", custo: 18.50, precoAtual: 27.99, margem: 33.9, amplaConcorrente: 26.49, baixaConcorrencia: 28.90, direto: 27.49, simulacao: null, status: "maior", confiancaMatch: 95 },
  { id: "2", categoria: "Mercearia", codigo: "10015", descricao: "Feijão Carioca Kicaldo 1kg", custo: 6.20, precoAtual: 8.99, margem: 31.1, amplaConcorrente: 8.99, baixaConcorrencia: 9.49, direto: 8.99, simulacao: null, status: "igual", confiancaMatch: 98 },
  { id: "3", categoria: "Bebidas", codigo: "20034", descricao: "Coca-Cola Original 2L", custo: 5.80, precoAtual: 8.49, margem: 31.7, amplaConcorrente: 8.99, baixaConcorrencia: 9.29, direto: 8.79, simulacao: null, status: "menor", confiancaMatch: 100 },
  { id: "4", categoria: "Bebidas", codigo: "20041", descricao: "Cerveja Brahma Duplo Malte 350ml", custo: 2.10, precoAtual: 3.99, margem: 47.4, amplaConcorrente: 3.49, baixaConcorrencia: 3.79, direto: 3.59, simulacao: null, status: "maior", confiancaMatch: 92 },
  { id: "5", categoria: "Higiene", codigo: "30021", descricao: "Sabonete Dove Original 90g", custo: 2.80, precoAtual: 4.29, margem: 34.7, amplaConcorrente: 3.99, baixaConcorrencia: 4.49, direto: 4.19, simulacao: null, status: "maior", confiancaMatch: 88 },
  { id: "6", categoria: "Limpeza", codigo: "40018", descricao: "Detergente Ypê 500ml", custo: 1.90, precoAtual: 2.99, margem: 36.5, amplaConcorrente: 2.79, baixaConcorrencia: 3.19, direto: 2.89, simulacao: null, status: "maior", confiancaMatch: 90 },
  { id: "7", categoria: "Frios", codigo: "50009", descricao: "Presunto Cozido Sadia kg", custo: 18.90, precoAtual: 29.99, margem: 37.0, amplaConcorrente: 28.49, baixaConcorrencia: 31.99, direto: 29.49, simulacao: null, status: "maior", confiancaMatch: 85 },
  { id: "8", categoria: "Açougue", codigo: "60005", descricao: "Picanha Bovina kg", custo: 42.00, precoAtual: 59.99, margem: 30.0, amplaConcorrente: 62.90, baixaConcorrencia: 64.99, direto: 61.49, simulacao: null, status: "menor", confiancaMatch: 78 },
  { id: "9", categoria: "Padaria", codigo: "70003", descricao: "Pão Francês kg", custo: 7.50, precoAtual: 14.99, margem: 50.0, amplaConcorrente: 14.99, baixaConcorrencia: 15.99, direto: 14.99, simulacao: null, status: "igual", confiancaMatch: 100 },
  { id: "10", categoria: "Hortifrúti", codigo: "80011", descricao: "Banana Prata kg", custo: 3.20, precoAtual: 5.99, margem: 46.6, amplaConcorrente: 5.49, baixaConcorrencia: 6.29, direto: 5.79, simulacao: null, status: "maior", confiancaMatch: 82 },
  { id: "11", categoria: "Laticínios", codigo: "90007", descricao: "Leite Integral Italac 1L", custo: 3.80, precoAtual: 5.49, margem: 30.8, amplaConcorrente: 5.29, baixaConcorrencia: 5.69, direto: 5.39, simulacao: null, status: "maior", confiancaMatch: 96 },
  { id: "12", categoria: "Congelados", codigo: "11002", descricao: "Pizza Sadia Mussarela 440g", custo: 8.50, precoAtual: 13.99, margem: 39.2, amplaConcorrente: 12.49, baixaConcorrencia: 14.49, direto: 13.29, simulacao: null, status: "maior", confiancaMatch: 91 },
  { id: "13", categoria: "Mercearia", codigo: "10029", descricao: "Açúcar Cristal União 1kg", custo: 3.90, precoAtual: 5.49, margem: 29.0, amplaConcorrente: 5.49, baixaConcorrencia: 5.99, direto: 5.49, simulacao: null, status: "igual", confiancaMatch: 97 },
  { id: "14", categoria: "Mercearia", codigo: "10033", descricao: "Óleo de Soja Liza 900ml", custo: 5.40, precoAtual: 7.99, margem: 32.4, amplaConcorrente: 7.49, baixaConcorrencia: 8.29, direto: 7.69, simulacao: null, status: "maior", confiancaMatch: 93 },
  { id: "15", categoria: "Bebidas", codigo: "20055", descricao: "Suco Del Valle Uva 1L", custo: 4.20, precoAtual: 6.99, margem: 39.9, amplaConcorrente: 6.49, baixaConcorrencia: 7.29, direto: 6.79, simulacao: null, status: "maior", confiancaMatch: 87 },
  { id: "16", categoria: "Limpeza", codigo: "40025", descricao: "Água Sanitária Qboa 1L", custo: 2.50, precoAtual: 3.99, margem: 37.3, amplaConcorrente: 3.79, baixaConcorrencia: 4.19, direto: 3.89, simulacao: null, status: "maior", confiancaMatch: 94 },
  { id: "17", categoria: "Laticínios", codigo: "90014", descricao: "Queijo Mussarela Fatiado kg", custo: 28.00, precoAtual: 42.99, margem: 34.9, amplaConcorrente: 39.90, baixaConcorrencia: 44.99, direto: 41.49, simulacao: null, status: "maior", confiancaMatch: 80 },
  { id: "18", categoria: "Higiene", codigo: "30038", descricao: "Papel Higiênico Neve 12 rolos", custo: 12.50, precoAtual: 18.99, margem: 34.2, amplaConcorrente: 17.99, baixaConcorrencia: 19.49, direto: 18.49, simulacao: null, status: "maior", confiancaMatch: 95 },
  { id: "19", categoria: "Congelados", codigo: "11009", descricao: "Hambúrguer Seara 672g", custo: 9.80, precoAtual: 15.49, margem: 36.7, amplaConcorrente: 14.99, baixaConcorrencia: 16.29, direto: 15.29, simulacao: null, status: "maior", confiancaMatch: 89 },
  { id: "20", categoria: "Hortifrúti", codigo: "80019", descricao: "Tomate Italiano kg", custo: 4.50, precoAtual: 8.99, margem: 49.9, amplaConcorrente: 7.99, baixaConcorrencia: 9.49, direto: 8.49, simulacao: null, status: "maior", confiancaMatch: 75 },
];

export const allCategorias = [...new Set(mockProducts.map(p => p.categoria))].sort();

import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ListaCega from './ListaCega';
const mocks=vi.hoisted(()=>({select:vi.fn(),report:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'user'}})}));
vi.mock('@/lib/vrReport',()=>({chamarRelatorio:mocks.report,avisoRelatorio:()=>null,pick:(p:Record<string,unknown>,...keys:string[])=>keys.map(k=>p[k]).find(Boolean)}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>({select:(columns:string)=>{mocks.select(table,columns);const q={eq:()=>q,order:async()=>({data:table==='recebimento_itens'?[{id:'item',seq_xml:1,codproduto:42,descricao_xml:'Produto da nota',descricao_produto:'Produto cadastrado',ean:'7891234567890',eans_cadastro:'7891234567890,7891234567891'}]:[],error:null})};return q;}})}}));
afterEach(cleanup);
describe('seleção da identidade na contagem',()=>{
 it('permite contar EAN sem cadastro para depois vincular ao item da nota',async()=>{
  mocks.report.mockResolvedValue({dados:[]});
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ListaCega id="receipt" store="store" round={2} targets={[]} onClosed={()=>{}} onRefresh={()=>{}}/></QueryClientProvider>);
  fireEvent.change(screen.getByRole('textbox',{name:'EAN do produto'}),{target:{value:'99999999'}});
  fireEvent.click(screen.getByRole('button',{name:'Buscar'}));
  await waitFor(()=>expect(screen.getByRole('textbox',{name:'Quantidade contada'})).toHaveFocus());
  expect(screen.getByRole('button',{name:'Gravar'})).toBeEnabled();
 });
 it('carrega só identidade e Usar EAN resolve o cadastro e foca a quantidade',async()=>{
  mocks.report.mockResolvedValue({dados:[{codproduto:42,descricao:'Produto cadastrado'}]});
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ListaCega id="receipt" store="store" round={2} targets={[]} onClosed={()=>{}} onRefresh={()=>{}}/></QueryClientProvider>);
  await screen.findAllByText('Produto da nota');
  expect(mocks.select).toHaveBeenCalledWith('recebimento_itens','id,seq_xml,codproduto,descricao_xml,descricao_produto,ean,eans_cadastro,cprod,ref_cadastro');
  fireEvent.click(screen.getAllByRole('button',{name:'Usar EAN'})[0]);
  expect(screen.getByRole('textbox',{name:'EAN do produto'})).toHaveValue('7891234567890');
  await waitFor(()=>expect(screen.getByRole('textbox',{name:'Quantidade contada'})).toHaveFocus());
  expect(mocks.report).toHaveBeenCalledWith('store','produto_por_ean',{ean:'7891234567890'});
 });
});
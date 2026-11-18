import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import VincularEan from './VincularEan';
const mocks=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/lib/recebimento',()=>({invokeReceipt:mocks.invoke}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const item={id:'i',seq_xml:1,codproduto:42,descricao_xml:'Nota',descricao_produto:'Cadastro',ean:'78900001',eans_cadastro:'78900002',cprod:'42',ref_cadastro:null};
describe('seletor do vínculo',()=>{
 it('cadastra por padrão somente EAN sem produto conhecido e espera recarregamento',async()=>{
  mocks.invoke.mockResolvedValue({ok:true,websac:'VINCULADO'});const linked=vi.fn(),close=vi.fn();
  render(<VincularEan store="loja" id="nota" round={2} ean="99999999" unknown items={[item]} onClose={close} onLinked={linked}/>);
  expect(screen.getByRole('checkbox')).toBeChecked();fireEvent.click(screen.getByRole('radio'));fireEvent.click(screen.getByRole('button',{name:'Confirmar vínculo'}));
  await waitFor(()=>expect(mocks.invoke).toHaveBeenCalledWith('loja','vincular_ean',{recebimento_id:'nota',rodada:2,ean:'99999999',seq_xml:1,gravar_websac:true}));
  await waitFor(()=>expect(linked).toHaveBeenCalled());expect(close).toHaveBeenCalled();
 });
 it('não grava no ERP quando o EAN já tem produto',async()=>{
  mocks.invoke.mockResolvedValue({ok:true,websac:null});
  render(<VincularEan store="loja" id="nota" round={1} ean="99999999" unknown={false} items={[item]} onClose={()=>{}} onLinked={async()=>{}}/>);
  expect(screen.queryByRole('checkbox')).toBeNull();fireEvent.click(screen.getByRole('radio'));fireEvent.click(screen.getByRole('button',{name:'Confirmar vínculo'}));
  await waitFor(()=>expect(mocks.invoke).toHaveBeenCalledWith('loja','vincular_ean',expect.objectContaining({gravar_websac:false})));
 });
});
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
export default function Scanner({danfe,onRead,onClose}: {danfe:boolean;onRead:(v:string)=>void;onClose:()=>void}) {
  const video=useRef<HTMLVideoElement>(null), callback=useRef(onRead);
  callback.current=onRead;
  const [error,setError]=useState('');
  useEffect(()=>{
    let closed=false, controls:IScannerControls|undefined, stream:MediaStream|undefined, timer:number|undefined, done=false;
    const read=(v:string)=>{const digits=v.replace(/\D/g,'');if(done || (danfe?digits.length!==44:digits.length<8))return;done=true;navigator.vibrate?.(150);callback.current(digits);};
    const start=async()=>{try {
      const el=video.current;if(!el)return;
      const Detector=(window as any).BarcodeDetector;
      let native=false;
      if(Detector) { const supported=await Detector.getSupportedFormats(); native=(danfe?['code_128']:['ean_13','ean_8','code_128']).every(f=>supported.includes(f)); }
      if(native){const detector=new Detector({formats:danfe?['code_128']:['ean_13','ean_8','code_128']});stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});if(closed){stream.getTracks().forEach(t=>t.stop());return;}el.srcObject=stream;await el.play();const tick=async()=>{if(closed||done)return;try{if(el.readyState>=2)for(const r of await detector.detect(el))read(r.rawValue);}catch{}timer=window.setTimeout(tick,200);};void tick();}
      else {const hints=new Map();hints.set(DecodeHintType.POSSIBLE_FORMATS,danfe?[BarcodeFormat.CODE_128]:[BarcodeFormat.EAN_13,BarcodeFormat.EAN_8,BarcodeFormat.CODE_128]);const reader=new BrowserMultiFormatReader(hints);controls=await reader.decodeFromConstraints({video:{facingMode:'environment'},audio:false},el,(result)=>{if(!closed&&result)read(result.getText());});if(closed)controls.stop();}
    }catch(e){if(!closed)setError('Não foi possível abrir a câmera. Permita o acesso ou use a digitação.');}};
    void start();return()=>{closed=true;controls?.stop();stream?.getTracks().forEach(t=>t.stop());window.clearTimeout(timer);};
  },[danfe]);
  return <Dialog open onOpenChange={o=>!o&&onClose()}><DialogContent><DialogTitle>{danfe?'Escanear DANFE':'Ler EAN'}</DialogTitle><DialogDescription>{danfe?'Código de barras da chave de 44 dígitos':'Código de barras do produto'}</DialogDescription><video ref={video} muted playsInline className="w-full aspect-square object-cover rounded-md bg-muted"/>{error&&<p role="alert" className="text-destructive">{error}</p>}</DialogContent></Dialog>;
}

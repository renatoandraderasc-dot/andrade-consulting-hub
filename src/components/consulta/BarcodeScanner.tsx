import { useEffect, useRef, useState } from "react";
import { X, Zap, ZapOff, RefreshCw, Loader2 } from "lucide-react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";

interface Props {
  onDetect: (codigo: string) => void;
  onClose: () => void;
}

const FORMATOS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

/** Scanner em tela cheia: mira, lanterna, troca de câmera e leitura confirmada. */
const BarcodeScanner = ({ onDetect, onClose }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ultimoRef = useRef<{ code: string; hits: number }>({ code: "", hits: 0 });
  const finalizadoRef = useRef(false);

  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [camIndex, setCamIndex] = useState(0);
  const [pronto, setPronto] = useState(false);
  const [torch, setTorch] = useState(false);
  const [temTorch, setTemTorch] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [parcial, setParcial] = useState<string | null>(null);

  const desligar = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
  };

  useEffect(() => {
    let cancelado = false;
    setPronto(false);
    setErro(null);

    (async () => {
      try {
        // permissão primeiro, senão os labels/deviceIds vêm vazios
        const inicial = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        inicial.getTracks().forEach((t) => t.stop());

        const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "videoinput",
        );
        if (cancelado) return;
        // prioriza câmeras traseiras
        const ordenadas = [
          ...devices.filter((d) => /back|rear|traseira|environment/i.test(d.label)),
          ...devices.filter((d) => !/back|rear|traseira|environment/i.test(d.label)),
        ];
        setCams(ordenadas);
        const alvo = ordenadas[camIndex] || ordenadas[0];

        const stream = await navigator.mediaDevices.getUserMedia({
          video: alvo?.deviceId
            ? { deviceId: { exact: alvo.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: "environment" } },
          audio: false,
        });
        const video = videoRef.current;
        if (cancelado || !video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play().catch(() => undefined);

        const track = stream.getVideoTracks()[0];
        const caps: any = track.getCapabilities?.() || {};
        setTemTorch(!!caps.torch);
        setPronto(true);

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATOS);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });

        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (!result || finalizadoRef.current) return;
          const texto = result.getText().trim();
          if (!texto) return;
          const u = ultimoRef.current;
          u.hits = u.code === texto ? u.hits + 1 : 1;
          u.code = texto;
          setParcial(texto);
          if (u.hits >= 2) {
            finalizadoRef.current = true;
            try {
              navigator.vibrate?.(80);
            } catch {
              /* noop */
            }
            desligar();
            onDetect(texto);
          }
        });
        if (cancelado) controls.stop();
        else controlsRef.current = controls;
      } catch (e: any) {
        if (cancelado) return;
        setErro(
          e?.name === "NotAllowedError"
            ? "Permissão de câmera negada. Libere o acesso nas configurações do navegador."
            : "Não foi possível abrir a câmera. Use HTTPS e verifique se outro app está usando-a.",
        );
      }
    })();

    return () => {
      cancelado = true;
      desligar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camIndex]);

  const alternarTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as any] });
      setTorch(!torch);
    } catch {
      setTemTorch(false);
    }
  };

  const fechar = () => {
    desligar();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white/90">
        <span className="text-sm font-medium" translate="no">
          Escanear código de barras
        </span>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={fechar}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay muted playsInline />

        {/* máscara com janela de leitura */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-x-0 top-0 h-[30%] bg-black/60" />
          <div className="absolute inset-x-0 bottom-0 h-[40%] bg-black/60" />
          <div className="absolute left-0 top-[30%] h-[30%] w-6 bg-black/60" />
          <div className="absolute right-0 top-[30%] h-[30%] w-6 bg-black/60" />
          <div className="absolute left-6 right-6 top-[30%] h-[30%] border-2 border-primary/80 rounded-xl">
            <div className="absolute inset-x-3 top-1/2 h-0.5 bg-primary animate-pulse" />
          </div>
        </div>

        {!pronto && !erro && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Abrindo câmera…
          </div>
        )}

        {erro && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/90">
            {erro}
          </div>
        )}
      </div>

      <div className="px-4 py-4 space-y-3 text-center">
        <p className="text-xs text-white/70">
          {parcial ? `Lendo ${parcial}…` : "Alinhe as barras dentro da moldura, a ~15 cm"}
        </p>
        <div className="flex items-center justify-center gap-2">
          {temTorch && (
            <Button variant="secondary" size="sm" onClick={alternarTorch}>
              {torch ? <ZapOff className="w-4 h-4 mr-1" /> : <Zap className="w-4 h-4 mr-1" />}
              Lanterna
            </Button>
          )}
          {cams.length > 1 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCamIndex((i) => (i + 1) % cams.length)}
            >
              <RefreshCw className="w-4 h-4 mr-1" /> Trocar câmera
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fechar}>
            Digitar código
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BarcodeScanner;

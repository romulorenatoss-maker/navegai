/**
 * AnexoViewer
 * ---------------------------------------------------------------
 * Visualizador interno de anexos do módulo Tarefas.
 * Sempre via signed URL (proxy) — nunca expõe link direto do provider.
 * Suporta image, video, audio, pdf (iframe) e fallback de download.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, AlertCircle } from "lucide-react";
import { tarefas_storage_service } from "@/modules/tarefas/services/tarefas_storage_service";

interface AnexoViewerProps {
  anexoId: string | null;
  nomeOriginal?: string;
  mimeType?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnexoViewer({ anexoId, nomeOriginal, mimeType, open, onOpenChange }: AnexoViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !anexoId) { setUrl(null); setError(null); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    tarefas_storage_service.getSignedUrl(anexoId)
      .then(({ url }) => { if (!cancelled) setUrl(url); })
      .catch((e) => { if (!cancelled) setError(e.message ?? "Falha ao carregar"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [anexoId, open]);

  const mt = (mimeType ?? "").toLowerCase();
  const isImage = mt.startsWith("image/");
  const isVideo = mt.startsWith("video/");
  const isAudio = mt.startsWith("audio/");
  const isPdf = mt === "application/pdf";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate">{nomeOriginal ?? "Anexo"}</DialogTitle>
        </DialogHeader>
        <div className="min-h-[300px] flex items-center justify-center bg-muted/30 rounded">
          {loading && <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />}
          {error && (
            <div className="text-center text-sm text-destructive flex flex-col items-center gap-2 p-6">
              <AlertCircle className="w-6 h-6" />
              {error}
            </div>
          )}
          {!loading && !error && url && (
            <>
              {isImage && <img src={url} alt={nomeOriginal ?? ""} className="max-h-[70vh] max-w-full object-contain" />}
              {isVideo && <video src={url} controls className="max-h-[70vh] max-w-full" />}
              {isAudio && <audio src={url} controls className="w-full" />}
              {isPdf && <iframe src={url} title={nomeOriginal ?? "PDF"} className="w-full h-[70vh] border-0" />}
              {!isImage && !isVideo && !isAudio && !isPdf && (
                <div className="text-center p-6 text-sm text-muted-foreground">
                  Pré-visualização indisponível para este tipo.
                  <div className="mt-3">
                    <Button asChild size="sm" variant="outline">
                      <a href={url} download={nomeOriginal ?? "anexo"}>
                        <Download className="w-4 h-4 mr-2" /> Baixar
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {url && (isImage || isVideo || isAudio || isPdf) && (
          <div className="flex justify-end pt-2">
            <Button asChild size="sm" variant="outline">
              <a href={url} download={nomeOriginal ?? "anexo"}>
                <Download className="w-4 h-4 mr-2" /> Baixar
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

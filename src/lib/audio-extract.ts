// Extrai o áudio de um arquivo (vídeo ou áudio) e devolve trechos WAV 16 kHz mono,
// prontos para transcrição. Assim vídeos grandes viram poucos megabytes de áudio.

const TARGET_RATE = 16_000;
const CHUNK_SECONDS = 60; // trechos curtos: o texto começa a aparecer em segundos

type AudioContextConstructor = typeof AudioContext;

function getAudioContext(): AudioContextConstructor {
  const win = window as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor };
  const ctor = win.AudioContext ?? win.webkitAudioContext;
  if (!ctor) throw new Error("Seu navegador não consegue processar este arquivo.");
  return ctor;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export type ExtractedAudio = {
  chunks: Blob[];
  durationSeconds: number;
};

export async function extractAudioChunks(file: File): Promise<ExtractedAudio> {
  const Ctor = getAudioContext();
  const decodeContext = new Ctor();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeContext.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("Não foi possível ler o áudio deste arquivo. Tente converter para MP4, MP3 ou WAV.");
  } finally {
    void decodeContext.close();
  }

  const frames = Math.ceil(decoded.duration * TARGET_RATE);
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);

  const chunkSize = CHUNK_SECONDS * TARGET_RATE;
  const chunks: Blob[] = [];
  for (let start = 0; start < samples.length; start += chunkSize) {
    chunks.push(encodeWav(samples.slice(start, start + chunkSize), TARGET_RATE));
  }

  return { chunks, durationSeconds: decoded.duration };
}

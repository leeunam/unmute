"use client";

import { useEffect, useRef, useState } from "react";
import { resumir, type Resumo } from "@/lib/resumo";
import type { IAgoraRTCClient, IMicrophoneAudioTrack, IRemoteAudioTrack } from "agora-rtc-sdk-ng";
import { DeviceMobile, Plant } from "@phosphor-icons/react/dist/ssr";
import { buttonVariants } from "@/components/ui/button";
import { ChamadaHero } from "@/components/produtor/chamada-hero";
import { ConversaAoVivo } from "@/components/produtor/conversa-ao-vivo";
import { CartaoPedido } from "@/components/produtor/cartao-pedido";
import { CartaoLatencia } from "@/components/produtor/cartao-latencia";
import { CartaoCompra, type Compra } from "@/components/produtor/cartao-compra";

type Sessao = { appId: string; channel: string; uid: number; token: string; agentId: string };
type Turnos = {
  turnos: { turno: number; inicio: string; fim: string; e2e_ms: number | null; segmentos: Record<string, number> }[];
  resumo: Resumo;
};

// Medição no navegador: do último instante com voz no microfone até o
// primeiro áudio do agente. Inclui rede e o silêncio que o VAD espera.
const POLL_MS = 30;
const LIMIAR_USUARIO = 0.08;
const LIMIAR_AGENTE = 0.03;
const SILENCIO_AGENTE_MS = 600;

type EstadoTarefa = {
  tarefa: Record<string, string | number | undefined>;
  faltando: string[];
  completa: boolean;
  conversa: { quem: string; texto: string }[];
  compra: Compra;
};
const postar = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const CAMPOS: [string, string][] = [
  ["produto", "Produto"],
  ["quantidade", "Quantidade"],
  ["unidade", "Unidade"],
  ["prazo_entrega", "Entrega até"],
  ["teto_total", "Teto total"],
  ["local_entrega", "Local"],
  ["observacoes", "Observações"],
];
function valorCampo(k: string, t: EstadoTarefa["tarefa"]) {
  const v = t[k];
  if (v === undefined) return undefined;
  if (k === "teto_total") return `R$ ${Number(v).toLocaleString("pt-BR")}`;
  if (k === "quantidade") return Number(v).toLocaleString("pt-BR");
  if (k === "prazo_entrega") {
    const d = new Date(`${v}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
    return t.prazo_falado ? `${d} ("${t.prazo_falado}")` : d;
  }
  return String(v);
}

// Resumo de uma linha do pedido, para quando a compra já começou: "2.500 L de Diesel S10 · até qui 26/11 · teto R$ 15.000".
function resumoPedido(t: EstadoTarefa["tarefa"]) {
  const un = t.unidade === "litros" ? "L" : t.unidade;
  const prazo = t.prazo_entrega
    ? new Date(`${t.prazo_entrega}T12:00:00Z`)
        .toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
        .replace(/\.,?/g, "")
    : undefined;
  return [
    `${Number(t.quantidade).toLocaleString("pt-BR")} ${un} de ${t.produto}`,
    prazo && `até ${prazo}`,
    t.teto_total !== undefined && `teto R$ ${Number(t.teto_total).toLocaleString("pt-BR")}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// A tarefa fica em memória no servidor; a página consulta a cada 500 ms
// (mais simples que SSE e não sofre com buffer do túnel).
function useTarefa() {
  const [t, setT] = useState<EstadoTarefa | null>(null);
  useEffect(() => {
    let vivo = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/tarefa", { cache: "no-store" });
        if (vivo && r.ok) setT(await r.json());
      } catch {}
    };
    tick();
    const id = setInterval(tick, 500);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);
  return t;
}

export default function Home() {
  const [estado, setEstado] = useState<"parado" | "conectando" | "conversando" | "encerrando">("parado");
  const [status, setStatus] = useState("");
  const [erro, setErro] = useState("");
  const [usuarioFalando, setUsuarioFalando] = useState(false);
  const [agenteFalando, setAgenteFalando] = useState(false);
  const [latencias, setLatencias] = useState<number[]>([]);
  const [turnos, setTurnos] = useState<Turnos | null>(null);

  const client = useRef<IAgoraRTCClient | null>(null);
  const mic = useRef<IMicrophoneAudioTrack | null>(null);
  const remoto = useRef<IRemoteAudioTrack | null>(null);
  const sessao = useRef<Sessao | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  function medir() {
    let ultimaVozUsuario = 0;
    let agenteAtivo = false;
    let agenteQuietoDesde = performance.now();
    let fimUltimaFalaAgente = 0;

    timer.current = setInterval(() => {
      const agora = performance.now();
      const u = mic.current?.getVolumeLevel() ?? 0;
      const a = remoto.current?.getVolumeLevel() ?? 0;

      // Voz do usuário enquanto o agente fala é ignorada (pode ser eco).
      const usuarioAtivo = u > LIMIAR_USUARIO;
      setUsuarioFalando(usuarioAtivo);
      if (usuarioAtivo && !agenteAtivo) ultimaVozUsuario = agora;

      if (a > LIMIAR_AGENTE) {
        if (!agenteAtivo) {
          agenteAtivo = true;
          setAgenteFalando(true);
          if (ultimaVozUsuario > fimUltimaFalaAgente) {
            const ms = Math.round(agora - ultimaVozUsuario);
            setLatencias((l) => [...l, ms]);
          }
        }
        agenteQuietoDesde = agora;
        ultimoSomAgente.current = agora;
      } else if (agenteAtivo && agora - agenteQuietoDesde > SILENCIO_AGENTE_MS) {
        agenteAtivo = false;
        setAgenteFalando(false);
        fimUltimaFalaAgente = agenteQuietoDesde;
      }
    }, POLL_MS);
  }

  // Grava a voz do agente para comparar TTS de ouvido (scripts/rodada.mjs lê window.__gravacao).
  const gravador = useRef<MediaRecorder | null>(null);
  function gravarAgente() {
    const track = remoto.current?.getMediaStreamTrack();
    if (!track || gravador.current || typeof MediaRecorder === "undefined") return;
    const partes: Blob[] = [];
    const rec = new MediaRecorder(new MediaStream([track]));
    rec.ondataavailable = (e) => partes.push(e.data);
    const w = window as unknown as { __gravacao?: Promise<string> };
    w.__gravacao = new Promise((resolve) => {
      rec.onstop = async () => {
        const buf = await new Blob(partes, { type: rec.mimeType }).arrayBuffer();
        let bin = "";
        new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
        resolve(btoa(bin));
      };
    });
    rec.start(1000);
    gravador.current = rec;
  }

  const ultimoSomAgente = useRef(0);

  // retorno: o produtor atende a ligação de volta com as ofertas (o agente abre com a recomendação).
  async function iniciar(retorno = false) {
    setErro("");
    setTurnos(null);
    setLatencias([]);
    setEstado("conectando");
    try {
      setStatus("Subindo o agente na Agora…");
      const res = await fetch("/api/sessao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retorno }),
      });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.erro ?? `Falha ao iniciar (${res.status})`);
      sessao.current = dados as Sessao;

      setStatus("Entrando no canal de voz…");
      // Import dinâmico: o SDK da Agora usa window e quebraria no servidor.
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      const c = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      client.current = c;

      c.on("user-published", async (user, mediaType) => {
        if (mediaType !== "audio") return;
        await c.subscribe(user, "audio");
        remoto.current = user.audioTrack ?? null;
        remoto.current?.play();
        gravarAgente();
        setStatus("Pode falar. O agente está ouvindo.");
      });
      c.on("user-unpublished", () => {
        remoto.current = null;
      });

      await c.join(dados.appId, dados.channel, dados.token, dados.uid);
      mic.current = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
      await c.publish([mic.current]);
      setEstado("conversando");
      setStatus("Esperando o agente entrar…");
      medir();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setStatus("");
      await desligarLocal();
      setEstado("parado");
    }
  }

  async function desligarLocal() {
    if (gravador.current?.state === "recording") gravador.current.stop();
    gravador.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    mic.current?.close();
    mic.current = null;
    remoto.current = null;
    await client.current?.leave().catch(() => {});
    client.current = null;
    setUsuarioFalando(false);
    setAgenteFalando(false);
  }

  async function encerrar() {
    // Pode ser chamado duas vezes (fim automático e ?auto=N): só a 1ª encerra.
    const s = sessao.current;
    if (!s) return;
    sessao.current = null;
    setEstado("encerrando");
    setStatus("Encerrando…");
    await desligarLocal();
    try {
      await fetch("/api/encerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: s.channel, agentId: s.agentId }),
      });
      await fetch("/api/latencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: s.agentId, navegador_ms: latencias }),
      }).catch(() => {});
      // Os turnos podem demorar um pouco para aparecer depois que o agente sai.
      for (let tentativa = 1; tentativa <= 5; tentativa++) {
        setStatus(`Buscando a latência medida pela Agora (tentativa ${tentativa})…`);
        await new Promise((r) => setTimeout(r, 3000));
        const res = await fetch(`/api/latencia?channel=${s.channel}&agentId=${s.agentId}`);
        const dados = await res.json();
        if (res.ok && dados.turnos?.length) {
          setTurnos(dados);
          break;
        }
        if (!res.ok) setErro(dados.erro ?? `Falha ao buscar turnos (${res.status})`);
      }
      setStatus(`Sessão encerrada. Agente ${s.agentId}.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEstado("parado");
    }
  }

  const resumoNavegador = resumir(latencias);
  const tarefa = useTarefa();
  const estadoCompra = tarefa?.compra.estado;
  const tocando = estadoCompra === "OFERTAS_COLETADAS" && estado === "parado";
  // Durante as ligações, a conversa mostrada é a do fornecedor da vez.
  const ligacaoAtual = tarefa?.compra.ligacoes.findLast((l) => l.status === "em_andamento" || (l.status === "encerrada" && /^LIGANDO/.test(estadoCompra ?? "")));

  // Modo automático para medir sem ninguém clicar: /?auto=70 começa sozinho e encerra depois de
  // 70 s (scripts/rodada.mjs). Se a compra está ligando para os fornecedores, espera a ligação de
  // volta tocar e atende.
  const iniciarRef = useRef(iniciar);
  const encerrarRef = useRef(encerrar);
  iniciarRef.current = iniciar;
  encerrarRef.current = encerrar;
  const autoIniciado = useRef(false);
  useEffect(() => {
    const auto = Number(new URLSearchParams(window.location.search).get("auto"));
    // A trava evita subir dois agentes quando o React roda o efeito duas vezes (dev).
    if (!auto || autoIniciado.current || !estadoCompra) return;
    if (/^LIGANDO/.test(estadoCompra)) return; // espera tocar
    autoIniciado.current = true;
    iniciarRef.current(estadoCompra === "OFERTAS_COLETADAS");
    setTimeout(() => encerrarRef.current(), auto * 1000);
  }, [estadoCompra]);

  // A sessão termina sozinha quando a compra muda de fase: depois do "vou ligar pros fornecedores"
  // e depois do "fechado". Espera o agente terminar de falar (1,2 s de silêncio, máx. 15 s).
  const estadoAnterior = useRef(estadoCompra);
  useEffect(() => {
    const antes = estadoAnterior.current;
    estadoAnterior.current = estadoCompra;
    if (estado !== "conversando" || !antes || antes === estadoCompra) return;
    if (!["LIGANDO_A", "FECHADA", "CANCELADA"].includes(estadoCompra ?? "")) return;
    const desde = performance.now();
    const t = setInterval(() => {
      const agora = performance.now();
      const falouDepois = ultimoSomAgente.current > desde;
      if ((falouDepois && agora - ultimoSomAgente.current > 1200) || agora - desde > 15000) {
        clearInterval(t);
        encerrarRef.current();
      }
    }, 200);
    return () => clearInterval(t);
  }, [estadoCompra, estado]);

  return (
    <main className="tela mx-auto max-w-[1360px] px-6 pt-6 pb-16 xl:px-10">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-accent text-primary-ink">
          <Plant weight="duotone" className="size-6" />
        </span>
        <div className="min-w-0 flex-1 basis-72">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.015em]">Desenrola Agro</h1>
          <p className="text-sm text-muted-foreground">Fale o que precisa comprar. O agente anota o pedido e pergunta o que faltar.</p>
        </div>
        {/* Os celulares simulados dos fornecedores, sempre à mão (abrem em nova aba). */}
        <nav aria-label="Celulares dos fornecedores" className="ml-auto flex shrink-0 gap-2">
          {(["a", "b"] as const).map((id) => (
            <a key={id} href={`/fornecedor/${id}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "tertiary", size: "sm" })}>
              <DeviceMobile weight="duotone" />
              Celular do {id.toUpperCase()}
            </a>
          ))}
        </nav>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:gap-8">
        <div className="space-y-6">
          <ChamadaHero
            estado={estado}
            usuarioFalando={usuarioFalando}
            agenteFalando={agenteFalando}
            status={status}
            erro={erro}
            tocando={tocando}
            onIniciar={() => iniciar(tocando)}
            onEncerrar={encerrar}
          />
          {ligacaoAtual ? (
            <ConversaAoVivo
              falas={ligacaoAtual.conversa}
              eu="agente"
              nomes={{ agente: "Agente", fornecedor: `Fornecedor ${ligacaoAtual.fornecedor.id.toUpperCase()}` }}
              titulo={`Ligação com o fornecedor ${ligacaoAtual.fornecedor.id.toUpperCase()}`}
            />
          ) : (
            <ConversaAoVivo falas={tarefa?.conversa ?? []} />
          )}
          <CartaoLatencia navegador={resumoNavegador} agora={turnos} />
        </div>

        <div className="space-y-6">
          <CartaoPedido
            resumo={estadoCompra && estadoCompra !== "CRIADA" && tarefa ? resumoPedido(tarefa.tarefa) : undefined}
            completa={tarefa?.completa ?? false}
            campos={
              tarefa
                ? CAMPOS.map(([k, rotulo]) => ({
                    chave: k,
                    rotulo,
                    valor: valorCampo(k, tarefa.tarefa),
                    faltando: tarefa.faltando.includes(k),
                    largo: k === "prazo_entrega" || k === "local_entrega" || k === "observacoes",
                  }))
                : null
            }
          />
          {tarefa && (
            <CartaoCompra
              compra={tarefa.compra}
              pedidoCompleto={tarefa.completa}
              onLigar={() => postar("/api/compra", { acao: "ligar" })}
              onAprovar={(id) => postar("/api/compra", { acao: "aprovar", oferta_id: id })}
              onCancelar={() => postar("/api/compra", { acao: "cancelar" })}
            />
          )}
        </div>
      </div>
    </main>
  );
}

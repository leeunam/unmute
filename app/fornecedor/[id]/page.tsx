"use client";

// Celular do fornecedor (simulado): toca quando o servidor "liga", e quem do time faz o papel
// do fornecedor atende. Atender sobe o agente negociador na Agora e entra no mesmo canal.
// Esta tela só recebe status e nome de quem liga: nada do pedido, nada do teto.
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { IAgoraRTCClient, IMicrophoneAudioTrack, IRemoteAudioTrack } from "agora-rtc-sdk-ng";
import type { Resumo } from "@/lib/resumo";
import { Celular, type ModoCelular } from "@/components/fornecedor/celular";
import { CartaoLatencia } from "@/components/produtor/cartao-latencia";

type Visao = { status: "livre" | "tocando" | "em_andamento" | "encerrada" | "recusada"; chamador?: string; descricao?: string };
type Sessao = { appId: string; channel: string; uid: number; token: string; agentId: string };
type Turnos = { turnos: { turno: number; inicio: string; fim: string; e2e_ms: number | null; segmentos: Record<string, number> }[]; resumo: Resumo };

const SILENCIO_PARA_DESLIGAR_MS = 1200;

export default function Fornecedor() {
  const { id } = useParams<{ id: string }>();
  const [visao, setVisao] = useState<Visao>({ status: "livre" });
  const [fase, setFase] = useState<"espera" | "conectando" | "falando" | "desligando" | "fim">("espera");
  const [erro, setErro] = useState("");
  const [status, setStatus] = useState("");
  const [segundos, setSegundos] = useState(0);
  const [agenteFalando, setAgenteFalando] = useState(false);
  const [turnos, setTurnos] = useState<Turnos | null>(null);

  const client = useRef<IAgoraRTCClient | null>(null);
  const mic = useRef<IMicrophoneAudioTrack | null>(null);
  const remoto = useRef<IRemoteAudioTrack | null>(null);
  const sessao = useRef<Sessao | null>(null);
  const faseRef = useRef(fase);
  faseRef.current = fase;
  const ultimoSomAgente = useRef(0);

  // Consulta o "telefone" a cada 700 ms.
  useEffect(() => {
    let vivo = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/chamada?fornecedor=${id}`, { cache: "no-store" });
        if (vivo && r.ok) setVisao(await r.json());
      } catch {}
    };
    tick();
    const t = setInterval(tick, 700);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [id]);

  // Relógio da ligação e volume do agente (para desligar só depois da despedida terminar).
  useEffect(() => {
    if (fase !== "falando" && fase !== "desligando") return;
    const inicio = Date.now();
    const t = setInterval(() => {
      setSegundos(Math.floor((Date.now() - inicio) / 1000));
      const v = remoto.current?.getVolumeLevel() ?? 0;
      if (v > 0.03) ultimoSomAgente.current = Date.now();
      setAgenteFalando(Date.now() - ultimoSomAgente.current < 300);
    }, 100);
    return () => clearInterval(t);
  }, [fase]);

  // O código do servidor decidiu que a ligação acabou: espera a despedida e desliga.
  useEffect(() => {
    if (visao.status !== "encerrada" || faseRef.current !== "falando") return;
    setFase("desligando");
    setStatus("O agente está se despedindo…");
    // A despedida chega ~1–2 s depois do "encerrada": espera ela começar, depois o silêncio (máx. 15 s).
    const encerradaEm = Date.now();
    const t = setInterval(() => {
      const agora = Date.now();
      const despediu = ultimoSomAgente.current > encerradaEm && agora - ultimoSomAgente.current > SILENCIO_PARA_DESLIGAR_MS;
      if (despediu || agora - encerradaEm > 15000) {
        clearInterval(t);
        desligar();
      }
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visao.status]);

  async function atender() {
    setErro("");
    setFase("conectando");
    try {
      const res = await fetch("/api/chamada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "atender", fornecedor: id }),
      });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.erro ?? `Falha ao atender (${res.status})`);
      sessao.current = dados;
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      const c = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      client.current = c;
      c.on("user-published", async (user, mediaType) => {
        if (mediaType !== "audio") return;
        await c.subscribe(user, "audio");
        remoto.current = user.audioTrack ?? null;
        remoto.current?.play();
      });
      await c.join(dados.appId, dados.channel, dados.token, dados.uid);
      mic.current = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
      await c.publish([mic.current]);
      ultimoSomAgente.current = Date.now();
      setFase("falando");
      setStatus("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setFase("espera");
    }
  }

  async function recusar() {
    await fetch("/api/chamada", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "recusar", fornecedor: id }) });
  }

  async function desligar() {
    if (faseRef.current === "fim") return;
    setFase("fim");
    mic.current?.close();
    mic.current = null;
    await client.current?.leave().catch(() => {});
    client.current = null;
    const s = sessao.current;
    if (!s) return;
    setStatus("Ligação encerrada. Buscando a latência medida pela Agora…");
    await fetch("/api/encerrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: s.channel, agentId: s.agentId }) }).catch(() => {});
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const r = await fetch(`/api/latencia?channel=${s.channel}&agentId=${s.agentId}`);
      const d = await r.json();
      if (r.ok && d.turnos?.length) {
        setTurnos(d);
        break;
      }
    }
    setStatus(`Sessão encerrada. Agente ${s.agentId}.`);
  }

  // ?auto=N: atende sozinho quando tocar e desliga depois de N s (scripts/rodada.mjs).
  const auto = useRef(0);
  useEffect(() => {
    auto.current = Number(new URLSearchParams(window.location.search).get("auto")) || 0;
  }, []);
  useEffect(() => {
    if (auto.current && visao.status === "tocando" && fase === "espera") {
      atender();
      setTimeout(() => faseRef.current !== "fim" && desligar(), auto.current * 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visao.status, fase]);

  const tocando = visao.status === "tocando" && fase === "espera";
  const mmss = `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;

  const modo: ModoCelular = tocando
    ? "tocando"
    : fase === "conectando"
      ? "conectando"
      : fase === "falando" || fase === "desligando"
        ? "em_ligacao"
        : "parado";

  return (
    <main className="tela mx-auto flex max-w-[1360px] flex-col items-center px-6 pt-10 pb-16">
      <p className="mb-6 text-sm font-medium text-muted-foreground">Celular do fornecedor {id.toUpperCase()} · simulado</p>
      <Celular
        modo={modo}
        chamador={visao.chamador}
        descricao={visao.descricao}
        rotuloParado={fase === "fim" ? "Ligação encerrada" : visao.status === "recusada" ? "Chamada recusada" : "Sem chamadas"}
        fornecedor={id.toUpperCase()}
        duracao={mmss}
        agenteFalando={agenteFalando}
        onAtender={atender}
        onRecusar={recusar}
        onDesligar={desligar}
      />
      <p className="status mt-6 text-center">{status}</p>
      {erro && <p className="erro max-w-md text-center">{erro}</p>}
      {turnos && (
        <div className="mt-2 w-full max-w-md">
          <CartaoLatencia navegador={null} agora={turnos} />
        </div>
      )}
    </main>
  );
}

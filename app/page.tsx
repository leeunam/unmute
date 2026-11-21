"use client";

import { useEffect, useRef, useState } from "react";
import { resumir, type Resumo } from "@/lib/resumo";
import type { IAgoraRTCClient, IMicrophoneAudioTrack, IRemoteAudioTrack } from "agora-rtc-sdk-ng";

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
      } else if (agenteAtivo && agora - agenteQuietoDesde > SILENCIO_AGENTE_MS) {
        agenteAtivo = false;
        setAgenteFalando(false);
        fimUltimaFalaAgente = agenteQuietoDesde;
      }
    }, POLL_MS);
  }

  async function iniciar() {
    setErro("");
    setTurnos(null);
    setLatencias([]);
    setEstado("conectando");
    try {
      setStatus("Subindo o agente na Agora…");
      const res = await fetch("/api/sessao", { method: "POST" });
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
    setEstado("encerrando");
    setStatus("Encerrando…");
    await desligarLocal();
    const s = sessao.current;
    if (!s) return setEstado("parado");
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

  // Modo automático para medir sem ninguém clicar: /?auto=70 começa sozinho
  // e encerra depois de 70 s (usado por scripts/audio-falso.sh).
  const iniciarRef = useRef(iniciar);
  const encerrarRef = useRef(encerrar);
  iniciarRef.current = iniciar;
  encerrarRef.current = encerrar;
  const autoIniciado = useRef(false);
  useEffect(() => {
    const auto = Number(new URLSearchParams(window.location.search).get("auto"));
    // A trava evita subir dois agentes quando o React roda o efeito duas vezes (dev).
    if (!auto || autoIniciado.current) return;
    autoIniciado.current = true;
    iniciarRef.current();
    setTimeout(() => encerrarRef.current(), auto * 1000);
  }, []);

  const resumoNavegador = resumir(latencias);

  return (
    <main>
      <h1>Desenrola Agro</h1>
      <p className="sub">Fase 1: conversa por voz em português com o agente da Agora.</p>

      {estado === "parado" || estado === "conectando" ? (
        <button onClick={iniciar} disabled={estado === "conectando"}>
          {estado === "conectando" ? "Conectando…" : "Falar com o agente"}
        </button>
      ) : (
        <button className="parar" onClick={encerrar} disabled={estado === "encerrando"}>
          Encerrar conversa
        </button>
      )}

      <p className="status">{status}</p>
      {erro && <p className="erro">{erro}</p>}

      {estado === "conversando" && (
        <div className="indicadores">
          <span className={`ind ${usuarioFalando ? "on" : ""}`}>Você</span>
          <span className={`ind ${agenteFalando ? "on" : ""}`}>Agente</span>
        </div>
      )}

      <section>
        <h2>Latência no navegador</h2>
        <p className="nota">
          Do último som da sua fala até o primeiro som do agente. Inclui a rede e o silêncio que o agente espera para
          saber que você terminou.
        </p>
        {resumoNavegador ? (
          <>
            <p>
              <strong>Média {resumoNavegador.media_ms} ms</strong> · p50 {resumoNavegador.p50_ms} ms · p90{" "}
              {resumoNavegador.p90_ms} ms · máx {resumoNavegador.max_ms} ms · {resumoNavegador.n} respostas
            </p>
            <p className="nota">Cada resposta: {latencias.join(", ")} ms</p>
          </>
        ) : (
          <p className="nota">Nenhuma resposta medida ainda.</p>
        )}
      </section>

      {turnos && (
        <section>
          <h2>Latência medida pela Agora</h2>
          {turnos.resumo ? (
            <p>
              <strong>Média {turnos.resumo.media_ms} ms</strong> · p50 {turnos.resumo.p50_ms} ms · p90{" "}
              {turnos.resumo.p90_ms} ms · máx {turnos.resumo.max_ms} ms · {turnos.resumo.n} turnos de voz
            </p>
          ) : (
            <p className="nota">Nenhum turno de voz com métrica.</p>
          )}
          <table>
            <thead>
              <tr>
                <th>Turno</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Total</th>
                <th>Partes (ms)</th>
              </tr>
            </thead>
            <tbody>
              {turnos.turnos.map((t) => (
                <tr key={t.turno}>
                  <td>{t.turno}</td>
                  <td>{t.inicio}</td>
                  <td>{t.fim}</td>
                  <td>{t.e2e_ms ?? "–"}</td>
                  <td>
                    {Object.entries(t.segmentos)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

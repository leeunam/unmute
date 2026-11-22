// Integração com o Conversational AI Engine da Agora (só servidor).
// Conferido na doc de 21/11/2026:
//   join:  https://docs.agora.io/en/api-reference/api-ref/conversational-ai/join
//   leave: https://docs.agora.io/en/api-reference/api-ref/conversational-ai/leave
//   turns: https://docs.agora.io/en/api-reference/api-ref/conversational-ai/turns
//   auth:  https://docs.agora.io/en/api-reference/api-ref/conversational-ai/authentication
//   LLM customizado: https://docs.agora.io/en/ai/build/custom-model-integration/custom-llm
//   modo gerenciado (ASR/TTS sem chave): https://docs.agora.io/en/ai/build/managed-mode
import { ConvoAITokenBuilder, RtcRole, RtcTokenBuilder } from "agora-token";
import { FEITA_GATEWAY, feitaModelId, feitaReasoning } from "./feita";
import { resumir } from "./resumo";

const API_BASE = "https://api.agora.io/api/conversational-ai-agent/v2/projects";

export const AGENT_UID = "1001";
export const USER_UID = 1002;

const TOKEN_TTL_S = 60 * 60;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta a variável ${name} no .env.local (veja .env.example)`);
  return value;
}

function appId() {
  return env("AGORA_APP_ID");
}

function appCertificate() {
  return env("AGORA_APP_CERTIFICATE");
}

/** Token do navegador: entra no canal RTC como USER_UID. */
export function userRtcToken(channel: string): string {
  return RtcTokenBuilder.buildTokenWithUid(
    appId(),
    appCertificate(),
    channel,
    USER_UID,
    RtcRole.PUBLISHER,
    TOKEN_TTL_S,
    TOKEN_TTL_S,
  );
}

/**
 * Token do agente. A doc manda usar o mesmo token no header Authorization
 * da REST API e em properties.token (canal e uid precisam bater).
 */
function agentToken(channel: string): string {
  return ConvoAITokenBuilder.buildToken(appId(), appCertificate(), channel, AGENT_UID, TOKEN_TTL_S, TOKEN_TTL_S);
}

const SYSTEM_PROMPT = `Você é o assistente de voz do Desenrola Agro, que ajuda produtores rurais do Brasil.
Fale sempre em português do Brasil, de um jeito simples, educado e direto, como se fala no interior.
Suas respostas viram áudio: use frases curtas, no máximo duas ou três por vez, e faça uma pergunta por vez.
Não use listas, markdown, emojis nem símbolos. Escreva números e valores por extenso quando forem curtos.
Se não entender o que a pessoa disse, peça para ela repetir.`;

const GREETING = "Oi! Aqui é o Desenrola Agro. Em que posso te ajudar hoje?";
const FAILURE = "Desculpa, tive um probleminha aqui. Pode repetir, por favor?";

/** Quem é o agente: o do produtor (padrão) ou o negociador que liga para o fornecedor. */
export type Perfil = { rota: string; sistema: string; saudacao: string };
const PRODUTOR: Perfil = { rota: "/api/llm/chat/completions", sistema: SYSTEM_PROMPT, saudacao: GREETING };

function llmConfig(origin: string, perfil: Perfil) {
  const provider = perfil === PRODUTOR ? process.env.LLM_PROVIDER || "feita-proxy" : "feita-proxy";
  const common = {
    system_messages: [{ role: "system", content: perfil.sistema }],
    greeting_message: perfil.saudacao,
    failure_message: FAILURE,
    max_history: 20,
    style: "openai",
    params: { model: feitaModelId(), max_tokens: 300 },
  };

  if (provider === "feita-proxy") {
    // A Agora chama a nossa rota (/api/llm/chat/completions) pelo túnel público;
    // a rota usa o AI SDK com a feita.ai. Tools, estado e logs ficam do nosso lado.
    const publicUrl = (process.env.PUBLIC_URL || origin).replace(/\/$/, "");
    if (/localhost|127\.0\.0\.1/.test(publicUrl)) {
      throw new Error(
        "A Agora não alcança localhost. Rode npm run tunel e abra o app pelo endereço https://…trycloudflare.com (ou defina PUBLIC_URL).",
      );
    }
    return {
      ...common,
      vendor: "custom",
      url: `${publicUrl}${perfil.rota}`,
      api_key: env("LLM_PROXY_SECRET"),
    };
  }

  if (provider === "feita-direto") {
    // A Agora chama o gateway da feita.ai direto. Serve de base para medir o
    // quanto a nossa rota + túnel somam na latência.
    return {
      ...common,
      url: `${FEITA_GATEWAY}/chat/completions`,
      api_key: env("FEITA_API_KEY"),
      params: { ...common.params, reasoning: feitaReasoning(feitaModelId()) },
    };
  }

  throw new Error(`LLM_PROVIDER inválido: ${provider}. Use "feita-proxy" ou "feita-direto".`);
}

// ASR Deepgram nova-3 gerenciado pela Agora (sem chave). Mais rápido que o ARES
// (asr_ttlw ~300 contra ~370 ms com VAD 300). TESTES.md, seção 7.
const ASR = {
  credential_mode: "managed",
  vendor: "deepgram",
  params: { url: "wss://api.deepgram.com/v1/listen", model: "nova-3", language: "pt-BR" },
};

function ttsConfig() {
  // TTS_JSON troca o bloco tts inteiro (ex.: Cartesia ou Fish Audio gerenciados).
  if (process.env.TTS_JSON) return JSON.parse(process.env.TTS_JSON);
  const vendor = process.env.TTS_VENDOR || "cartesia";
  if (vendor === "cartesia") {
    // Cartesia sonic-3.6 gerenciado pela Agora (sem chave): tts_ttfb ~90–140 ms, o menor medido.
    // Voz multilíngue "Jacqueline" falando pt. TESTES.md, seção 7.
    return {
      credential_mode: "managed",
      vendor: "cartesia",
      params: {
        model_id: "sonic-3.6",
        voice: { mode: "id", id: process.env.TTS_VOICE || "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc" },
        output_format: { container: "raw", sample_rate: 24000 },
        language: "pt",
      },
    };
  }
  if (vendor === "minimax") {
    // TTS gerenciado pela Agora (MiniMax): sem chave, tem vozes em português.
    return {
      credential_mode: "managed",
      vendor: "minimax",
      params: {
        url: "wss://api.minimax.io/ws/v1/t2a_v2",
        model: "speech-2.8-turbo",
        voice_setting: { voice_id: process.env.TTS_VOICE || "Portuguese_FriendlyNeighbor", speed: 1.0 },
        audio_setting: { sample_rate: 24000 },
        language_boost: "Portuguese",
      },
    };
  }
  if (vendor === "feita") {
    // TTS do gateway da feita.ai (protocolo OpenAI /audio/speech) pelo generic_http da Agora.
    // https://docs.agora.io/en/ai/models/tts/generic-http — o gateway devolve PCM 24 kHz.
    return {
      vendor: "generic_http",
      url: `${FEITA_GATEWAY}/audio/speech`,
      headers: { Authorization: `Bearer ${env("FEITA_API_KEY")}` },
      params: {
        model: process.env.TTS_MODEL || "elevenlabs/eleven-flash-v2.5",
        voice: process.env.TTS_VOICE || "pNInz6obpgDQGcFmaJgB",
        sample_rate: 24000,
        response_format: "pcm",
      },
    };
  }
  throw new Error(`TTS_VENDOR inválido: ${vendor}. Use "cartesia", "minimax" ou "feita".`);
}

export function joinBody(channel: string, origin: string, perfil: Perfil = PRODUTOR) {
  return {
    name: `desenrola-${channel}`,
    properties: {
      channel,
      token: agentToken(channel),
      agent_rtc_uid: AGENT_UID,
      remote_rtc_uids: [String(USER_UID)],
      enable_string_uid: false,
      idle_timeout: 60,
      // ASR_JSON troca o bloco asr inteiro (ex.: Deepgram gerenciado).
      asr: process.env.ASR_JSON ? JSON.parse(process.env.ASR_JSON) : ASR,
      llm: llmConfig(origin, perfil),
      tts: ttsConfig(),
      // Fim de fala semântico só existe para inglês e chinês; em pt-BR é VAD.
      // O padrão é 640 ms de silêncio; 300 ms ganha ~0,2 s sem cortar frases com pausa (TESTES.md).
      turn_detection: {
        config: {
          end_of_speech: {
            mode: "vad",
            vad_config: { silence_duration_ms: Number(process.env.VAD_SILENCE_MS || 300) },
          },
        },
      },
    },
  };
}

async function agoraFetch(channel: string, path: string, init: { method: string; body?: unknown }) {
  const res = await fetch(`${API_BASE}/${appId()}${path}`, {
    method: init.method,
    headers: {
      Authorization: `agora token="${agentToken(channel)}"`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    throw new Error(`Agora ${init.method} ${path} → ${res.status}: ${text}`);
  }
  return data;
}

export async function startAgent(
  channel: string,
  origin: string,
  perfil?: Perfil,
): Promise<{ agent_id: string; status: string }> {
  return (await agoraFetch(channel, "/join", { method: "POST", body: joinBody(channel, origin, perfil) })) as {
    agent_id: string;
    status: string;
  };
}

export async function stopAgent(channel: string, agentId: string) {
  return agoraFetch(channel, `/agents/${agentId}/leave`, { method: "POST" });
}

type Turn = {
  turn_id: number;
  start: { type: string; metadata?: { speech_duration_ms?: number } };
  end: { type: string };
  metrics?: { e2e_latency_ms?: number; segmented_latency_ms?: { name: string; latency: number }[] };
};

export async function getTurns(channel: string, agentId: string) {
  const data = (await agoraFetch(channel, `/agents/${agentId}/turns?page_size=100`, { method: "GET" })) as {
    turns?: Turn[];
  };
  const turns = data.turns ?? [];
  // Só turnos iniciados por voz do usuário contam: o turno da saudação mede
  // apenas o TTS e deixaria a média otimista.
  const voice = turns.filter((t) => t.start.type === "voice_input" && t.metrics?.e2e_latency_ms !== undefined);
  const e2e = voice.map((t) => t.metrics!.e2e_latency_ms!);
  return {
    turnos: turns.map((t) => ({
      turno: t.turn_id,
      inicio: t.start.type,
      fim: t.end.type,
      e2e_ms: t.metrics?.e2e_latency_ms ?? null,
      segmentos: Object.fromEntries((t.metrics?.segmented_latency_ms ?? []).map((s) => [s.name, s.latency])),
    })),
    resumo: resumir(e2e),
  };
}

/** Agentes ainda de pé (IDLE, STARTING, RUNNING) nas últimas 2 h. */
export async function listRunning(): Promise<{ agent_id: string; channel: string; status: string }[]> {
  const data = (await agoraFetch("listagem", "/agents?state=0,1,2&limit=50", { method: "GET" })) as {
    data?: { list?: { agent_id: string; channel?: string; status: string }[] };
    list?: { agent_id: string; channel?: string; status: string }[];
  };
  const list = data.data?.list ?? data.list ?? [];
  return list.map((a) => ({ agent_id: a.agent_id, channel: a.channel ?? "", status: a.status }));
}

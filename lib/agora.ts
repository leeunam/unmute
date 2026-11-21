// Integração com o Conversational AI Engine da Agora (só servidor).
// Conferido na doc de 21/11/2026:
//   join:  https://docs.agora.io/en/api-reference/api-ref/conversational-ai/join
//   leave: https://docs.agora.io/en/api-reference/api-ref/conversational-ai/leave
//   turns: https://docs.agora.io/en/api-reference/api-ref/conversational-ai/turns
//   auth:  https://docs.agora.io/en/api-reference/api-ref/conversational-ai/authentication
//   Claude: https://docs.agora.io/en/ai/models/llm/claude
//   modo gerenciado (ASR/TTS sem chave): https://docs.agora.io/en/ai/build/managed-mode
import { ConvoAITokenBuilder, RtcRole, RtcTokenBuilder } from "agora-token";
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

function llmConfig() {
  const provider = process.env.LLM_PROVIDER ?? "claude";
  const common = {
    system_messages: [{ role: "system", content: SYSTEM_PROMPT }],
    greeting_message: GREETING,
    failure_message: FAILURE,
    max_history: 20,
  };

  if (provider === "claude") {
    return {
      ...common,
      url: "https://api.anthropic.com/v1/messages",
      api_key: env("ANTHROPIC_API_KEY"),
      // O SDK oficial (agora-agents) manda headers como objeto.
      headers: { "anthropic-version": "2023-06-01" },
      style: "anthropic",
      params: {
        model: process.env.CLAUDE_MODEL ?? "claude-haiku-5-5",
        max_tokens: 300,
      },
    };
  }

  if (provider === "openai-gerenciado") {
    // Plano B da spec (seção 9): LLM gerenciado pela Agora, sem chave nossa.
    return {
      ...common,
      credential_mode: "managed",
      vendor: "openai",
      style: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      params: { model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini" },
    };
  }

  throw new Error(`LLM_PROVIDER inválido: ${provider}. Use "claude" ou "openai-gerenciado".`);
}

export function joinBody(channel: string) {
  return {
    name: `desenrola-${channel}`,
    properties: {
      channel,
      token: agentToken(channel),
      agent_rtc_uid: AGENT_UID,
      remote_rtc_uids: [String(USER_UID)],
      enable_string_uid: false,
      idle_timeout: 60,
      // ASR nativo da Agora (ARES): sem chave, aceita pt-BR.
      asr: {
        vendor: "ares",
        language: "pt-BR",
      },
      llm: llmConfig(),
      // TTS gerenciado pela Agora (MiniMax): sem chave, tem vozes em português.
      tts: {
        credential_mode: "managed",
        vendor: "minimax",
        params: {
          url: "wss://api.minimax.io/ws/v1/t2a_v2",
          model: "speech-2.8-turbo",
          voice_setting: {
            voice_id: process.env.TTS_VOICE ?? "Portuguese_FriendlyNeighbor",
            speed: 1.0,
          },
          audio_setting: { sample_rate: 24000 },
          language_boost: "Portuguese",
        },
      },
      // Fim de fala semântico só existe para inglês e chinês; em pt-BR é VAD.
      // O padrão é 640 ms de silêncio; baixamos para ganhar latência.
      turn_detection: {
        config: {
          end_of_speech: {
            mode: "vad",
            vad_config: { silence_duration_ms: Number(process.env.VAD_SILENCE_MS ?? 480) },
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

export async function startAgent(channel: string): Promise<{ agent_id: string; status: string }> {
  return (await agoraFetch(channel, "/join", { method: "POST", body: joinBody(channel) })) as {
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

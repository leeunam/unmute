// Uma rodada de medição sem ninguém falando: abre o Chrome com um WAV como
// microfone, deixa a página conversar sozinha (?auto=N) e imprime os números.
// No fim, confere que nenhum agente ficou de pé.
// Uso: node scripts/rodada.mjs <url-do-túnel> <fala.wav> [segundos=75] [gravacao.webm]
// O WAV sai de: SO_GERAR=1 ./scripts/audio-falso.sh
// Ligação para o fornecedor: passe <url-do-túnel>/fornecedor/a e o WAV com as falas do fornecedor
// (scripts/audio-fornecedor.sh). O script "liga" antes e a página atende sozinha.
import puppeteer from "puppeteer-core";

import { writeFileSync } from "node:fs";
const [url, wav, segundos = "75", saidaAudio] = process.argv.slice(2);
const origem = new URL(url).origin;
const fornecedor = url.match(/\/fornecedor\/(\w+)/)?.[1];
if (fornecedor) {
  await fetch(`${origem}/api/chamada`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao: "ligar", fornecedor }),
  });
}
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${wav}%noloop`,
    "--autoplay-policy=no-user-gesture-required",
    // Sem isso o serviço de áudio do Chrome não consegue ler o WAV e o microfone fica mudo.
    "--disable-features=AudioServiceSandbox",
  ],
});
try {
  const page = await browser.newPage();
  page.on("console", (m) => {
    const t = m.text();
    if (!/AgoraRTC|agora-rtc/i.test(t) || /error/i.test(t)) console.log(`[console] ${t.slice(0, 300)}`);
  });
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
  await page.goto(fornecedor ? `${url}?auto=${segundos}` : `${url}/?auto=${segundos}`, { waitUntil: "networkidle2" });
  await page.waitForFunction(
    // .erro em vez de procurar "falta" no texto: o cartão do pedido mostra "faltando".
    () => (/Sessão encerrada/.test(document.body.innerText) || !!document.querySelector(".erro")) && !/Buscando/.test(document.body.innerText),
    { timeout: (Number(segundos) + 60) * 1000, polling: 1000 },
  );
  if (saidaAudio) {
    const b64 = await page.evaluate(() => window.__gravacao ?? null);
    if (b64) {
      writeFileSync(saidaAudio, Buffer.from(b64, "base64"));
      console.log(`voz do agente gravada em ${saidaAudio}`);
    }
  }
  console.log("----- página -----");
  console.log(await page.evaluate(() => document.querySelector("main")?.innerText));
} finally {
  await browser.close();
  const res = await fetch(`${origem}/api/agentes`).then((r) => r.json());
  console.log("----- agentes de pé -----", JSON.stringify(res));
  if (res.agentes?.length) console.log(JSON.stringify(await fetch(`${origem}/api/agentes`, { method: "POST" }).then((r) => r.json())));
}

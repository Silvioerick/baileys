import axios from "axios";
import * as cheerio from "cheerio";
import { Octokit } from "octokit";

const PAGE_URL = "https://wppconnect.io/pt-BR/whatsapp-versions/";
const OWNER = "Silvioerick";
const REPO = "baileys";
const BRANCH = "main";
const FILE_PATH = "src/Defaults/baileys-version.json";
const HEARTBEAT_PATH = ".github/wa-version-last-check.json";
const GH_TOKEN = process.env.GITHUB_TOKEN;

function getVersionArray(versionStr) {
  const clean = versionStr.split("-")[0]; // Remove "-alpha"
  const [major, minor, patch] = clean.split(".").map(Number);
  return [major, minor, patch];
}

async function getLatestVersion() {
  const res = await axios.get(PAGE_URL, { timeout: 15000 });
  const $ = cheerio.load(res.data);

  const versions = [];
  $("h3").each((_, el) => {
    const txt = $(el).text().trim();
    const match = txt.match(/^(\d+\.\d+\.\d+(?:-[a-z]+)?)/i);
    if (match) versions.push(match[1]);
  });

  if (versions.length < 1) {
    throw new Error("Nenhuma versão encontrada.");
  }

  return versions[0];
}

async function getFile(octokit, path) {
  try {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner: OWNER,
      repo: REPO,
      path,
      ref: BRANCH,
    });
    return data;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function putFile(octokit, path, contentObj, message, sha) {
  const encodedContent = Buffer.from(JSON.stringify(contentObj, null, 2) + "\n").toString("base64");

  await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner: OWNER,
    repo: REPO,
    path,
    message,
    content: encodedContent,
    sha,
    branch: BRANCH,
  });
}

async function updateVersionFile(octokit, versionArray) {
  const data = await getFile(octokit, FILE_PATH);
  if (!data) {
    throw new Error(`Arquivo não encontrado: ${FILE_PATH}`);
  }

  const current = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));

  if (JSON.stringify(current.version) === JSON.stringify(versionArray)) {
    console.log("Versão já está atualizada.");
    return false;
  }

  await putFile(
    octokit,
    FILE_PATH,
    { version: versionArray },
    `chore: update WA version to ${versionArray.join(".")}`,
    data.sha
  );

  console.log("Atualizado para:", versionArray.join("."));
  return true;
}

async function writeHeartbeat(octokit, versionArray) {
  const existing = await getFile(octokit, HEARTBEAT_PATH);
  const payload = {
    checkedAt: new Date().toISOString(),
    version: versionArray,
  };

  await putFile(
    octokit,
    HEARTBEAT_PATH,
    payload,
    `chore: wa-version check (${versionArray.join(".")})`,
    existing?.sha
  );

  console.log("Heartbeat atualizado em", HEARTBEAT_PATH);
}

(async () => {
  const versionStr = await getLatestVersion();
  const versionArray = getVersionArray(versionStr);

  const octokit = new Octokit({ auth: GH_TOKEN });

  const versionUpdated = await updateVersionFile(octokit, versionArray);

  // Só grava heartbeat quando não houve update de versão — o commit de versão
  // já conta como atividade; sem commits o GitHub desativa o schedule em 60 dias.
  if (!versionUpdated) {
    await writeHeartbeat(octokit, versionArray);
  }
})();

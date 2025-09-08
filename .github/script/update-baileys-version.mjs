import axios from "axios";
import * as cheerio from "cheerio";
import { Octokit } from "octokit";

const PAGE_URL = "https://wppconnect.io/pt-BR/whatsapp-versions/";
const OWNER = "Silvioerick";
const REPO = "baileys";
const BRANCH = "main";
const FILE_PATH = "src/Defaults/baileys-version.json";
const GH_TOKEN = process.env.GITHUB_TOKEN;

function getVersionArray(versionStr) {
  const clean = versionStr.split("-")[0]; // Remove "-alpha"
  const [major, minor, patch] = clean.split(".").map(Number);
  return [major, minor, patch];
}

async function getThirdLatestVersion() {
  const res = await axios.get(PAGE_URL, { timeout: 15000 });
  const $ = cheerio.load(res.data);

  const versions = [];
  $("h3").each((_, el) => {
    const txt = $(el).text().trim();
    const match = txt.match(/^(\d+\.\d+\.\d+(?:-[a-z]+)?)/i);
    if (match) versions.push(match[1]);
  });

  if (versions.length < 3) {
    throw new Error("Menos de 3 versões encontradas.");
  }

  return versions[2]; // terceira da lista
}

async function updateVersionFile(octokit, versionArray) {
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
    owner: OWNER,
    repo: REPO,
    path: FILE_PATH,
    ref: BRANCH,
  });

  const current = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));

  // Evita commit desnecessário
  if (JSON.stringify(current.version) === JSON.stringify(versionArray)) {
    console.log("Versão já está atualizada.");
    return;
  }

  const newContent = {
    version: versionArray,
  };

  const encodedContent = Buffer.from(JSON.stringify(newContent, null, 2)).toString("base64");

  await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner: OWNER,
    repo: REPO,
    path: FILE_PATH,
    message: `chore: update 3rd latest WA version to ${versionArray.join(".")}`,
    content: encodedContent,
    sha: data.sha,
    branch: BRANCH,
  });

  console.log("Atualizado para:", versionArray.join("."));
}

(async () => {
  const versionStr = await getThirdLatestVersion();
  const versionArray = getVersionArray(versionStr);

  const octokit = new Octokit({ auth: GH_TOKEN });

  await updateVersionFile(octokit, versionArray);
})();

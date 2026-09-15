import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import { createSign } from "node:crypto";
import "dotenv/config";

const DEFAULT_SERVICE_ACCOUNT_EMAIL =
  "sync-planilhas-produtividade@produtividade-p-sep-ar.iam.gserviceaccount.com";
const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

let serviceAccountTokenCache: { accessToken: string; expiresAt: number } | null = null;

const base64UrlEncode = (value: string | Buffer) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const getServiceAccountCredentials = (): ServiceAccountCredentials | null => {
  const jsonValue = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const base64Value = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  const jsonFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_FILE?.trim();
  const email =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || DEFAULT_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (jsonValue || base64Value || jsonFilePath) {
    try {
      const decoded = jsonFilePath
        ? fs.readFileSync(jsonFilePath, "utf8")
        : base64Value
          ? Buffer.from(base64Value, "base64").toString("utf8")
          : jsonValue;
      const parsed = JSON.parse(decoded || "{}");
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: parsed.private_key,
        };
      }
      throw new Error("O JSON da conta de serviço não contém client_email e private_key.");
    } catch (error: any) {
      throw new Error(`Credencial da conta de serviço inválida: ${error.message}`);
    }
  }

  if (privateKey) {
    return { client_email: email, private_key: privateKey };
  }

  return null;
};

const hasServiceAccountCredentials = () => {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim() ||
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON_FILE?.trim() ||
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim(),
  );
};

const getServiceAccountAccessToken = async (): Promise<string | null> => {
  const credentials = getServiceAccountCredentials();
  if (!credentials) return null;

  const now = Math.floor(Date.now() / 1000);
  if (serviceAccountTokenCache && serviceAccountTokenCache.expiresAt > now + 60) {
    return serviceAccountTokenCache.accessToken;
  }

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: credentials.client_email,
      scope: GOOGLE_SHEETS_SCOPES,
      aud: GOOGLE_TOKEN_URI,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const assertion = `${unsignedToken}.${base64UrlEncode(signer.sign(credentials.private_key))}`;

  const tokenResponse = await fetchWithTimeout(
    GOOGLE_TOKEN_URI,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    },
    15000,
  );

  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenBody.access_token) {
    const message = tokenBody?.error_description || tokenBody?.error || `HTTP ${tokenResponse.status}`;
    throw new Error(`Não foi possível autenticar a conta de serviço: ${message}`);
  }

  serviceAccountTokenCache = {
    accessToken: tokenBody.access_token,
    expiresAt: now + Number(tokenBody.expires_in || 3600),
  };
  return tokenBody.access_token;
};

// Safe non-blocking fetch with timeout to prevent Google Sheets from hanging the server
const fetchWithTimeout = async (url: string, options: any = {}, timeoutMs = 25000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (error: any) {
    clearTimeout(timer);
    if (error.name === "AbortError") {
      throw new Error(`Tempo limite de requisição excedido (${timeoutMs}ms) ao acessar: ${url}`);
    }
    throw error;
  }
};

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // API Route: health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", serviceAccountConfigured: hasServiceAccountCredentials() });
  });

  // API Route: debug save sheets
  app.post("/api/debug-save-sheets", (req, res) => {
    try {
      fs.writeFileSync("last_sync_debug.json", JSON.stringify(req.body.sheets, null, 2));
      console.log("[DEBUG] Dados reais das abas salvos com sucesso em last_sync_debug.json");
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[DEBUG] Erro ao salvar dados no disco:", err);
      return res.status(500).json({ error: err.message });
    }
  });


  // API Route: CORS proxy to dynamically sync Google Sheet
  app.post("/api/sync-sheet", async (req, res) => {
    const { url, token } = req.body;
    if (!url) {
      return res.status(400).json({ error: "A URL é obrigatória." });
    }

    try {
      let spreadsheetId = "";
      let isPublished = false;
      let isDriveFile = false;

      if (url.includes("/d/e/")) {
        const matchPub = url.match(/\/d\/e\/([a-zA-Z0-9-_]+)/);
        if (matchPub) {
          spreadsheetId = matchPub[1];
          isPublished = true;
        }
      } else if (url.includes("/file/d/")) {
        const matchFile = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
        if (matchFile) {
          spreadsheetId = matchFile[1];
          isDriveFile = true;
        }
      } else {
        const matchDoc = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (matchDoc) {
          spreadsheetId = matchDoc[1];
        }
      }

      if (!spreadsheetId) {
        return res.status(400).json({ error: "Formato do link do Google Planilhas inválido ou não pôde ser identificado." });
      }

      // Se for um link de arquivo arbitrário no Drive (ex: .csv compartilhado)
      const authHeader = req.headers.authorization;
      const userAccessToken = token || (authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.substring(7)
        : null);
      let serviceAccountAccessToken: string | null = null;
      let serviceAccountError: Error | null = null;

      try {
        serviceAccountAccessToken = await getServiceAccountAccessToken();
      } catch (error: any) {
        serviceAccountError = error instanceof Error ? error : new Error(String(error));
        console.error("Falha ao autenticar a conta de serviço:", serviceAccountError.message);
      }

      const accessToken = serviceAccountAccessToken || userAccessToken;
      const accessTokenSource = serviceAccountAccessToken ? "service-account" : "oauth";

      if (isDriveFile) {

        if (accessToken) {
          try {
            const driveRes = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?alt=media`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (driveRes.ok) {
              const fileContent = await driveRes.text();
              return res.json({
                success: true,
                sheets: { "Geral": fileContent },
                csvText: fileContent,
                isPrivate: true,
                isDriveFile: true
              });
            }
          } catch (driveErr) {
            console.error("Erro ao puxar arquivo do drive autenticado:", driveErr);
          }
        }

        // Fallback público para arquivo do Drive (se compartilhado publicamente)
        try {
          const exportUrl = `https://docs.google.com/uc?export=download&id=${spreadsheetId}`;
          const response = await fetchWithTimeout(exportUrl);
          if (response.ok) {
            const fileContent = await response.text();
            const cleanContent = fileContent.trim();
            const isHtml = cleanContent.startsWith("<!DOCTYPE") || cleanContent.startsWith("<html");
            if (!isHtml) {
              return res.json({
                success: true,
                sheets: { "Geral": fileContent },
                csvText: fileContent,
                isPrivate: false,
                isDriveFile: true
              });
            }
          }
        } catch (pubDriveErr: any) {
          console.error("Erro ao puxar arquivo do drive público:", pubDriveErr);
        }
      }

      // Se a planilha for publicada na web, tentamos puxar diretamente
      if (isPublished) {
        try {
          const exportUrl = `https://docs.google.com/spreadsheets/d/e/${spreadsheetId}/pub?output=csv`;
          const response = await fetchWithTimeout(exportUrl);
          if (!response.ok) {
            return res.status(400).json({ 
              error: "Não foi possível carregar a planilha publicada. Certifique-se de que a planilha foi publicada na Web no formato 'Valores separados por vírgulas (.csv)' e que o link corresponde à publicação." 
            });
          }
          const csvText = await response.text();
          return res.json({ 
            success: true, 
            sheets: { "Geral": csvText },
            csvText, 
            isPrivate: false, 
            isPublished: true 
          });
        } catch (pubErr: any) {
          return res.status(500).json({ error: `Erro ao obter planilha publicada: ${pubErr.message}` });
        }
      }

      let apiAuthError: any = null;

      // Se houver token de acesso, vamos usar a API oficial do Google Sheets v4 para obter as abas reais!
      if (accessToken) {
        try {
          // Obter dados da planilha (metadados para listar todas as abas e buscar por nome/id)
          const metaRes = await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          }, 15000);

          if (!metaRes.ok) {
            const errBody = await metaRes.json().catch(() => ({}));
            const errMessage = errBody?.error?.message || `Erro HTTP ${metaRes.status}`;
            throw new Error(`GoogleAPIError:${metaRes.status}:${errMessage}`);
          }

          const metaData = await metaRes.json();
          const sheetsList = metaData.sheets || [];
          
          if (sheetsList.length === 0) {
            return res.status(400).json({ error: "A planilha conectada está vazia e não contém abas." });
          }

          const sheetsResultMap: { [key: string]: string } = {};

          // Buscar dados de todas as abas detectadas no arquivo real em lote (batchGet) para economizar quotas
          const rangesQuery = sheetsList
            .map((sheet: any) => `ranges=${encodeURIComponent("'" + sheet.properties.title + "'!A1:ZZ2500")}`)
            .join("&");


          try {
            const batchRes = await fetchWithTimeout(
              `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${rangesQuery}`,
              {
                headers: { Authorization: `Bearer ${accessToken}` }
              },
              45000 // Aumentado timeout global para envio em lote
            );

            if (batchRes.ok) {
              const batchData = await batchRes.json();
              const valueRanges = batchData.valueRanges || [];

              valueRanges.forEach((rangeData: any, idx: number) => {
                const title = sheetsList[idx]?.properties?.title || `Aba${idx}`;
                const rows = rangeData.values || [];
                const csv = rows.map((row: any[]) => 
                  row.map((cell: any) => {
                    const valStr = String(cell ?? "");
                    if (valStr.includes(",") || valStr.includes("\n") || valStr.includes("\"") || valStr.includes(";")) {
                      return `"${valStr.replace(/"/g, '""')}"`;
                    }
                    return valStr;
                  }).join(",")
                ).join("\n");
                sheetsResultMap[title] = csv;
              });
            } else {
              console.error(`Erro na API do Google no batchGet: ${batchRes.status} ${batchRes.statusText}`);
              const errBody = await batchRes.json().catch(() => ({}));
              throw new Error(`GoogleAPIError:${batchRes.status}:${errBody?.error?.message || batchRes.statusText}`);
            }
          } catch (errBatch) {
            console.error("Erro ao sincronizar planilhas em lote:", errBatch);
            throw errBatch; // Repassa erro para bloco principal
          }

          const primarySheetName = sheetsList[0].properties.title;
          const defaultCsvText = sheetsResultMap[primarySheetName] || "";

          try {
            fs.writeFileSync("last_sync_debug.json", JSON.stringify(sheetsResultMap, null, 2));
            console.log("[DEBUG] Dados reais salvos em last_sync_debug.json");
          } catch (writeErr) {
            console.error("[DEBUG] Erro ao salvar dados no disco:", writeErr);
          }

          return res.json({ 
            success: true, 
            sheets: sheetsResultMap, 
            csvText: defaultCsvText, 
            isPrivate: true 
          });
        } catch (apiErr: any) {
          console.error("Falha ao ler via Google Sheets API oficial:", apiErr);
          if (apiErr.message && apiErr.message.includes("GoogleAPIError:")) {
            const parts = apiErr.message.split(":");
            const status = parseInt(parts[1] || "500");
            const msg = parts.slice(2).join(":");

            if (status === 401) {
              apiAuthError = {
                status: 401,
                userMessage: "Sua conexão com o Google expirou. É necessário fazer login novamente.",
                action: "LOGOUT",
              };
            } else if (status === 403) {
              const normalizedMsg = msg.toLowerCase();
              const isScopeError = normalizedMsg.includes("scope") || normalizedMsg.includes("insufficient") || normalizedMsg.includes("authentication credentials");
              const isApiDisabled = normalizedMsg.includes("has not been used") || normalizedMsg.includes("disabled") || normalizedMsg.includes("enable it");
              let userMessage = "O Google recusou a leitura da planilha.";
              if (isScopeError) {
                userMessage = "A autorização do Google não inclui o escopo de leitura do Sheets. Saia da conta Google conectada e autorize novamente o acesso às planilhas.";
              } else if (isApiDisabled) {
                userMessage = "A Google Sheets API está desativada no projeto Google desta integração. Ela precisa ser reativada pelo administrador do projeto.";
              } else if (normalizedMsg.includes("permission") || normalizedMsg.includes("forbidden") || normalizedMsg.includes("caller")) {
                userMessage = "A conta Google conectada não tem acesso a esta planilha. Confirme se é exatamente o mesmo e-mail que abre a planilha no Google Sheets.";
              }
              apiAuthError = {
                status: 403,
                userMessage,
                googleError: msg,
                action: isScopeError ? "REAUTH" : undefined,
              };
            } else if (msg.toLowerCase().includes("quota") || status === 429) {
              return res.status(429).json({ error: "O limite de leitura em tempo real do Google foi temporariamente atingido devido a muitos pedidos simultâneos na sua conta. O sistema continuará tentando em alguns segundos." });
            }
          }
          // Prossegue para o fallback se falhar a API oficial
        }
      }

      // Fallback tradicional para planilhas públicas
      const sheetsResultMap: { [key: string]: string } = {};
      let defaultCsvText = "";

      // 1. Obter a aba padrão usando a url/gid
      try {
        const gidMatch = url.match(/gid=([0-9]+)/);
        const gid = gidMatch ? gidMatch[1] : null;
        let exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
        if (gid) {
          exportUrl += `&gid=${gid}`;
        }
        const response = await fetchWithTimeout(exportUrl);
        if (response.ok) {
          const text = await response.text();
          const cleanText = text.trim();
          const isHtml = cleanText.startsWith("<!DOCTYPE") || 
                         cleanText.startsWith("<html") || 
                         text.includes("<script") || 
                         text.includes("Google Accounts") || 
                         text.includes("ServiceLogin");
          if (!isHtml) {
            defaultCsvText = text;
            sheetsResultMap["Geral"] = defaultCsvText;
          }
        }
      } catch (errDefault) {
        console.error("Erro ao puxar aba padrão pública:", errDefault);
      }

      // 2. Tentar baixar abas comuns do usuário (Controle, Estagiários, etc.)
      const candidates = ["Controle", "Estagiatarios", "Estagiarios", "Estagiários", "Cadastro", "Membros", "Usuários"];
      await Promise.all(candidates.map(async (candidate) => {
        try {
          const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(candidate)}`;
          const response = await fetchWithTimeout(exportUrl, {}, 4000); // Menor tempo de resposta para candidatos opcionais
          if (response.ok) {
            const text = await response.text();
            const cleanText = text.trim();
            const isHtml = cleanText.startsWith("<!DOCTYPE") || 
                           cleanText.startsWith("<html") || 
                           text.includes("<script") || 
                           text.includes("Google Accounts") || 
                           text.includes("ServiceLogin");
            if (text && text.split("\n").length >= 2 && !text.includes("google-visualization") && !isHtml) {
              sheetsResultMap[candidate] = text;
            }
          }
        } catch (errCandidate) {
          console.error(`Erro ao puxar aba candidata pública '${candidate}':`, errCandidate);
        }
      }));

      if (Object.keys(sheetsResultMap).length === 0) {
        if (apiAuthError) {
          return res.status(apiAuthError.status).json({
            error: apiAuthError.userMessage || "Sua conexão com o Google expirou. É necessário fazer login novamente.",
            action: apiAuthError.action || "LOGOUT",
            googleError: apiAuthError.googleError,
          });
        }
        if (serviceAccountError && !userAccessToken) {
          return res.status(500).json({
            error: "A conta de serviço está configurada, mas não pôde ser autenticada. Verifique o arquivo JSON no ambiente do servidor.",
          });
        }
        return res.status(400).json({ 
          error: "Não foi possível acessar a planilha de forma pública. Por favor, conecte com o Google para autorizar o acesso à planilha vinculada à sua conta." 
        });
      }

      res.json({ 
        success: true, 
        sheets: sheetsResultMap, 
        csvText: defaultCsvText || Object.values(sheetsResultMap)[0], 
        isPrivate: false 
      });
    } catch (err: any) {
      console.error("Erro na sincronização de planilha no servidor:", err);
      res.status(500).json({ error: err.message || "Erro interno do servidor." });
    }
  });

  // Integrated Vite Server for Development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static assets compiled under dist/
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server executing at http://localhost:${PORT}`);
  });
}

startServer();

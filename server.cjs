var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_fs = __toESM(require("fs"), 1);
var import_node_crypto = require("node:crypto");
var import_config = require("dotenv/config");
var DEFAULT_SERVICE_ACCOUNT_EMAIL = "sync-planilhas-produtividade@produtividade-p-sep-ar.iam.gserviceaccount.com";
var GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
var GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly"
].join(" ");
var serviceAccountTokenCache = null;
var base64UrlEncode = (value) => Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
var getServiceAccountCredentials = () => {
  const jsonValue = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const base64Value = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  const jsonFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_FILE?.trim();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || DEFAULT_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (jsonValue || base64Value || jsonFilePath) {
    try {
      const decoded = jsonFilePath ? import_fs.default.readFileSync(jsonFilePath, "utf8") : base64Value ? Buffer.from(base64Value, "base64").toString("utf8") : jsonValue;
      const parsed = JSON.parse(decoded || "{}");
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: parsed.private_key
        };
      }
      throw new Error("O JSON da conta de servi\xE7o n\xE3o cont\xE9m client_email e private_key.");
    } catch (error) {
      throw new Error(`Credencial da conta de servi\xE7o inv\xE1lida: ${error.message}`);
    }
  }
  if (privateKey) {
    return { client_email: email, private_key: privateKey };
  }
  return null;
};
var hasServiceAccountCredentials = () => {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim() || process.env.GOOGLE_SERVICE_ACCOUNT_JSON_FILE?.trim() || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim()
  );
};
var getServiceAccountAccessToken = async () => {
  const credentials = getServiceAccountCredentials();
  if (!credentials) return null;
  const now = Math.floor(Date.now() / 1e3);
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
      exp: now + 3600
    })
  );
  const unsignedToken = `${header}.${payload}`;
  const signer = (0, import_node_crypto.createSign)("RSA-SHA256");
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
        assertion
      }).toString()
    },
    15e3
  );
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenBody.access_token) {
    const message = tokenBody?.error_description || tokenBody?.error || `HTTP ${tokenResponse.status}`;
    throw new Error(`N\xE3o foi poss\xEDvel autenticar a conta de servi\xE7o: ${message}`);
  }
  serviceAccountTokenCache = {
    accessToken: tokenBody.access_token,
    expiresAt: now + Number(tokenBody.expires_in || 3600)
  };
  return tokenBody.access_token;
};
var fetchWithTimeout = async (url, options = {}, timeoutMs = 25e3) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (error) {
    clearTimeout(timer);
    if (error.name === "AbortError") {
      throw new Error(`Tempo limite de requisi\xE7\xE3o excedido (${timeoutMs}ms) ao acessar: ${url}`);
    }
    throw error;
  }
};
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = process.env.PORT || 3e3;
  app.use(import_express.default.json());
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", serviceAccountConfigured: hasServiceAccountCredentials() });
  });
  app.post("/api/debug-save-sheets", (req, res) => {
    try {
      import_fs.default.writeFileSync("last_sync_debug.json", JSON.stringify(req.body.sheets, null, 2));
      console.log("[DEBUG] Dados reais das abas salvos com sucesso em last_sync_debug.json");
      return res.json({ success: true });
    } catch (err) {
      console.error("[DEBUG] Erro ao salvar dados no disco:", err);
      return res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/sync-sheet", async (req, res) => {
    const { url, token } = req.body;
    if (!url) {
      return res.status(400).json({ error: "A URL \xE9 obrigat\xF3ria." });
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
        return res.status(400).json({ error: "Formato do link do Google Planilhas inv\xE1lido ou n\xE3o p\xF4de ser identificado." });
      }
      const authHeader = req.headers.authorization;
      const userAccessToken = token || (authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null);
      let serviceAccountAccessToken = null;
      let serviceAccountError = null;
      try {
        serviceAccountAccessToken = await getServiceAccountAccessToken();
      } catch (error) {
        serviceAccountError = error instanceof Error ? error : new Error(String(error));
        console.error("Falha ao autenticar a conta de servi\xE7o:", serviceAccountError.message);
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
        } catch (pubDriveErr) {
          console.error("Erro ao puxar arquivo do drive p\xFAblico:", pubDriveErr);
        }
      }
      if (isPublished) {
        try {
          const exportUrl = `https://docs.google.com/spreadsheets/d/e/${spreadsheetId}/pub?output=csv`;
          const response = await fetchWithTimeout(exportUrl);
          if (!response.ok) {
            return res.status(400).json({
              error: "N\xE3o foi poss\xEDvel carregar a planilha publicada. Certifique-se de que a planilha foi publicada na Web no formato 'Valores separados por v\xEDrgulas (.csv)' e que o link corresponde \xE0 publica\xE7\xE3o."
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
        } catch (pubErr) {
          return res.status(500).json({ error: `Erro ao obter planilha publicada: ${pubErr.message}` });
        }
      }
      let apiAuthError = null;
      if (accessToken) {
        try {
          const metaRes = await fetchWithTimeout(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          }, 15e3);
          if (!metaRes.ok) {
            const errBody = await metaRes.json().catch(() => ({}));
            const errMessage = errBody?.error?.message || `Erro HTTP ${metaRes.status}`;
            throw new Error(`GoogleAPIError:${metaRes.status}:${errMessage}`);
          }
          const metaData = await metaRes.json();
          const sheetsList = metaData.sheets || [];
          if (sheetsList.length === 0) {
            return res.status(400).json({ error: "A planilha conectada est\xE1 vazia e n\xE3o cont\xE9m abas." });
          }
          const sheetsResultMap2 = {};
          const rangesQuery = sheetsList.map((sheet) => `ranges=${encodeURIComponent("'" + sheet.properties.title + "'!A1:ZZ2500")}`).join("&");
          try {
            const batchRes = await fetchWithTimeout(
              `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${rangesQuery}`,
              {
                headers: { Authorization: `Bearer ${accessToken}` }
              },
              45e3
              // Aumentado timeout global para envio em lote
            );
            if (batchRes.ok) {
              const batchData = await batchRes.json();
              const valueRanges = batchData.valueRanges || [];
              valueRanges.forEach((rangeData, idx) => {
                const title = sheetsList[idx]?.properties?.title || `Aba${idx}`;
                const rows = rangeData.values || [];
                const csv = rows.map(
                  (row) => row.map((cell) => {
                    const valStr = String(cell ?? "");
                    if (valStr.includes(",") || valStr.includes("\n") || valStr.includes('"') || valStr.includes(";")) {
                      return `"${valStr.replace(/"/g, '""')}"`;
                    }
                    return valStr;
                  }).join(",")
                ).join("\n");
                sheetsResultMap2[title] = csv;
              });
            } else {
              console.error(`Erro na API do Google no batchGet: ${batchRes.status} ${batchRes.statusText}`);
              const errBody = await batchRes.json().catch(() => ({}));
              throw new Error(`GoogleAPIError:${batchRes.status}:${errBody?.error?.message || batchRes.statusText}`);
            }
          } catch (errBatch) {
            console.error("Erro ao sincronizar planilhas em lote:", errBatch);
            throw errBatch;
          }
          const primarySheetName = sheetsList[0].properties.title;
          const defaultCsvText2 = sheetsResultMap2[primarySheetName] || "";
          try {
            import_fs.default.writeFileSync("last_sync_debug.json", JSON.stringify(sheetsResultMap2, null, 2));
            console.log("[DEBUG] Dados reais salvos em last_sync_debug.json");
          } catch (writeErr) {
            console.error("[DEBUG] Erro ao salvar dados no disco:", writeErr);
          }
          return res.json({
            success: true,
            sheets: sheetsResultMap2,
            csvText: defaultCsvText2,
            isPrivate: true
          });
        } catch (apiErr) {
          console.error("Falha ao ler via Google Sheets API oficial:", apiErr);
          if (apiErr.message && apiErr.message.includes("GoogleAPIError:")) {
            const parts = apiErr.message.split(":");
            const status = parseInt(parts[1] || "500");
            const msg = parts.slice(2).join(":");
            if (status === 401) {
              apiAuthError = {
                status: 401,
                userMessage: "Sua conex\xE3o com o Google expirou. \xC9 necess\xE1rio fazer login novamente.",
                action: "LOGOUT"
              };
            } else if (status === 403) {
              const normalizedMsg = msg.toLowerCase();
              const isScopeError = normalizedMsg.includes("scope") || normalizedMsg.includes("insufficient") || normalizedMsg.includes("authentication credentials");
              const isApiDisabled = normalizedMsg.includes("has not been used") || normalizedMsg.includes("disabled") || normalizedMsg.includes("enable it");
              let userMessage = "O Google recusou a leitura da planilha.";
              if (isScopeError) {
                userMessage = "A autoriza\xE7\xE3o do Google n\xE3o inclui o escopo de leitura do Sheets. Saia da conta Google conectada e autorize novamente o acesso \xE0s planilhas.";
              } else if (isApiDisabled) {
                userMessage = "A Google Sheets API est\xE1 desativada no projeto Google desta integra\xE7\xE3o. Ela precisa ser reativada pelo administrador do projeto.";
              } else if (normalizedMsg.includes("permission") || normalizedMsg.includes("forbidden") || normalizedMsg.includes("caller")) {
                userMessage = "A conta Google conectada n\xE3o tem acesso a esta planilha. Confirme se \xE9 exatamente o mesmo e-mail que abre a planilha no Google Sheets.";
              }
              apiAuthError = {
                status: 403,
                userMessage,
                googleError: msg,
                action: isScopeError ? "REAUTH" : void 0
              };
            } else if (msg.toLowerCase().includes("quota") || status === 429) {
              return res.status(429).json({ error: "O limite de leitura em tempo real do Google foi temporariamente atingido devido a muitos pedidos simult\xE2neos na sua conta. O sistema continuar\xE1 tentando em alguns segundos." });
            }
          }
        }
      }
      const sheetsResultMap = {};
      let defaultCsvText = "";
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
          const isHtml = cleanText.startsWith("<!DOCTYPE") || cleanText.startsWith("<html") || text.includes("<script") || text.includes("Google Accounts") || text.includes("ServiceLogin");
          if (!isHtml) {
            defaultCsvText = text;
            sheetsResultMap["Geral"] = defaultCsvText;
          }
        }
      } catch (errDefault) {
        console.error("Erro ao puxar aba padr\xE3o p\xFAblica:", errDefault);
      }
      const candidates = ["Controle", "Estagiatarios", "Estagiarios", "Estagi\xE1rios", "Cadastro", "Membros", "Usu\xE1rios"];
      await Promise.all(candidates.map(async (candidate) => {
        try {
          const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(candidate)}`;
          const response = await fetchWithTimeout(exportUrl, {}, 4e3);
          if (response.ok) {
            const text = await response.text();
            const cleanText = text.trim();
            const isHtml = cleanText.startsWith("<!DOCTYPE") || cleanText.startsWith("<html") || text.includes("<script") || text.includes("Google Accounts") || text.includes("ServiceLogin");
            if (text && text.split("\n").length >= 2 && !text.includes("google-visualization") && !isHtml) {
              sheetsResultMap[candidate] = text;
            }
          }
        } catch (errCandidate) {
          console.error(`Erro ao puxar aba candidata p\xFAblica '${candidate}':`, errCandidate);
        }
      }));
      if (Object.keys(sheetsResultMap).length === 0) {
        if (apiAuthError) {
          return res.status(apiAuthError.status).json({
            error: apiAuthError.userMessage || "Sua conex\xE3o com o Google expirou. \xC9 necess\xE1rio fazer login novamente.",
            action: apiAuthError.action || "LOGOUT",
            googleError: apiAuthError.googleError
          });
        }
        if (serviceAccountError && !userAccessToken) {
          return res.status(500).json({
            error: "A conta de servi\xE7o est\xE1 configurada, mas n\xE3o p\xF4de ser autenticada. Verifique o arquivo JSON no ambiente do servidor."
          });
        }
        return res.status(400).json({
          error: "N\xE3o foi poss\xEDvel acessar a planilha de forma p\xFAblica. Por favor, conecte com o Google para autorizar o acesso \xE0 planilha vinculada \xE0 sua conta."
        });
      }
      res.json({
        success: true,
        sheets: sheetsResultMap,
        csvText: defaultCsvText || Object.values(sheetsResultMap)[0],
        isPrivate: false
      });
    } catch (err) {
      console.error("Erro na sincroniza\xE7\xE3o de planilha no servidor:", err);
      res.status(500).json({ error: err.message || "Erro interno do servidor." });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server executing at http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map

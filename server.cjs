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
  const PORT = 3e3;
  app.use(import_express.default.json());
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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
      if (isDriveFile) {
        const authHeader2 = req.headers.authorization;
        const accessToken2 = token || (authHeader2 && authHeader2.startsWith("Bearer ") ? authHeader2.substring(7) : null);
        if (accessToken2) {
          try {
            const driveRes = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?alt=media`, {
              headers: { Authorization: `Bearer ${accessToken2}` }
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
      const authHeader = req.headers.authorization;
      const accessToken = token || (authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null);
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
          const rangesQuery = sheetsList.map((sheet) => `ranges=${encodeURIComponent("'" + sheet.properties.title + "'!A1:BZ2500")}`).join("&");
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
          logSheetsData(sheetsResultMap2);
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
              return res.status(401).json({ error: "Sua conex\xE3o com o Google expirou. \xC9 necess\xE1rio fazer login novamente.", action: "LOGOUT" });
            }
            if (status === 403) {
              return res.status(403).json({ error: "Voc\xEA n\xE3o possui permiss\xE3o de leitura para esta planilha. Verifique se o e-mail atual tem acesso ou altere o compartilhamento." });
            }
            if (msg.toLowerCase().includes("quota") || status === 429) {
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

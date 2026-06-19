import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

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
  const PORT = 3000;

  app.use(express.json());

  // API Route: health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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
      if (isDriveFile) {
        const authHeader = req.headers.authorization;
        const accessToken = token || (authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null);

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

      // Se houver token de acesso, vamos usar a API oficial do Google Sheets v4 para obter as abas reais!
      const authHeader = req.headers.authorization;
      const accessToken = token || (authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null);

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
            .map((sheet: any) => `ranges=${encodeURIComponent("'" + sheet.properties.title + "'!A1:Z2500")}`)
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
              return res.status(401).json({ error: "Sua conexão com o Google expirou. É necessário fazer login novamente.", action: "LOGOUT" });
            }
            if (status === 403) {
              return res.status(403).json({ error: "Você não possui permissão de leitura para esta planilha. Verifique se o e-mail atual tem acesso ou altere o compartilhamento." });
            }
            if (msg.toLowerCase().includes("quota") || status === 429) {
              return res.status(429).json({ error: "O limite de leitura em tempo real do Google foi temporariamente atingido devido a muitos pedidos simultâneos na sua conta. O sistema continuará tentando em alguns segundos." });
            }
          }
          // Prossegue para o fallback público se falhar
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

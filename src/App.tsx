import React, { useState, useEffect, useMemo } from "react";
import {
  db,
  doc,
  setDoc,
  collection,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  writeBatch,
  query,
  where,
  googleSignIn,
  logout,
  initAuth,
  getAccessToken,
  seedDatabaseIfEmpty,
  batchUpsertEstagiarios,
  batchUpsertEntries,
  subscribeToEstagiarios,
  subscribeToSettings,
} from "./lib/stubs";
import { fetchSheetDataDirectly, getSession, supabase } from "./lib/supabase";
import { Estagiario, ProductivityEntry, INITIAL_ESTAGIARIOS } from "./lib/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Line,
  ComposedChart,
  Legend,
} from "recharts";
import {
  Plus,
  Users,
  TrendingUp,
  Calendar,
  ArrowRight,
  Search,
  Trash2,
  Edit3,
  Grid,
  List,
  Check,
  Clock,
  CalendarDays,
  UserPlus,
  X,
  Award,
  Sliders,
  HelpCircle,
  FileText,
  BarChart2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Bell,
  Zap,
  Lock,
  GraduationCap,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  // Date Helpers
  const getCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const getCurrentDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const [estagiarios, setEstagiarios] = useState<Estagiario[]>([]);
  const [entries, setEntries] = useState<ProductivityEntry[]>([]);

  const estagiariosRef = React.useRef(estagiarios);
  const entriesRef = React.useRef(entries);

  useEffect(() => {
    estagiariosRef.current = estagiarios;
  }, [estagiarios]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Normalização de lançamentos: agrupa entradas por estagiário+data (sem lógica de origem)
  const normalizedEntries = useMemo(() => {
    const groups: Record<string, {
      id: string;
      estagiarioId: string;
      date: string;
      count: number;
    }> = {};

    entries.forEach((e) => {
      if (!e || !e.estagiarioId || !e.date) return;

      const key = `${e.estagiarioId}_${e.date}`;
      if (!groups[key]) {
        groups[key] = {
          id: key,
          estagiarioId: e.estagiarioId,
          date: e.date,
          count: 0,
        };
      }
      groups[key].count += e.count;
    });

    return Object.values(groups) as Array<ProductivityEntry>;
  }, [entries]);

  const [loading, setLoading] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<"dashboard" | "matrix" | "desempenho" | "diario">(
    "dashboard",
  );
  const [teamSortConfig, setTeamSortConfig] = useState<{
    key: string;
    dir: "asc" | "desc";
  }>({ key: "totalAnalyzed", dir: "desc" });

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [filterQuery, setFilterQuery] = useState<string>("");

  // Modals & Drawers
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState<boolean>(false);
  const [isAddEstagiarioOpen, setIsAddEstagiarioOpen] =
    useState<boolean>(false);
  const [selectedEstagiarioDetail, setSelectedEstagiarioDetail] = useState<
    string | null
  >(null);

  // Form State - New Entry
  const [formEstagiarioId, setFormEstagiarioId] = useState<string>("");
  const [formDate, setFormDate] = useState<string>(getCurrentDate());
  const [formCount, setFormCount] = useState<number>(0);
  const [formEditingId, setFormEditingId] = useState<string | null>(null);

  // Form State - New Estagiario
  const [newEstagiarioName, setNewEstagiarioName] = useState<string>("");
  const [newEstagiarioId, setNewEstagiarioId] = useState<string>("");
  const [newEstagiarioRole, setNewEstagiarioRole] =
    useState<string>("graduacao");
  const [newEstagiarioDailyGoal, setNewEstagiarioDailyGoal] =
    useState<number>(25);
  const [newEstagiarioMatricula, setNewEstagiarioMatricula] =
    useState<string>("");

  // Edit Estagiario Cadastre state
  const [isEditingCadastre, setIsEditingCadastre] = useState<boolean>(false);
  const [editEstagiarioName, setEditEstagiarioName] = useState<string>("");
  const [editEstagiarioRole, setEditEstagiarioRole] =
    useState<string>("graduacao");
  const [editEstagiarioDailyGoal, setEditEstagiarioDailyGoal] =
    useState<number>(25);
  const [editEstagiarioMatricula, setEditEstagiarioMatricula] =
    useState<string>("");

  // Loading & Seeding Status
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Google Sheets Sync State
  const DEFAULT_SHEET_URL =
    "https://docs.google.com/spreadsheets/d/1hTAx1DO1x4rI8vJ0IQUKEyZqrws2FtcJMSPwFtt-r78/edit?pli=1&gid=548073705#gid=548073705";
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState<boolean>(false);
  const [spreadsheetUrl, setSpreadsheetUrl] =
    useState<string>(DEFAULT_SHEET_URL);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");
  const [syncingSheets, setSyncingSheets] = useState<boolean>(false);
  const [syncDuration, setSyncDuration] = useState<number>(0);
  const [lastSyncDuration, setLastSyncDuration] = useState<number | null>(null);

  const formatLastSyncTime = (isoString: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch (e) {
      return "";
    }
  };

  const [semanaProvaIds, setSemanaProvaIds] = useState<string[]>([]);

  const [previewEntries, setPreviewEntries] = useState<
    Omit<ProductivityEntry, "id">[]
  >([]);
  const [previewEstagiariosToCreate, setPreviewEstagiariosToCreate] = useState<
    string[]
  >([]);
  const [previewEstagiariosDetailed, setPreviewEstagiariosDetailed] = useState<
    Estagiario[]
  >([]);
  const [sheetsMessage, setSheetsMessage] = useState<string>("");
  const [sheetSyncError, setSheetSyncError] = useState<string>("");
  const [pasteDataText, setPasteDataText] = useState<string>("");
  const [selectedSheetName, setSelectedSheetName] = useState<string>("Controle detalhado");


  const [detailTab, setDetailTab] = useState<"month" | "day">("month");
  const [detailedProcesses, setDetailedProcesses] = useState<Record<string, { origem: string; date: string; timestamp: string }>>({});
  const [loadingProcesses, setLoadingProcesses] = useState<boolean>(false);

  // Redistribuição de processos
  const [isRedistributeOpen, setIsRedistributeOpen] = useState<boolean>(false);
  const [redistributeFromId, setRedistributeFromId] = useState<string>("");
  const [redistributeDate, setRedistributeDate] = useState<string>(getCurrentDate());
  const [redistributeCount, setRedistributeCount] = useState<number>(0);

  // Processos detalhados agregados de toda a equipe no mês
  const [allDetailedProcesses, setAllDetailedProcesses] = useState<Record<string, Record<string, { origem: string; date: string }>>>({});

  // Toast notification state and safe non-blocking iframe-friendly alert shadowing
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "info",
  ) => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev && prev.message === message ? null : prev));
    }, 6000);
  };

  const alert = (message: string) => {
    let type: "success" | "error" | "info" = "info";
    const lower = message.toLowerCase();
    if (
      lower.includes("sucesso") ||
      lower.includes("concluído") ||
      lower.includes("salvo") ||
      lower.includes("sincronizados") ||
      lower.includes("removido")
    ) {
      type = "success";
    } else if (
      lower.includes("erro") ||
      lower.includes("falha") ||
      lower.includes("inválida") ||
      lower.includes("atenção") ||
      lower.includes("não foi possível") ||
      lower.includes("já existe")
    ) {
      type = "error";
    }
    showToast(message, type);
  };

  // Google Auth integration states
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isLoggingInGoogle, setIsLoggingInGoogle] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [hasAutoSyncedOnStartup, setHasAutoSyncedOnStartup] =
    useState<boolean>(false);
  const [hasSpreadsheetAccess, setHasSpreadsheetAccess] = useState<
    boolean | null
  >(null);
  const [selectedDetailDate, setSelectedDetailDate] = useState<string>(getCurrentDate());

  // Notifications
  const previousTodayCounts = React.useRef<Record<string, number>>({});
  const maxNotifiedCounts = React.useRef<Record<string, number>>({});
  const [notifications, setNotifications] = useState<any[]>([]);

  // Pagination
  const [historyPage, setHistoryPage] = useState<number>(1);
  const itemsPerPage = 15;

  // Monitor Firebase Auth status
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
        setIsAuthLoading(false);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
        setHasSpreadsheetAccess(null);
        setIsAuthLoading(false);
      },
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingInGoogle(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setGoogleToken(result.accessToken);
        // If there's an existing URL, sync it instantly!
        if (spreadsheetUrl) {
          triggerSheetsSync(spreadsheetUrl, estagiarios);
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(
        "Falha ao se conectar com a conta do Google: " + (err.message || err),
      );
    } finally {
      setIsLoggingInGoogle(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logout();
    setGoogleUser(null);
    setGoogleToken(null);
  };

  // Time Tracker Effect
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Update selectedDetailDate when selectedMonth changes
  useEffect(() => {
    const today = getCurrentDate();
    if (today.startsWith(selectedMonth)) {
      setSelectedDetailDate(today);
    } else {
      setSelectedDetailDate(`${selectedMonth}-01`);
    }
  }, [selectedMonth]);

  // Initialize edit fields when an estagiario is selected
  useEffect(() => {
    if (selectedEstagiarioDetail) {
      const detailed = estagiarios.find(
        (a) => a.id === selectedEstagiarioDetail,
      );
      if (detailed) {
        setEditEstagiarioName(detailed.name);
        setEditEstagiarioRole(
          detailed.role === "pos_graduacao" ? "pos_graduacao" : "graduacao",
        );
        setEditEstagiarioDailyGoal(
          detailed.dailyGoal ?? (detailed.role === "pos_graduacao" ? 30 : 25),
        );
      }
      setIsEditingCadastre(false);
    }
  }, [selectedEstagiarioDetail, estagiarios]);


  // Fetch Data
  const fetchData = async () => {
    try {
      setLoading(true);

      // 1. Carregar estagiários
      const SKIP_IDS = new Set(["total", "livre_1", "pietro"]);
      const estagiariosSnap = await getDocs(collection(db, "estagiarios"));
      const estagiariosList: Estagiario[] = [];
      estagiariosSnap.forEach((docSnap) => {
        const estag = { id: docSnap.id, ...docSnap.data() } as Estagiario;
        if (!SKIP_IDS.has(estag.id)) {
          estagiariosList.push(estag);
        }
      });
      estagiariosList.sort((a, b) => a.name.localeCompare(b.name));
      setEstagiarios(estagiariosList);

      // 2. Carregar entradas de produtividade
      const entriesSnap = await getDocs(collection(db, "productivityEntries"));
      const entriesList: ProductivityEntry[] = [];
      entriesSnap.forEach((docSnap) => {
        const data = {
          id: docSnap.id,
          ...docSnap.data(),
        } as ProductivityEntry;
        if (!SKIP_IDS.has(data.estagiarioId)) {
          entriesList.push(data);
        }
      });

      // Garantir o carregamento completo do dia 22/06/2026 (bypass do limite de 1000 do PostgREST)
      try {
        const { data: todayRows } = await supabase
          .from("productivity_entries")
          .select("*")
          .eq("date", "2026-06-22");

        if (todayRows && todayRows.length > 0) {
          todayRows.forEach((row) => {
            let count = row.count;
            // Aplica os valores corretos informados
            if (row.estagiario_id === "henrique") count = 31;
            if (row.estagiario_id === "vinicius") count = 25;
            if (row.estagiario_id === "ademar") count = 56;

            const existingIdx = entriesList.findIndex(
              (e) => e.estagiarioId === row.estagiario_id && e.date === row.date
            );
            if (existingIdx !== -1) {
              entriesList[existingIdx].count = count;
            } else {
              entriesList.push({
                id: row.id,
                estagiarioId: row.estagiario_id,
                date: row.date,
                count: count,
              });
            }
          });
        }
      } catch (errToday) {
        console.error("Erro ao buscar dados específicos de hoje:", errToday);
      }

      setEntries(entriesList);

      // HOTFIX: Salva no Supabase os valores corretos de Henrique (31) e Vinicius (25) se o admin estiver logado
      getSession().then((session) => {
        if (session?.user) {
          const targetDate = "2026-06-22";
          const henriqueEntry = entriesList.find((e) => e.estagiarioId === "henrique" && e.date === targetDate);
          const viniciusEntry = entriesList.find((e) => e.estagiarioId === "vinicius" && e.date === targetDate);
          const ademarEntry = entriesList.find((e) => e.estagiarioId === "ademar" && e.date === targetDate);

          const needsHenriqueFix = !henriqueEntry || henriqueEntry.count !== 31;
          const needsViniciusFix = !viniciusEntry || viniciusEntry.count !== 25;
          const needsAdemarFix = !ademarEntry || ademarEntry.count !== 56;

          if (needsHenriqueFix || needsViniciusFix || needsAdemarFix) {
            console.log("[Hotfix] Gravando correções definitivas do dia 22/06 no Supabase...");
            const corrections = [
              { estagiarioId: "ademar", date: targetDate, count: 56 },
              { estagiarioId: "henrique", date: targetDate, count: 31 },
              { estagiarioId: "vinicius", date: targetDate, count: 25 }
            ];

            batchUpsertEntries(corrections).then(() => {
              console.log("[Hotfix] Banco de dados atualizado com sucesso para 22/06!");
            }).catch((err) => {
              console.error("[Hotfix] Falha ao persistir correções:", err);
            });
          }
        }
      });

      // 3. Carregar configurações da planilha (somente leitura — anon pode ler)
      const settingsSnap = await getDoc(doc(db, "settings", "googleSheet"));
      if (settingsSnap.exists()) {
        const settingsData = settingsSnap.data();
        setSpreadsheetUrl(settingsData.url || DEFAULT_SHEET_URL);
        setAutoSyncEnabled(
          settingsData.autoSync !== undefined ? settingsData.autoSync : true,
        );
        // Sempre usa "Controle detalhado" — ignorar valor antigo "Controle" do banco
        setSelectedSheetName("Controle detalhado");
        setLastSyncTime(settingsData.lastSync || "");
      }

      // 4. Carregar configurações de semana de prova (anon pode ler)
      const semanaProvaSnap = await getDoc(doc(db, "settings", "semanaProva"));
      if (semanaProvaSnap.exists()) {
        const semanaProvaData = semanaProvaSnap.data();
        setSemanaProvaIds(semanaProvaData.estagiariosIds || []);
      }
      // Não tenta criar settings se não existir — o usuário autenticado fará isso depois
    } catch (error) {
      console.error("Erro ao carregar dados do Supabase:", error);
    } finally {
      setLoading(false);
    }
  };



  // Google Sheets & Clipboard CSV/TSV Parser (Supports Multiple Tabs: Controle and Estagiários)
  const parseSheetData = (
    rawData: string | { [key: string]: string },
    currentEstagiarios: Estagiario[],
    targetControleSheetName?: string,
  ) => {
    let diagDetalhado = false;
    let diagTypesRowIdx = -1;
    let diagDateColIdx = -1;
    let diagMaxDateCount = 0;
    let diagTotalRows = 0;
    let diagMappedUsers: string[] = [];
    let diagFirstRowDump = "";
    let diagFirstDateRaw = "";
    let diagFirstDateIso = "";
    let debugRows: string[][] = [];
    const SKIP_IDS = new Set(["total", "livre_1", "pietro"]);

    const normalizeText = (text: string) =>
      text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const findEstagiarioId = (name: string): string | null => {
      const normName = normalizeText(name);
      const found = currentEstagiarios.find(
        (a) => normalizeText(a.name) === normName,
      );
      return found ? found.id : null;
    };

    const translateMonthToNum = (m: string): string => {
      const norm = m
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .substring(0, 3);
      const months: { [key: string]: string } = {
        jan: "01",
        fev: "02",
        mar: "03",
        abr: "04",
        mai: "05",
        jun: "06",
        jul: "07",
        ago: "08",
        set: "09",
        out: "10",
        nov: "11",
        dez: "12",
        "01": "01",
        "02": "02",
        "03": "03",
        "04": "04",
        "05": "05",
        "06": "06",
        "07": "07",
        "08": "08",
        "09": "09",
        "10": "10",
        "11": "11",
        "12": "12",
      };
      return months[norm] || m;
    };

    const parseDateToISO = (dateStr: string): string | null => {
      const getIso = () => {
        if (!dateStr) return null;
        let cleaned = dateStr.trim();

        // Se já estiver no formato YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

        // Procura por DD/MM/YYYY ou DD/MM/YY ou DD-MM-YYYY no início (ex: "25/06/2026-Quinta")
        const slashMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2}|\w{3,4})[\/\-](\d{2,4})/);
        if (slashMatch) {
          const [, day, monthStr, yearStr] = slashMatch;
          const year = yearStr.length === 2 ? `20${yearStr}` : yearStr;
          const month = translateMonthToNum(monthStr);
          return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }

        // Procura por Date(2026,5,25) ou similar (formato retornado pelo Google Visualization API)
        const gvizMatch = cleaned.match(/Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})\)/i);
        if (gvizMatch) {
          const [, y, m, d] = gvizMatch;
          // O mês no Gviz é 0-indexado (0 = Jan, 5 = Jun)
          const monthVal = String(parseInt(m, 10) + 1).padStart(2, "0");
          return `${y}-${monthVal}-${d.padStart(2, "0")}`;
        }

        // Procura por YYYY/MM/DD ou YYYY-MM-DD no início
        const isoMatch = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (isoMatch) {
          const [, year, month, day] = isoMatch;
          return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }

        // Caso tenha espaços, tenta pegar o primeiro token
        if (cleaned.includes(" ")) {
          cleaned = cleaned.split(" ")[0].trim();
        }

        // Formato com barras clássico (DD/MM/YYYY)
        const slashParts = cleaned.split("/");
        if (slashParts.length === 3) {
          const [day, monthStr, yearStr] = slashParts;
          const year = yearStr.length === 2 ? `20${yearStr}` : yearStr;
          const month = translateMonthToNum(monthStr);
          const padM = month.padStart(2, "0");
          const padD = day.padStart(2, "0");
          if (
            year.length === 4 &&
            !isNaN(parseInt(year, 10)) &&
            !isNaN(parseInt(padM, 10)) &&
            !isNaN(parseInt(padD, 10))
          ) {
            return `${year}-${padM}-${padD}`;
          }
        }

        return null;
      };

      const iso = getIso();
      if (iso === "2026-06-22") return null; // Ignora o dia 22 de junho de 2026 na sincronização
      return iso;
    };

    if (!rawData) {
      return {
        success: false,
        entries: [],
        estagiariosCreated: [],
        estagiariosDetailedToCreate: [],
        message:
          "Nenhum dado legível foi recebido da planilha. Verifique as configurações de compartilhamento.",
      };
    }

    let sheets: { [key: string]: string } = {};
    if (typeof rawData === "string") {
      sheets["Controle Geral"] = rawData;
    } else {
      sheets = rawData || {};
    }

    let estagiariosSheetContent = "";
    let estagiariosSheetName = "";
    const allControleSheets: { name: string; content: string }[] = [];
    const candidateIndividualSheets: { name: string; content: string }[] = [];

    // 1. Identify sheets
    Object.entries(sheets).forEach(([name, content]) => {
      const norm = normalizeText(name);
      // Ignora abas de template/modelo (ex: MODELO GERAL) de onde não precisamos de nenhum dado
      if (norm.includes("modelo") || norm.includes("template")) {
        return;
      }
      if (
        /estag|membro|usuario|cadastro|user|integrante|funcionario/i.test(norm)
      ) {
        estagiariosSheetContent = content;
        estagiariosSheetName = name;
      } else if (targetControleSheetName) {
        if (norm === normalizeText(targetControleSheetName)) {
          allControleSheets.push({ name, content });
        }
      } else if (norm.startsWith("controle")) {
        // Aceita "Controle", "Controle detalhado", etc.
        allControleSheets.push({ name, content });
      }
    });

    const controleSheets = targetControleSheetName
      ? allControleSheets
      : (allControleSheets.some((s) => normalizeText(s.name).includes("detalh"))
          ? allControleSheets.filter((s) => normalizeText(s.name).includes("detalh"))
          : allControleSheets);

    const estagiariosFromSheet: Estagiario[] = [];
    const estagiariosCreatedTemp: string[] = [];

    const getDelimiter = (csv: string) => {
      const firstLine = csv.split(/\r?\n/)[0] || "";
      if (firstLine.includes("\t")) return "\t";
      if (firstLine.includes(";")) return ";";
      return ",";
    };

    // 2. Process Estagiarios Sheet (Aba dos Estagiários)
    if (estagiariosSheetContent) {
      const eLines = estagiariosSheetContent
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (eLines.length > 1) {
        const eDelim = getDelimiter(estagiariosSheetContent);
        const eHeaders = eLines[0]
          .split(eDelim)
          .map((h) => h.trim().replace(/^["']|["']$/g, ""));

        let nameColIdx = -1;
        let matriculaColIdx = -1;
        let roleColIdx = -1;
        let goalColIdx = -1;

        for (let i = 0; i < eHeaders.length; i++) {
          const norm = normalizeText(eHeaders[i]);
          if (
            norm.includes("nome") ||
            norm.includes("estagiario") ||
            norm.includes("estagiário") ||
            norm.includes("usuario") ||
            norm.includes("pessoa") ||
            norm.includes("membro")
          ) {
            nameColIdx = i;
          } else if (
            norm.includes("matricula") ||
            norm.includes("matrícula") ||
            norm.includes("numero") ||
            norm.includes("número") ||
            norm.includes("codigo") ||
            norm.includes("código") ||
            norm.includes("id")
          ) {
            matriculaColIdx = i;
          } else if (
            norm.includes("role") ||
            norm.includes("cargo") ||
            norm.includes("categoria") ||
            norm.includes("tipo") ||
            norm.includes("modalidade")
          ) {
            roleColIdx = i;
          } else if (
            norm.includes("meta") ||
            norm.includes("daily") ||
            norm.includes("diaria") ||
            norm.includes("diária") ||
            norm.includes("objetivo")
          ) {
            goalColIdx = i;
          }
        }

        if (nameColIdx === -1) nameColIdx = 0;

        for (let i = 1; i < eLines.length; i++) {
          const cells = eLines[i]
            .split(eDelim)
            .map((c) => c.trim().replace(/^["']|["']$/g, ""));
          if (cells.length <= nameColIdx) continue;

          const rawName = cells[nameColIdx];
          if (!rawName || rawName === "Nome") continue;

          const rawMatricula =
            matriculaColIdx !== -1 && matriculaColIdx < cells.length
              ? cells[matriculaColIdx]
              : "";
          const rawRole =
            roleColIdx !== -1 && roleColIdx < cells.length
              ? cells[roleColIdx]
              : "";
          const rawGoal =
            goalColIdx !== -1 && goalColIdx < cells.length
              ? cells[goalColIdx]
              : "";

          let parsedRole = "graduacao";
          const normRole = normalizeText(rawRole);
          if (
            normRole.includes("pos_grad") ||
            normRole.includes("pós_grad") ||
            normRole.includes("pos grad") ||
            normRole.includes("pós grad") ||
            normRole.includes("pos-grad") ||
            normRole.includes("pós-grad")
          ) {
            parsedRole = "pos_graduacao";
          } else if (
            normRole.includes("grad") ||
            normRole.includes("bacharel")
          ) {
            parsedRole = "graduacao";
          }

          let parsedGoal = parsedRole === "pos_graduacao" ? 30 : 25;
          if (rawGoal) {
            const gNum = parseInt(rawGoal.replace(/[^0-9]/g, ""), 10);
            if (!isNaN(gNum) && gNum > 0) parsedGoal = gNum;
          }

          const computedId = rawName
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, "");
          if (computedId) {
            if (!estagiariosFromSheet.some((x) => x.id === computedId)) {
              estagiariosFromSheet.push({
                id: computedId,
                name: rawName,
                role: parsedRole,
                dailyGoal: parsedGoal,
                matricula: rawMatricula ? rawMatricula.trim() : "",
              });
            }
          }
        }
      }
    }

    // Combine current with sheet estagiarios for matching IDs during parsing
    const combinedCurrentAndSheetEstagiarios = [...currentEstagiarios];
    estagiariosFromSheet.forEach((sheetEstag) => {
      const idx = combinedCurrentAndSheetEstagiarios.findIndex(
        (e) => e.id === sheetEstag.id,
      );
      if (idx !== -1) {
        combinedCurrentAndSheetEstagiarios[idx] = {
          ...combinedCurrentAndSheetEstagiarios[idx],
          role: sheetEstag.role || combinedCurrentAndSheetEstagiarios[idx].role,
          dailyGoal:
            sheetEstag.dailyGoal ||
            combinedCurrentAndSheetEstagiarios[idx].dailyGoal,
          matricula:
            sheetEstag.matricula ||
            combinedCurrentAndSheetEstagiarios[idx].matricula,
        };
      } else {
        combinedCurrentAndSheetEstagiarios.push(sheetEstag);
      }
    });

    const parsedEntries: Omit<ProductivityEntry, "id">[] = [];

    const findEstagiarioIdLocal = (name: string): string | null => {
      const normName = normalizeText(name);
      const found = combinedCurrentAndSheetEstagiarios.find(
        (a) => normalizeText(a.name) === normName,
      );
      return found ? found.id : null;
    };

    const parsedDetailedProcesses: Array<{
      estagiarioId: string;
      date: string;
      numeroProcesso: string;
      origem: string;
    }> = [];

    // Identificar abas individuais reais vinculando aos estagiarios
    const individualSheetsProcessed: { estagiarioId: string; content: string; name: string }[] = [];
    const individualEstagiarioIds = new Set<string>();

    candidateIndividualSheets.forEach(({ name, content }) => {
      const estagId = findEstagiarioIdLocal(name);
      if (estagId) {
        individualSheetsProcessed.push({ estagiarioId: estagId, content, name });
        individualEstagiarioIds.add(estagId);
      }
    });

    // Processar abas individuais
    individualSheetsProcessed.forEach(({ estagiarioId, content, name }) => {
      if (!content) return;
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length <= 1) return;

      const delimiter = getDelimiter(content);
      const rows = lines.map((line) =>
        line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""))
      );

      // Achar cabeçalho: Data, Nº do Processo (ou Processo), Origem
      let dateColIdx = -1;
      let procColIdx = -1;
      let origemColIdx = -1;
      let headerRowIdx = -1;

      for (let r = 0; r < Math.min(rows.length, 10); r++) {
        const row = rows[r].map((h) => normalizeText(h || ""));
        const dIdx = row.findIndex((h) => h === "data" || h.includes("data"));
        const pIdx = row.findIndex((h) => h.includes("processo") || h.includes("nº"));
        const oIdx = row.findIndex((h) => h === "origem" || h.includes("origem"));

        if (dIdx !== -1 && pIdx !== -1) {
          dateColIdx = dIdx;
          procColIdx = pIdx;
          origemColIdx = oIdx;
          headerRowIdx = r;
          break;
        }
      }

      if (dateColIdx === -1) {
        dateColIdx = 0;
        procColIdx = 1;
        origemColIdx = 2;
        headerRowIdx = 1;
      }

      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (dateColIdx >= row.length) continue;

        const rawDate = row[dateColIdx] || "";
        const isoDate = parseDateToISO(rawDate);
        if (!isoDate || isoDate < "2026-04-01") continue;

        const rawProc = procColIdx !== -1 && procColIdx < row.length ? row[procColIdx].trim() : "";
        const rawOrigem = origemColIdx !== -1 && origemColIdx < row.length ? row[origemColIdx].trim() : "";
        const normOrigem = rawOrigem.toLowerCase();

        if (!rawProc) continue;

        parsedEntries.push({
          estagiarioId,
          date: isoDate,
          count: 1, // Cada linha de processo representa 1!
        });

        parsedDetailedProcesses.push({
          estagiarioId,
          date: isoDate,
          numeroProcesso: rawProc,
          origem: normOrigem.toUpperCase() || "CV",
        });
      }
    });

    // 3. Process Controle (Cases) Sheets
    controleSheets.forEach(({ name: cName, content: cContent }) => {
      if (!cContent) return;
      const lines = cContent
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length <= 1) return;

      const delimiter = getDelimiter(cContent);
      const rows = lines.map((line) =>
        line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, "")),
      );

      debugRows = rows.slice(0, 10);

      // 3.0 Detectar formato DETALHADO ("Controle detalhado")
      // Identifica por subcolunas de tipo como CV, RCV, DCV, CR, RCR, DCR
      const DETAIL_TYPE_CODES = new Set(["cv", "rcv", "dcv", "cr", "rcr", "dcr"]);
      let typesRowIdx = -1;
      let maxTypeCodeCount = -1;
      for (let i = 0; i < Math.min(15, rows.length); i++) {
        const typeCodeCount = rows[i].filter(
          (c) => DETAIL_TYPE_CODES.has((c || "").toLowerCase().trim())
        ).length;
        if (typeCodeCount >= 3 && typeCodeCount > maxTypeCodeCount) {
          maxTypeCodeCount = typeCodeCount;
          typesRowIdx = i;
        }
      }

      if (typesRowIdx !== -1) {
        // === FORMATO DETALHADO (subcolunas por tipo) ===
        console.log(`[parseSheetData] Formato DETALHADO detectado na aba "${cName}", linha de tipos: ${typesRowIdx}`);
        diagDetalhado = true;
        diagTypesRowIdx = typesRowIdx;
        diagTotalRows = rows.length;

        // Linha de nomes: procura a linha de nomes subindo a partir de typesRowIdx
        let namesRowIdx = typesRowIdx > 0 ? typesRowIdx - 1 : typesRowIdx;
        for (let r = typesRowIdx - 1; r >= 0; r--) {
          const row = rows[r];
          const textCellCount = row.filter((c) => {
            const trimmed = (c || "").trim();
            return trimmed && !/^\d+(\.\d+)?%?$/.test(trimmed) && !DETAIL_TYPE_CODES.has(trimmed.toLowerCase());
          }).length;
          if (textCellCount >= 3) {
            namesRowIdx = r;
            break;
          }
        }

        const namesRow = rows[namesRowIdx];
        const typesRow = rows[typesRowIdx];
        const totalCols = Math.max(namesRow.length, typesRow.length);

        // Forward-fill nomes de usuários (células mescladas: nome só na 1ª coluna, restante vazio)
        let currentUserName = "";
        const colUserMap: string[] = new Array(totalCols).fill("");
        for (let c = 0; c < totalCols; c++) {
          const cell = (namesRow[c] || "").trim();
          // Atualiza nome corrente se a célula tem conteúdo e não é número puro (total) nem código de tipo
          if (cell && !/^\d+(\.\d+)?%?$/.test(cell) && !DETAIL_TYPE_CODES.has(cell.toLowerCase())) {
            currentUserName = cell;
          }
          colUserMap[c] = currentUserName;
        }

        // Detectar a coluna de datas de forma robusta no formato detalhado
        let dateColIdx = 0; // fallback padrão
        let maxDateCount = 0;
        const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);

        // Varre as primeiras 6 colunas (A-F) para encontrar a coluna de datas
        for (let c = 0; c < Math.min(6, colCount); c++) {
          let dateCount = 0;
          for (let r = typesRowIdx + 1; r < rows.length; r++) {
            const row = rows[r];
            if (c < row.length && row[c] && parseDateToISO(row[c])) {
              dateCount++;
            }
          }
          if (dateCount > maxDateCount) {
            maxDateCount = dateCount;
            dateColIdx = c;
          }
        }
        console.log(`[parseSheetData] Coluna de datas detectada no formato detalhado: coluna índice ${dateColIdx} (${maxDateCount} datas válidas)`);

        // Mapear usuário -> lista de índices de colunas das subcolunas
        const userColsMap: { [userId: string]: { name: string; cols: number[] } } = {};
        for (let c = 0; c < typesRow.length; c++) {
          if (c === dateColIdx) continue; // Ignorar explicitamente a coluna de data para evitar parsing indevido
          const typeCode = (typesRow[c] || "").trim();
          const userName = colUserMap[c] || "";
          // Só processa colunas que são códigos de tipo conhecidos E têm nome de usuário
          if (!typeCode || !DETAIL_TYPE_CODES.has(typeCode.toLowerCase())) continue;
          if (!userName) continue;

          let userId = findEstagiarioIdLocal(userName);
          if (!userId) {
            const generatedId = userName
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/\s+/g, "_")
              .replace(/[^a-z0-9_]/g, "");
            if (!generatedId || generatedId.length < 2) continue;
            if (!estagiariosCreatedTemp.includes(userName))
              estagiariosCreatedTemp.push(userName);
            userId = generatedId;
          }

          if (SKIP_IDS.has(userId)) continue;

          if (!userColsMap[userId]) userColsMap[userId] = { name: userName, cols: [] };
          userColsMap[userId].cols.push(c);
        }

        console.log(`[parseSheetData] Usuários detectados no formato detalhado:`, Object.keys(userColsMap));
        diagDateColIdx = dateColIdx;
        diagMaxDateCount = maxDateCount;
        diagMappedUsers = Object.keys(userColsMap);

        if (rows[typesRowIdx + 1]) {
          diagFirstRowDump = rows[typesRowIdx + 1].slice(0, 10).join(" | ");
          diagFirstDateRaw = rows[typesRowIdx + 1][dateColIdx] || "";
          diagFirstDateIso = parseDateToISO(diagFirstDateRaw) || "null";
        }

        // Processar linhas de dados (a partir da linha após a de tipos)
        for (let r = typesRowIdx + 1; r < rows.length; r++) {
          const row = rows[r];
          if (dateColIdx >= row.length) continue;
          const rawDate = row[dateColIdx] || "";
          const isoDate = parseDateToISO(rawDate);
          if (!isoDate || isoDate < "2026-04-01") continue;

          Object.entries(userColsMap).forEach(([userId, { cols }]) => {
            if (individualEstagiarioIds.has(userId)) return;
            let total = 0;
            const typeBreakdown: Record<string, number> = {};

            cols.forEach((colIdx) => {
              if (colIdx === dateColIdx) return; // Segurança extra
              if (colIdx < row.length) {
                const rawVal = (row[colIdx] || "").replace(/\s/g, "").replace(",", ".");
                const num = Math.round(parseFloat(rawVal));
                if (!isNaN(num) && num > 0) {
                  total += num;

                  // Acumular por tipo (CV, RCV, DCV, CR, RCR, DCR)
                  const typeCode = (typesRow[colIdx] || "").trim().toUpperCase();
                  if (typeCode) {
                    typeBreakdown[typeCode] = (typeBreakdown[typeCode] || 0) + num;
                  }

                  // Gerar processos detalhados fictícios correspondentes (mantido para compatibilidade)
                  for (let i = 1; i <= num; i++) {
                    parsedDetailedProcesses.push({
                      estagiarioId: userId,
                      date: isoDate,
                      numeroProcesso: `Proc-${userId.substring(0, 3).toUpperCase()}-${typeCode}-${isoDate.replace(/-/g, "")}-${i}`,
                      origem: typeCode || "CV",
                    });
                  }
                }
              }
            });
            if (total > 0) {
              parsedEntries.push({
                estagiarioId: userId,
                date: isoDate,
                count: total,
                typeBreakdown,
              });
            }
          });
        }
        return; // Concluiu leitura desta aba no formato detalhado
      }

      // 3.1 Identificar coluna de datas (aquela com maior quantidade de entradas de datas válidas)
      let dateColIdx = -1;
      let maxDateCount = 0;
      const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);

      for (let c = 0; c < colCount; c++) {
        let dateCount = 0;
        rows.forEach((row) => {
          if (c < row.length && row[c] && parseDateToISO(row[c])) {
            dateCount++;
          }
        });
        if (dateCount > maxDateCount) {
          maxDateCount = dateCount;
          dateColIdx = c;
        }
      }

      // Se não encontrou nenhuma coluna com datas válidas, pula esta aba
      if (dateColIdx === -1) return;

      // DETERMINAÇÃO DO FORMATO
      // Tenta identificar se a tabela está no formato de lista flat (ex: Data, Estagiário, Quantidade)
      if (rows.length > 0) {
        const firstRows = [rows[0]];
        if (rows[1]) firstRows.push(rows[1]); // Look at first 2 rows for headers

        let estagiarioColIdx = -1;
        let qtdColIdx = -1;
        let origemColIdx = -1;
        let headerRowIdxToSkip = -1;

        for (let i = 0; i < firstRows.length; i++) {
          const headerRow = firstRows[i].map((h) => normalizeText(h || ""));
          const eIdx = headerRow.findIndex(
            (h) =>
              h.includes("nome") ||
              h.includes("estagiario") ||
              h.includes("autor"),
          );
          const qIdx = headerRow.findIndex(
            (h) =>
              h.includes("qtd") ||
              h.includes("quantidade") ||
              h.includes("processos") ||
              h.includes("total"),
          );
          const oIdx = headerRow.findIndex(
            (h) =>
              h.includes("origem") ||
              h.includes("tipo") ||
              h.includes("categoria") ||
              h.includes("setor"),
          );
          if (eIdx !== -1 && qIdx !== -1) {
            estagiarioColIdx = eIdx;
            qtdColIdx = qIdx;
            origemColIdx = oIdx;
            headerRowIdxToSkip = i;
            break;
          }
        }

        if (estagiarioColIdx !== -1 && qtdColIdx !== -1 && dateColIdx !== -1) {
          // Processamento para tabela no formato FLAT LIST
          console.log(`[parseSheetData] Formato FLAT detectado na aba "${cName}": dateCol=${dateColIdx}, nomeCol=${estagiarioColIdx}, qtdCol=${qtdColIdx}, headerRow=${headerRowIdxToSkip}`);
          console.log(`[parseSheetData] Header detectado:`, rows[headerRowIdxToSkip]);
          // Mostrar os primeiros 3 valores da coluna de qtd para diagnóstico
          for (let r = headerRowIdxToSkip + 1; r < Math.min(headerRowIdxToSkip + 4, rows.length); r++) {
            const row = rows[r];
            console.log(`[parseSheetData] Linha ${r}: nome="${row[estagiarioColIdx]}", qtd="${row[qtdColIdx]}", date="${row[dateColIdx]}"`);
          }

          for (let r = headerRowIdxToSkip + 1; r < rows.length; r++) {
            const row = rows[r];
            const rawDate = row[dateColIdx] || "";
            const isoDate = parseDateToISO(rawDate);
            if (!isoDate || isoDate < "2026-04-01")
              continue;

            const estagiarioName = (row[estagiarioColIdx] || "").trim();
            const qtdStr = row[qtdColIdx];
            if (!estagiarioName || estagiarioName === "" || !qtdStr) continue;

            let estagiarioId = findEstagiarioIdLocal(estagiarioName);
            if (!estagiarioId) {
              const generatedId = estagiarioName
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/\s+/g, "_")
                .replace(/[^a-z0-9_]/g, "");
              if (!generatedId || generatedId.length < 2) continue;
              if (!estagiariosCreatedTemp.includes(estagiarioName))
                estagiariosCreatedTemp.push(estagiarioName);
              estagiarioId = generatedId;
            }

            if (SKIP_IDS.has(estagiarioId) || individualEstagiarioIds.has(estagiarioId)) continue;

            const cleanedVal = qtdStr.replace(/\s/g, "").replace(",", ".");
            const parsedVal = Math.round(parseFloat(cleanedVal));
            if (!isNaN(parsedVal) && parsedVal > 0) {
              parsedEntries.push({
                estagiarioId,
                date: isoDate,
                count: parsedVal,
              });
            }
          }
          return; // Concluiu a leitura desta aba em formato flat
        }
      }

      // 3.2 Identificar a linha dos nomes de estagiários (Formato Cruzado/Matriz)
      let nameRowIdx = -1;
      let maxNameScore = -1;

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        // Se essa linha já é uma linha cheia de datas, não é a de nomes
        if (row[dateColIdx] && parseDateToISO(row[dateColIdx])) {
          continue;
        }

        let score = 0;
        row.forEach((cell, cIdx) => {
          if (cIdx === dateColIdx) return;
          const trimmed = cell.trim();
          if (!trimmed) return;

          // Se bate exatamente com um estagiário cadastrado ou pré-carregado
          const matchesExisting = combinedCurrentAndSheetEstagiarios.some(
            (e) => normalizeText(e.name) === normalizeText(trimmed),
          );

          if (matchesExisting) {
            score += 15; // Pontuação altíssima para estagiários pré-existentes
          } else if (
            /^[A-Za-zÀ-ÖØ-öø-ÿ\s\.\-]{3,25}$/.test(trimmed) &&
            !/^\d+$/.test(trimmed) &&
            !trimmed.includes("/") &&
            !trimmed.includes("-")
          ) {
            const normTrimmed = normalizeText(trimmed);
            const ignoreWords = [
              "total",
              "quantidade",
              "data",
              "obs",
              "comentario",
              "concluido",
              "meta",
              "soma",
              "segunda",
              "terca",
              "quarta",
              "quinta",
              "sexta",
              "sabado",
              "domingo",
              "porcent",
              "percent",
              "media",
              "dias",
              "mes",
              "ano",
              "semana",
              "revisao",
              "ajuste",
            ];
            if (!ignoreWords.some((w) => normTrimmed.includes(w))) {
              score += 2;
            }
          }
        });

        if (score > maxNameScore) {
          maxNameScore = score;
          nameRowIdx = r;
        }
      }

      // Se não encontrou uma linha de nomes satisfatória, usamos a linha 0 como padrão
      if (nameRowIdx === -1) {
        nameRowIdx = 0;
      }

      const nameRow = rows[nameRowIdx];

      // 3.3 Mapear colunas que contêm cabeçalhos válidos de estagiários
      const mappedCols: {
        colIndex: number;
        estagiarioId: string;
        estagiarioName: string;
      }[] = [];
      nameRow.forEach((cell, cIdx) => {
        if (cIdx === dateColIdx) return;
        const estagiarioName = cell.trim();
        if (!estagiarioName) return;

        // Ignora palavras técnicas comuns para colunas (ex: "total", "observações", etc.)
        const normName = normalizeText(estagiarioName);
        const ignoreWords = [
          "total",
          "quantidade",
          "data",
          "obs",
          "comentario",
          "concluido",
          "meta",
          "soma",
          "segunda",
          "terca",
          "quarta",
          "quinta",
          "sexta",
          "sabado",
          "domingo",
          "porcent",
          "percent",
          "media",
          "dias",
          "mes",
          "ano",
          "semana",
          "revisao",
          "ajuste",
          "dia",
        ];

        if (
          ignoreWords.some((w) => normName.includes(w)) ||
          normName.length < 3
        ) {
          return;
        }

        // Ignora colunas que são puramente números (ex: cabeçalhos extras como o total vertical da planilha "192")
        if (
          /^\d+$/.test(estagiarioName) ||
          /^[\d\.\,\%]+$/.test(estagiarioName)
        ) {
          return;
        }

        let estagiarioId = findEstagiarioIdLocal(estagiarioName);
        if (!estagiarioId) {
          const generatedId = estagiarioName
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, "");
          if (!generatedId) return; // Ignore columns that generate empty/invalid identifiers like blank spaces or notes
          estagiariosCreatedTemp.push(estagiarioName);
          estagiarioId = generatedId;
        }
        if (estagiarioId) {
          mappedCols.push({ colIndex: cIdx, estagiarioId, estagiarioName });
        }
      });

      // 3.4 Processar as linhas de dados (tendo data válida em `dateColIdx`)
      rows.forEach((row) => {
        if (dateColIdx >= row.length) return;
        const rawDate = row[dateColIdx];
        const isoDate = parseDateToISO(rawDate);
        if (!isoDate || isoDate < "2026-04-01")
          return;

        mappedCols.forEach(({ colIndex, estagiarioId }) => {
          if (SKIP_IDS.has(estagiarioId) || individualEstagiarioIds.has(estagiarioId)) {
            return;
          }

          if (colIndex < row.length) {
            const rawVal = row[colIndex];

            if (rawVal) {
              const cleanedVal = rawVal.replace(/\s/g, "").replace(",", ".");
              const parsedVal = Math.round(parseFloat(cleanedVal));
              if (!isNaN(parsedVal) && parsedVal >= 0) {
                parsedEntries.push({
                  estagiarioId,
                  date: isoDate,
                  count: parsedVal,
                });
              }
            }
          }
        });
      });
    });

    // ELIMINATE DUPLICATES AND REDUNDANCIES:
    const consolidatedMap: { [key: string]: Omit<ProductivityEntry, "id"> } =
      {};
    parsedEntries.forEach((entry) => {
      const key = `${entry.estagiarioId}_${entry.date}`;
      if (consolidatedMap[key]) {
        consolidatedMap[key].count += entry.count;
      } else {
        consolidatedMap[key] = { ...entry };
      }
    });

    const consolidatedEntries = Object.values(consolidatedMap);

    // Ensure estagiariosCreatedTemp has detailed representations in estagiariosFromSheet
    estagiariosCreatedTemp.forEach((name) => {
      const code = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
      if (
        code &&
        !SKIP_IDS.has(code) &&
        !estagiariosFromSheet.some((e) => e.id === code) &&
        !currentEstagiarios.some((e) => e.id === code)
      ) {
        estagiariosFromSheet.push({
          id: code,
          name: name,
          role: "graduacao",
          dailyGoal: 25,
          matricula: "",
        });
      }
    });

    // Extract names for backward compatibility list display
    const uniqueEstagiariosCreated = Array.from(
      new Set(estagiariosFromSheet.map((e) => e.name)),
    );

    let msg = "";
    if (consolidatedEntries.length === 0 && diagDetalhado) {
      msg = `Sincronizados 0 casos. Diag: typesRowIdx=${diagTypesRowIdx}, dateColIdx=${diagDateColIdx} (${diagMaxDateCount} datas), totalLinhas=${diagTotalRows}, usuarios=[${diagMappedUsers.join(", ")}], primeiraLinhaDump=[${diagFirstRowDump}], primeiraDataRaw="${diagFirstDateRaw}", primeiraDataIso="${diagFirstDateIso}"`;
    } else if (estagiariosSheetContent && controleSheets.length > 0) {
      const namesList = controleSheets.map((s) => `"${s.name}"`).join(", ");
      msg = `Sincronização concluída! Foram sincronizados ${consolidatedEntries.length} casos de produtividade ao todo a partir de ${controleSheets.length} aba(s) (${namesList}) e localizados ${estagiariosFromSheet.length} perfis de estagiários na aba "${estagiariosSheetName}".`;
    } else if (controleSheets.length > 0) {
      const namesList = controleSheets.map((s) => `"${s.name}"`).join(", ");
      msg = `Sincronização concluída! Foram sincronizados ${consolidatedEntries.length} casos de produtividade ao todo a partir de ${controleSheets.length} aba(s) (${namesList}).`;
    } else {
      msg = `Sincronização concluída! Importados ${estagiariosFromSheet.length} perfis de estagiários.`;
    }

    return {
      success: true,
      entries: consolidatedEntries,
      estagiariosCreated: uniqueEstagiariosCreated,
      estagiariosDetailedToCreate: estagiariosFromSheet,
      detailedProcesses: parsedDetailedProcesses,
      message: msg,
      debugRows: debugRows,
    };
  };

  // Trigger Sheet Sync
  const triggerSheetsSync = async (
    urlStr: string,
    activeEstagiarios: Estagiario[],
    showFeedback: boolean = true,
  ) => {
    if (!urlStr) {
      if (showFeedback)
        alert("Por favor, insira o link da Planilha do Google.");
      return;
    }

    const isDocUrl = urlStr.includes("/d/");
    if (!isDocUrl) {
      if (showFeedback)
        alert(
          "URL do Google Planilhas inválida. Certifique-se de copiar o link do seu navegador.",
        );
      return;
    }

    let timerId: any = null;
    setSyncingSheets(true);
    setSyncDuration(0);
    const startTime = Date.now();
    timerId = setInterval(() => {
      setSyncDuration((Date.now() - startTime) / 1000);
    }, 100);

    if (showFeedback) {
      setSheetsMessage("Iniciando conexão de sincronização...");
    }
    setSheetSyncError("");

    try {
      const activeToken = (await getAccessToken()) || googleToken;
      if (!activeToken) {
        throw new Error("Token de acesso não disponível. Faça login novamente.");
      }

      const resData = await fetchSheetDataDirectly(urlStr, activeToken);
      const parseResult = parseSheetData(
        resData.sheets || resData.csvText,
        activeEstagiarios,
        selectedSheetName,
      );

      if (showFeedback) {
        try {
          await setDoc(
            doc(db, "settings", "sync_diagnostics_raw"),
            {
              timestamp: new Date().toISOString(),
              showFeedback,
              sheetsNames: Object.keys(resData.sheets || {}),
              message: parseResult.message,
              entriesCount: parseResult.entries?.length || 0,
              entries: (parseResult.entries || []).map(e => ({ estagiarioId: e.estagiarioId, date: e.date, count: e.count })),
              detailedProcessesCount: parseResult.detailedProcesses?.length || 0,
              detailedProcesses: (parseResult.detailedProcesses || []).slice(0, 10),
              debugRows: parseResult.debugRows || [],
            }
          );
        } catch (diagErr) {
          console.error("Failed raw diagnostics write:", diagErr);
        }
      }

      if (!parseResult.success) {
        setHasSpreadsheetAccess(false);
        if (showFeedback) alert(parseResult.message);
        setSheetSyncError(parseResult.message);
        return;
      }

      setHasSpreadsheetAccess(true);
      setPreviewEntries(parseResult.entries);
      setPreviewEstagiariosToCreate(parseResult.estagiariosCreated);
      setPreviewEstagiariosDetailed(
        parseResult.estagiariosDetailedToCreate || [],
      );
      setSheetsMessage(parseResult.message);
      setSheetSyncError("");

      // Salva no Firestore — sincronização manual salva tudo, automática salva só o dia atual
      let finalEntriesToSave = parseResult.entries;
      let finalDetailedProcesses = parseResult.detailedProcesses || [];
      if (!showFeedback) {
        const todayStr = getCurrentDate();
        finalEntriesToSave = parseResult.entries.filter(
          (e) => e.date === todayStr
        );
        finalDetailedProcesses = (parseResult.detailedProcesses || []).filter(
          (p) => p.date === todayStr
        );
      }

      await saveSyncedDataToFirestore(
        finalEntriesToSave,
        parseResult.estagiariosCreated,
        urlStr,
        !showFeedback,
        parseResult.estagiariosDetailedToCreate || [],
        finalDetailedProcesses,
      );

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      setLastSyncDuration(duration);

      if (showFeedback) {
        setIsSheetsModalOpen(true);
      }
    } catch (err: any) {
      console.error(err);
      const isQuotaError = err.status === 429 || (err.message && err.message.toLowerCase().includes("quota"));
      if (err.status === 401 || err.status === 403) {
        setHasSpreadsheetAccess(false);
        // Se for erro de sessão expirada / token inválido (401), tentamos reautenticar de forma automatizada
        if (err.status === 401) {
          const lastAutoAuthStr = sessionStorage.getItem("last_auto_reauth_time");
          const now = Date.now();
          const delay = 15000; // 15 segundos de cooldown
          
          if (!lastAutoAuthStr || now - parseInt(lastAutoAuthStr, 10) > delay) {
            sessionStorage.setItem("last_auto_reauth_time", now.toString());
            console.warn("Detectado token do Google expirado (401). Iniciando reautenticação automática...");
            googleSignIn();
            return;
          }
        }
      } else if (!isQuotaError && !hasSpreadsheetAccess && hasSpreadsheetAccess !== null) {
        // Leave it false if it was already false, but if it's 429, don't force it to false
        setHasSpreadsheetAccess(false);
      } else if (!isQuotaError && hasSpreadsheetAccess === null) {
        setHasSpreadsheetAccess(false);
      }
      
      let errMsg = err.message || "Verifique as configurações de compartilhamento da planilha.";
      const isScopeError = errMsg.toLowerCase().includes("scope") || errMsg.toLowerCase().includes("insufficient");
      if (isScopeError) {
        errMsg = "Erro de Permissão (Escopo Insuficiente): A conta conectada não concedeu permissão para ler planilhas do Google. Por favor, faça logout do Google no banner ou menu lateral e reconecte, garantindo que autorizou o acesso às planilhas. Se o erro persistir, certifique-se de que o escopo de leitura do Sheets ('https://www.googleapis.com/auth/spreadsheets.readonly') está habilitado no provedor Google dentro do painel do Supabase.";
      }
      setSheetSyncError(errMsg);
      if (showFeedback) {
        alert(`Falha na sincronização em tempo real: ${errMsg}`);
      }
    } finally {
      if (timerId) clearInterval(timerId);
      setSyncingSheets(false);
    }
  };

  // Convert pasted text (Ctrl+V) instantly
  const handleImportPastedData = async () => {
    if (!pasteDataText.trim()) {
      showToast(
        "Por favor, copie dados da sua planilha Excel e cole na caixa de texto.",
        "error",
      );
      return;
    }

    const parseResult = parseSheetData(pasteDataText, estagiarios, selectedSheetName);
    if (!parseResult.success) {
      showToast(parseResult.message, "error");
      return;
    }

    setPreviewEntries(parseResult.entries);
    setPreviewEstagiariosToCreate(parseResult.estagiariosCreated);
    setPreviewEstagiariosDetailed(
      parseResult.estagiariosDetailedToCreate || [],
    );
    setSheetsMessage(
      parseResult.message + " (Copiado da área de transferência)",
    );

    try {
      // Salva automaticamente no Firestore também para colagem direta do Excel
      await saveSyncedDataToFirestore(
        parseResult.entries,
        parseResult.estagiariosCreated,
        spreadsheetUrl,
        false,
        parseResult.estagiariosDetailedToCreate || [],
        parseResult.detailedProcesses || [],
      );
      showToast(
        "Dados salvos e sincronizados no banco com sucesso!",
        "success",
      );
      setPasteDataText(""); // clear input after success
      setIsSheetsModalOpen(false); // close modal
    } catch (e: any) {
      showToast("Erro ao salvar dados colados: " + e.message, "error");
    }
  };

  // Salva apenas as configurações de vínculo com a planilha no Firebase e já realiza a sincronização imediata salvando os dados
  const handleSaveSheetSettings = async () => {
    if (!spreadsheetUrl.trim()) {
      alert("Por favor, insira o link da Planilha do Google antes de salvar.");
      return;
    }

    const isDocUrl = spreadsheetUrl.includes("/d/");
    if (!isDocUrl) {
      alert(
        "URL do Google Planilhas inválida. Certifique-se de copiar o link completo do seu navegador.",
      );
      return;
    }

    setIsSaving(true);
    setSyncingSheets(true);
    setSyncDuration(0);
    const startTime = Date.now();
    const timerId = setInterval(() => {
      setSyncDuration((Date.now() - startTime) / 1000);
    }, 100);
    setSheetsMessage("Configurando vínculo e importando dados da planilha...");
    try {
      const nowIso = new Date().toISOString();
      await setDoc(
        doc(db, "settings", "googleSheet"),
        {
          url: spreadsheetUrl.trim(),
          autoSync: autoSyncEnabled,
          selectedSheetName: selectedSheetName.trim(),
          lastSync: nowIso,
        },
        { merge: true },
      );
      setLastSyncTime(nowIso);

      // Executa sincronização imediata
      const activeToken = (await getAccessToken()) || googleToken;
      if (!activeToken) {
        throw new Error("Token de acesso não disponível. Faça login novamente.");
      }

      const resData = await fetchSheetDataDirectly(spreadsheetUrl.trim(), activeToken);
      const parseResult = parseSheetData(
        resData.sheets || resData.csvText,
        estagiarios,
        selectedSheetName,
      );

      if (!parseResult.success) {
        throw new Error(parseResult.message);
      }

      setPreviewEntries(parseResult.entries);
      setPreviewEstagiariosToCreate(parseResult.estagiariosCreated);
      setPreviewEstagiariosDetailed(
        parseResult.estagiariosDetailedToCreate || [],
      );
      setSheetsMessage(parseResult.message);
      setSheetSyncError("");

      // Salva os dados carregados no Firestore instantaneamente
      await saveSyncedDataToFirestore(
        parseResult.entries,
        parseResult.estagiariosCreated,
        spreadsheetUrl.trim(),
        true, // isStartupSilent = true
        parseResult.estagiariosDetailedToCreate || [],
        parseResult.detailedProcesses || [],
      );

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      setLastSyncDuration(duration);

      alert(
        `A planilha foi vinculada e sincronizada com sucesso! Foram salvos ${parseResult.entries.length} lançamentos de produtividade no banco de dados. ` +
          (autoSyncEnabled
            ? "A Sincronização em Tempo Real está ATIVA para carregar dados automaticamente ao abrir o site."
            : ""),
      );

      // Limpa os dados de preview
      setPreviewEntries([]);
      setPreviewEstagiariosToCreate([]);
      setPreviewEstagiariosDetailed([]);
    } catch (err: any) {
      console.error(err);
      alert(
        "Erro ao gravar vínculo e sincronizar dados: " + (err.message || err),
      );
      setSheetSyncError(err.message || "");
    } finally {
      if (timerId) clearInterval(timerId);
      setIsSaving(false);
      setSyncingSheets(false);
    }
  };

  // Desvincula a planilha atual do sistema
  const handleUnlinkSheet = async () => {
    if (
      !window.confirm(
        "Tem certeza que deseja remover o vínculo com esta planilha? O link será limpo do sistema, mas os dados de processos já salvos serão preservados.",
      )
    ) {
      return;
    }
    setIsSaving(true);
    try {
      await setDoc(
        doc(db, "settings", "googleSheet"),
        {
          url: "",
          autoSync: false,
          lastSync: null,
        },
        { merge: true },
      );

      setSpreadsheetUrl("");
      setAutoSyncEnabled(false);
      setLastSyncTime("");
      alert("Vínculo removido com sucesso!");
    } catch (err: any) {
      console.error(err);
      alert("Erro ao desvincular planilha: " + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  const saveSyncedDataToFirestore = async (
    entriesToSave: Omit<ProductivityEntry, "id">[],
    estagiariosToCreate: string[],
    sheetUrl: string = spreadsheetUrl,
    isStartupSilent: boolean = false,
    estagiariosDetailedToCreate: Estagiario[] = previewEstagiariosDetailed,
    detailedProcesses: Array<{ estagiarioId: string; date: string; numeroProcesso: string; origem: string }> = [],
  ) => {
    setIsSaving(true);
    try {
        // Gravar timestamps dos processos detalhados nas abas individuais se existirem
        if (detailedProcesses && detailedProcesses.length > 0) {
          const processesBySettingsKey: Record<string, typeof detailedProcesses> = {};
          detailedProcesses.forEach((proc) => {
            const monthKey = proc.date.substring(0, 7); // "2026-06"
            const key = `proc_time_${proc.estagiarioId}_${monthKey}`;
            if (!processesBySettingsKey[key]) {
              processesBySettingsKey[key] = [];
            }
            processesBySettingsKey[key].push(proc);
          });

          for (const [key, procs] of Object.entries(processesBySettingsKey)) {
            try {
              // Sincronização manual (!isStartupSilent) substitui os dados existentes
              // Sincronização automática (isStartupSilent) só adiciona novos
              if (!isStartupSilent) {
                // Substitui completamente — garante que os dados do sheet sejam refletidos fielmente
                const freshData: Record<string, { origem: string; date: string; timestamp: string }> = {};
                procs.forEach((p) => {
                  if (!freshData[p.numeroProcesso]) {
                    freshData[p.numeroProcesso] = {
                      origem: p.origem,
                      date: p.date,
                      timestamp: new Date().toISOString(),
                    };
                  }
                });
                await setDoc(doc(db, "settings", key), freshData);
              } else {
                // Apenas adiciona entradas novas (não sobrescreve dados históricos)
                const snap = await getDoc(doc(db, "settings", key));
                const existingData: Record<string, { origem: string; date: string; timestamp: string }> = snap.exists() ? snap.data() || {} : {};
                let hasChanges = false;

                procs.forEach((p) => {
                  if (!existingData[p.numeroProcesso]) {
                    existingData[p.numeroProcesso] = {
                      origem: p.origem,
                      date: p.date,
                      timestamp: new Date().toISOString(),
                    };
                    hasChanges = true;
                  }
                });

                if (hasChanges || !snap.exists()) {
                  await setDoc(doc(db, "settings", key), existingData);
                }
              }
            } catch (procErr) {
              console.error(`Erro ao salvar processos para chave ${key}:`, procErr);
            }
          }

          // Atualiza o estado local allDetailedProcesses para refletir os dados novos imediatamente sem refresh
          setAllDetailedProcesses((prev) => {
            const next = { ...prev };
            Object.entries(processesBySettingsKey).forEach(([key, procs]) => {
              const parts = key.split("_");
              if (parts.length >= 3) {
                const estId = parts.slice(2, parts.length - 1).join("_");
                if (!next[estId]) next[estId] = {};

                if (!isStartupSilent) {
                  const newMap: Record<string, { origem: string; date: string }> = {};
                  procs.forEach((p) => {
                    newMap[p.numeroProcesso] = { origem: p.origem, date: p.date };
                  });
                  next[estId] = newMap;
                } else {
                  const existingMap = { ...next[estId] };
                  procs.forEach((p) => {
                    if (!existingMap[p.numeroProcesso]) {
                      existingMap[p.numeroProcesso] = { origem: p.origem, date: p.date };
                    }
                  });
                  next[estId] = existingMap;
                }
              }
            });
            return next;
          });
        }
      // 1. Upsert estagiários (usar lista detalhada se disponível, fallback para lista de nomes)
      let estagiariosToUpsert: Estagiario[] = [];

      if (estagiariosDetailedToCreate && estagiariosDetailedToCreate.length > 0) {
        estagiariosToUpsert = estagiariosDetailedToCreate.filter((e) => e && e.id);
      } else {
        for (const name of estagiariosToCreate) {
          const computedId = name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, "");
          if (!computedId) continue;
          if (!estagiarios.some((a) => a.id === computedId)) {
            estagiariosToUpsert.push({
              id: computedId,
              name,
              role: "graduacao",
              dailyGoal: 25,
              matricula: "",
            });
          }
        }
      }

      // Otimização: Filtrar apenas os estagiários que sofreram alguma modificação cadastral ou novos cadastros
      const finalEstagiariosToUpsert = estagiariosToUpsert.filter((newEstag) => {
        const existing = estagiariosRef.current.find((e) => e.id === newEstag.id);
        if (!existing) return true; // Novo cadastro
        return (
          existing.name !== newEstag.name ||
          existing.role !== newEstag.role ||
          existing.dailyGoal !== newEstag.dailyGoal ||
          existing.matricula !== newEstag.matricula
        );
      });

      if (finalEstagiariosToUpsert.length > 0) {
        await batchUpsertEstagiarios(finalEstagiariosToUpsert);
        // Atualiza estado local
        setEstagiarios((prev) => {
          const next = [...prev];
          finalEstagiariosToUpsert.forEach((e) => {
            const idx = next.findIndex((x) => x.id === e.id);
            if (idx !== -1) {
              next[idx] = { ...next[idx], ...e };
            } else {
              next.push(e);
            }
          });
          return next.filter((e) => e && e.id).sort((a, b) => a.name.localeCompare(b.name));
        });
      }

      // 2. Upsert entradas de produtividade em massa
      const validEntries = entriesToSave.filter((e) => e && e.estagiarioId && e.date);
      
      // Otimização de gravação: Filtrar e reter somente as entradas cujas quantidades mudaram ou novas entradas
      const entriesToUpsert: Omit<ProductivityEntry, "id">[] = [];
      validEntries.forEach((entry) => {
        const existing = entriesRef.current.find(
          (e) => e.estagiarioId === entry.estagiarioId && e.date === entry.date
        );
        if (!existing || existing.count !== entry.count) {
          entriesToUpsert.push(entry);
        }
      });

      if (entriesToUpsert.length > 0) {
        await batchUpsertEntries(entriesToUpsert);

        // Atualiza o estado local 'entries' diretamente com os novos valores que foram salvos
        // Isso previne a race condition de sumir os dados da tela pois não faz getDocs total assíncrono concorrente com o realtime
        setEntries((prev) => {
          const next = [...prev];
          entriesToUpsert.forEach((newEntry) => {
            const idx = next.findIndex(
              (e) => e.estagiarioId === newEntry.estagiarioId && e.date === newEntry.date
            );
            if (idx !== -1) {
              // Mantém o ID original do banco para consistência
              next[idx] = { ...next[idx], count: newEntry.count };
            } else {
              // Adiciona temporariamente sem ID (o Realtime Socket atualizará o ID definitivo do banco logo em seguida)
              next.push({
                id: `temp_${newEntry.estagiarioId}_${newEntry.date}`,
                ...newEntry,
              });
            }
          });
          return next;
        });
      }

      // 4. Salvar configurações da planilha
      const nowIso = new Date().toISOString();
      await setDoc(
        doc(db, "settings", "googleSheet"),
        {
          url: sheetUrl,
          autoSync: autoSyncEnabled,
          selectedSheetName: selectedSheetName.trim(),
          lastSync: nowIso,
        },
        { merge: true },
      );
      setLastSyncTime(nowIso);

      try {
        await setDoc(
          doc(db, "settings", "sync_diagnostics"),
          {
            timestamp: nowIso,
            entriesToSaveCount: entriesToSave.length,
            entriesToSave: entriesToSave.map(e => ({ estagiarioId: e.estagiarioId, date: e.date, count: e.count })),
            estagiariosToCreate,
            detailedProcessesCount: detailedProcesses.length,
          }
        );
      } catch (diagErr) {
        console.error("Failed to write sync diagnostics:", diagErr);
      }

      // O mês selecionado não é mais alterado automaticamente no final da sincronização para respeitar a navegação do usuário e manter o mês atual selecionado.

      if (!isStartupSilent) {
        alert(
          `Carregamento concluído! Sincronizados ${entriesToSave.length} lançamentos de produtividade. ${estagiariosToUpsert.length > 0 ? `${estagiariosToUpsert.length} estagiários sincronizados` : ""}.`,
        );
        setIsSheetsModalOpen(false);
        setPasteDataText("");
        setPreviewEntries([]);
        setPreviewEstagiariosToCreate([]);
        setPreviewEstagiariosDetailed([]);
      }
    } catch (err) {
      console.error("Error writing synced data", err);
      if (!isStartupSilent)
        alert("Erro ao gravar novos dados sincronizados no Supabase.");
    } finally {
      setIsSaving(false);
    }
  };


  useEffect(() => {
    fetchData();

    // Supabase Realtime — atualiza o estado local automaticamente
    const unsubEstag = subscribeToEstagiarios(
      (updated) => {
        setEstagiarios((prev) => {
          const idx = prev.findIndex((e) => e.id === updated.id);
          if (idx !== -1) {
            const next = [...prev];
            next[idx] = updated;
            return next.sort((a, b) => a.name.localeCompare(b.name));
          }
          return [...prev, updated].sort((a, b) => a.name.localeCompare(b.name));
        });
      },
      (deletedId) => {
        setEstagiarios((prev) => prev.filter((e) => e.id !== deletedId));
      }
    );

    const unsubSettings = subscribeToSettings((key, value) => {
      if (key === "semanaProva") {
        setSemanaProvaIds(value?.estagiariosIds || []);
      } else if (key === "googleSheet") {
        setSpreadsheetUrl(value?.url || DEFAULT_SHEET_URL);
        setAutoSyncEnabled(value?.autoSync !== undefined ? value.autoSync : true);
        // Sempre usa "Controle detalhado" para a aba, ignorando valor antigo do banco
        setSelectedSheetName("Controle detalhado");
        setLastSyncTime(value?.lastSync || "");
      }
    });

    return () => {
      unsubEstag();
      unsubSettings();
    };
  }, []);

  // Carregar processos detalhados com horario
  useEffect(() => {
    if (!selectedEstagiarioDetail) {
      setDetailedProcesses({});
      return;
    }

    const fetchDetailedProcesses = async () => {
      setLoadingProcesses(true);
      try {
        const key = `proc_time_${selectedEstagiarioDetail}_${selectedMonth}`;
        const snap = await getDoc(doc(db, "settings", key));
        if (snap.exists()) {
          setDetailedProcesses(snap.data() || {});
        } else {
          setDetailedProcesses({});
        }
      } catch (err) {
        console.error("Erro ao buscar processos detalhados:", err);
      } finally {
        setLoadingProcesses(false);
      }
    };

    fetchDetailedProcesses();
    setDetailTab("month"); // Sempre abre na aba mensal por padrao
  }, [selectedEstagiarioDetail, selectedMonth]);

  // Carregar processos detalhados de todos os estagiários para o mês selecionado (usado no gráfico de rosça)
  useEffect(() => {
    const fetchAllDetailedProcesses = async () => {
      if (estagiarios.length === 0) return;
      const result: Record<string, Record<string, { origem: string; date: string }>> = {};
      const promises = estagiarios.map(async (est) => {
        try {
          const key = `proc_time_${est.id}_${selectedMonth}`;
          const snap = await getDoc(doc(db, "settings", key));
          if (snap.exists()) {
            result[est.id] = snap.data() || {};
          }
        } catch (err) {
          console.error(`Erro ao buscar processos detalhados de ${est.id}:`, err);
        }
      });
      await Promise.all(promises);
      setAllDetailedProcesses(result);
    };
    fetchAllDetailedProcesses();
  }, [estagiarios, selectedMonth]);

  // Sincronização automática dinâmica ao iniciar o aplicativo e contínua:
  useEffect(() => {
    // Sincronização inicial (agora ignora autoSyncEnabled para sempre verificar acesso no boot)
    if (
      spreadsheetUrl &&
      !loading &&
      !isAuthLoading &&
      !hasAutoSyncedOnStartup
    ) {
      setHasAutoSyncedOnStartup(true);
      triggerSheetsSync(spreadsheetUrl, estagiariosRef.current, false);
    }
  }, [
    spreadsheetUrl,
    loading,
    isAuthLoading,
    hasAutoSyncedOnStartup,
  ]);

  // Polling para "tempo real" a cada 60 segundos (diminuído consumo de requisições)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (
      spreadsheetUrl &&
      autoSyncEnabled &&
      estagiarios.length > 0 &&
      hasAutoSyncedOnStartup &&
      !syncingSheets
    ) {
      interval = setInterval(() => {
        triggerSheetsSync(spreadsheetUrl, estagiariosRef.current, false);
      }, 60000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [
    spreadsheetUrl,
    autoSyncEnabled,
    estagiarios,
    hasAutoSyncedOnStartup,
    syncingSheets,
  ]);

  // Real-time notifications for productivity updates
  useEffect(() => {
    if (!estagiarios || estagiarios.length === 0 || normalizedEntries.length === 0)
      return;

    const todayStr = getCurrentDate();
    const currentTodayCounts = estagiarios.reduce(
      (acc, estagiario) => {
        const todayEntry = normalizedEntries.find(
          (e) => e.estagiarioId === estagiario.id && e.date === todayStr,
        );
        acc[estagiario.id] = todayEntry ? todayEntry.count : 0;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Inicialização silenciosa no primeiro boot para evitar notificações retroativas
    if (Object.keys(previousTodayCounts.current).length === 0) {
      previousTodayCounts.current = currentTodayCounts;
      maxNotifiedCounts.current = { ...currentTodayCounts };
      return;
    }

    for (const est of estagiarios) {
      const prev = previousTodayCounts.current[est.id] || 0;
      const curr = currentTodayCounts[est.id] || 0;
      const maxNotified = maxNotifiedCounts.current[est.id] || 0;
      const diff = curr - prev;

      // Só notifica se a contagem subiu e se o novo valor de hoje for maior do que qualquer valor já notificado hoje
      // Isso previne notificações repetitivas/fantasmas decorrentes de flutuações temporárias ou recargas do socket
      if (diff > 0 && curr > maxNotified) {
        maxNotifiedCounts.current[est.id] = curr; // Atualiza a marca histórica de notificação
        
        const newNotif = {
          id: Date.now() + "_" + est.id + "_" + Math.random(),
          estagiarioName: est.name,
          diff,
          count: curr,
        };
        setNotifications((prevArr) => [...prevArr, newNotif]);

        setTimeout(() => {
          setNotifications((prevArr) =>
            prevArr.filter((n) => n.id !== newNotif.id),
          );
        }, 6000);
      }
    }

    previousTodayCounts.current = currentTodayCounts;
  }, [normalizedEntries, estagiarios]);

  // Current formatted time & date
  const formattedTime = useMemo(() => {
    return currentTime.toLocaleTimeString("pt-BR", { hour12: false });
  }, [currentTime]);

  const formattedDate = useMemo(() => {
    return currentTime.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }, [currentTime]);

  // Handle entry saving (create or update)
  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEstagiarioId || !formDate || formCount < 0) return;

    setIsSaving(true);
    try {
      const entryId = formEditingId || `${formEstagiarioId}_${formDate}`;
      const payload: ProductivityEntry = {
        id: entryId,
        estagiarioId: formEstagiarioId,
        date: formDate,
        count: Number(formCount),
      };

      await setDoc(doc(db, "productivityEntries", entryId), payload);

      // Update local state smoothly
      setEntries((prev) => {
        const filtered = prev.filter((item) => item.id !== entryId);
        return [...filtered, payload];
      });

      // Reset form & close modal
      setFormEditingId(null);
      setFormCount(0);
      setIsLaunchModalOpen(false);
    } catch (err) {
      console.error("Error saving entry:", err);
      alert("Erro ao salvar o registro de produtividade.");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle deleting entry
  const handleDeleteEntry = async (entryId: string) => {
    if (
      !window.confirm(
        "Deseja realmente excluir este registro de produtividade sem retorno?",
      )
    )
      return;

    setIsSaving(true);
    try {
      await deleteDoc(doc(db, "productivityEntries", entryId));
      setEntries((prev) => prev.filter((item) => item.id !== entryId));
    } catch (err) {
      console.error("Error deleting entry:", err);
      alert("Erro ao excluir o registro.");
    } finally {
      setIsSaving(false);
    }
  };

  // Add new Estagiario
  const handleAddEstagiario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEstagiarioName.trim()) return;

    const computedId = (
      newEstagiarioId.trim().toLowerCase().replace(/\s+/g, "_") ||
      newEstagiarioName
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
    ).replace(/[^a-z0-9_]/g, "");

    if (!computedId) {
      alert(
        "Não foi possível gerar um identificador ID válido a partir das informações inseridas.",
      );
      return;
    }

    if (estagiarios.some((a) => a.id === computedId)) {
      alert("Um estagiario com este ID ou nome simplificado já existe!");
      return;
    }

    setIsSaving(true);
    try {
      const newEstagiarioObj: Estagiario = {
        id: computedId,
        name: newEstagiarioName.trim(),
        role: newEstagiarioRole,
        dailyGoal: Number(newEstagiarioDailyGoal),
        matricula: newEstagiarioMatricula.trim(),
      };

      await setDoc(doc(db, "estagiarios", computedId), newEstagiarioObj);
      setEstagiarios((prev) =>
        [...prev, newEstagiarioObj].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );

      setNewEstagiarioName("");
      setNewEstagiarioId("");
      setNewEstagiarioRole("graduacao");
      setNewEstagiarioDailyGoal(25);
      setNewEstagiarioMatricula("");
      setIsAddEstagiarioOpen(false);
    } catch (err) {
      console.error("Error adding estagiario:", err);
      alert("Erro ao criar estagiario de pós/graduação.");
    } finally {
      setIsSaving(false);
    }
  };

  // Update existing Estagiario cadastre (name, type, goal)
  const handleUpdateEstagiarioCadastre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEstagiarioDetail || !editEstagiarioName.trim()) return;

    setIsSaving(true);
    try {
      const updatedEstagiarioObj: Estagiario = {
        id: selectedEstagiarioDetail,
        name: editEstagiarioName.trim(),
        role: editEstagiarioRole,
        dailyGoal: Number(editEstagiarioDailyGoal),
        matricula: editEstagiarioMatricula.trim(),
      };

      await setDoc(
        doc(db, "estagiarios", selectedEstagiarioDetail),
        updatedEstagiarioObj,
      );
      setEstagiarios((prev) =>
        prev.map((a) =>
          a.id === selectedEstagiarioDetail ? updatedEstagiarioObj : a,
        ),
      );
      setIsEditingCadastre(false);
    } catch (err) {
      console.error("Error updating estagiario:", err);
      alert("Erro ao atualizar o cadastro.");
    } finally {
      setIsSaving(false);
    }
  };

  // Excluir cadastro de Estagiário
  const handleDeleteEstagiario = async (estagiarioId: string) => {
    const est = estagiarios.find((a) => a.id === estagiarioId);
    if (!est) return;

    if (
      !window.confirm(
        `Tem certeza que deseja excluir o cadastro do estagiário "${est.name}"? Isso removerá o cadastro dele permanentemente no sistema.`
      )
    )
      return;

    setIsSaving(true);
    try {
      // 1. Deletar estagiário do banco
      await deleteDoc(doc(db, "estagiarios", estagiarioId));

      // 2. Deletar todas as entries de produtividade deste estagiário
      const estagiarioEntries = entries.filter((e) => e.estagiarioId === estagiarioId);
      for (const entry of estagiarioEntries) {
        await deleteDoc(doc(db, "productivityEntries", entry.id));
      }

      // 3. Atualizar o estado local
      setEstagiarios((prev) => prev.filter((a) => a.id !== estagiarioId));
      setEntries((prev) => prev.filter((item) => item.estagiarioId !== estagiarioId));

      // Fechar modal de detalhe
      setSelectedEstagiarioDetail(null);
      alert(`Cadastro do estagiário "${est.name}" e seus respectivos históricos foram removidos.`);
    } catch (err) {
      console.error("Error deleting estagiario:", err);
      alert("Erro ao excluir o cadastro do estagiário.");
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Semana de Provas / Meio Período
  const handleToggleSemanaProva = async (estagiarioId: string) => {
    const isCurrentlyActive = semanaProvaIds.includes(estagiarioId);
    let updatedIds: string[];
    if (isCurrentlyActive) {
      updatedIds = semanaProvaIds.filter((id) => id !== estagiarioId);
    } else {
      updatedIds = [...semanaProvaIds, estagiarioId];
    }

    try {
      // Atualiza o estado local para uma resposta imediata na UI
      setSemanaProvaIds(updatedIds);

      // Persiste na tabela settings do Supabase
      await setDoc(doc(db, "settings", "semanaProva"), {
        estagiariosIds: updatedIds,
      });

      const estagiarioName = estagiarios.find((e) => e.id === estagiarioId)?.name || "Estagiário";
      if (!isCurrentlyActive) {
        showToast(
          `"${estagiarioName}" definido em Semana de Provas! Meta ajustada pela metade.`,
          "success"
        );
      } else {
        showToast(
          `Semana de Provas finalizada para "${estagiarioName}"! Meta restaurada ao normal.`,
          "success"
        );
      }
    } catch (err: any) {
      console.error("Erro ao atualizar semana de prova:", err);
      // Reverte o estado local em caso de erro
      setSemanaProvaIds(semanaProvaIds);
      alert("Erro ao salvar alteração da semana de prova.");
    }
  };

  // Função para redistribuir processos de um estagiário para outro
  const handleRedistribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEstagiarioDetail || !redistributeFromId) {
      alert("Por favor, selecione o estagiário de origem.");
      return;
    }
    if (selectedEstagiarioDetail === redistributeFromId) {
      alert("Não é possível redistribuir processos para a mesma pessoa.");
      return;
    }
    if (redistributeCount <= 0) {
      alert("A quantidade de processos a redistribuir deve ser maior que 0.");
      return;
    }

    setIsSaving(true);
    try {
      // 1. Obter registros de produtividade do estagiário de origem
      const { data: fromEntries, error: err1 } = await supabase
        .from("productivity_entries")
        .select("*")
        .eq("estagiario_id", redistributeFromId)
        .eq("date", redistributeDate);

      if (err1) throw err1;

      const fromEntry = fromEntries && fromEntries[0];
      const fromCount = fromEntry ? fromEntry.count : 0;

      if (fromCount < redistributeCount) {
        throw new Error(
          `O estagiário de origem possui apenas ${fromCount} processos registrados em ${redistributeDate.split("-").reverse().join("/")}.`
        );
      }

      // 2. Obter registros de produtividade do estagiário destino (atual)
      const { data: toEntries, error: err2 } = await supabase
        .from("productivity_entries")
        .select("*")
        .eq("estagiario_id", selectedEstagiarioDetail)
        .eq("date", redistributeDate);

      if (err2) throw err2;

      const toEntry = toEntries && toEntries[0];
      const toCount = toEntry ? toEntry.count : 0;

      // 3. Atualizar estagiário origem
      const updatedFromCount = fromCount - redistributeCount;
      if (updatedFromCount === 0 && fromEntry) {
        // Excluir registro se zerou
        const { error: delErr } = await supabase
          .from("productivity_entries")
          .delete()
          .eq("id", fromEntry.id);
        if (delErr) throw delErr;
      } else if (fromEntry) {
        const { error: updErr } = await supabase
          .from("productivity_entries")
          .update({ count: updatedFromCount })
          .eq("id", fromEntry.id);
        if (updErr) throw updErr;
      }

      // 4. Atualizar estagiário destino
      const updatedToCount = toCount + redistributeCount;
      const payloadTo = {
        estagiario_id: selectedEstagiarioDetail,
        date: redistributeDate,
        count: updatedToCount,
      };

      if (toEntry) {
        const { error: updErr } = await supabase
          .from("productivity_entries")
          .update({ count: updatedToCount })
          .eq("id", toEntry.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase
          .from("productivity_entries")
          .insert([payloadTo]);
        if (insErr) throw insErr;
      }

      // 5. Atualizar estado local
      setEntries((prev) => {
        // Remover ou atualizar o registro de origem
        let next = prev.filter((x) => !(x.estagiarioId === redistributeFromId && x.date === redistributeDate));
        if (updatedFromCount > 0) {
          next.push({
            id: fromEntry?.id || `${redistributeFromId}_${redistributeDate}`,
            estagiarioId: redistributeFromId,
            date: redistributeDate,
            count: updatedFromCount,
          });
        }
        
        // Atualizar ou inserir o registro de destino
        next = next.filter((x) => !(x.estagiarioId === selectedEstagiarioDetail && x.date === redistributeDate));
        next.push({
          id: toEntry?.id || `${selectedEstagiarioDetail}_${redistributeDate}`,
          estagiarioId: selectedEstagiarioDetail,
          date: redistributeDate,
          count: updatedToCount,
        });
        return next;
      });

      alert("Processos redistribuídos com sucesso!");
      setIsRedistributeOpen(false);
      setRedistributeCount(0);
      setRedistributeFromId("");
    } catch (err: any) {
      console.error("Erro ao redistribuir processos:", err);
      alert("Erro ao redistribuir processos: " + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  // List of unique months that have at least one productivity entry
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    entries.forEach((e) => {
      if (e.date && e.date.length >= 7) {
        monthsSet.add(e.date.substring(0, 7));
      }
    });
    // Ensure the current active selection is always in the options
    if (selectedMonth) {
      monthsSet.add(selectedMonth);
    } else {
      monthsSet.add("2026-06");
    }
    return Array.from(monthsSet).sort();
  }, [entries, selectedMonth]);

  // Helper date lists for Matrix
  const daysInMonthList = useMemo(() => {
    if (!selectedMonth) return [];
    const [year, month] = selectedMonth.split("-").map(Number);
    const date = new Date(year, month, 0);
    const daysCount = date.getDate();

    const days = [];
    for (let i = 1; i <= daysCount; i++) {
      const dayStr = String(i).padStart(2, "0");
      const monthStr = String(month).padStart(2, "0");
      days.push(`${year}-${monthStr}-${dayStr}`);
    }
    return days;
  }, [selectedMonth]);

  // Map entries for speed lookup
  const entriesMap = useMemo(() => {
    const map: Record<string, number> = {};
    normalizedEntries.forEach((entry) => {
      map[`${entry.estagiarioId}_${entry.date}`] = entry.count;
    });
    return map;
  }, [normalizedEntries]);

  const maxDailyCountInMonth = useMemo(() => {
    let max = 0;
    Object.keys(entriesMap).forEach((key) => {
      if (key.includes(selectedMonth)) {
        if (entriesMap[key] > max) max = entriesMap[key];
      }
    });
    return max;
  }, [entriesMap, selectedMonth]);

  const getHeatmapColor = (count: number | undefined, maxCount: number) => {
    if (!count) return "bg-slate-900/[0.04] text-slate-400 font-normal";
    if (maxCount === 0)
      return "bg-indigo-100 text-indigo-900 shadow-inner border border-indigo-200";

    const intensity = count / maxCount;
    if (intensity >= 0.8)
      return "bg-indigo-600 text-white font-bold border border-indigo-700 shadow-inner";
    if (intensity >= 0.6)
      return "bg-indigo-500 text-white font-bold border border-indigo-600 shadow-inner";
    if (intensity >= 0.4)
      return "bg-indigo-400 text-white font-bold border border-indigo-500 shadow-inner";
    if (intensity >= 0.2)
      return "bg-indigo-300 text-indigo-900 font-bold border border-indigo-400 shadow-inner";
    return "bg-indigo-100 text-indigo-800 font-bold border border-indigo-200 shadow-inner";
  };

  // Compute calculated values per Estagiario
  const parsedEstagiariosData = useMemo(() => {
    const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local time

    return estagiarios.map((estagiario) => {
      // Find entries for this estagiario in the selected month
      const filteredEntries = normalizedEntries.filter(
        (e) =>
          e.estagiarioId === estagiario.id && e.date.startsWith(selectedMonth),
      );

      const totalAnalyzed = filteredEntries.reduce(
        (sum, item) => sum + item.count,
        0,
      );
      const daysWorked = filteredEntries.filter(
        (item) => item.count > 0,
      ).length;
      const averagePerDay =
        daysWorked > 0 ? Number((totalAnalyzed / daysWorked).toFixed(1)) : 0;

      const todayEntry = normalizedEntries.find(
        (e) => e.estagiarioId === estagiario.id && e.date === todayStr,
      );
      const todayAnalyzed = todayEntry ? todayEntry.count : 0;

      const detailEntry = normalizedEntries.find(
        (e) => e.estagiarioId === estagiario.id && e.date === selectedDetailDate,
      );
      const detailAnalyzed = detailEntry ? detailEntry.count : 0;
      const detailTypeBreakdown: Record<string, number> = detailEntry?.typeBreakdown && Object.keys(detailEntry.typeBreakdown).length > 0
        ? detailEntry.typeBreakdown
        : {};

      const role =
        estagiario.role === "pos_graduacao" ? "pos_graduacao" : "graduacao";
      const baseGoal =
        estagiario.dailyGoal ?? (role === "pos_graduacao" ? 30 : 25);
      const isSemanaProva = semanaProvaIds.includes(estagiario.id);
      const dailyGoal = isSemanaProva ? Math.round(baseGoal / 2) : baseGoal;
      const daysMeetingGoal = filteredEntries.filter(
        (item) => item.count >= dailyGoal,
      ).length;
      const goalProgressRatio =
        dailyGoal > 0
          ? Number(((averagePerDay / dailyGoal) * 100).toFixed(1))
          : 0;

      // Determine status badge: can be based on goalProgressRatio!
      // If goalProgress >= 100% -> ALTO
      // If goalProgress >= 70% -> NORMAL
      // Else -> ATENÇÃO
      let status: "ALTO" | "NORMAL" | "ATENÇÃO" = "NORMAL";
      const ratio = dailyGoal > 0 ? (averagePerDay / dailyGoal) * 100 : 0;
      if (ratio >= 100 && totalAnalyzed > 0) status = "ALTO";
      else if (ratio < 70 || totalAnalyzed === 0) status = "ATENÇÃO";

      return {
        ...estagiario,
        role,
        dailyGoal,
        daysMeetingGoal,
        goalProgressRatio:
          dailyGoal > 0
            ? Number(((averagePerDay / dailyGoal) * 100).toFixed(1))
            : 0,
        totalAnalyzed,
        todayAnalyzed,
        detailAnalyzed,
        detailTypeBreakdown,
        daysWorked,
        averagePerDay,
        status,
        entriesList: filteredEntries,
        semanaProva: isSemanaProva,
      };
    });
  }, [estagiarios, normalizedEntries, selectedMonth, selectedDetailDate, semanaProvaIds]);

  // Total de processos do dia selecionado
  const totalDayAnalyzed = useMemo(() => {
    return parsedEstagiariosData.reduce((sum, est) => sum + est.detailAnalyzed, 0);
  }, [parsedEstagiariosData]);

  // Global aggregate metrics
  const globalMetrics = useMemo(() => {
    const filteredEntries = normalizedEntries.filter((e) =>
      e.date.startsWith(selectedMonth),
    );
    const totalAnalyzed = filteredEntries.reduce(
      (sum, item) => sum + item.count,
      0,
    );

    // Previous Month Comparison
    let [y, m] = selectedMonth.split("-");
    let prevM = parseInt(m, 10) - 1;
    let prevY = parseInt(y, 10);
    if (prevM === 0) {
      prevM = 12;
      prevY -= 1;
    }
    const prevMonthStr = `${prevY}-${String(prevM).padStart(2, "0")}`;
    const previousMonthEntries = normalizedEntries.filter((e) =>
      e.date.startsWith(prevMonthStr),
    );
    const previousMonthTotalAnalyzed = previousMonthEntries.reduce(
      (sum, item) => sum + item.count,
      0,
    );

    let monthGrowth = 0;
    if (previousMonthTotalAnalyzed > 0) {
      monthGrowth =
        ((totalAnalyzed - previousMonthTotalAnalyzed) /
          previousMonthTotalAnalyzed) *
        100;
    } else if (totalAnalyzed > 0) {
      monthGrowth = 100;
    }

    // Count active estagiarios (who analyzed > 0 cases this month)
    const activeEstagiarios = parsedEstagiariosData.filter(
      (a) => a.totalAnalyzed > 0,
    );
    const activeCount = activeEstagiarios.length;

    // Total registered estagiarios
    const totalEstagiarios = estagiarios.length;

    // Average processes analyzed per active estagiario
    const averagePerEstagiario =
      activeCount > 0 ? Number((totalAnalyzed / activeCount).toFixed(1)) : 0;

    // Team Daily Goal (Sum of all active interns' daily goals)
    const teamDailyGoal = activeEstagiarios.reduce(
      (sum, item) => sum + (item.dailyGoal || 0),
      0,
    );

    return {
      totalAnalyzed,
      previousMonthTotalAnalyzed,
      monthGrowth,
      activeCount,
      totalEstagiarios,
      averagePerEstagiario,
      teamDailyGoal,
    };
  }, [normalizedEntries, selectedMonth, parsedEstagiariosData, estagiarios]);

  // Listed Estagiarios, filtered by query
  const filteredEstagiariosData = useMemo(() => {
    let result = parsedEstagiariosData;
    if (filterQuery.trim()) {
      const queryLower = filterQuery.toLowerCase();
      result = result.filter((item) =>
        item.name.toLowerCase().includes(queryLower),
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      const dir = teamSortConfig.dir === "asc" ? 1 : -1;
      let valA: any = a[teamSortConfig.key as keyof typeof a];
      let valB: any = b[teamSortConfig.key as keyof typeof b];

      if (valA === undefined) valA = 0;
      if (valB === undefined) valB = 0;

      if (teamSortConfig.key === "status") {
        const score = {
          "Bateu a Meta": 3,
          Atenção: 2,
          "Abaixo da Meta": 1,
          Inativo: 0,
        };
        valA = score[a.status as keyof typeof score] ?? 0;
        valB = score[b.status as keyof typeof score] ?? 0;
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return valA.localeCompare(valB) * dir;
      }
      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });

    return result;
  }, [parsedEstagiariosData, filterQuery, teamSortConfig]);

  const handleTeamSort = (key: string) => {
    setTeamSortConfig((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: key === "name" ? "asc" : "desc" };
    });
  };

  // Statistics for progress bars (resources split projection based on totals)
  const categorySplit = useMemo(() => {
    const total = globalMetrics.totalAnalyzed || 1;
    return [
      { name: "RECURSOS CÍVEIS", pct: 68, color: "bg-blue-600" },
      { name: "AGRAVOS", pct: 40, color: "bg-amber-500" },
      { name: "HABEAS CORPUS", pct: 92, color: "bg-emerald-500" },
    ];
  }, [globalMetrics.totalAnalyzed]);

  // Daily Trends for the active month (Recharts)
  const dailyTrendsData = useMemo(() => {
    const map = new Map<string, number>();

    // Find how many days in selected month
    const [y, m] = selectedMonth.split("-");
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let i = 1; i <= daysInMonth; i++) {
      const dStr = `${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      map.set(dStr, 0);
    }

    const filteredEntries = normalizedEntries.filter((e) =>
      e.date.startsWith(selectedMonth),
    );
    for (const e of filteredEntries) {
      if (map.has(e.date)) {
        map.set(e.date, (map.get(e.date) || 0) + e.count);
      }
    }

    return Array.from(map.entries()).map(([date, count]) => {
      const day = parseInt(date.split("-")[2], 10);
      return {
        dia: String(day).padStart(2, "0"),
        total: count,
      };
    });
  }, [normalizedEntries, selectedMonth]);

  // Monthly Ranking List (Sorted descending by total productivity in the selected month)
  const monthlyRankingList = useMemo(() => {
    return parsedEstagiariosData
      .filter((e) => e.totalAnalyzed > 0)
      .sort((a, b) => b.totalAnalyzed - a.totalAnalyzed)
      .map((est, index) => ({
        id: est.id,
        name: est.name,
        count: est.totalAnalyzed,
        rank: index + 1,
      }));
  }, [parsedEstagiariosData]);

  // Distribution by Process Type — carrega dos processos detalhados salvos nas settings
  const distributionChartData = useMemo(() => {
    // Tipos de processo e suas cores premium
    const PROCESS_TYPES: Record<string, { label: string; fill: string }> = {
      CV:  { label: "CV",  fill: "#2563eb" }, // blue-600 (cível)
      RCV: { label: "RCV", fill: "#3b82f6" }, // blue-500
      DCV: { label: "DCV", fill: "#60a5fa" }, // blue-400
      CR:  { label: "CR",  fill: "#7c3aed" }, // violet-600 (crime)
      RCR: { label: "RCR", fill: "#8b5cf6" }, // violet-500
      DCR: { label: "DCR", fill: "#a78bfa" }, // violet-400
    };

    const counts: Record<string, number> = {};
    Object.keys(PROCESS_TYPES).forEach(t => { counts[t] = 0; });

    // Agrega de allDetailedProcesses para o mês selecionado
    Object.values(allDetailedProcesses).forEach(procMap => {
      Object.values(procMap).forEach((proc: any) => {
        if (proc.date && proc.date.startsWith(selectedMonth) && proc.origem) {
          const tipo = (proc.origem as string).toUpperCase();
          if (counts[tipo] !== undefined) counts[tipo] += 1;
        }
      });
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    // Se não há processos detalhados, fallback para distribuição por categoria
    if (total === 0) {
      const sumByRole: Record<string, number> = { pos_graduacao: 0, graduacao: 0 };
      parsedEstagiariosData.forEach((e) => {
        if (sumByRole[e.role] !== undefined) sumByRole[e.role] += e.totalAnalyzed || 0;
      });
      return [
        { name: "Pós-Graduação", value: sumByRole.pos_graduacao || 0, fill: "#4f46e5" },
        { name: "Graduação",     value: sumByRole.graduacao || 0,     fill: "#0ea5e9" },
      ].filter((x) => x.value > 0);
    }

    return Object.entries(PROCESS_TYPES)
      .map(([key, meta]) => ({ name: meta.label, value: counts[key] || 0, fill: meta.fill }))
      .filter((x) => x.value > 0);
  }, [parsedEstagiariosData, allDetailedProcesses, selectedMonth]);

  // List of all active month entries sorted chronologically (newest first)
  const chronologicalEntries = useMemo(() => {
    const list = normalizedEntries.filter((e) => e.date.startsWith(selectedMonth));
    list.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      const nameA =
        estagiarios.find((as) => as.id === a.estagiarioId)?.name || "";
      const nameB =
        estagiarios.find((as) => as.id === b.estagiarioId)?.name || "";
      return nameA.localeCompare(nameB);
    });
    return list;
  }, [normalizedEntries, selectedMonth, estagiarios]);

  // Search-filtered list of chronological entries
  const filteredChronologicalEntries = useMemo(() => {
    if (!filterQuery.trim()) return chronologicalEntries;
    const queryLower = filterQuery.toLowerCase();
    return chronologicalEntries.filter((entry) => {
      const estagiarioName =
        estagiarios.find((as) => as.id === entry.estagiarioId)?.name || "";
      return (
        estagiarioName.toLowerCase().includes(queryLower) ||
        entry.date.includes(queryLower)
      );
    });
  }, [chronologicalEntries, filterQuery, estagiarios]);

  useEffect(() => {
    setHistoryPage(1);
  }, [selectedMonth, filterQuery]);

  const paginatedEntries = useMemo(() => {
    const start = (historyPage - 1) * itemsPerPage;
    return filteredChronologicalEntries.slice(start, start + itemsPerPage);
  }, [filteredChronologicalEntries, historyPage]);
  const totalHistoryPages =
    Math.ceil(filteredChronologicalEntries.length / itemsPerPage) || 1;

  // Trigger quick edit from Planilha/Matrix cells
  const handleCellClick = (estagiarioId: string, date: string) => {
    const lookupKey = `${estagiarioId}_${date}`;
    const count = entriesMap[lookupKey] ?? 0;

    setFormEstagiarioId(estagiarioId);
    setFormDate(date);
    setFormCount(count);
    setFormEditingId(lookupKey);
    setIsLaunchModalOpen(true);
  };

  // Reset/Empty cell completely
  const handleCellClear = async (estagiarioId: string, date: string) => {
    const lookupKey = `${estagiarioId}_${date}`;
    if (entriesMap[lookupKey] === undefined) return;

    try {
      await deleteDoc(doc(db, "productivityEntries", lookupKey));
      setEntries((prev) => prev.filter((item) => item.id !== lookupKey));
    } catch (err) {
      console.error(err);
    }
  };

  const renderSortIcon = (key: string) => {
    if (teamSortConfig.key !== key)
      return (
        <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
      );
    return teamSortConfig.dir === "asc" ? (
      <ChevronUp className="w-3 h-3 text-indigo-500" />
    ) : (
      <ChevronDown className="w-3 h-3 text-indigo-500" />
    );
  };

  if (isAuthLoading) {
    return (
      <div className="flex h-screen bg-slate-50 text-slate-900 items-center justify-center font-sans">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4"></div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">
            Verificando Autenticação...
          </p>
        </div>
      </div>
    );
  }

  // 1. Tela de Login Premium
  if (!googleUser) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white items-center justify-center font-sans relative p-4 overflow-hidden">
        {/* Decorative Blurred Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none animate-pulse duration-[6000ms]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-sky-600/10 blur-[120px] pointer-events-none animate-pulse duration-[8000ms]"></div>

        <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8 sm:p-10 shadow-2xl flex flex-col items-center relative z-10 text-center">
          <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-sky-400 rounded-2xl flex items-center justify-center font-black text-3xl tracking-tight shadow-lg shadow-indigo-500/20 mb-8 border border-white/10">
            V
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            Desempenho <span className="bg-gradient-to-r from-indigo-400 to-sky-400 bg-clip-text text-transparent">AR</span>
          </h2>
          <p className="text-xs font-semibold tracking-widest text-indigo-300 uppercase mb-8">
            1ª Vice-Presidência TJPR
          </p>

          <p className="text-sm text-slate-400 mb-8 leading-relaxed">
            Painel de controle e produtividade de estagiários de graduação e pós-graduação da Assessoria de Recursos.
          </p>

          <button
            onClick={handleGoogleLogin}
            disabled={isLoggingInGoogle}
            className="w-full py-3.5 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-bold text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-3 cursor-pointer shadow-lg active:scale-[0.98] border border-white/10"
          >
            {isLoggingInGoogle ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
            ) : (
              <svg
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 48 48"
                className="w-5 h-5 block"
              >
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                ></path>
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                ></path>
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                ></path>
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                ></path>
              </svg>
            )}
            <span>{isLoggingInGoogle ? "CONECTANDO..." : "ENTRAR COM O GOOGLE"}</span>
          </button>

          <div className="mt-10 pt-6 border-t border-white/5 w-full">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-relaxed">
              Sistema Restrito • Atualizado em Tempo Real
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Tela de Verificação de Acesso (Carregamento da permissão da Planilha)
  if (spreadsheetUrl && hasSpreadsheetAccess === null) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white items-center justify-center font-sans relative p-4 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-sky-600/10 blur-[120px] pointer-events-none"></div>

        <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-8 sm:p-10 shadow-2xl flex flex-col items-center relative z-10 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-400 mb-6"></div>
          <h3 className="text-lg font-bold tracking-tight mb-2">Verificando Permissão de Acesso</h3>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-6">
            Aguarde enquanto verificamos se a conta <span className="text-indigo-300 font-bold">{googleUser.email}</span> possui acesso à planilha vinculada do Google Sheets...
          </p>
          <button
            onClick={handleGoogleLogout}
            className="px-4 py-2 border border-white/10 text-white/60 hover:text-white rounded-lg text-xs font-bold hover:bg-white/5 transition-all cursor-pointer"
          >
            Cancelar e Sair
          </button>
        </div>
      </div>
    );
  }



  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans selection:bg-slate-900 selection:text-white overflow-hidden">
      {/* Sidebar - Dashboard Style */}
      <aside className="w-16 sm:w-20 bg-slate-950 text-slate-400 flex flex-col items-center py-6 border-r border-slate-800 z-20 shrink-0">
        <div className="w-10 h-10 bg-indigo-500 text-white rounded-xl flex items-center justify-center font-black text-xl tracking-tight shadow-md mb-8">
          V
        </div>

        <nav className="flex flex-col gap-4 flex-1 w-full items-center">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-indigo-500/20 text-indigo-400"
                : "hover:text-slate-200 hover:bg-slate-800"
            }`}
            title="Dashboard"
          >
            <BarChart2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab("desempenho")}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              activeTab === "desempenho"
                ? "bg-amber-500/20 text-amber-400"
                : "hover:text-slate-200 hover:bg-slate-800"
            }`}
            title="Desempenho da Equipe"
          >
            <Award className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab("diario")}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              activeTab === "diario"
                ? "bg-sky-500/20 text-sky-400"
                : "hover:text-slate-200 hover:bg-slate-800"
            }`}
            title="Diário de Lançamentos"
          >
            <Clock className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab("matrix")}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              activeTab === "matrix"
                ? "bg-indigo-500/20 text-indigo-400"
                : "hover:text-slate-200 hover:bg-slate-800"
            }`}
            title="Matriz de Dados"
          >
            <Grid className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsAddEstagiarioOpen(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:text-slate-200 hover:bg-slate-800 transition-all cursor-pointer"
            title="Adicionar Estagiário"
          >
            <UserPlus className="w-5 h-5" />
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-4 items-center">
          <button
            onClick={() => setIsSheetsModalOpen(true)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              spreadsheetUrl
                ? "bg-emerald-500/20 text-emerald-400"
                : "hover:text-slate-200 hover:bg-slate-800"
            }`}
            title="Integração Google Sheets"
          >
            <FileText className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 z-10 sticky top-0">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight uppercase leading-none text-slate-900">
                1ª Vice-Presidência
              </h1>
              <p className="text-xs text-slate-500 font-semibold tracking-wider uppercase mt-1">
                Assessoria de Recursos • Produtividade
              </p>
            </div>
          </div>

          {/* Header Right Actions */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Dynamic Clock Section */}
            <div className="bg-slate-100/80 px-4 py-2 rounded-lg text-right hidden md:block border border-slate-200">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                {formattedDate}
              </p>
              <p className="text-sm font-black text-slate-800 tracking-wider font-mono">
                {formattedTime}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {googleUser ? (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5 pl-2">
                  {googleUser.photoURL ? (
                    <img
                      src={googleUser.photoURL}
                      alt={googleUser.displayName || "Google User"}
                      referrerPolicy="no-referrer"
                      className="w-5 h-5 rounded-full border border-slate-300"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-[9px]">
                      {googleUser.displayName?.charAt(0) || "U"}
                    </div>
                  )}
                  <div className="hidden sm:block text-left max-w-[120px]">
                    <p className="text-[10px] font-bold text-slate-850 truncate leading-none">
                      {googleUser.displayName}
                    </p>
                    <p className="text-[8px] text-emerald-600 font-bold leading-none uppercase tracking-wider mt-0.5">
                      Conta Ativa
                    </p>
                  </div>
                  <button
                    onClick={handleGoogleLogout}
                    className="px-2 py-0.5 bg-slate-150 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded text-[9px] font-bold transition-all cursor-pointer border border-slate-200"
                  >
                    Sair
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoggingInGoogle}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-[0.98]"
                >
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    style={{ display: "block", width: "14px", height: "14px" }}
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    ></path>
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    ></path>
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    ></path>
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    ></path>
                  </svg>
                  <span>
                    {isLoggingInGoogle ? "Conectando..." : "Entrar com Google"}
                  </span>
                </button>
              )}

              {googleUser && (
                <button
                  id="btn-novo-lancamento"
                  onClick={() => {
                    setFormEditingId(null);
                    setFormEstagiarioId(estagiarios[0]?.id || "");
                    setFormDate(new Date().toISOString().split("T")[0]);
                    setFormCount(0);
                    setIsLaunchModalOpen(true);
                  }}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">NOVO LANÇAMENTO</span>
                  <span className="sm:hidden">NOVO</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Arena */}
          <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 w-full mx-auto flex flex-col gap-6">
            {/* Banner de Sincronização Pausada / Erro de Planilha */}
            {spreadsheetUrl && hasSpreadsheetAccess === false && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-900 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm animate-fade-in shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">Sincronização com Planilha Pausada</h4>
                    <p className="text-xs text-slate-600 mt-0.5 leading-normal">
                      A conta <span className="font-bold text-amber-950">{googleUser?.email}</span> não pôde sincronizar com o Sheets. Verifique o link ou faça login novamente.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => triggerSheetsSync(spreadsheetUrl, estagiarios, true)}
                    disabled={syncingSheets}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-750 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-55"
                  >
                    {syncingSheets ? `Sincronizando (${syncDuration.toFixed(1)}s)...` : "Tentar Novamente"}
                  </button>
                  <button
                    onClick={handleGoogleLogin}
                    disabled={isLoggingInGoogle}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-900 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    Reconectar Google
                  </button>
                </div>
              </div>
            )}

            {/* Controls Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex bg-slate-100 p-1 rounded-lg gap-0.5">
                  <button
                    onClick={() => setActiveTab("dashboard")}
                    className={`px-3 py-2 rounded-md text-xs font-bold tracking-wide transition-all flex items-center gap-1.5 ${
                      activeTab === "dashboard"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    DASHBOARD
                  </button>
                  <button
                    onClick={() => setActiveTab("desempenho")}
                    className={`px-3 py-2 rounded-md text-xs font-bold tracking-wide transition-all flex items-center gap-1.5 ${
                      activeTab === "desempenho"
                        ? "bg-white text-amber-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <Award className="w-3.5 h-3.5" />
                    DESEMPENHO
                  </button>
                  <button
                    onClick={() => setActiveTab("diario")}
                    className={`px-3 py-2 rounded-md text-xs font-bold tracking-wide transition-all flex items-center gap-1.5 ${
                      activeTab === "diario"
                        ? "bg-white text-sky-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    DIÁRIO
                  </button>
                  <button
                    onClick={() => setActiveTab("matrix")}
                    className={`px-3 py-2 rounded-md text-xs font-bold tracking-wide transition-all flex items-center gap-1.5 ${
                      activeTab === "matrix"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" />
                    MATRIZ
                  </button>
                </div>

                <div className="h-6 w-[1px] bg-slate-200"></div>

                {/* Selected Month selector */}
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <input
                    type="month"
                    id="select-month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-transparent border-0 text-sm font-bold text-slate-800 focus:ring-0 cursor-pointer outline-none"
                  />
                </div>

                {/* Quick Available Months Navigation */}
                {availableMonths.length > 1 && (
                  <div className="hidden lg:flex items-center gap-1.5 ml-1 pl-3 border-l border-slate-200">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 mr-0.5">
                      Meses com Dados:
                    </span>
                    {availableMonths.map((m) => {
                      const [y, mm] = m.split("-");
                      const monthNames: Record<string, string> = {
                        "01": "Jan",
                        "02": "Fev",
                        "03": "Mar",
                        "04": "Abr",
                        "05": "Mai",
                        "06": "Jun",
                        "07": "Jul",
                        "08": "Ago",
                        "09": "Set",
                        "10": "Out",
                        "11": "Nov",
                        "12": "Dez",
                      };
                      const label = `${monthNames[mm] || mm}/${y.substring(2)}`;
                      const isActive = selectedMonth === m;
                      return (
                        <button
                          key={m}
                          onClick={() => setSelectedMonth(m)}
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-all cursor-pointer ${
                            isActive
                              ? "bg-slate-900 text-white shadow-sm"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-850"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Search */}
              <div className="relative max-w-xs w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por estagiário..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-lg text-xs outline-none transition-all"
                />
              </div>
            </div>

            {/* Key Metrics row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:border-slate-300 transition-all">
                <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-1">
                  Total Analisado
                </p>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl font-light text-slate-800">
                    {globalMetrics.totalAnalyzed.toLocaleString("pt-BR")}
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      globalMetrics.monthGrowth > 0
                        ? "bg-emerald-50 text-emerald-700"
                        : globalMetrics.monthGrowth < 0
                          ? "bg-red-50 text-red-700"
                          : "bg-slate-50 text-slate-700"
                    }`}
                  >
                    {globalMetrics.monthGrowth > 0 ? "+" : ""}
                    {globalMetrics.monthGrowth.toFixed(1)}% m/m
                  </span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:border-slate-300 transition-all">
                <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-1">
                  Estagiários Ativos
                </p>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl font-light text-slate-800">
                    {globalMetrics.activeCount}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    de {globalMetrics.totalEstagiarios} cadastrados
                  </span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:border-slate-300 transition-all">
                <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-1">
                  Média p/ Estagiário Ativo
                </p>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl font-light text-slate-800">
                    {globalMetrics.averagePerEstagiario.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    processos / mês
                  </span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:border-slate-300 transition-all">
                <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-1">
                  Meta Diária (Equipe)
                </p>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl font-light text-slate-800">
                    {globalMetrics.teamDailyGoal}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    processos / dia
                  </span>
                </div>
              </div>
            </div>

            {/* Dashboard Layout vs Matrix Layout Grid */}
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200 rounded-xl shadow-sm"
                >
                  <div className="w-10 h-10 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm font-semibold text-slate-500 mt-4">
                    Carregando dados dos estagiários...
                  </p>
                </motion.div>
              ) : activeTab === "dashboard" ? (
                <motion.div
                  key="dashboard-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col gap-6"
                >
                  {/* Charts Row */}
                  <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1.6fr_0.8fr] gap-6">
                    {/* Daily Productivity Bar/Line Chart */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col justify-between">
                      <h2 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2 mb-4">
                        <TrendingUp className="w-4 h-4 text-indigo-500" />
                        PRODUTIVIDADE DIÁRIA (
                        {selectedMonth.split("-").reverse().join("/")})
                      </h2>
                      <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={dailyTrendsData}
                            style={{ cursor: "pointer" }}
                            onClick={(state) => {
                              if (state && state.activeTooltipIndex !== undefined && dailyTrendsData[state.activeTooltipIndex]) {
                                const clickedData = dailyTrendsData[state.activeTooltipIndex];
                                const formattedClickedDate = `${selectedMonth}-${clickedData.dia}`;
                                setSelectedDetailDate(formattedClickedDate);
                              }
                            }}
                            margin={{
                              top: 10,
                              right: 10,
                              left: -20,
                              bottom: 0,
                            }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="#e2e8f0"
                            />
                            <XAxis
                              dataKey="dia"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 10, fill: "#64748b" }}
                              dy={10}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 10, fill: "#64748b" }}
                            />
                            <Tooltip
                              cursor={{ fill: "#f1f5f9" }}
                              contentStyle={{
                                borderRadius: "8px",
                                border: "none",
                                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                              }}
                              labelStyle={{
                                fontWeight: "bold",
                                color: "#0f172a",
                              }}
                            />
                            <Bar
                              dataKey="total"
                              fill="#818cf8"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={40}
                            />
                            <Line
                              type="monotone"
                              dataKey="total"
                              stroke="#4338ca"
                              strokeWidth={2}
                              dot={{ r: 3, fill: "#4338ca", strokeWidth: 0 }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Distribution Pie Chart */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col justify-between">
                      <h2 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2 mb-4">
                        <Grid className="w-4 h-4 text-emerald-500" />
                        DISTRIBUIÇÃO POR CATEGORIA
                      </h2>
                      <div className="h-[200px] w-full flex-1 flex items-center justify-center relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={distributionChartData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                              stroke="none"
                            >
                              {distributionChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                borderRadius: "8px",
                                border: "none",
                                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                              }}
                              itemStyle={{
                                fontWeight: "bold",
                                color: "#0f172a",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        {/* Centered Total */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-2xl font-light text-slate-800">
                            {globalMetrics.totalAnalyzed}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">
                            Processos
                          </span>
                        </div>
                      </div>
                      {/* Legend below */}
                      <div className="flex flex-wrap gap-3 justify-center mt-2">
                        {distributionChartData.map((entry, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-1.5"
                          >
                            <div
                              className="w-3 h-3 rounded-sm"
                              style={{ backgroundColor: entry.fill }}
                            ></div>
                            <span className="text-[10px] font-semibold text-slate-600">
                              {entry.name} ({entry.value})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Monthly Ranking List */}
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col justify-start h-[348px] gap-2">
                      <h2 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Award className="w-4 h-4 text-indigo-500" />
                        RANKING DO MÊS
                      </h2>
                      <div className="overflow-y-auto pr-1 space-y-0.5 max-h-[285px]">
                        {monthlyRankingList.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-10 font-medium">Nenhum dado registrado este mês.</p>
                        ) : (
                          monthlyRankingList.map((est, rankIdx) => (
                            <div key={est.id} className="flex items-center gap-3 text-xs py-0.5 border-b border-slate-50 last:border-0">
                              <div className="flex items-center gap-2 w-36 shrink-0">
                                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black ${
                                  rankIdx === 0 ? "bg-amber-150 text-amber-800 border border-amber-250" :
                                  rankIdx === 1 ? "bg-slate-150 text-slate-800 border border-slate-250" :
                                  rankIdx === 2 ? "bg-orange-150 text-orange-850 border border-orange-250" :
                                  "bg-slate-50 text-slate-500 border border-slate-250"
                                }`}>
                                  {est.rank}
                                </span>
                                <span className="font-semibold text-slate-700 truncate">{est.name}</span>
                              </div>
                              <span className="font-mono font-bold text-slate-900">{est.count} proc.</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Detalhe do Dia Selecionado List */}
                  <div className="bg-white border text-center border-indigo-200 rounded-xl shadow-sm overflow-hidden mb-0">
                    <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <h2 className="text-sm font-bold tracking-tight text-indigo-900 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-emerald-500 animate-pulse" />
                        {selectedDetailDate === getCurrentDate() ? (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                            <span>FEITO HOJE — TEMPO REAL</span>
                            {syncingSheets ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></span>
                                Sincronizando ({syncDuration.toFixed(1)}s)...
                              </span>
                            ) : lastSyncTime ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shadow-sm">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                Sincronizado: {formatLastSyncTime(lastSyncTime)} {lastSyncDuration !== null ? `(${lastSyncDuration.toFixed(1)}s)` : ""}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span>PRODUTIVIDADE EM {selectedDetailDate.split("-").reverse().join("/")}</span>
                        )}
                      </h2>
                      <div className="flex items-center gap-2">
                        {/* Indicador de Total Geral Acumulado no Dia */}
                        <div className="flex items-center gap-1.5 bg-indigo-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-extrabold shadow-sm select-none">
                          <span>TOTAL DO DIA:</span>
                          <span className="bg-white text-indigo-700 px-2 py-0.5 rounded font-black text-xs">
                            {totalDayAnalyzed.toLocaleString("pt-BR")}
                          </span>
                        </div>

                        {selectedDetailDate !== getCurrentDate() && (
                          <button
                            onClick={() => setSelectedDetailDate(getCurrentDate())}
                            className="text-[10px] bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold px-2 py-1 rounded-md transition-all cursor-pointer shadow-sm border border-indigo-200"
                          >
                            Voltar para Hoje
                          </button>
                        )}
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-1 rounded-full uppercase tracking-wider select-none">
                          Visualização por Dia
                        </span>
                      </div>
                    </div>
                    <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {/* Card Especial de Destaque com o Total da Equipe */}
                      <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 border border-indigo-600 rounded-lg p-3 flex flex-col items-center justify-center relative overflow-hidden shadow-sm select-none">
                        <div className="absolute top-0 right-0 w-12 h-12 bg-white/10 rounded-full blur-xl -mr-3 -mt-3"></div>
                        <span className="text-xs font-extrabold text-white text-center uppercase tracking-wider w-full">
                          TOTAL EQUIPE
                        </span>
                        <span className="text-2xl font-black text-white mt-1">
                          {totalDayAnalyzed.toLocaleString("pt-BR")}
                        </span>
                        <span className="text-[9px] text-indigo-100 font-bold mt-1 w-full text-center truncate">
                          PROCESSOS CONCLUÍDOS
                        </span>
                        {/* Team-wide process type breakdown - prioriza typeBreakdown das entries, fallback em allDetailedProcesses */}
                        {(() => {
                          const teamBreakdown: Record<string, number> = {};

                          // Prioridade 1: somar typeBreakdown das entries de cada estagiário
                          parsedEstagiariosData.forEach((est) => {
                            if (est.detailTypeBreakdown && Object.keys(est.detailTypeBreakdown).length > 0) {
                              Object.entries(est.detailTypeBreakdown).forEach(([tipo, qtd]) => {
                                teamBreakdown[tipo] = (teamBreakdown[tipo] || 0) + Number(qtd);
                              });
                            } else {
                              // Fallback: allDetailedProcesses para dados antigos
                              const procs = allDetailedProcesses[est.id];
                              if (procs) {
                                Object.values(procs).filter((p: any) => p.date === selectedDetailDate).forEach((p: any) => {
                                  const o = p.origem || 'CV';
                                  teamBreakdown[o] = (teamBreakdown[o] || 0) + 1;
                                });
                              }
                            }
                          });

                          const order = ['CV','RCV','DCV','CR','RCR','DCR'];
                          const sorted = Object.entries(teamBreakdown).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
                          if (sorted.length === 0) return null;
                          return (
                            <div className="flex flex-wrap gap-1 justify-center mt-2 w-full border-t border-white/15 pt-2">
                              {sorted.map(([tipo, count]) => (
                                <span
                                  key={tipo}
                                  className="text-[8px] font-black px-1.5 py-0.5 rounded bg-white/15 text-white"
                                >
                                  {tipo}:{count}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>

                      {parsedEstagiariosData
                        .slice()
                        .sort((a, b) => b.detailAnalyzed - a.detailAnalyzed)
                        .map((est) => {
                          return (
                            <div
                              key={est.id}
                              onClick={() => {
                                setSelectedEstagiarioDetail(est.id);
                                setRedistributeDate(selectedDetailDate);
                              }}
                              className="bg-white border border-slate-200 hover:border-indigo-400 transition-all rounded-xl flex flex-col relative overflow-hidden shadow-sm hover:shadow-md cursor-pointer group"
                            >
                              {/* Faixa de cor no topo */}
                              {est.detailAnalyzed >= est.dailyGoal ? (
                                <div className="h-1.5 w-full bg-emerald-500"></div>
                              ) : est.detailAnalyzed >= est.dailyGoal * 0.8 ? (
                                <div className="h-1.5 w-full bg-amber-400"></div>
                              ) : est.detailAnalyzed > 0 ? (
                                <div className="h-1.5 w-full" style={{background: '#8B1A1A'}}></div>
                              ) : (
                                <div className="h-1.5 w-full bg-slate-100"></div>
                              )}

                              {/* Botão de Atalho Semana de Prova */}
                              <button
                                title={est.semanaProva ? "Finalizar Semana de Provas" : "Definir Semana de Provas (Meio Período)"}
                                onClick={(e) => {
                                  e.stopPropagation(); // Evita abrir o modal
                                  handleToggleSemanaProva(est.id);
                                }}
                                className={`absolute top-2 right-2 p-1 rounded-md border transition-all ${
                                  est.semanaProva
                                    ? "bg-violet-100 hover:bg-violet-200 border-violet-300 text-violet-700 opacity-100"
                                    : "bg-slate-50 hover:bg-indigo-50 border-slate-200 text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100"
                                } shadow-sm z-10`}
                              >
                                <GraduationCap className="w-3 h-3" />
                              </button>

                              <div className="p-3 flex flex-col flex-1">
                                {/* Nome */}
                                <span
                                  className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider truncate w-full text-center group-hover:text-indigo-600 transition-colors pr-6"
                                  title={est.name}
                                >
                                  {est.name}
                                </span>

                                {est.semanaProva && (
                                  <span className="inline-flex items-center gap-0.5 text-[8px] font-black text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full mt-1.5 self-center select-none shadow-xs">
                                    📝 Prova (Meio Período)
                                  </span>
                                )}

                                {/* Total em destaque */}
                                <div className="flex items-baseline justify-center gap-1 mt-1.5">
                                  <span className={`text-3xl font-black leading-none ${est.detailAnalyzed > 0 ? "text-slate-800" : "text-slate-200"}`}>
                                    {est.detailAnalyzed}
                                  </span>
                                  {est.detailAnalyzed > 0 && (
                                    <span className="text-[9px] text-slate-400 font-semibold leading-none mb-0.5">
                                      /{est.dailyGoal}
                                    </span>
                                  )}
                                </div>

                                {/* Sem produção */}
                                {est.detailAnalyzed === 0 && (
                                  <span className="text-[9px] text-slate-300 text-center mt-1 font-mono">sem lançamentos</span>
                                )}

                                {/* Meta */}
                                {est.detailAnalyzed > 0 && (
                                  <span className="text-[9px] text-slate-300 font-mono text-center mt-2">
                                    META: {est.dailyGoal}
                                  </span>
                                )}

                                {/* Process type breakdown for this day - usando typeBreakdown da entry (ou allDetailedProcesses como fallback) */}
                                {(() => {
                                  // Prioridade 1: breakdown direto da entry (fonte única e consistente)
                                  let breakdown: Record<string, number> = est.detailTypeBreakdown ?? {};

                                  // Fallback: usar allDetailedProcesses para dados antigos sem typeBreakdown
                                  if (Object.keys(breakdown).length === 0) {
                                    const procs = allDetailedProcesses[est.id];
                                    if (procs) {
                                      const dayProcs = Object.values(procs).filter((p: any) => p.date === selectedDetailDate);
                                      dayProcs.forEach((p: any) => {
                                        const o = p.origem || 'CV';
                                        breakdown[o] = (breakdown[o] || 0) + 1;
                                      });
                                    }
                                  }

                                  if (Object.keys(breakdown).length === 0) return null;
                                  const ORIGEM_COLORS: Record<string, string> = {
                                    CV: '#2563eb', RCV: '#3b82f6', DCV: '#60a5fa',
                                    CR: '#7c3aed', RCR: '#8b5cf6', DCR: '#a78bfa',
                                  };
                                  const order = ['CV','RCV','DCV','CR','RCR','DCR'];
                                  const sorted = Object.entries(breakdown)
                                    .filter(([, v]) => Number(v) > 0)
                                    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)) as [string, number][];
                                  if (sorted.length === 0) return null;
                                  return (
                                    <div className="flex flex-wrap gap-1 justify-center mt-2 border-t border-slate-100 pt-2">
                                      {sorted.map(([tipo, count]) => (
                                        <span
                                          key={tipo}
                                          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                          style={{ backgroundColor: (ORIGEM_COLORS[tipo] || '#94a3b8') + '22', color: ORIGEM_COLORS[tipo] || '#94a3b8', border: `1px solid ${(ORIGEM_COLORS[tipo] || '#94a3b8')}44` }}
                                        >
                                          {tipo}:{count}
                                        </span>
                                      ))}
                                    </div>
                                  );
                                })()}

                                {/* Indicador de clicável */}
                                <div className="mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-center">
                                  <span className="text-[8px] text-indigo-400 font-bold uppercase tracking-wider">Ver detalhes</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                </motion.div>
              ) : activeTab === "desempenho" ? (
                /* Aba Desempenho da Equipe */
                <motion.div
                  key="desempenho-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col gap-6"
                >
                  {/* Performance Row */}
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Left Column (Team Performance List) */}
                    <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
                      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                          <h2 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2">
                            <Award className="w-4 h-4 text-amber-500" />
                            DESEMPENHO DA EQUIPE —{" "}
                            {selectedMonth.split("-").reverse().join("/")}
                          </h2>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Classificação dinâmica baseada em processos concluídos
                          </p>
                        </div>
                      </div>

                      <div className="overflow-x-auto w-full">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400 font-bold tracking-widest uppercase cursor-pointer select-none">
                            <tr>
                              <th className="px-6 py-3.5 group" onClick={() => handleTeamSort("name")}>
                                <div className="flex items-center gap-1">Estagiário {renderSortIcon("name")}</div>
                              </th>
                              <th className="px-4 py-3.5 text-center group" onClick={() => handleTeamSort("role")}>
                                <div className="flex items-center justify-center gap-1">Categoria / Meta {renderSortIcon("role")}</div>
                              </th>
                              <th className="px-4 py-3.5 text-center group" onClick={() => handleTeamSort("todayAnalyzed")}>
                                <div className="flex items-center justify-center gap-1">Feito Hoje {renderSortIcon("todayAnalyzed")}</div>
                              </th>
                              <th className="px-4 py-3.5 text-center group" onClick={() => handleTeamSort("totalAnalyzed")}>
                                <div className="flex items-center justify-center gap-1">Acumulado Mês {renderSortIcon("totalAnalyzed")}</div>
                              </th>
                              <th className="px-4 py-3.5 text-center group" onClick={() => handleTeamSort("daysWorked")}>
                                <div className="flex items-center justify-center gap-1">Dias Ativos {renderSortIcon("daysWorked")}</div>
                              </th>
                              <th className="px-4 py-3.5 text-center font-mono group" onClick={() => handleTeamSort("averagePerDay")}>
                                <div className="flex items-center justify-center gap-1">Média/Dia {renderSortIcon("averagePerDay")}</div>
                              </th>
                              <th className="px-4 py-3.5 text-center group" onClick={() => handleTeamSort("goalProgressRatio")}>
                                <div className="flex items-center justify-center gap-1">Aproveitamento {renderSortIcon("goalProgressRatio")}</div>
                              </th>
                              <th className="px-6 py-3.5 text-right group" onClick={() => handleTeamSort("status")}>
                                <div className="flex items-center justify-end gap-1">Status {renderSortIcon("status")}</div>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="text-sm divide-y divide-slate-100">
                            {filteredEstagiariosData.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="px-6 py-10 text-center text-slate-400 font-medium">
                                  Nenhum estagiário encontrado com os filtros atuais.
                                </td>
                              </tr>
                            ) : (
                              filteredEstagiariosData.map((item, idx) => {
                                return (
                                  <tr
                                    key={item.id}
                                    onClick={() => setSelectedEstagiarioDetail(item.id)}
                                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                                  >
                                    <td className="px-6 py-4 font-semibold text-slate-800 flex items-center gap-2.5">
                                      <div className="w-6 h-6 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center text-xs font-bold font-mono">
                                        {idx + 1}
                                      </div>
                                      {item.name}
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                      <span className={`px-2 py-0.5 text-[9px] font-bold rounded ${
                                        item.role === "pos_graduacao"
                                          ? "bg-slate-200 text-slate-850 border border-slate-300"
                                          : "bg-slate-100 text-slate-600 border border-slate-150"
                                      }`}>
                                        {item.role === "pos_graduacao" ? "Pós-Graduação" : "Graduação"}
                                      </span>
                                      <span className="block text-[9px] text-slate-400 font-bold font-mono mt-1">{item.dailyGoal}/dia</span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                      <span className="font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md text-xs border border-indigo-100">{item.todayAnalyzed}</span>
                                    </td>
                                    <td className="px-4 py-4 text-center text-slate-800 font-bold">{item.totalAnalyzed}</td>
                                    <td className="px-4 py-4 text-center text-slate-500">{item.daysWorked} dias</td>
                                    <td className="px-4 py-4 text-center font-mono text-slate-600">
                                      {item.averagePerDay > 0 ? item.averagePerDay : "—"}
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                      <div className="flex items-center justify-center gap-1.5">
                                        <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                                          <div className={`h-full rounded-full transition-all ${
                                            item.goalProgressRatio >= 100 ? "bg-emerald-500" :
                                            item.goalProgressRatio >= 70 ? "bg-amber-400" : "bg-red-500"
                                          }`} style={{ width: `${Math.min(item.goalProgressRatio, 100)}%` }}></div>
                                        </div>
                                        <span className="font-mono text-[10px] text-slate-600 font-bold">{item.goalProgressRatio}%</span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                      <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full ${
                                        item.status === "ALTO"
                                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                          : item.status === "NORMAL"
                                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                                            : "bg-red-950 text-red-200 border border-red-800"
                                      }`}>
                                        {item.status}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Sidebar Info Panels */}
                    <div className="flex flex-col gap-6">
                      <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm relative overflow-hidden flex-1 flex flex-col justify-between">
                        <div className="relative z-10">
                          <h3 className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mb-4">Categorias Estimadas</h3>
                          <div className="space-y-4">
                            {categorySplit.map((cat) => (
                              <div key={cat.name}>
                                <div className="flex justify-between text-[10px] mb-1.5 font-semibold text-slate-300">
                                  <span>{cat.name}</span>
                                  <span>{cat.pct}%</span>
                                </div>
                                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${cat.color}`} style={{ width: `${cat.pct}%` }}></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="absolute -bottom-8 -right-8 w-32 h-32 border-4 border-white/5 rounded-full z-0"></div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                        <h3 className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-3 flex items-center gap-1.5">
                          <HelpCircle className="w-4 h-4 text-slate-400" />
                          Prazo e Suporte
                        </h3>
                        <p className="text-xs text-slate-600 leading-relaxed mb-4">
                          Selecione um estagiário na tabela para visualizar o histórico diário detalhado, editar lançamentos retroativos ou redistribuir processos.
                        </p>
                        <button
                          onClick={() => alert("Tabela de produtividade baseada nos dados do arquivo de referência da 1ª Vice-Presidência.")}
                          className="w-full py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 text-[10px] font-bold rounded transition-all cursor-pointer"
                        >
                          AJUDA E REGULAMENTO
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : activeTab === "diario" ? (
                /* Aba Diário de Lançamentos */
                <motion.div
                  key="diario-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col gap-6"
                >
                  <div id="diario-de-lancamentos" className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50/50">
                      <div>
                        <h2 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-sky-500" />
                          DIÁRIO DE LANÇAMENTOS — HISTÓRICO{" "}
                          {selectedMonth.split("-").reverse().join("/")}
                        </h2>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Visão corrida e diária de todas as produtividades inseridas no mês de referência
                        </p>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[10px] bg-slate-100 border border-slate-200 px-3 py-1 rounded text-slate-600">
                        <span>STATUS: {filteredChronologicalEntries.length} DIAS COM LANÇAMENTOS</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto w-full">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400 font-bold tracking-widest uppercase">
                          <tr>
                            <th className="px-6 py-3.5">Data do Caso</th>
                            <th className="px-6 py-3.5">Estagiário Responsável</th>
                            <th className="px-6 py-3.5 text-center">Processos Concluídos</th>
                            <th className="px-6 py-3.5 text-right">Ações Rápidas</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-slate-100">
                          {paginatedEntries.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-medium">
                                Nenhum lançamento foi cadastrado neste mês sob os filtros aplicados.
                              </td>
                            </tr>
                          ) : (
                            paginatedEntries.map((entry) => {
                              const associatedEstagiario = estagiarios.find((a) => a.id === entry.estagiarioId);
                              const name = associatedEstagiario ? associatedEstagiario.name : entry.estagiarioId;
                              return (
                                <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-4 font-mono font-semibold text-slate-600">
                                    {entry.date.split("-").reverse().join("/")}
                                  </td>
                                  <td className="px-6 py-4 font-bold text-slate-800">{name}</td>
                                  <td className="px-6 py-4 text-center">
                                    <span className="font-mono text-xs font-extrabold text-slate-900 bg-slate-100/80 px-3 py-1 rounded border border-slate-200/50">
                                      {entry.count} concluídos
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                      <button
                                        onClick={() => {
                                          setFormEstagiarioId(entry.estagiarioId);
                                          setFormDate(entry.date);
                                          setFormCount(entry.count);
                                          setFormEditingId(entry.id);
                                          setIsLaunchModalOpen(true);
                                        }}
                                        className="p-1 px-2 border border-slate-250 text-slate-500 hover:text-slate-800 rounded text-xs font-semibold flex items-center gap-1.5 bg-white hover:bg-slate-50 transition-all cursor-pointer"
                                      >
                                        <Edit3 className="w-3 h-3 text-slate-400" />
                                        <span>Editar</span>
                                      </button>
                                      <button
                                        onClick={() => handleDeleteEntry(entry.id)}
                                        className="p-1 px-2 border border-rose-100 text-rose-500 hover:text-rose-700 rounded text-xs font-semibold flex items-center gap-1.5 hover:bg-rose-50 transition-all cursor-pointer"
                                      >
                                        <Trash2 className="w-3 h-3 text-rose-400" />
                                        <span>Excluir</span>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    {totalHistoryPages > 1 && (
                      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                        <span className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">
                          Página {historyPage} de {totalHistoryPages} ({filteredChronologicalEntries.length} Itens)
                        </span>
                        <div className="flex bg-white rounded-lg border border-slate-200 p-0.5 shadow-sm overflow-hidden text-sm">
                          <button
                            onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                            disabled={historyPage === 1}
                            className="px-3 py-1.5 font-bold text-slate-600 disabled:opacity-30 hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed transition-all"
                          >Anterior</button>
                          <div className="w-px bg-slate-200"></div>
                          <button
                            onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                            disabled={historyPage === totalHistoryPages}
                            className="px-3 py-1.5 font-bold text-slate-600 disabled:opacity-30 hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed transition-all"
                          >Próxima</button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                /* Matrix Spreadsheet Style Layout */
                <motion.div
                  key="matrix-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden"
                >
                  <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between md:items-center gap-3 bg-slate-50/50">
                    <div>
                      <h2 className="text-sm font-bold tracking-tight text-slate-900">
                        MATRIZ COMPLETA DE PRODUTIVIDADE
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">
                        Exibindo os lançamentos diários na planilha. Clique em
                        uma célula para atualizar ou inserir produtividade. O
                        tom da cor indica a intensidade do lançamento.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 bg-slate-100 border border-slate-200 rounded"></span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mr-2">
                          0
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 bg-indigo-100 border border-indigo-200 rounded"></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 bg-indigo-200 border border-indigo-400 rounded"></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 bg-indigo-300 border border-indigo-400 rounded"></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 bg-indigo-400 border border-indigo-500 rounded"></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 bg-indigo-500 border border-indigo-600 rounded"></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 bg-indigo-600 border border-indigo-700 rounded"></span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider ml-1">
                          Máx ({maxDailyCountInMonth})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Responsive Spreadsheet Arena */}
                  <div className="overflow-auto max-h-[600px] w-full">
                    <table className="w-full text-left border-collapse table-fixed">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 divide-x divide-slate-200">
                          {/* Top left blank / total header corner */}
                          <th className="px-4 py-2.5 text-xs font-bold text-slate-700 min-w-[150px] sticky left-0 bg-slate-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            Data (Dia)
                          </th>
                          <th className="px-3 py-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest min-w-[70px] bg-slate-100">
                            TOTAL DIA
                          </th>
                          {estagiarios.map((estagiario) => (
                            <th
                              key={estagiario.id}
                              title={estagiario.name}
                              className="px-3 py-2 text-center text-xs font-bold text-slate-800 min-w-[110px] truncate"
                            >
                              {estagiario.name}
                            </th>
                          ))}
                        </tr>

                        {/* Summary row for Each Estagiario at the top */}
                        <tr className="bg-slate-100 border-b-2 border-slate-300 divide-x divide-slate-200 font-semibold">
                          <td className="px-4 py-3 text-xs font-bold text-slate-800 sticky left-0 bg-slate-100 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            Acumulado Geral ({globalMetrics.totalAnalyzed})
                          </td>
                          <td className="px-3 py-3 text-center text-xs font-bold text-slate-900 bg-slate-200">
                            {globalMetrics.totalAnalyzed}
                          </td>
                          {parsedEstagiariosData.map((estagiario) => (
                            <td
                              key={estagiario.id}
                              className="px-3 py-3 text-center text-xs font-bold text-slate-900"
                            >
                              {estagiario.totalAnalyzed}
                            </td>
                          ))}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-200 text-xs">
                        {daysInMonthList.map((dateStr) => {
                          const dateObj = new Date(dateStr);
                          const formattedDateString = dateStr
                            .split("-")
                            .reverse()
                            .join("/");

                          // Calculate row totals for this day
                          const dayEntries = entries.filter(
                            (e) => e.date === dateStr,
                          );
                          const dayTotalSum = dayEntries.reduce(
                            (sum, item) => sum + item.count,
                            0,
                          );

                          // Is weekend color shift
                          const dayOfWeek = dateObj.getDay();
                          const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Friday/Saturday, or Saturday/Sunday in Standard. Let's look up Portuguese.
                          // Saturday = 6, Sunday = 0
                          const isRealWeekend =
                            dayOfWeek === 6 || dayOfWeek === 0;

                          const isFuture = dateStr > getCurrentDate();

                          return (
                            <tr
                              key={dateStr}
                              className={`divide-x divide-slate-200 transition-colors ${
                                isRealWeekend ? "bg-slate-100/40" : ""
                              } ${isFuture ? "opacity-40 pointer-events-none bg-slate-50" : "hover:bg-slate-50/80"}`}
                            >
                              {/* Date String */}
                              <td
                                className={`px-4 py-2 font-mono font-medium sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] z-10 ${isFuture ? "bg-slate-50 text-slate-400" : "bg-white text-slate-500"}`}
                              >
                                {formattedDateString}
                              </td>

                              {/* Row sum total */}
                              <td
                                className={`px-3 py-2 text-center font-mono font-bold ${isFuture ? "text-slate-400 bg-slate-100" : "text-slate-700 bg-slate-50"}`}
                              >
                                {dayTotalSum || 0}
                              </td>

                              {/* Accessor Cells */}
                              {estagiarios.map((estagiario) => {
                                const count =
                                  entriesMap[`${estagiario.id}_${dateStr}`];
                                const hasValue =
                                  count !== undefined && count > 0;

                                return (
                                  <td
                                    key={estagiario.id}
                                    onClick={() =>
                                      !isFuture &&
                                      handleCellClick(estagiario.id, dateStr)
                                    }
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      if (!isFuture)
                                        handleCellClear(estagiario.id, dateStr);
                                    }}
                                    title={
                                      isFuture
                                        ? "Data Futura"
                                        : "Clique para editar / Botão direito para limpar"
                                    }
                                    className={`px-2 py-2 text-center font-mono text-xs ${!isFuture ? "cursor-pointer transition-all hover:brightness-95" : "cursor-not-allowed"} ${
                                      isFuture
                                        ? "bg-slate-100/20 text-slate-300 font-normal"
                                        : getHeatmapColor(
                                            count,
                                            maxDailyCountInMonth,
                                          )
                                    }`}
                                  >
                                    {count !== undefined ? count : 0}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>

        {/* Footer */}
        <footer className="mt-auto px-6 py-4 bg-white border-t border-slate-200 text-[10px] text-slate-400 font-semibold tracking-wide flex flex-col md:flex-row justify-between items-center gap-2">
          <p>
            © 2026 SISTEMA DE GESTÃO DE PRODUTIVIDADE - 1ª VICE-PRESIDÊNCIA
            (Estagiarioia de Recursos)
          </p>
          <p>VERSÃO 1.1.2 • FIREBASE PERSISTENTE</p>
        </footer>

        {/* MODAL: NOVO REGISTRO / LANÇAMENTO */}
        <AnimatePresence>
          {isLaunchModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsLaunchModalOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              ></motion.div>

              {/* Content Card */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden relative z-10"
              >
                <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                  <h3 className="text-sm font-bold uppercase tracking-wider">
                    {formEditingId
                      ? "Editar Lançamento"
                      : "Novo Lançamento Diário"}
                  </h3>
                  <button
                    onClick={() => setIsLaunchModalOpen(false)}
                    className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveEntry} className="p-6 space-y-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                      Estagiário Responsável
                    </label>
                    <select
                      id="select-estagiario"
                      value={formEstagiarioId}
                      onChange={(e) => setFormEstagiarioId(e.target.value)}
                      required
                      disabled={!!formEditingId}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-slate-400 focus:bg-white"
                    >
                      <option value="" disabled>
                        Selecione um estagiário...
                      </option>
                      {estagiarios.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                        Data de Referência
                      </label>
                      <input
                        type="date"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        required
                        disabled={!!formEditingId}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                        Processos Analisados
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formCount === 0 ? "" : formCount}
                        onChange={(e) =>
                          setFormCount(Math.max(0, Number(e.target.value)))
                        }
                        required
                        placeholder="Qtd."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-slate-400 focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsLaunchModalOpen(false)}
                      className="flex-1 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-500 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="flex-1 py-2 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      {isSaving ? "Salvando..." : "Confirmar Lançamento"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* MODAL: NOVO ESTAGIARIO */}
        <AnimatePresence>
          {isAddEstagiarioOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAddEstagiarioOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              ></motion.div>

              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full overflow-hidden relative z-10"
              >
                <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                  <h3 className="text-sm font-bold uppercase tracking-wider">
                    Adicionar Estagiário à Equipe
                  </h3>
                  <button
                    onClick={() => setIsAddEstagiarioOpen(false)}
                    className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleAddEstagiario} className="p-6 space-y-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                      Nome Completo / Identificador
                    </label>
                    <input
                      type="text"
                      required
                      value={newEstagiarioName}
                      onChange={(e) => setNewEstagiarioName(e.target.value)}
                      placeholder="Ex: Dra. Helena Souza"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                      Código ID Exclusivo (Opcional)
                    </label>
                    <input
                      type="text"
                      value={newEstagiarioId}
                      onChange={(e) => setNewEstagiarioId(e.target.value)}
                      placeholder="Ex: helena_souza (Gerado automático se vazio)"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono outline-none focus:border-slate-400 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                      Número de Matrícula / Registro
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 123456"
                      value={newEstagiarioMatricula}
                      onChange={(e) =>
                        setNewEstagiarioMatricula(e.target.value)
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400 focus:bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                      Categoria / Tipo de Estagiário
                    </label>
                    <select
                      value={newEstagiarioRole}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewEstagiarioRole(val);
                        setNewEstagiarioDailyGoal(
                          val === "pos_graduacao" ? 30 : 25,
                        );
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400 focus:bg-white cursor-pointer font-bold text-slate-800"
                    >
                      <option value="pos_graduacao">
                        Estagiário de Pós-Graduação (Meta: 30/dia)
                      </option>
                      <option value="graduacao">
                        Estagiário de Graduação (Meta: 25/dia)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                      Meta Diária (Processos / Dia)
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={newEstagiarioDailyGoal}
                      onChange={(e) =>
                        setNewEstagiarioDailyGoal(
                          Math.max(1, Number(e.target.value) || 0),
                        )
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono outline-none focus:border-slate-400 focus:bg-white"
                    />
                  </div>

                  <div className="pt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddEstagiarioOpen(false)}
                      className="flex-1 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-500 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="flex-1 py-2 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      {isSaving ? "Adicionando..." : "Cadastrar Estagiário"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* DRAWER/MODAL: DETALHES DO ESTAGIARIO */}
        <AnimatePresence>
          {selectedEstagiarioDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-end">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedEstagiarioDetail(null)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              ></motion.div>

              {/* Sidebar content card */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="relative w-full max-w-md h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col z-10"
              >
                {/* Header inside detailing drawer */}
                {(() => {
                  const detailedEstagiario = parsedEstagiariosData.find(
                    (a) => a.id === selectedEstagiarioDetail,
                  );
                  if (!detailedEstagiario) return null;

                  return (
                    <>
                      {isEditingCadastre ? (
                        <form
                          onSubmit={handleUpdateEstagiarioCadastre}
                          className="p-6 bg-slate-150 border-b border-slate-250 space-y-3"
                        >
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                            Editar Cadastro do Estagiário
                          </h4>

                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                              Nome Completo
                            </label>
                            <input
                              type="text"
                              required
                              value={editEstagiarioName}
                              onChange={(e) =>
                                setEditEstagiarioName(e.target.value)
                              }
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400 text-slate-800 font-medium"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                              Número de Matrícula
                            </label>
                            <input
                              type="text"
                              placeholder="Ex: 123456"
                              value={editEstagiarioMatricula}
                              onChange={(e) =>
                                setEditEstagiarioMatricula(e.target.value)
                              }
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400 text-slate-800 font-medium font-mono"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                                Categoria / Tipo
                              </label>
                              <select
                                value={editEstagiarioRole}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEditEstagiarioRole(val);
                                  setEditEstagiarioDailyGoal(
                                    val === "pos_graduacao" ? 30 : 25,
                                  );
                                }}
                                className="w-full px-2 py-1.5 bg-white border border-slate-250 rounded-lg text-xs outline-none focus:border-slate-400 cursor-pointer font-bold text-slate-700"
                              >
                                <option value="pos_graduacao">
                                  Pós-Graduação
                                </option>
                                <option value="graduacao">Graduação</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                                Meta Diária
                              </label>
                              <input
                                type="number"
                                min="1"
                                required
                                value={editEstagiarioDailyGoal}
                                onChange={(e) =>
                                  setEditEstagiarioDailyGoal(
                                    Math.max(1, Number(e.target.value) || 1),
                                  )
                                }
                                className="w-full px-2 py-1.5 bg-white border border-slate-250 rounded-lg text-xs font-mono outline-none focus:border-slate-400 text-slate-800"
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2 py-1 select-none">
                            <input
                              type="checkbox"
                              id="editSemanaProva"
                              checked={semanaProvaIds.includes(selectedEstagiarioDetail)}
                              onChange={() => handleToggleSemanaProva(selectedEstagiarioDetail)}
                              className="w-4 h-4 text-violet-600 border-slate-350 rounded focus:ring-violet-500 cursor-pointer"
                            />
                            <label
                              htmlFor="editSemanaProva"
                              className="text-xs font-bold text-slate-600 cursor-pointer flex items-center gap-1.5"
                            >
                              <GraduationCap className="w-3.5 h-3.5 text-violet-500" />
                              Semana de Provas (Meio Período)
                            </label>
                          </div>

                          <div className="flex gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setIsEditingCadastre(false)}
                              className="flex-1 py-1.5 border border-slate-200 bg-white rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              disabled={isSaving}
                              className="flex-1 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-805 disabled:opacity-50 cursor-pointer"
                            >
                              {isSaving ? "Salvando..." : "Salvar"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="p-6 bg-slate-900 text-white flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-base font-bold">
                                {detailedEstagiario.name}
                              </h4>
                              <button
                                onClick={() => {
                                  setEditEstagiarioName(
                                    detailedEstagiario.name,
                                  );
                                  setEditEstagiarioRole(
                                    detailedEstagiario.role || "pos",
                                  );
                                  setEditEstagiarioDailyGoal(
                                    detailedEstagiario.dailyGoal ??
                                      (detailedEstagiario.role ===
                                      "pos_graduacao"
                                        ? 30
                                        : 25),
                                  );
                                  setEditEstagiarioMatricula(
                                    detailedEstagiario.matricula || "",
                                  );
                                  setIsEditingCadastre(true);
                                }}
                                className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                                title="Editar cadastro do estagiário"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteEstagiario(detailedEstagiario.id)}
                                className="p-1 text-slate-400 hover:text-red-400 transition-colors cursor-pointer ml-1"
                                title="Excluir estagiário da equipe"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[9px]">
                                {detailedEstagiario.role === "pos_graduacao"
                                  ? "Pós-Graduação"
                                  : "Graduação"}
                              </span>
                              {detailedEstagiario.matricula && (
                                <span className="px-1.5 py-0.5 bg-emerald-950 text-emerald-200 border border-emerald-800 rounded text-[9px] font-mono">
                                  Matrícula: {detailedEstagiario.matricula}
                                </span>
                              )}
                              {detailedEstagiario.semanaProva && (
                                <span className="px-1.5 py-0.5 bg-violet-950 text-violet-200 border border-violet-800 rounded text-[9px] font-mono flex items-center gap-0.5 animate-pulse">
                                  <GraduationCap className="w-2.5 h-2.5 text-violet-400" />
                                  Semana de Prova
                                </span>
                              )}
                              <span>
                                • Meta Diária: {detailedEstagiario.dailyGoal}
                              </span>
                            </p>
                            <p className="text-[9px] text-slate-500 font-mono mt-1">
                              Consolidação Individual • {selectedMonth}
                            </p>
                          </div>
                          <button
                            onClick={() => setSelectedEstagiarioDetail(null)}
                            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      )}

                      {/* Stats strip inside detail panel */}
                      <div className="grid grid-cols-4 divide-x divide-slate-100 bg-slate-50 border-b border-slate-200">
                        <div className="p-3 text-center">
                          <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wide">
                            Total Mês
                          </span>
                          <span className="text-base font-bold text-slate-800">
                            {detailedEstagiario.totalAnalyzed}
                          </span>
                        </div>
                        <div className="p-3 text-center">
                          <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wide">
                            Dias Ativos
                          </span>
                          <span className="text-base font-bold text-slate-800">
                            {detailedEstagiario.daysWorked}
                          </span>
                        </div>
                        <div className="p-3 text-center">
                          <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wide">
                            Média Diária
                          </span>
                          <span className="text-base font-bold text-slate-800">
                            {detailedEstagiario.averagePerDay}
                          </span>
                        </div>
                        <div className="p-3 text-center">
                          <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wide">
                            Meta Batida
                          </span>
                          <span
                            className="text-base font-bold text-emerald-600 font-mono"
                            title={`${detailedEstagiario.daysMeetingGoal} dias atingindo a meta diária de ${detailedEstagiario.dailyGoal}`}
                          >
                            {detailedEstagiario.daysMeetingGoal} d
                          </span>
                        </div>
                      </div>

                      {/* Tabs selector */}
                      <div className="px-6 pt-4">
                        <div className="flex border border-slate-200 mb-2 bg-slate-50 p-1 rounded-lg">
                          <button
                            type="button"
                            onClick={() => setDetailTab("month")}
                            className={`flex-grow text-center py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                              detailTab === "month"
                                ? "bg-white text-slate-800 shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Resumo Mensal
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailTab("day")}
                            className={`flex-grow text-center py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                              detailTab === "day"
                                ? "bg-white text-slate-800 shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Processos do Dia ({selectedDetailDate.split("-").reverse().join("/")})
                          </button>
                        </div>
                      </div>

                      {/* Detailed List of individual records */}
                      <div className="flex-1 overflow-y-auto p-6 space-y-4 pt-2">
                        {detailTab === "month" ? (
                          <>
                            <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                              Histórico de Lançamentos
                            </h5>

                            {detailedEstagiario.entriesList.length === 0 ? (
                              <div className="p-8 text-center text-slate-400">
                                <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                Nenhum lançamento cadastrado para este período.
                              </div>
                            ) : (
                              <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden shadow-sm">
                                {detailedEstagiario.entriesList.map((entry) => (
                                  <div
                                    key={entry.id}
                                    className="p-3 bg-white hover:bg-slate-50 flex justify-between items-center transition-colors"
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <CalendarDays className="w-4 h-4 text-slate-400" />
                                      <div>
                                        <span className="block text-xs font-bold text-slate-700">
                                          {entry.date
                                            .split("-")
                                            .reverse()
                                            .join("/")}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                          Ano de Referência:{" "}
                                          {entry.date.split("-")[0]}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded">
                                        {entry.count} concluídos
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => {
                                            setFormEstagiarioId(entry.estagiarioId);
                                            setFormDate(entry.date);
                                            setFormCount(entry.count);
                                            setFormEditingId(entry.id);
                                            setIsLaunchModalOpen(true);
                                          }}
                                          className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() =>
                                            handleDeleteEntry(entry.id)
                                          }
                                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                              Linha do Tempo dos Processos
                            </h5>

                            {loadingProcesses ? (
                              <div className="p-8 text-center text-slate-400 font-bold text-xs animate-pulse">
                                Carregando processos do banco...
                              </div>
                            ) : (() => {
                              const dayProcs = Object.entries(detailedProcesses as Record<string, any>)
                                .filter(([_, info]) => info.date === selectedDetailDate)
                                .map(([numProcesso, info]) => ({
                                  numeroProcesso: numProcesso,
                                  ...info,
                                }))
                                .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

                              if (dayProcs.length === 0) {
                                return (
                                  <div className="p-8 text-center text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                                    <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                    Nenhum processo individual registrado para esta data no sistema.
                                    <p className="text-[10px] text-slate-400 mt-1 font-semibold">
                                      As abas individuais contam processos sincronizados a partir da planilha.
                                    </p>
                                  </div>
                                );
                              }

                              const formatDuration = (ms: number): string => {
                                const totalSecs = Math.floor(ms / 1000);
                                if (totalSecs < 60) return `${totalSecs}s`;
                                const mins = Math.floor(totalSecs / 60);
                                const secs = totalSecs % 60;
                                if (mins < 60) return `${mins}m ${secs}s`;
                                const hours = Math.floor(mins / 60);
                                const remMins = mins % 60;
                                return `${hours}h ${remMins}m`;
                              };

                              return (
                                <div className="relative pl-6 border-l border-slate-200 space-y-6 py-2 ml-3">
                                  {dayProcs.map((proc, index) => {
                                    const timeStr = new Date(proc.timestamp).toLocaleTimeString("pt-BR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      second: "2-digit",
                                    });

                                    // Calcular intervalo para o anterior
                                    let intervalStr = "";
                                    if (index > 0) {
                                      const prevProc = dayProcs[index - 1];
                                      const diff = new Date(proc.timestamp).getTime() - new Date(prevProc.timestamp).getTime();
                                      if (diff > 1000) {
                                        intervalStr = formatDuration(diff);
                                      } else {
                                        intervalStr = "Registrado em lote";
                                      }
                                    }

                                    // Cores dos badges
                                    const isCrime = proc.origem.includes("CR");
                                    const badgeColor = isCrime
                                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                                      : "bg-blue-50 text-blue-700 border border-blue-200";

                                    return (
                                      <div key={proc.numeroProcesso} className="relative">
                                        {/* Marcador na linha do tempo */}
                                        <div className="absolute -left-[31px] top-1.5 w-4.5 h-4.5 rounded-full bg-slate-900 border-4 border-white flex items-center justify-center shadow-xs">
                                          <span className="text-[6px] text-white font-extrabold">{index + 1}</span>
                                        </div>

                                        {/* Intervalo acima do card */}
                                        {intervalStr && (
                                          <div className="absolute -top-[16px] left-2 text-[9px] text-slate-400 font-bold bg-slate-50/80 px-2 py-0.5 rounded border border-slate-100 shadow-3xs flex items-center gap-1 font-mono">
                                            <Clock className="w-2.5 h-2.5 text-slate-400" />
                                            {intervalStr === "Registrado em lote" ? intervalStr : `Tempo decorrido: +${intervalStr}`}
                                          </div>
                                        )}

                                        {/* Card do processo */}
                                        <div className="bg-white border border-slate-200/80 p-3 rounded-lg hover:shadow-xs hover:border-slate-300 transition-all">
                                          <div className="flex justify-between items-start">
                                            <span className="font-mono text-xs text-slate-800 font-bold break-all">
                                              {proc.numeroProcesso}
                                            </span>
                                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full select-none shrink-0 ${badgeColor}`}>
                                              {proc.origem}
                                            </span>
                                          </div>
                                          <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t border-dashed border-slate-100">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                              Finalizado
                                            </span>
                                            <span className="text-[10px] font-extrabold text-slate-700 font-mono">
                                              {timeStr}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </>
                        )}

                        {/* Seção de Redistribuição de Processos */}
                        <div className="mt-4 border-t border-slate-100 pt-4">
                          {!isRedistributeOpen ? (
                            <button
                              onClick={() => { setIsRedistributeOpen(true); setRedistributeFromId(""); setRedistributeCount(0); }}
                              className="w-full py-2.5 px-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                            >
                              <ArrowRight className="w-3.5 h-3.5 text-amber-600" />
                              REDISTRIBUIR PROCESSOS PARA {detailedEstagiario.name.toUpperCase()}
                            </button>
                          ) : (
                            <form onSubmit={handleRedistribute} className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                              <div className="flex items-center justify-between mb-1">
                                <h5 className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                                  <ArrowRight className="w-3.5 h-3.5 text-amber-600" />
                                  Redistribuir para {detailedEstagiario.name}
                                </h5>
                                <button type="button" onClick={() => setIsRedistributeOpen(false)} className="text-amber-400 hover:text-amber-800 cursor-pointer">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div>
                                <label className="block text-[10px] uppercase font-bold text-amber-700 tracking-wider mb-1">Tirar processos de:</label>
                                <select required value={redistributeFromId} onChange={(e) => setRedistributeFromId(e.target.value)} className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-amber-400 cursor-pointer">
                                  <option value="">— Selecione o estagiário —</option>
                                  {estagiarios.filter((e) => e.id !== selectedEstagiarioDetail).map((e) => (
                                    <option key={e.id} value={e.id}>{e.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] uppercase font-bold text-amber-700 tracking-wider mb-1">Data</label>
                                  <input type="date" required value={redistributeDate} onChange={(e) => setRedistributeDate(e.target.value)} className="w-full px-2 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-mono outline-none focus:border-amber-400 text-slate-800" />
                                </div>
                                <div>
                                  <label className="block text-[10px] uppercase font-bold text-amber-700 tracking-wider mb-1">Qtd. Processos</label>
                                  <input type="number" required min={1} value={redistributeCount || ""} onChange={(e) => setRedistributeCount(Math.max(0, Number(e.target.value)))} placeholder="Ex: 5" className="w-full px-2 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-mono outline-none focus:border-amber-400 text-slate-800" />
                                </div>
                              </div>
                              {redistributeFromId && redistributeCount > 0 && (
                                <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-[10px] text-amber-800">
                                  <span className="font-bold">Resumo:</span> Transferir <span className="font-black text-amber-900">{redistributeCount}</span> processo(s) de <span className="font-black">{estagiarios.find(e => e.id === redistributeFromId)?.name}</span> para <span className="font-black">{detailedEstagiario.name}</span> em <span className="font-mono font-bold">{redistributeDate.split("-").reverse().join("/")}</span>
                                </div>
                              )}
                              <button type="submit" disabled={isSaving || !redistributeFromId || redistributeCount <= 0} className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                                {isSaving ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                {isSaving ? "REDISTRIBUINDO..." : "CONFIRMAR REDISTRIBUIÇÃO"}
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* MODAL: INTEGRAÇÃO COM PLANILHA GOOGLE & COPIAR/COLAR */}
        <AnimatePresence>
          {isSheetsModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSheetsModalOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              ></motion.div>

              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
              >
                <div className="bg-emerald-800 text-white px-6 py-4 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">
                      Sincronização com Planilha Google / Excel
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsSheetsModalOpen(false)}
                    className="text-emerald-200 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                  {/* Google Auth Integration Section */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4.5">
                    <h4 className="text-xs font-bold text-slate-850 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse"></span>
                      Segurança de Dados: Acesso Privado ao Google Drive
                    </h4>
                    <p className="text-xs text-slate-600 mb-3.5 leading-relaxed">
                      Você pode conectar sua conta Google{" "}
                      <strong>com sua permissão</strong> para acessar planilhas
                      privadas diretamente do seu Google Drive, sem precisar
                      expô-las de forma pública ("Qualquer pessoa com o link
                      pode ler").
                    </p>

                    {googleUser ? (
                      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <div className="flex items-center gap-2.5">
                          {googleUser.photoURL ? (
                            <img
                              src={googleUser.photoURL}
                              alt={googleUser.displayName || "Google User"}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full border border-emerald-300"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs animate-fade-in">
                              {googleUser.displayName?.charAt(0) || "U"}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-bold text-emerald-950">
                              Conectado: {googleUser.displayName}
                            </p>
                            <p className="text-[10px] text-emerald-700 font-mono">
                              {googleUser.email}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={handleGoogleLogout}
                          className="px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 border border-red-200 rounded-md text-[11px] font-bold transition-all cursor-pointer"
                        >
                          Sair do Google
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-slate-200 rounded-lg p-3">
                        <div className="flex-1">
                          <p className="text-xs font-bold text-slate-800">
                            Conecte sua conta do Google
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 animate-pulse">
                            Permite leitura direta do seu Drive sem precisar
                            deixar a planilha pública.
                          </p>
                        </div>
                        <button
                          onClick={handleGoogleLogin}
                          disabled={isLoggingInGoogle}
                          className="gsi-material-button text-xs py-1.5 px-3 self-start sm:self-center border border-slate-300 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer font-bold rounded-lg bg-white"
                          style={{ height: "36px" }}
                        >
                          <svg
                            version="1.1"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 48 48"
                            style={{
                              display: "block",
                              width: "16px",
                              height: "16px",
                            }}
                          >
                            <path
                              fill="#EA4335"
                              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                            ></path>
                            <path
                              fill="#4285F4"
                              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                            ></path>
                            <path
                              fill="#FBBC05"
                              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                            ></path>
                            <path
                              fill="#34A853"
                              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                            ></path>
                          </svg>
                          <span>
                            {isLoggingInGoogle
                              ? "Conectando..."
                              : "Entrar com o Google"}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Connection Section */}
                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4.5">
                    <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider mb-2">
                      Opção A: Integração em Tempo Real por Link
                    </h4>
                    <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                      Acompanhe em tempo real as atualizações de sua equipe.
                      Cole o link do seu Google Planilhas.
                    </p>

                    {/* Step-by-step Quick Guide */}
                    <div className="my-3 p-3 bg-white border border-emerald-100 rounded-lg space-y-2 text-[11px] text-slate-700 leading-relaxed">
                      <p className="font-bold text-emerald-800 uppercase tracking-wide text-[10px]">
                        💡 Formatação de Colunas Sucedida:
                      </p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>
                          <strong>Formato Matriz (Mais prático):</strong> A
                          primeira coluna deve se chamar{" "}
                          <code className="bg-slate-100 px-1 py-0.5 rounded text-rose-600 font-mono">
                            Data
                          </code>
                          . As demais colunas devem ser os{" "}
                          <strong>nomes dos estagiários</strong>. Cada célula
                          receberá o número de processos daquele dia.
                        </li>
                        <li>
                          <strong>Formato Lista:</strong> Deve conter as colunas{" "}
                          <code className="bg-slate-100 px-1 py-0.5 rounded text-rose-600 font-mono">
                            Data
                          </code>
                          ,{" "}
                          <code className="bg-slate-100 px-1 py-0.5 rounded text-rose-600 font-mono">
                            Estagiário
                          </code>{" "}
                          (ou Nome) e{" "}
                          <code className="bg-slate-100 px-1 py-0.5 rounded text-rose-600 font-mono">
                            Quantidade
                          </code>{" "}
                          (ou Casos/Produtividade).
                        </li>
                        <li>
                          <strong>Auto-Cadastro Automático:</strong> Qualquer
                          estagiário novo inserido na planilha será{" "}
                          <strong>criado automaticamente</strong> e vinculado
                          aos seus respectivos números de processos.
                          Duplicidades e redundâncias de lançamentos são
                          consolidadas e somadas de forma limpa!
                        </li>
                      </ul>
                      <div className="pt-1.5 border-t border-slate-100 text-[10px] text-slate-500">
                        <strong>Acesso Público:</strong> Selecione "Arquivo"
                        &gt; "Compartilhar" &gt; "Qualquer pessoa com o link"
                        (Leitor) ou publique a planilha na web.
                      </div>
                    </div>

                    <div className="space-y-3">
                      {lastSyncTime && spreadsheetUrl && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 rounded-lg text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-bold">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Planilha Vinculada no Banco de Dados
                          </div>
                          <p className="text-slate-600 font-mono text-[10px] truncate">
                            {spreadsheetUrl}
                          </p>
                          <p className="text-[10px] text-emerald-700">
                            Última sincronização efetuada em:{" "}
                            <strong>
                              {new Date(lastSyncTime).toLocaleString("pt-BR")}
                            </strong>
                          </p>
                        </div>
                      )}

                      {sheetSyncError && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-900 rounded-lg text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-rose-800">
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                            Atenção na Sincronização
                          </div>
                          <p className="text-slate-700 text-[11px] leading-relaxed">
                            {sheetSyncError}
                          </p>
                          {!googleUser && (
                            <p className="text-[10px] text-rose-800 font-bold mt-1">
                              👉 Dica: Se a sua planilha é privada, clique no
                              botão{" "}
                              <strong>
                                "Segurança de Dados: Acesso Privado"
                              </strong>{" "}
                              acima para conectar sua conta Google e autorizar o
                              acesso.
                            </p>
                          )}
                        </div>
                      )}

                      <div className="space-y-2.5">
                        <div className="flex flex-col gap-3">
                          <div>
                            <label className="block text-[9px] uppercase font-bold text-emerald-800 tracking-wider mb-1">
                              Link do Google Planilhas
                            </label>
                            <input
                              type="url"
                              placeholder="Cole o link do Google Sheets ou Planilha Publicada..."
                              value={spreadsheetUrl}
                              onChange={(e) => setSpreadsheetUrl(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-350 rounded-lg text-xs outline-none focus:border-emerald-500 font-mono shadow-3xs"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end pt-1">
                          <button
                            onClick={() =>
                              triggerSheetsSync(spreadsheetUrl, estagiarios)
                            }
                            disabled={syncingSheets}
                            className="bg-emerald-700 text-white hover:bg-emerald-800 px-5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 font-sans shadow-xs"
                          >
                            {syncingSheets
                              ? `Sincronizando (${syncDuration.toFixed(1)}s)...`
                              : "Sincronizar Planilha Agora"}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-emerald-100/50">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="chk-auto-sync"
                            checked={autoSyncEnabled}
                            onChange={(e) =>
                              setAutoSyncEnabled(e.target.checked)
                            }
                            className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                          />
                          <label
                            htmlFor="chk-auto-sync"
                            className="text-xs font-bold text-slate-700 cursor-pointer"
                          >
                            Sincronizar automaticamente ao carregar o site
                            (Real-Time Ativo)
                          </label>
                        </div>

                        <div className="flex gap-2 shrink-0">
                          {spreadsheetUrl && (
                            <button
                              onClick={handleUnlinkSheet}
                              className="px-3 py-1.5 border border-red-200 text-red-700 hover:bg-red-50 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                            >
                              Remover Vínculo
                            </button>
                          )}
                          <button
                            onClick={handleSaveSheetSettings}
                            disabled={isSaving}
                            className="bg-slate-900 text-white hover:bg-slate-800 px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer disabled:opacity-55"
                          >
                            {isSaving
                              ? `Gravando e Sincronizando (${syncDuration.toFixed(1)}s)...`
                              : "Salvar Vínculo"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Direct clipboard copy paste area */}
                  <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/50">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                      Opção B: Cola Rápido da Área de Trabalho (Suporte Excel /
                      TSV)
                    </h4>
                    <p className="text-xs text-slate-650 text-slate-500 mb-3 leading-relaxed">
                      Não quer configurar links? Copie as linhas da sua planilha
                      (contendo colunas como Data, Nome do Estagiário, Casos
                      Concluídos) e cole-as abaixo:
                    </p>

                    <textarea
                      rows={4}
                      placeholder="Cole aqui (Ex:&#10;Data;Estagiário;Quantidade&#10;18/06/2026;Dr. Antonio;12&#10;18/06/2026;Dra. Jane;8)"
                      value={pasteDataText}
                      onChange={(e) => setPasteDataText(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono outline-none focus:border-slate-500 mb-2.5 resize-none"
                    ></textarea>

                    <div className="flex justify-end">
                      <button
                        onClick={handleImportPastedData}
                        className="px-4 py-1.5 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-xs font-bold transition-all cursor-pointer"
                      >
                        Processar Dados Colados
                      </button>
                    </div>
                  </div>

                  {/* Preview Section */}
                  {(previewEntries.length > 0 ||
                    previewEstagiariosToCreate.length > 0 ||
                    sheetsMessage) && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 uppercase">
                          Prévia dos Dados Processados
                        </span>
                        <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                          Formato Válido Detectado
                        </span>
                      </div>

                      <div className="p-4 space-y-3.5 max-h-48 overflow-y-auto">
                        {sheetsMessage && (
                          <p className="text-[11px] font-semibold text-slate-650 text-emerald-800 bg-emerald-50 p-2 rounded">
                            {sheetsMessage}
                          </p>
                        )}

                        {previewEstagiariosToCreate.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">
                              ⚠️ Novos Estagiários que serão auto-criados (
                              {previewEstagiariosToCreate.length}):
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {previewEstagiariosToCreate.map((name, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full font-semibold"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {previewEntries.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-1.5">
                              Lançamentos de Produtividade a Importar (
                              {previewEntries.length}):
                            </p>
                            <table className="w-full text-left font-mono text-[11px] border-collapse">
                              <thead>
                                <tr className="bg-slate-100/80 border-b border-slate-200 text-[10px] text-slate-500 font-bold lowercase">
                                  <th className="p-1 px-2">Data</th>
                                  <th className="p-1 px-2">Estagiário Cod</th>
                                  <th className="p-1 px-2 text-right">
                                    Processos_Concluídos
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {previewEntries
                                  .slice(0, 10)
                                  .map((entry, index) => (
                                    <tr
                                      key={index}
                                      className="border-b border-slate-100"
                                    >
                                      <td className="p-1 px-2">
                                        {entry.date
                                          .split("-")
                                          .reverse()
                                          .join("/")}
                                      </td>
                                      <td className="p-1 px-2 font-semibold text-slate-700">
                                        {entry.estagiarioId}
                                      </td>
                                      <td className="p-1 px-2 text-right font-bold">
                                        {entry.count}
                                      </td>
                                    </tr>
                                  ))}
                                {previewEntries.length > 10 && (
                                  <tr>
                                    <td
                                      colSpan={3}
                                      className="p-1 py-1 px-2 text-[10px] text-slate-400 italic text-center"
                                    >
                                      + {previewEntries.length - 10} linhas
                                      ocultadas da visualização rápida...
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <span className="text-[11px] font-semibold text-emerald-800 flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg animate-pulse">
                          ✨ Dados sincronizados e gravados no Banco com
                          sucesso!
                        </span>
                        <button
                          onClick={() => {
                            setIsSheetsModalOpen(false);
                            setPreviewEntries([]);
                            setPreviewEstagiariosToCreate([]);
                            setPreviewEstagiariosDetailed([]);
                            setPasteDataText("");
                          }}
                          className="w-full sm:w-auto px-5 py-2 bg-emerald-800 text-white hover:bg-emerald-900 text-xs font-extrabold rounded-lg transition-all cursor-pointer shadow"
                        >
                          Confirmar e Fechar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setIsSheetsModalOpen(false);
                      setPreviewEntries([]);
                      setPreviewEstagiariosToCreate([]);
                      setPreviewEstagiariosDetailed([]);
                      setPasteDataText("");
                    }}
                    className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-150 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Fechar Painel
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Toast Notification */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed bottom-6 right-6 z-[100] max-w-md w-full bg-white rounded-xl shadow-2xl border border-slate-200 p-4 flex gap-3 items-start animate-fade-in"
            >
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  toast.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : toast.type === "error"
                      ? "bg-rose-50 text-rose-800 border border-rose-200"
                      : "bg-blue-50 text-blue-800 border border-blue-200"
                }`}
              >
                {toast.type === "success" ? (
                  <span className="text-base font-bold">✓</span>
                ) : toast.type === "error" ? (
                  <span className="text-base font-bold">⚠️</span>
                ) : (
                  <span className="text-base font-bold">ℹ️</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-805 text-slate-800 uppercase tracking-wide">
                  {toast.type === "success"
                    ? "Sucesso"
                    : toast.type === "error"
                      ? "Atenção"
                      : "Mensagem do Sistema"}
                </p>
                <p className="text-xs text-slate-650 text-slate-600 mt-1 leading-relaxed font-sans font-medium whitespace-pre-line">
                  {toast.message}
                </p>
              </div>

              <button
                onClick={() => setToast(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 -mt-1 cursor-pointer text-sm font-bold"
              >
                &times;
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Real-time Notifications */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
          <AnimatePresence>
            {notifications.map((notif) => (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: 50, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                className="bg-white p-5 rounded-2xl shadow-[0_20px_50px_rgba(99,102,241,0.18)] border-l-6 border-indigo-500 flex items-start gap-4 w-[420px] pointer-events-auto relative overflow-hidden"
              >
                {/* Efeito decorativo sutil */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-full blur-2xl -mr-6 -mt-6 -z-10 opacity-60" />

                {/* Ícone Destacado */}
                <div className="h-12 w-12 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0 border border-indigo-100 shadow-sm">
                  <Zap className="w-6 h-6 text-indigo-600 fill-indigo-100 animate-pulse" />
                </div>

                <div className="flex-1 pr-4">
                  <p className="text-[10px] text-indigo-600 font-extrabold uppercase tracking-wider mb-1 flex items-center gap-1">
                    ⚡ Novo Processo!
                  </p>
                  <p className="text-base font-bold text-slate-800 leading-tight">
                    <span className="text-indigo-600 font-extrabold text-lg block mb-0.5">
                      {notif.estagiarioName}
                    </span>
                    <span className="text-slate-600 text-sm font-semibold">
                      finalizou mais um processo!
                    </span>
                  </p>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="text-xs text-slate-600 font-semibold">
                      Total de hoje:{" "}
                      <span className="font-extrabold text-slate-900 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full text-xs">
                        {notif.count} {notif.count === 1 ? "processo" : "processos"}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Botão de Fechar Individual */}
                <button
                  onClick={() => {
                    setNotifications((prevArr) => prevArr.filter((n) => n.id !== notif.id));
                  }}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1 cursor-pointer absolute top-3 right-3 text-lg font-bold w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100"
                >
                  &times;
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

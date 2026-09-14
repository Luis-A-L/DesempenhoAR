export interface Estagiario {
  id: string;
  name: string;
  role?: "pos" | "pos_graduacao" | "graduacao" | string;
  dailyGoal?: number;
  matricula?: string;
  semanaProva?: boolean;
  ferias?: boolean;
}

export interface ProductivityEntry {
  id: string;
  estagiarioId: string;
  date: string; // YYYY-MM-DD
  count: number;
}

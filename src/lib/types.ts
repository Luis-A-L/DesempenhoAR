export interface Estagiario {
  id: string; // Ex: '1'
  name: string; // Ex: 'Gustavo Arruda'
  period?: "matutino" | "vespertino";
  isActive?: boolean;
  role?: string;
  dailyGoal?: number;
  matricula?: string;
  semanaProva?: boolean;
}

export interface ProductivityEntry {
  id: string; // Ex: '1_2024-05-18' (estagiarioId_date)
  estagiarioId: string;
  date: string; // Format: YYYY-MM-DD
  count: number;
  typeBreakdown?: Record<string, number>; // Ex: { CV: 5, RCV: 3, DCV: 2, CR: 1, RCR: 0, DCR: 0 }
}

export const INITIAL_ESTAGIARIOS: Estagiario[] = [];

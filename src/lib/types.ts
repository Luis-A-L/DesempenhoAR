export interface Estagiario {
  id: string; // Ex: '1'
  name: string; // Ex: 'Gustavo Arruda'
  period?: "matutino" | "vespertino";
  isActive?: boolean;
  role?: string;
  dailyGoal?: number;
  matricula?: string;
}

export interface ProductivityEntry {
  id: string; // Ex: '1_2024-05-18' (estagiarioId_date)
  estagiarioId: string;
  date: string; // Format: YYYY-MM-DD
  count: number;
}

export const INITIAL_ESTAGIARIOS: Estagiario[] = [];

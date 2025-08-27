
export enum Permission {
  TEMPLATES_VIEW = 'templates.view',
  FORMS_VIEW = 'forms.view',
  USERS_VIEW = 'users.view',
  REPORTS_VIEW = 'reports.view',
}
export type Branch = 'ALL' | 'MACKAY' | 'YAT' | 'NSW';
export const BRANCHES: Branch[] = ['ALL', 'MACKAY', 'YAT', 'NSW'];
export const ALL_CONCRETE_BRANCHES: Branch[] = BRANCHES.filter(b => b !== 'ALL');
export type Role = 'admin' | 'crew-leader' | 'crew-member' | 'ops';
export const MANAGER_ROLES: Role[] = ['admin', 'crew-leader'];
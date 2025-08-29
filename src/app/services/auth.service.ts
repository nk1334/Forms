import { Injectable } from '@angular/core';
import {
  Auth,
  idToken,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  User
} from '@angular/fire/auth';
import { Permission, Branch, Role, MANAGER_ROLES } from '../permissions.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  /* ---------- Mock users for local login ---------- */
  private users = [
    { username: 'admin',      password: 'admin',   role: 'crew-leader' },
    { username: 'crew',       password: 'crew123', role: 'crew-member' },
    { username: 'operations', password: 'ops123',  role: 'ops' },
  ];

  private userRole: string | null = null;   // ← authoritative app role
  private currentUser: any = null;

  constructor(private auth: Auth) {
    // Keep Firebase user in localStorage (separate from mock)
    this.auth.onAuthStateChanged(user => {
      if (user) {
        this.currentUser = user;
        localStorage.setItem('firebaseUser', JSON.stringify(user));
      } else {
        localStorage.removeItem('firebaseUser');
      }
    });

    // Restore mock login (if present) and set role
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      this.currentUser = JSON.parse(storedUser);
      this.userRole = (this.currentUser as any)?.role ?? null;
    } else {
      // Fallback to any explicit role saved by UI (optional)
      const storedRole = localStorage.getItem('role');
      if (storedRole) this.userRole = storedRole;
    }
  }

  /* ---------- Role → Permissions (strongly typed) ---------- */
  private rolePermissions: Record<Role, Permission[]> = {
    admin: [
      Permission.TEMPLATES_VIEW,
      Permission.FORMS_VIEW,
      Permission.USERS_VIEW,
      Permission.REPORTS_VIEW,
    ],
    'crew-leader': [
      Permission.TEMPLATES_VIEW,
      Permission.FORMS_VIEW,
      Permission.USERS_VIEW,
      Permission.REPORTS_VIEW,
    ],
    'crew-member': [
      Permission.FORMS_VIEW,
    ],
    ops: [
      // OPS cannot view templates
      Permission.FORMS_VIEW,
      Permission.USERS_VIEW,
      Permission.REPORTS_VIEW,
    ],
  };

  /* ---------- RBAC helpers ---------- */
  setUserRole(role: string | null) { this.userRole = role; }

  getUserRole(): string | null {
    if (!this.userRole) {
      const u = this.getCurrentUserLocal();
      this.userRole = (u as any)?.role ?? this.userRole;
      if (!this.userRole) {
        const storedRole = localStorage.getItem('role');
        if (storedRole) this.userRole = storedRole;
      }
    }
    return this.userRole;
  }

  getPermissions(): Permission[] {
    const role = this.getUserRole() as Role | null;
    return role ? (this.rolePermissions[role] ?? []) : [];
  }

  hasPermission(p: Permission): boolean { return this.getPermissions().includes(p); }

  hasAll(perms: Permission[]): boolean {
    const mine = this.getPermissions();
    return perms.every(p => mine.includes(p));
  }

  /* ---------- Branch helpers ---------- */
  // Managers can set ALL or multiple branches in the UI
  get canManageAllBranches(): boolean {
    const r = this.getUserRole() as Role | null;
    return !!r && MANAGER_ROLES.includes(r);
  }

  // The branch assigned to the current user (for filtering & save locks)
  getUserBranch(): Branch {
    return (localStorage.getItem('branch') as Branch) || 'ALL';
  }

  setUserBranch(branch: Branch) {
    localStorage.setItem('branch', branch);
  }

  /* ---------- Local (mock) auth ---------- */
  login(username: string, password: string): boolean {
    const user = this.users.find(u => u.username === username && u.password === password);
    if (user) {
      this.currentUser = user;
      this.userRole = user.role;                     // ✅ set role at login
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('isLoggedIn', 'true');    // keep flag in sync
      localStorage.setItem('role', user.role);       // optional convenience

      // Ensure a branch is set for non-managers (or as a sensible default)
      if (!localStorage.getItem('branch')) this.setUserBranch('MACKAY');

      return true;
    }
    return false;
  }

  signup(username: string, password: string): boolean {
    const exists = this.users.find(u => u.username === username);
    if (exists) return false;

    const newUser = { username, password, role: 'crew-member' };
    this.users.push(newUser);
    this.currentUser = newUser;
    this.userRole = newUser.role;                    // ✅ set role
    localStorage.setItem('user', JSON.stringify(newUser));
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('role', newUser.role);

    if (!localStorage.getItem('branch')) this.setUserBranch('MACKAY');

    return true;
  }

  /** Renamed: this function was clearing login; it's a logout. */
  logoutLocal(): void {
    localStorage.removeItem('user');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('role');
    this.currentUser = null;
    this.userRole = null;
  }

  async logout(): Promise<void> {
    try {
      // Attempt Firebase logout (safe even if not logged in with Firebase)
      await this.logoutFirebase();
    } catch (e) {
      console.warn('Firebase signOut failed or not logged in:', e);
    }

    // Always clear local mock session
    this.logoutLocal();

    // And clean up anything else you set
    localStorage.removeItem('branch');
    localStorage.removeItem('firebaseUser');
  }

  getCurrentUserLocal() {
    if (!this.currentUser) {
      const stored = localStorage.getItem('user');
      if (stored) {
        this.currentUser = JSON.parse(stored);
        this.userRole = (this.currentUser as any)?.role ?? this.userRole;
      }
    }
    return this.currentUser;
  }

  isLoggedInLocal(): boolean {
    const flag = localStorage.getItem('isLoggedIn') === 'true';
    return flag && !!this.getCurrentUserLocal();
  }

  isAdmin(): boolean {
    return (this.getUserRole() ?? '').toLowerCase() === 'admin';
  }

  /* ---------- Firebase auth ---------- */
  async loginFirebase(email: string, password: string): Promise<boolean> {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      this.currentUser = userCredential.user;

      // TODO: map Firebase user → app role and call setUserRole('ops' | 'crew-member' | ...)
      // Example:
      // const roleFromBackend = await this.fetchRoleForUid(userCredential.user.uid);
      // this.setUserRole(roleFromBackend);
      // localStorage.setItem('role', roleFromBackend);
      //
      // Also set a branch if you load it from your backend:
      // this.setUserBranch(loadedBranchFromBackend);
   const role: Role = 'ops';                 // or load from your backend/claims
    this.setUserRole(role);
    localStorage.setItem('role', role);
      if (!localStorage.getItem('branch')) this.setUserBranch('MACKAY');

      return true;
    } catch (error) {
      console.error('Firebase login failed', error);
      return false;
    }
  }

  async signupFirebase(email: string, password: string): Promise<boolean> {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      this.currentUser = userCredential.user;
      await sendEmailVerification(userCredential.user);

      // TODO: assign default role for Firebase users if you want:
      // this.setUserRole('crew-member');
      // localStorage.setItem('role', 'crew-member');

      if (!localStorage.getItem('branch')) this.setUserBranch('MACKAY');

      return true;
    } catch (error) {
      console.error('Firebase signup failed', error);
      return false;
    }
  }

  logoutFirebase(): Promise<void> {
    return signOut(this.auth).then(() => {
      // does not touch local mock state; call logoutLocal() if you also want to clear it
    });
  }
}
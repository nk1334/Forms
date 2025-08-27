import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService } from './services/auth.service';   // adjust path if your service is elsewhere
import { Permission } from './permissions.model';

@Injectable({ providedIn: 'root' })
export class PermissionGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const required: Permission[] = route.data['required'] ?? [];

    // ✅ if no permission required → allow
    if (!required.length) return true;

    // ✅ allow only if user has all required permissions
    if (this.auth.hasAll(required)) return true;

    // ❌ if user does not have permission, send them back to dashboard
    this.router.navigate(['/dashboard']);
    return false;
  }
}
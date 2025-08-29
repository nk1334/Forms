import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { AuthService } from './services/auth.service';
import { Permission } from './permissions.model';

@Injectable({ providedIn: 'root' })
export class PermissionGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): boolean | UrlTree {
    const required = (route.data?.['required'] as Permission[]) || [];

    // nothing required -> allow
    if (!required.length) return true;

    // check all required perms
    const ok = this.auth.hasAll(required);
    return ok ? true : this.router.createUrlTree(['/dashboard']);
  }
}
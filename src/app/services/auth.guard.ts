// auth.guard.ts (functional version)
import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

 if (auth.isLoggedInLocal()) {
    return true;
  } else {
    return router.createUrlTree(['/login']);
  }
};

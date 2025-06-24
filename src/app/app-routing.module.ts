import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { SignupComponent } from './components/signup/signup.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { authGuard } from './services/auth.guard';
import { CreateTemplateComponent } from './components/create-template/create-template.component';
import { CreateFormComponent } from './components/create-form/create-form.component';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
  },
  {
    path: 'template',
    component: CreateTemplateComponent,
    canActivate: [authGuard],
  },
  {
    path: 'forms',
    component: CreateFormComponent,
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: 'login', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}

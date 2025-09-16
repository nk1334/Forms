import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { environment } from 'src/environments/environment';
import { LoginComponent } from './components/login/login.component';
import { SignupComponent } from './components/signup/signup.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { authGuard } from './services/auth.guard';
import { CreateTemplateComponent } from './components/create-template/create-template.component';
import { CreateFormComponent } from './components/create-form/create-form.component';
import { ProblemTrackerComponent } from './components/problem-tracker/problem-tracker.component';
import { AddUserComponent } from './components/add-user/add-user.component';
import { PermissionGuard } from './permission.guard';
import { Permission } from './permissions.model';
const templateGuards: any[] = environment.bypassPerms ? [] : [authGuard, PermissionGuard];

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    //canActivate: [authGuard],
  },
{
  path: 'template',                       // (your route is singular)
  component: CreateTemplateComponent,
    canActivate: templateGuards,
  data: { required: [Permission.TEMPLATES_VIEW] }
},
  {
    path: 'forms',
    component: CreateFormComponent,
  
  },
   { path: 'forms/:id', component: CreateFormComponent }, 
  // Add ProblemTracker route with authGuard if needed
  {
    path: 'problem-tracker',
    component: ProblemTrackerComponent,
    canActivate: [authGuard],
 
  },
  {
    path: 'forms/fill',
    component: CreateFormComponent,
    // canActivate: [authGuard], // optional if you want fill to require auth
  },
 { path: 'forms/:id', component: CreateFormComponent },  
  // Default redirect
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // Wildcard redirect
  { path: '**', redirectTo: 'login', pathMatch: 'full' },
  
];


@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
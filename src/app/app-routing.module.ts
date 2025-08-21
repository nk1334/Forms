import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { LoginComponent } from './components/login/login.component';
import { SignupComponent } from './components/signup/signup.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { authGuard } from './services/auth.guard';
import { CreateTemplateComponent } from './components/create-template/create-template.component';
import { CreateFormComponent } from './components/create-form/create-form.component';
import { ProblemTrackerComponent } from './components/problem-tracker/problem-tracker.component';
import { AddUserComponent } from './components/add-user/add-user.component';


const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    //canActivate: [authGuard],
  },
  {
    path: 'template',
    component: CreateTemplateComponent,
    canActivate: [authGuard],
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
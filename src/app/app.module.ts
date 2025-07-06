import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { LoginComponent } from './components/login/login.component';
import { SignupComponent } from './components/signup/signup.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { MaterialModule } from './modules/material.module';
import { ReactiveFormsModule } from '@angular/forms';
import { AddNewTemplateModalComponent } from './components/add-new-template-modal/add-new-template-modal.component';
import { CreateTemplateComponent } from './components/create-template/create-template.component';
import { CreateFormComponent } from './components/create-form/create-form.component';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { ProblemTrackerComponent } from './components/problem-tracker/problem-tracker.component';
import { FormsModule } from '@angular/forms'; // Needed for ngModel
@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    SignupComponent,
    DashboardComponent,
    AddNewTemplateModalComponent,
    CreateTemplateComponent,
    CreateFormComponent,
    ProblemTrackerComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MaterialModule,
    ReactiveFormsModule,
    DragDropModule,
     FormsModule
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}

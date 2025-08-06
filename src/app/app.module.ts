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
import { FormsModule } from '@angular/forms';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalModule, MsalRedirectComponent, MsalService, MSAL_INSTANCE } from '@azure/msal-angular';
import { AddUserComponent } from './components/add-user/add-user.component';
import { MatDialogModule } from '@angular/material/dialog';
import { RouterModule } from '@angular/router';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { environment } from '../environments/environment';
import { AddPlantDialogComponent } from './components/add-plant-dialog/add-plant-dialog.component';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { MatCheckboxModule } from '@angular/material/checkbox';
const clientId = 'YOUR_CLIENT_ID_HERE';
const tenantId = 'YOUR_TENANT_ID_HERE';

export function MSALInstanceFactory() {
  return new PublicClientApplication({
    auth: {
      clientId: clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: 'http://localhost:4200',
    }
  });
}

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
    AddUserComponent,
    AddPlantDialogComponent,
   
     
   ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MaterialModule,
    ReactiveFormsModule,
    DragDropModule,
     FormsModule,
     MatSnackBarModule,
     MsalModule ,
     MatDialogModule,
         MatCheckboxModule,
     RouterModule,
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth()),
  ],
  providers: [
    {
      provide: MSAL_INSTANCE,
      useFactory: MSALInstanceFactory
    },
    MsalService
  ],
  bootstrap: [AppComponent] // Add MsalRedirectComponent
})
export class AppModule {}
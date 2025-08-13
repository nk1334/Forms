// src/app/material.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Angular Material Components
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTableModule } from '@angular/material/table';
import { MatListModule } from '@angular/material/list';
import { FormsModule } from '@angular/forms';
import { MatDialogModule  } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTabsModule } from '@angular/material/tabs';
@NgModule({
  exports: [
    CommonModule,
    MatCardModule,
    MatInputModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatToolbarModule,
    MatSnackBarModule,
    MatMenuModule,
    MatSidenavModule,
    MatTableModule,
    MatListModule,
    FormsModule,
    MatDialogModule,
    MatSelectModule,
     MatDatepickerModule,    // <-- added
    MatNativeDateModule,  
      MatTabsModule   ,  
    MatTooltipModule,
    MatCheckboxModule,
  ],
})
export class MaterialModule {}

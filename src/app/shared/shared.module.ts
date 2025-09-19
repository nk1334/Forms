import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule }     from '@angular/material/input';
import { MatIconModule }      from '@angular/material/icon';
import { MatSelectModule }    from '@angular/material/select';
import { MatButtonModule }    from '@angular/material/button';

import { FieldRendererComponent } from './field-renderer/field-renderer.component';
import { TextFieldComponent } from './gforms/components/text-field/text-field.component';
import { DataGridComponent } from './gforms/components/data-grid/data-grid.component';


@NgModule({
  declarations: [
    FieldRendererComponent,
    TextFieldComponent,
    DataGridComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
    MatButtonModule
  ],
  exports: [
    FieldRendererComponent,
        TextFieldComponent ,
         DataGridComponent 
  ]
})
export class SharedModule {}
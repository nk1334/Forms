import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { FormField } from '../create-template/create-template.component';

@Injectable({
  providedIn: 'root',
})
export class DragDropService {
  private draggedFieldSource = new Subject<FormField | null>(); // <-- must be Subject, not boolean

  draggedField$ = this.draggedFieldSource.asObservable();

  setDraggedField(field: FormField | null) {
    this.draggedFieldSource.next(field); // now next() will work
  }
}
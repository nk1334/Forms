import { Component, EventEmitter, Input, Output } from '@angular/core';

export type FieldMode = 'builder' | 'fill';

@Component({
  selector: 'app-field-renderer',
  templateUrl: './field-renderer.component.html',
  styleUrls: ['./field-renderer.component.scss']
})
export class FieldRendererComponent {
  @Input() field: any;
  @Input() mode: FieldMode = 'builder';

  // Signature events so parent can keep its drawing logic
  @Output() sigStart = new EventEmitter<{ev: PointerEvent, id: string}>();
  @Output() sigMove  = new EventEmitter<{ev: PointerEvent, id: string}>();
  @Output() sigStop  = new EventEmitter<{ev: PointerEvent, id: string}>();
}

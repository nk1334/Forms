import { Component } from '@angular/core';
import { OverlayContainer } from '@angular/cdk/overlay';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'avanteApp';

  constructor(private overlay: OverlayContainer) {
    this.overlay.getContainerElement().classList.add('my-theme');
  }
}
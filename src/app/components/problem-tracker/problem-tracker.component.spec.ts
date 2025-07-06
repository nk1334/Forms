import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProblemTrackerComponent } from './problem-tracker.component';

describe('ProblemTrackerComponent', () => {
  let component: ProblemTrackerComponent;
  let fixture: ComponentFixture<ProblemTrackerComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ProblemTrackerComponent]
    });
    fixture = TestBed.createComponent(ProblemTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

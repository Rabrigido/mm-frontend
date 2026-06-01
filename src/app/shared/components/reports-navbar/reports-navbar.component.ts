import { Component, EventEmitter, Input, Output, signal, OnChanges, SimpleChanges } from '@angular/core';
import { NgFor, NgClass } from '@angular/common';
import { components, colors, spacing } from '../../../design-system';

/** Available graph report types. */
export type ReportKey =
  | 'hierarchical-graph'
  | 'module-class-graph'
  | 'module-function-graph'; 

/** Describes a selectable report in the navigation bar. */
export interface ReportItem {
  key: ReportKey;
  label: string;
  hint?: string;
}

@Component({
  selector: 'app-reports-navbar',
  standalone: true,
  imports: [NgFor, NgClass],
  templateUrl: './reports-navbar.component.html',
})
/**
 * Navigation bar for switching between graph report views (toggle-style buttons).
 */
export class ReportsNavbarComponent implements OnChanges {
  // Design System
  components = components;
  colors = colors;
  spacing = spacing;
  @Input() items: ReportItem[] = [
  
    { key: 'hierarchical-graph', label: 'Project summary' },  
    { key: 'module-class-graph', label: 'Module-class' },  
    { key: 'module-function-graph', label: 'Module-function' },  
 
  ];

  @Input() selected: ReportKey | null = null;
  @Output() selectedChange = new EventEmitter<ReportKey | null>();

  private selectedSig = signal<ReportKey | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if ('selected' in changes) {
      this.selectedSig.set(this.selected);
    }
  }

  selectedValue(): ReportKey | null {
    return this.selectedSig();
  }

  /** Toggles report selection (clicking the same item deselects). */
  toggle(k: ReportKey | null): void {
    const next = this.selectedValue() === k ? null : k;
    this.selectedSig.set(next);
    this.selectedChange.emit(next);
  }
}
import { Component, EventEmitter, Input, Output, signal, OnChanges, SimpleChanges } from '@angular/core';
import { NgFor, NgClass } from '@angular/common';

export type ReportKey =
  | 'loc-sloc'
  | 'cyclomatic-complexity'
  | 'dependencies'
  | 'architecture'
  | 'duplication'

  | 'files'
  | 'functions-per-file'
  | 'classes-per-file'
  | 'function-coupling'
  ;



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
export class ReportsNavbarComponent implements OnChanges {
  @Input() items: ReportItem[] = [
    { key: 'loc-sloc', label: 'LOC / SLOC' },
    { key: 'cyclomatic-complexity', label: 'Cyclomatic complexity' },
    { key: 'dependencies', label: 'Dependency graph' },
    { key: 'architecture', label: 'Architecture' },
    { key: 'duplication', label: 'Duplication' },



    { key: 'files', label: 'Archivos' },

    { key: 'functions-per-file', label: 'Funciones por Archivo' },
    { key: 'classes-per-file', label: 'Clases por Archivo' },
    { key: 'function-coupling', label: 'Acoplamiento de Funciones' },
  ];

  @Input() selected: ReportKey | null = null;
  @Output() selectedChange = new EventEmitter<ReportKey | null>();

  // Arranca en null; los @Input llegan luego
  private selectedSig = signal<ReportKey | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if ('selected' in changes) {
      this.selectedSig.set(this.selected);
    }
  }

  selectedValue(): ReportKey | null {
    return this.selectedSig();
  }

  toggle(k: ReportKey | null): void {
    const next = this.selectedValue() === k ? null : k;
    this.selectedSig.set(next);
    this.selectedChange.emit(next);
  }
}

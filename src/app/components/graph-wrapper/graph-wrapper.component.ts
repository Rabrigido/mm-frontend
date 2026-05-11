import { Component, Input, Output, EventEmitter, HostListener, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GraphNode } from '../../types/graph.types';
import { graphs, colors } from '../../design-system';
import { GraphTreeModalComponent } from '../graph-tree-modal/graph-tree-modal.component';

export interface LegendItem {
  colorClass: string;
  label: string;
}

@Component({
  selector: 'app-graph-wrapper',
  standalone: true,
  imports: [CommonModule, GraphTreeModalComponent],
  templateUrl: './graph-wrapper.component.html',
})
export class GraphWrapperComponent implements OnDestroy {
  @Input() title = '';
  @Input() legendItems: LegendItem[] = [];
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() separation = 1;
  @Input() showTreeModal = false;
  @Input() allNodes: GraphNode[] = [];
  @Input() hiddenNodes = new Set<string>();

  @Output() separationChange = new EventEmitter<number>();
  @Output() expandAll = new EventEmitter<void>();
  @Output() collapseAll = new EventEmitter<void>();
  @Output() downloadSVG = new EventEmitter<void>();
  @Output() downloadPNG = new EventEmitter<void>();
  @Output() openTreeModal = new EventEmitter<void>();
  @Output() openDetailsModal = new EventEmitter<void>();
  @Output() treeNodeSelected = new EventEmitter<string>();
  @Output() closeTreeModal = new EventEmitter<void>();

  graphs = graphs;
  colors = colors;
  isIdle = signal(false);

  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  @HostListener('mousemove')
  onMouseMove(): void {
    this.isIdle.set(false);
    this.resetIdleTimer();
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.startIdleTimer();
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.isIdle.set(true), 5000);
  }

  private startIdleTimer(): void {
    if (!this.idleTimer) this.resetIdleTimer();
  }

  ngOnDestroy(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }

  onSeparationChange(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.separationChange.emit(value);
  }
}

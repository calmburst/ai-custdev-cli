export class ProgressTracker {
  private readonly total: number;
  private readonly label: string;
  private readonly width: number;
  private current: number;
  private lastRender: number;

  constructor(total: number, label = "Progress", width = 24) {
    this.total = Math.max(0, total);
    this.label = label;
    this.width = width;
    this.current = 0;
    this.lastRender = 0;
  }

  tick(step = 1): void {
    if (this.total <= 0) {
      return;
    }
    this.current = Math.min(this.total, this.current + step);
    this.render();
  }

  complete(): void {
    if (this.total <= 0) {
      return;
    }
    this.current = this.total;
    this.render(true);
  }

  private render(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastRender < 120) {
      return;
    }
    this.lastRender = now;
    const ratio = this.total === 0 ? 1 : this.current / this.total;
    const filled = Math.round(this.width * ratio);
    const bar = `${"#".repeat(filled)}${"-".repeat(this.width - filled)}`;
    const percent = Math.round(ratio * 100);
    process.stdout.write(
      `\r${this.label} [${bar}] ${percent}% (${this.current}/${this.total})`
    );
    if (force || this.current >= this.total) {
      process.stdout.write("\n");
    }
  }
}

let activeTracker: ProgressTracker | null = null;

export const setProgressTracker = (tracker: ProgressTracker | null): void => {
  activeTracker = tracker;
};

export const reportProgress = (step = 1): void => {
  activeTracker?.tick(step);
};

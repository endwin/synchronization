export class SyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  private intervalMinutes: number = 0;
  private onTrigger: () => Promise<void>;

  constructor(onTrigger: () => Promise<void>) {
    this.onTrigger = onTrigger;
  }

  setIntervalMinutes(minutes: number): void {
    this.intervalMinutes = minutes;
    this.restart();
  }

  start(): void {
    if (this.intervalMinutes <= 0) return;
    this.stop();
    this.timer = setInterval(() => {
      this.onTrigger().catch(err => {
        console.error('Scheduler trigger error:', err);
      });
    }, this.intervalMinutes * 60 * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  restart(): void {
    this.stop();
    this.start();
  }
}
